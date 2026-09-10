"""
models_config.py — OmniAI Single Source of Truth for AI Models
---------------------------------------------------------------
All model IDs here are live-tested against the Hugging Face Inference API
free tier. Do not add any model ID from memory without verifying it first.

Last verified: 2026-09-10 against HF_API_KEY (Hugging Face free tier)
"""

from typing import List, Dict, Any, Optional

# ---------------------------------------------------------------------------
# MODEL_CONFIG — the one list the entire app trusts
# ---------------------------------------------------------------------------
# Each entry:
#   id           : internal model ID (sent in API requests from frontend)
#   display_name : human-readable name shown in the UI
#   provider     : "huggingface"  (determines which SDK/client to call)
#   free         : True if on the provider's free tier
#   rpm_limit    : requests-per-minute on the free tier (conservative estimate)
#   description  : short capability description for the dropdown tooltip
#   badge        : UI pill label
#   reasoning    : True if the model returns <think>…</think> blocks
# ---------------------------------------------------------------------------

MODEL_CONFIG: List[Dict[str, Any]] = [
    {
        "id": "hf/mistral-7b-instruct",
        "display_name": "Mistral 7B Instruct",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 30,
        "description": "Mistral 7B Instruct v0.3 — fast, capable general-purpose model. Best for most academic doubts.",
        "badge": "Recommended",
        "reasoning": False,
    },
    {
        "id": "hf/mistral-nemo",
        "display_name": "Mistral NeMo 12B",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 20,
        "description": "Mistral NeMo 12B — stronger reasoning and longer context. Great for complex derivations.",
        "badge": "Powerful",
        "reasoning": False,
    },
    {
        "id": "hf/llama-3-8b-instruct",
        "display_name": "Llama 3 8B Instruct",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 30,
        "description": "Meta Llama 3 8B Instruct — excellent instruction following for coding and STEM doubts.",
        "badge": "Fast",
        "reasoning": False,
    },
    {
        "id": "hf/qwen2-7b-instruct",
        "display_name": "Qwen2 7B Instruct",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 20,
        "description": "Qwen2 7B Instruct — strong multilingual math and science reasoning.",
        "badge": "Math",
        "reasoning": False,
    },
]

# Ordered fallback chain: primary → first fallback → second fallback
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
