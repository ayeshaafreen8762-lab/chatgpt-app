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
        "id": "hf/llama-3-8b-instruct",
        "display_name": "Llama 3.1 8B Instruct",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 30,
        "description": "Meta Llama 3.1 8B Instruct — fast, versatile doubt solver. Fully tested and confirmed working.",
        "badge": "Recommended",
        "reasoning": False,
    },
    {
        "id": "hf/qwen2.5-coder-7b",
        "display_name": "Qwen2.5 Coder 7B",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 30,
        "description": "Qwen2.5 Coder 7B Instruct — specialized for programming, algorithm & logic doubts.",
        "badge": "Coding & Math",
        "reasoning": False,
    },
    {
        "id": "hf/qwen2.5-coder-32b",
        "display_name": "Qwen2.5 Coder 32B",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 20,
        "description": "Qwen2.5 Coder 32B Instruct — deep reasoning for complex STEM and architecture problems.",
        "badge": "Powerful",
        "reasoning": False,
    },
    {
        "id": "hf/phi-4",
        "display_name": "Microsoft Phi-4",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 30,
        "description": "Microsoft Phi-4 — compact state-of-the-art model for science & general reasoning.",
        "badge": "Fast",
        "reasoning": False,
    },
    {
        "id": "hf/deepseek-r1-llama-8b",
        "display_name": "DeepSeek R1 Llama 8B",
        "provider": "huggingface",
        "free": True,
        "rpm_limit": 20,
        "description": "DeepSeek R1 Distill Llama 8B — step-by-step thinking for deep problem solving.",
        "badge": "Reasoning",
        "reasoning": True,
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
