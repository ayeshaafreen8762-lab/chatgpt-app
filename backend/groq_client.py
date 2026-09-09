"""
groq_client.py — OmniAI Groq Streaming Client
- Reads GROQ_API_KEY fresh on every request (no stale module-level cache)
- Streams responses as SSE chunks via the OpenAI-compatible Groq endpoint
- Strips <think>…</think> reasoning blocks from Qwen models in-stream
- Handles 401, 429, 503, timeout and network errors gracefully over SSE
- Zero hardcoded mock responses; zero dead model references
"""

import os
import re
import json
from typing import AsyncGenerator, List, Dict, Any, Optional
import httpx
from dotenv import load_dotenv, find_dotenv

# Reload .env on module import (will also be re-read per-request via get_groq_key())
_DOTENV_PATH = find_dotenv(usecwd=True)

SYSTEM_DOUBT_SOLVER_PROMPT = """You are OmniAI, a world-class Principal AI Tutor and Doubt Solver.
Your goal is to solve academic, technical, scientific, and coding doubts with maximum clarity, intuitive pedagogy, and rich visual aids.

Guidelines for Doubt Solving:
1. **Visual Explanations & Mermaid Diagrams**:
   - Whenever an explanation benefits from a flowchart, architecture, state diagram, or logic tree, generate a clean, strictly-valid Mermaid.js diagram inside a ```mermaid code block.
   - **STRICT MERMAID RULES (Failure to follow causes syntax errors)**:
     - Always begin the diagram with `flowchart TD` or `flowchart LR`.
     - Use clean alphanumeric node IDs (e.g., `start_node`, `step1`, `cond1`, `end_node`).
     - NEVER use reserved keywords as node IDs (e.g., do NOT use `end`, `subgraph`, `graph`, `default`, `class`, `style` as IDs).
     - ALWAYS enclose the text/label of every node in double quotes: `A["Step 1: Calculate (a + b)"] --> B["Step 2: Check condition"]`.
     - For decision nodes: `cond1{"Is x > 0?"} -->|"Yes"| step_pos["Positive Result"]`.
     - For connections with labels: `A["Start"] -->|"Action label"| B["Next Step"]`.
     - Do NOT use raw HTML tags or unescaped quotes inside node labels.
     - **Constraint**: Ensure node labels do not contain semicolons or complex syntax that breaks the Mermaid parser.
     - Example of a valid diagram:
       ```mermaid
       flowchart TD
           node_start["Start: Initialize x = 0"] --> node_check{"Is x < 10?"}
           node_check -->|"Yes"| node_inc["Increment: x = x + 1"]
           node_inc --> node_check
           node_check -->|"No"| node_finish["Complete: Return x"]
       ```
   - Whenever explaining a mathematical function, physics trajectory, or statistical distribution, provide an interactive plot using a ```recharts block formatted as JSON, for example:
     ```recharts
     {
       "type": "line",
       "title": "Function Plot",
       "xAxis": "x",
       "yAxis": "y",
       "data": [{"x": 0, "y": 0}, {"x": 1, "y": 1}]
     }
     ```
2. **Mathematical Rigor & LaTeX**:
   - Write all formulas and equations in crisp LaTeX.
   - For standalone equations, use display math: `$$ ... $$`.
   - For inline variables, use: `$x$`.
3. **Step-by-Step Problem Solving**:
   - Break down problems into Problem Statement, Core Intuition, Step-by-Step Derivation, and Final Answer.
4. **Document & RAG Grounding**:
   - If provided with Document/RAG context, cite the exact source/page (e.g. `[Reference Page X]`).
"""


def get_groq_key() -> str:
    """
    Re-reads GROQ_API_KEY from disk on every call so that key rotations /
    .env edits are picked up without restarting uvicorn.
    """
    if _DOTENV_PATH:
        load_dotenv(_DOTENV_PATH, override=True)
    key = os.getenv("GROQ_API_KEY", "").strip()
    prefix = key[:6] if key else "(none)"
    print(f"[DEBUG GROQ_API_KEY] loaded prefix: '{prefix}' | length: {len(key)}")
    return key


def is_valid_key(key: str) -> bool:
    """Returns True only if the key looks like a real (non-placeholder) Groq key."""
    if not key or len(key) < 16:
        return False
    placeholders = ("your_actual", "your_key", "placeholder", "xxxx", "gsk_your", "replace_me", "insert_key")
    return not any(p in key.lower() for p in placeholders)


def _build_error_sse(msg: str, code: Optional[str] = None) -> str:
    payload: Dict[str, str] = {"content": msg, "chunk": msg, "error": code or msg}
    return f"data: {json.dumps(payload)}\n\n"


class _ThinkTagStripper:
    """
    Stateful in-stream stripper for <think>…</think> blocks emitted by
    reasoning models (Qwen 3.x). Buffers content inside <think> blocks and
    discards it; passes through everything outside.
    """

    def __init__(self) -> None:
        self._inside_think = False
        self._buf = ""  # partial tag accumulation buffer

    def feed(self, chunk: str) -> str:
        """Process a streaming chunk; return only the displayable portion."""
        result_parts: List[str] = []
        i = 0
        text = self._buf + chunk
        self._buf = ""

        while i < len(text):
            if self._inside_think:
                # Look for closing </think>
                end = text.find("</think>", i)
                if end == -1:
                    # Not found yet; keep buffering (could be a partial tag)
                    # Buffer up to 10 chars back in case </think> spans chunks
                    safe_up_to = max(i, len(text) - 10)
                    i = len(text)  # consume everything
                    # Nothing to emit while inside think block
                    # Stash potential partial end tag
                    self._buf = text[safe_up_to:]
                    break
                else:
                    i = end + len("</think>")
                    self._inside_think = False
            else:
                # Look for opening <think>
                start = text.find("<think>", i)
                if start == -1:
                    # No think block ahead — check for a partial "<think" at the tail
                    tail_check = max(i, len(text) - 7)
                    if text[tail_check:].startswith("<") and "<think>".startswith(text[tail_check:]):
                        result_parts.append(text[i:tail_check])
                        self._buf = text[tail_check:]
                    else:
                        result_parts.append(text[i:])
                    i = len(text)
                    break
                else:
                    result_parts.append(text[i:start])
                    i = start + len("<think>")
                    self._inside_think = True

        return "".join(result_parts)


async def stream_groq_chat(
    messages: List[Dict[str, Any]],
    model: str = "groq/compound",
    has_image: bool = False,
    image_url: Optional[str] = None,
    custom_endpoint: Optional[str] = None,
    is_reasoning_model: bool = False,
    model_used: Optional[str] = None,
    fallback_triggered: bool = False,
    original_model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Live-streams Groq API response as SSE.

    Yields:
        data: {"sessionId": "...", "model_used": "...", "fallback_triggered": bool}  (first event)
        data: {"content": "<delta>", "chunk": "<delta>"}                             (content events)
        data: [DONE]                                                                  (final event)

    On any error: yields a friendly SSE error message then [DONE].
    """
    # Re-read key fresh on every invocation
    api_key = get_groq_key()

    # --- Key validation ---
    if not is_valid_key(api_key):
        key_prefix = api_key[:8] + "..." if api_key else "(empty)"
        print(f"[ERROR] GROQ_API_KEY is missing or invalid on this deployment. Loaded key prefix: '{key_prefix}'. Set GROQ_API_KEY in Render environment variables.")
        msg = (
            "⚠️ **AI Service Configuration Error**\n\n"
            "The AI backend is missing its API key configuration. "
            "The server administrator needs to set `GROQ_API_KEY` in the Render deployment environment variables.\n\n"
            "**Loaded key prefix**: `" + key_prefix + "`\n\n"
            "This is a server configuration issue — not something you can fix. "
            "Please contact the app administrator or wait for a fix.\n\n"
            "Free Groq keys available at [console.groq.com/keys](https://console.groq.com/keys)."
        )
        yield _build_error_sse(msg, "MISSING_API_KEY")
        yield "data: [DONE]\n\n"
        return

    effective_model = model_used or model

    # --- Build messages array for OpenAI-compatible endpoint ---
    payload_messages = [{"role": "system", "content": SYSTEM_DOUBT_SOLVER_PROMPT}]
    last_idx = len(messages) - 1
    for idx, m in enumerate(messages):
        role = "user" if m.get("role") in ("user", "human") else "assistant"
        content = m.get("content", "")

        if role == "user" and image_url and idx == last_idx:
            # Embed image as text description since vision models are unavailable
            payload_messages.append({
                "role": "user",
                "content": f"[Image attached — please analyze and respond to]: {content}",
            })
        else:
            payload_messages.append({"role": role, "content": content})

    request_headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    request_body = {
        "model": effective_model,
        "messages": payload_messages,
        "temperature": 0.4,
        "max_tokens": 4096,
        "stream": True,
    }

    # --- HTTP streaming ---
    api_url = custom_endpoint if custom_endpoint else "https://api.groq.com/openai/v1/chat/completions"
    stripper = _ThinkTagStripper() if is_reasoning_model else None

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        try:
            async with client.stream(
                "POST",
                api_url,
                headers=request_headers,
                json=request_body,
            ) as resp:

                # ── Non-200 responses ──────────────────────────────────────────
                if resp.status_code != 200:
                    raw = (await resp.aread()).decode("utf-8", errors="ignore")

                    if resp.status_code == 401:
                        key_prefix = api_key[:8] + "..." if api_key else "(empty)"
                        print(f"[ERROR] Groq 401 Unauthorized. The deployed GROQ_API_KEY was rejected. Prefix: '{key_prefix}'. Update GROQ_API_KEY in Render environment.")
                        msg = (
                            "⚠️ **AI Service Authentication Error (401)**\n\n"
                            "The Groq API key configured on this server was rejected. "
                            "The API key needs to be updated in the Render deployment environment variables.\n\n"
                            f"**Key prefix used**: `{key_prefix}`\n\n"
                            "Please contact the app administrator. "
                            "New keys can be generated at [console.groq.com/keys](https://console.groq.com/keys)."
                        )
                        yield _build_error_sse(msg, "INVALID_API_KEY_401")

                    elif resp.status_code == 429:
                        msg = (
                            "⚠️ **Rate Limit Hit (429)**\n\n"
                            f"Model `{effective_model}` hit the free-tier rate limit. "
                            "Wait ~60 seconds or try a different model."
                        )
                        yield _build_error_sse(msg, "RATE_LIMIT_429")

                    elif resp.status_code in (503, 502, 500):
                        msg = (
                            f"⚠️ **Groq Service Unavailable ({resp.status_code})**\n\n"
                            "The Groq API is temporarily down. Please try again in a moment."
                        )
                        yield _build_error_sse(msg, f"GROQ_SERVER_ERROR_{resp.status_code}")

                    else:
                        msg = f"⚠️ **Groq API Error ({resp.status_code})**\n\n```\n{raw[:400]}\n```"
                        yield _build_error_sse(msg, f"GROQ_HTTP_{resp.status_code}")

                    yield "data: [DONE]\n\n"
                    return

                # ── Successful stream ──────────────────────────────────────────
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue

                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return

                    try:
                        parsed = json.loads(data_str)
                        delta = (
                            parsed.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if delta:
                            # Strip <think> blocks for reasoning models
                            if stripper is not None:
                                delta = stripper.feed(delta)
                            if delta:  # may be empty after stripping
                                yield f"data: {json.dumps({'content': delta, 'chunk': delta})}\n\n"
                    except Exception:
                        continue

                # Ensure [DONE] even if Groq doesn't send it
                yield "data: [DONE]\n\n"

        except httpx.TimeoutException:
            msg = (
                "⚠️ **Request Timed Out** — Groq took too long to respond.\n\n"
                "Check your network connection and try again."
            )
            yield _build_error_sse(msg, "TIMEOUT")
            yield "data: [DONE]\n\n"

        except httpx.ConnectError:
            msg = (
                "⚠️ **Cannot Reach Groq API** — Connection refused.\n\n"
                "Ensure you have internet access and `api.groq.com` is reachable."
            )
            yield _build_error_sse(msg, "CONNECT_ERROR")
            yield "data: [DONE]\n\n"

        except Exception as exc:
            msg = f"⚠️ **Unexpected Streaming Error**: `{type(exc).__name__}: {exc}`"
            yield _build_error_sse(msg, str(exc))
            yield "data: [DONE]\n\n"


async def probe_model(model_id: str) -> bool:
    """
    Quick non-streaming probe to test if a model_id is callable.
    Returns True if the model returns HTTP 200, False otherwise.
    Used by the fallback logic in main.py before committing to a model.
    """
    api_key = get_groq_key()
    if not is_valid_key(api_key):
        return False
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model_id,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5,
                    "stream": False,
                },
            )
            return r.status_code == 200
    except Exception:
        return False
