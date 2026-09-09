"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  ChevronDown,
  Check,
  Cpu,
  Link as LinkIcon,
  Settings2,
  Globe,
  Loader2,
  AlertCircle,
} from "lucide-react";

// Shape returned by GET /api/models
export interface AIModel {
  id: string;
  display_name: string;
  provider: string;
  free: boolean;
  rpm_limit: number;
  description: string;
  badge: string;
  // legacy fields still accepted so existing call-sites don't break
  name?: string;
  endpointUrl?: string;
}

import { getBackendUrl } from "@/lib/config";

const API_BASE = getBackendUrl();

function makeStorageKey(userId?: number | string | null): string {
  // Scoped per user when available; falls back to a generic key
  return userId ? `omniai_selected_model_uid_${userId}` : "omniai_selected_model";
}

export interface ModelSwitcherProps {
  /** The currently active model ID (controlled from the parent). */
  selectedModelId?: string;
  /** Called when the user picks a different model. */
  onModelChange: (modelId: string, customUrl?: string) => void;
  /** User ID from AuthContext for scoped localStorage key. */
  userId?: number | string | null;
  className?: string;
  // Legacy aliases kept for compatibility
  currentModel?: string;
  selectedModel?: string;
}

export function ModelSwitcher({
  selectedModelId,
  onModelChange,
  userId,
  className = "",
  currentModel,
  selectedModel,
}: ModelSwitcherProps) {
  const activeId = selectedModelId || selectedModel || currentModel || "";

  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [showUrlConfig, setShowUrlConfig] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Fetch live model list from /api/models ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingModels(true);
      setFetchError(null);
      try {
        const res = await fetch(`${API_BASE}/api/models`, { cache: "no-store" });
        if (!res.ok) throw new Error(`/api/models returned ${res.status}`);
        const data = await res.json();
        const list: AIModel[] = (data.models || []).map((m: AIModel) => ({
          ...m,
          // normalise: backend sends display_name; keep name for any legacy consumers
          name: m.display_name || m.name || m.id,
        }));
        if (!cancelled) setModels(list);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setFetchError(msg);
          console.warn("ModelSwitcher: failed to fetch /api/models:", msg);
        }
      } finally {
        if (!cancelled) setIsLoadingModels(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Restore custom endpoint URL from localStorage ──────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved =
      localStorage.getItem("custom_llm_endpoint_url") ||
      localStorage.getItem("omni_ai_custom_endpoint_url") ||
      "";
    if (saved) setCustomEndpoint(saved);
  }, []);

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowUrlConfig(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedObj = models.find((m) => m.id === activeId) ?? models[0];
  const displayName = selectedObj
    ? (selectedObj.display_name || selectedObj.name || selectedObj.id)
    : activeId || "Select model";

  const handleSelectModel = (modelId: string) => {
    onModelChange(modelId);
    // Persist scoped to user
    if (typeof window !== "undefined") {
      localStorage.setItem(makeStorageKey(userId), modelId);
    }
    setIsOpen(false);
  };

  const handleSaveCustomEndpoint = () => {
    const trimmed = customEndpoint.trim();
    if (trimmed) {
      if (typeof window !== "undefined") {
        localStorage.setItem("custom_llm_endpoint_url", trimmed);
        localStorage.setItem("omni_ai_custom_endpoint_url", trimmed);
      }
      onModelChange("hosted-cloud-llm", trimmed);
      setShowUrlConfig(false);
      setIsOpen(false);
    }
  };

  // Badge colour mapping
  const badgeStyle = (badge: string): string => {
    const b = badge.toLowerCase();
    if (b === "recommended") return "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50";
    if (b === "fast") return "bg-sky-900/60 text-sky-300 border border-sky-700/50";
    if (b === "reasoning") return "bg-violet-900/60 text-violet-300 border border-violet-700/50";
    return "bg-zinc-800 text-zinc-400";
  };

  return (
    <div className={`relative inline-block text-left z-30 ${className}`} ref={dropdownRef}>
      {/* ── Trigger button ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoadingModels}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs sm:text-sm font-medium transition-all shadow-md shadow-emerald-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoadingModels ? (
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
        ) : (
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
        )}
        <span className="truncate max-w-[140px] sm:max-w-[200px]">{displayName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-emerald-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Dropdown ── */}
      {isOpen && (
        <div className="absolute z-50 right-0 sm:right-auto left-0 sm:left-auto mt-2 w-80 max-h-[85vh] overflow-y-auto bg-[#18181b]/98 backdrop-blur-2xl border border-zinc-700/80 rounded-2xl shadow-2xl py-2 text-left text-zinc-100 ring-1 ring-white/10">
          {/* Header */}
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" /> AI Models
            </span>
            <button
              onClick={() => setShowUrlConfig(!showUrlConfig)}
              className="text-zinc-400 hover:text-emerald-400 transition-colors p-1 rounded-md hover:bg-white/5"
              title="Configure Custom LLM Endpoint URL"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {/* Custom endpoint config panel */}
          {showUrlConfig ? (
            <div className="p-3.5 space-y-3 bg-zinc-950/70 border-b border-zinc-800">
              <label className="text-xs text-zinc-200 font-semibold flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" /> Custom LLM Link / Endpoint URL:
              </label>
              <input
                type="url"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                placeholder="https://your-hosted-endpoint.com/v1"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-zinc-400 leading-tight">
                Enter your hosted OpenAI-compatible endpoint to bypass rate limits.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowUrlConfig(false)}
                  className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCustomEndpoint}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-950/40 transition-colors"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1">
              {/* Error state */}
              {fetchError && (
                <div className="px-3 py-2 flex items-start gap-2 text-[11px] text-amber-400 bg-amber-950/30 border-b border-zinc-800">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Could not load model list from backend. Is the server running?</span>
                </div>
              )}

              {/* Loading shimmer */}
              {isLoadingModels && !fetchError && (
                <div className="px-3 py-3 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 rounded-lg bg-zinc-800/50 animate-pulse" />
                  ))}
                </div>
              )}

              {/* Model list */}
              {!isLoadingModels &&
                models.map((model) => {
                  const isSelected = activeId === model.id;
                  const name = model.display_name || model.name || model.id;
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-start justify-between hover:bg-zinc-800/80 transition-colors ${
                        isSelected ? "bg-emerald-950/40 border-l-2 border-emerald-500" : ""
                      }`}
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-zinc-100">{name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${badgeStyle(model.badge)}`}>
                            {model.badge}
                          </span>
                          {model.free && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-mono">
                              Free
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                          {model.description}
                        </p>
                        <p className="text-[10px] text-zinc-600 font-mono truncate">{model.id}</p>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 ml-2" />}
                    </button>
                  );
                })}
            </div>
          )}

          {/* Footer — custom endpoint shortcut */}
          <div className="p-2 border-t border-zinc-800 bg-zinc-950/40 text-center">
            <button
              onClick={() => setShowUrlConfig(true)}
              className="text-[11px] text-emerald-400 hover:underline flex items-center justify-center gap-1 mx-auto"
            >
              <LinkIcon className="w-3 h-3" />
              {customEndpoint ? "Edit Custom Cloud Endpoint" : "+ Add Custom Endpoint URL"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelSwitcher;

// ── Utility: read the persisted model ID for a given user from localStorage ──
export function readPersistedModelId(
  userId?: number | string | null,
  fallback?: string
): string {
  if (typeof window === "undefined") return fallback ?? "";
  const key = makeStorageKey(userId);
  return localStorage.getItem(key) || localStorage.getItem("omniai_selected_model") || fallback || "";
}