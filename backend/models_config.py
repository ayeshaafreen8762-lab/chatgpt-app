"""
models_config.py — OmniAI Single Source of Truth for AI Models
---------------------------------------------------------------
All model IDs here were LIVE-TESTED against the Groq API and confirmed
to return non-empty chat completions. Do not add any model ID from memory
without verifying against the /openai/v1/models endpoint first.

Last verified: 2026-09-05 against GROQ_API_KEY in backend/.env
"""

from typing import List, Dict, Any, Optional

# ---------------------------------------------------------------------------
# MODEL_CONFIG — the one list the entire app trusts
# ---------------------------------------------------------------------------
# Each entry:
#   id           : exact model ID sent to the provider API
#   display_name : human-readable name shown in the UI
#   provider     : "groq"  (determines which SDK/client to call)
#   free         : True if on the provider's free tier
#   rpm_limit    : requests-per-minute on the free tier (conservative estimate)
#   description  : short capability description for the dropdown tooltip
#   badge        : UI pill label
#   reasoning    : True if the model returns <think>…</think> blocks (must be stripped)
# ---------------------------------------------------------------------------

MODEL_CONFIG: List[Dict[str, Any]] = [
    {
        "id": "groq/compound",
        "display_name": "Groq Compound",
        "provider": "groq",
        "free": True,
        "rpm_limit": 30,
        "description": "Groq's flagship general-purpose model. Best for complex doubts, math, and coding.",
        "badge": "Recommended",
        "reasoning": False,
    },
    {
        "id": "groq/compound-mini",
        "display_name": "Groq Compound Mini",
        "provider": "groq",
        "free": True,
        "rpm_limit": 30,
        "description": "Lightweight fast variant. Ideal for quick questions and simple explanations.",
        "badge": "Fast",
        "reasoning": False,
    },
    {
        "id": "qwen/qwen3.8-27b",
        "display_name": "Qwen 3.8 27B",
        "provider": "groq",
        "free": True,
        "rpm_limit": 30,
        "description": "Strong reasoning and analytical capabilities for science and engineering doubts.",
        "badge": "Reasoning",
        "reasoning": True,
    },
    {
        "id": "qwen/qwen3.6-27b",
        "display_name": "Qwen 3.6 27B",
        "provider": "groq",
        "free": True,
        "rpm_limit": 30,
        "description": "Extended reasoning model — great for multi-step derivations and proofs.",
        "badge": "Reasoning",
        "reasoning": True,
    },
]

# Ordered fallback chain: primary → first fallback → second fallback
# When a model fails (429/503/timeout), we walk this list.
_FALLBACK_ORDER = [m["id"] for m in MODEL_CONFIG]

# ---------------------------------------------------------------------------
# Helpers used by main.py
# ---------------------------------------------------------------------------

def get_model_by_id(model_id: str) -> Optional[Dict[str, Any]]:
    """Return a model config dict or None if model_id is not in MODEL_CONFIG."""
    for m in MODEL_CONFIG:
        if m["id"] == model_id:
            return m
    return None


def get_fallback_model(failed_model_id: str) -> Optional[Dict[str, Any]]:
    """
    Return the next model in the fallback chain after failed_model_id.
    Prefers same-provider; since all models are Groq this is trivially satisfied.
    Returns None if there is no fallback left.
    """
    try:
        idx = _FALLBACK_ORDER.index(failed_model_id)
    except ValueError:
        # Unknown model — fall back to the first working one
        return MODEL_CONFIG[0] if MODEL_CONFIG else None

    next_idx = idx + 1
    if next_idx < len(_FALLBACK_ORDER):
        return get_model_by_id(_FALLBACK_ORDER[next_idx])
    return None


def get_default_model_id() -> str:
    """Returns the ID of the first (recommended) model."""
    return MODEL_CONFIG[0]["id"]


def public_model_list() -> List[Dict[str, Any]]:
    """
    Returns a sanitised list safe to send to the frontend — no internal keys.
    """
    return [
        {
            "id": m["id"],
            "display_name": m["display_name"],
            "provider": m["provider"],
            "free": m["free"],
            "rpm_limit": m["rpm_limit"],
            "description": m["description"],
            "badge": m["badge"],
        }
        for m in MODEL_CONFIG
    ]
