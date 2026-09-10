"""
hf_client.py — OmniAI Hugging Face Inference API Streaming Client
-----------------------------------------------------------------
- Reads HF_API_KEY fresh on every request (no stale module-level cache)
- Streams responses as SSE chunks via huggingface_hub InferenceClient
- Strips <think>…</think> reasoning blocks in-stream (for reasoning models)
- Handles 401, 429, 503, timeout and network errors gracefully over SSE
- Zero hardcoded mock responses; zero dead model references
"""

import os
import re
import json
import asyncio
from typing import AsyncGenerator, List, Dict, Any, Optional
import httpx
from dotenv import load_dotenv, find_dotenv

try:
    from huggingface_hub import InferenceClient
    _HAS_HF_HUB = True
except ImportError:
    _HAS_HF_HUB = False

# ---------------------------------------------------------------------------
# Reload .env on module import
# ---------------------------------------------------------------------------
_DOTENV_PATH = find_dotenv(usecwd=True)

# ---------------------------------------------------------------------------
# Hugging Face Inference API Router URL
# ---------------------------------------------------------------------------
HF_API_BASE = "https://router.huggingface.co/v1/chat/completions"

# ---------------------------------------------------------------------------
# Model ID mapping: our internal IDs → HF repo IDs
# ---------------------------------------------------------------------------
MODEL_ID_MAP: Dict[str, str] = {
    "hf/llama-3-8b-instruct":   "meta-llama/Llama-3.1-8B-Instruct",
    "hf/qwen2.5-coder-7b":     "Qwen/Qwen2.5-Coder-7B-Instruct",
    "hf/qwen2.5-coder-32b":    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "hf/phi-4":                "microsoft/phi-4",
    "hf/deepseek-r1-llama-8b": "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
    # Legacy fallbacks for backwards compatibility
    "hf/mistral-7b-instruct":  "meta-llama/Llama-3.1-8B-Instruct",
    "hf/mistral-nemo":         "meta-llama/Llama-3.1-8B-Instruct",
    "hf/qwen2-7b-instruct":    "Qwen/Qwen2.5-Coder-7B-Instruct",
}

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
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
2. **Table Formatting for Comparative & Structured Data**:
   - Whenever comparing items (e.g., programming languages, algorithms, physics concepts, pros & cons, step summaries, or feature matrix), ALWAYS present the comparison using a clean, well-formatted Markdown Table with header rows (e.g. `| Feature | Option A | Option B |`).
   - Do NOT output unstructured plain text paragraphs when comparing concepts.
3. **Mathematical Rigor & LaTeX**:
   - Write all formulas and equations in crisp LaTeX.
   - For standalone equations, use display math: `$$ ... $$`.
   - For inline variables, use: `$x$`.
4. **Step-by-Step Problem Solving**:
   - Break down problems into Problem Statement, Core Intuition, Step-by-Step Derivation, and Final Answer.
5. **Document & RAG Grounding**:
   - If provided with Document/RAG context, cite the exact source/page (e.g. `[Reference Page X]`).
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_hf_key() -> str:
    """
    Re-reads HF_API_KEY from disk on every call so that key rotations /
    .env edits are picked up without restarting uvicorn.
    """
    if _DOTENV_PATH:
        load_dotenv(_DOTENV_PATH, override=True)
    key = os.getenv("HF_API_KEY", "").strip()
    prefix = key[:8] if key else "(none)"
    print(f"[DEBUG HF_API_KEY] loaded prefix: '{prefix}' | length: {len(key)}")
    return key


def is_valid_hf_key(key: str) -> bool:
    """Returns True only if the key looks like a real (non-placeholder) HF token."""
    if not key or len(key) < 10:
        return False
    placeholders = ("your_key", "placeholder", "xxxx", "hf_your", "replace_me", "insert_key", "your_actual")
    return not any(p in key.lower() for p in placeholders)


def _resolve_hf_model(internal_id: str) -> str:
    """Map our internal model ID to the real HF repo ID."""
    return MODEL_ID_MAP.get(internal_id, "meta-llama/Llama-3.1-8B-Instruct")


def _build_error_sse(msg: str, code: Optional[str] = None) -> str:
    payload: Dict[str, str] = {"content": msg, "chunk": msg, "error": code or msg}
    return f"data: {json.dumps(payload)}\n\n"


class _ThinkTagStripper:
    """
    Stateful in-stream stripper for <think>…</think> blocks emitted by
    reasoning models. Buffers content inside <think> blocks and discards it;
    passes through everything outside.
    """

    def __init__(self) -> None:
        self._inside_think = False
        self._buf = ""

    def feed(self, chunk: str) -> str:
        result_parts: List[str] = []
        i = 0
        text = self._buf + chunk
        self._buf = ""

        while i < len(text):
            if self._inside_think:
                end = text.find("</think>", i)
                if end == -1:
                    safe_up_to = max(i, len(text) - 10)
                    i = len(text)
                    self._buf = text[safe_up_to:]
                    break
                else:
                    i = end + len("</think>")
                    self._inside_think = False
            else:
                start = text.find("<think>", i)
                if start == -1:
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


# ---------------------------------------------------------------------------
# Main streaming function
# ---------------------------------------------------------------------------

async def stream_hf_chat(
    messages: List[Dict[str, Any]],
    model: str = "hf/mistral-7b-instruct",
    has_image: bool = False,
    image_url: Optional[str] = None,
    custom_endpoint: Optional[str] = None,
    is_reasoning_model: bool = False,
    model_used: Optional[str] = None,
    fallback_triggered: bool = False,
    original_model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Yields SSE-formatted lines:
      First chunk : {"sessionId": ..., "model_used": ..., "fallback_triggered": ...}
      Deltas      : {"content": "<str>", "chunk": "<str>"}
      Error       : {"content": "<err_msg>", "chunk": "<err_msg>", "error": "<code>"}
      End         : [DONE]
    """
    # Emit metadata event first
    meta_event = {
        "sessionId": f"sess_{os.urandom(6).hex()}",
        "model_used": model_used or model,
        "fallback_triggered": fallback_triggered,
    }
    if fallback_triggered and original_model:
        meta_event["original_model"] = original_model
    yield f"data: {json.dumps(meta_event)}\n\n"

    # Read API key fresh per-request
    api_key = get_hf_key()
    if not is_valid_hf_key(api_key):
        key_prefix = api_key[:8] + "..." if api_key else "(empty)"
        print(
            f"[ERROR] HF_API_KEY is missing or invalid on this deployment. "
            f"Loaded key prefix: '{key_prefix}'. Set HF_API_KEY in the Render environment variables."
        )
        msg = (
            "⚠️ **AI Service Configuration Error**\n\n"
            "The AI backend is missing its Hugging Face API token. "
            "The server administrator needs to set `HF_API_KEY` in the Render deployment environment variables.\n\n"
            f"**Loaded key prefix**: `{key_prefix}`\n\n"
            "This is a server configuration issue — not something you can fix. "
            "Please contact the app administrator or wait for a fix.\n\n"
            "Free HF tokens are available at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)."
        )
        yield _build_error_sse(msg, "MISSING_API_KEY")
        yield "data: [DONE]\n\n"
        return

    # Resolve internal model ID to HF repo ID
    effective_model = _resolve_hf_model(model_used or model)

    # --- Build messages array ---
    payload_messages = [{"role": "system", "content": SYSTEM_DOUBT_SOLVER_PROMPT}]
    last_idx = len(messages) - 1
    for idx, m in enumerate(messages):
        role = "user" if m.get("role") in ("user", "human") else "assistant"
        content = m.get("content", "")

        if role == "user" and image_url and idx == last_idx:
            payload_messages.append({
                "role": "user",
                "content": f"[Image attached — please analyze and respond to]: {content}",
            })
        else:
            payload_messages.append({"role": role, "content": content})

    stripper = _ThinkTagStripper() if is_reasoning_model else None

    # ── Method 1: Official huggingface_hub InferenceClient ─────────────────────
    if _HAS_HF_HUB and not custom_endpoint:
        try:
            loop = asyncio.get_running_loop()
            client = InferenceClient(token=api_key, timeout=90.0)

            def _create_stream():
                return client.chat.completions.create(
                    model=effective_model,
                    messages=payload_messages,
                    temperature=0.4,
                    max_tokens=4096,
                    stream=True,
                )

            stream = await loop.run_in_executor(None, _create_stream)

            emitted_any = False
            for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        emitted_any = True
                        if stripper is not None:
                            delta = stripper.feed(delta)
                        if delta:
                            yield f"data: {json.dumps({'content': delta, 'chunk': delta})}\n\n"

            if emitted_any:
                yield "data: [DONE]\n\n"
                return
        except Exception as hub_err:
            err_str = str(hub_err)
            print(f"[WARN] InferenceClient error: {err_str} — trying HTTP fallback")
            if "401" in err_str or "unauthorized" in err_str.lower():
                key_prefix = api_key[:8] + "..." if api_key else "(empty)"
                msg = (
                    "⚠️ **AI Service Authentication Error (401)**\n\n"
                    "The Hugging Face API token configured on this server was rejected.\n\n"
                    f"**Key prefix used**: `{key_prefix}`\n\n"
                    "Please verify `HF_API_KEY` in Render environment settings."
                )
                yield _build_error_sse(msg, "INVALID_API_KEY_401")
                yield "data: [DONE]\n\n"
                return

    # ── Method 2: HTTP Candidate Streaming Fallback ────────────────────────────
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

    candidate_urls = [
        custom_endpoint if custom_endpoint else "https://router.huggingface.co/v1/chat/completions",
    ]

    for api_url in candidate_urls:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as http_client:
                async with http_client.stream(
                    "POST",
                    api_url,
                    headers=request_headers,
                    json=request_body,
                ) as resp:

                    if resp.status_code != 200:
                        raw = (await resp.aread()).decode("utf-8", errors="ignore")
                        msg = f"⚠️ **Hugging Face API Error ({resp.status_code})**\n\n```\n{raw[:400]}\n```"
                        yield _build_error_sse(msg, f"HF_HTTP_{resp.status_code}")
                        yield "data: [DONE]\n\n"
                        return

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
                                if stripper is not None:
                                    delta = stripper.feed(delta)
                                if delta:
                                    yield f"data: {json.dumps({'content': delta, 'chunk': delta})}\n\n"
                        except Exception:
                            continue

                    yield "data: [DONE]\n\n"
                    return

        except Exception as exc:
            msg = f"⚠️ **Streaming Error**: `{type(exc).__name__}: {exc}`"
            yield _build_error_sse(msg, str(exc))
            yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Probe function (used by fallback logic in main.py)
# ---------------------------------------------------------------------------

async def probe_model(model_id: str) -> bool:
    """
    Quick non-streaming probe to test if a model_id is callable.
    Returns True if the model returns HTTP 200, False otherwise.
    """
    api_key = get_hf_key()
    if not is_valid_hf_key(api_key):
        return False
    hf_model = _resolve_hf_model(model_id)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            r = await client.post(
                HF_API_BASE,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": hf_model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5,
                    "stream": False,
                },
            )
            return r.status_code == 200
    except Exception:
        return False
