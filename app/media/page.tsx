"use client";

import React, { useState, useEffect } from "react";
import {
  Palette,
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Download,
  Copy,
  Check,
  Loader2,
  PanelLeft,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import ModelSwitcher from "@/components/ModelSwitcher";
import VoiceInputButton from "@/components/VoiceInputButton";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

const ART_STYLES = [
  { id: "Cinematic", label: "Cinematic", desc: "Dramatic lighting & movie depth" },
  { id: "Cyberpunk", label: "Cyberpunk", desc: "Neon lights & futuristic tech" },
  { id: "Anime", label: "Anime / Manga", desc: "Vibrant cel-shaded illustrations" },
  { id: "Photorealistic", label: "Photorealistic", desc: "Hyper-detailed camera render" },
  { id: "3D Render", label: "3D Digital Art", desc: "Octane render & smooth textures" },
  { id: "Oil Painting", label: "Oil Painting", desc: "Classic textured brushstrokes" },
];

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 Landscape" },
  { id: "1:1", label: "1:1 Square" },
  { id: "9:16", label: "9:16 Story/Mobile" },
  { id: "4:3", label: "4:3 Classic" },
];

const PROMPT_SUGGESTIONS = [
  "A futuristic neon cyberpunk metropolis during rain at dusk",
  "A majestic glowing cosmic whale soaring through nebulae in deep space",
  "An ancient mystical library inside a giant hollow tree with sunbeams",
  "A hyper-realistic glass sculpture of a dragon with glowing blue flame core",
];

export interface GeneratedMediaItem {
  id: string;
  title: string;
  prompt: string;
  enhancedPrompt: string;
  style: string;
  aspectRatio: string;
  imageUrl: string;
  createdAt: number;
}

import { getBackendUrl, DEFAULT_MODEL_ID } from "@/lib/config";

const LOCAL_STORAGE_MODEL_KEY = "omni_ai_selected_model";
const API_BASE = getBackendUrl();

export default function MediaStudioPage() {
  const { getAuthHeaders } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("Cinematic");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [mediaGallery, setMediaGallery] = useState<GeneratedMediaItem[]>([]);
  const [activeMedia, setActiveMedia] = useState<GeneratedMediaItem | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedModel = localStorage.getItem(LOCAL_STORAGE_MODEL_KEY);
      if (savedModel) setSelectedModel(savedModel);
    }
  }, []);

  const handleModelChange = (newModelId: string, customUrl?: string) => {
    setSelectedModel(newModelId);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_MODEL_KEY, newModelId);
      if (customUrl !== undefined) {
        localStorage.setItem("omni_ai_custom_endpoint_url", customUrl);
      }
    }
  };

  const handleGenerateMedia = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);

    try {
      let customEndpoint = undefined;
      if (selectedModel === "hosted-cloud-llm" && typeof window !== "undefined") {
        customEndpoint = localStorage.getItem("custom_llm_endpoint_url") || undefined;
      }

      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/media`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            prompt,
            style: selectedStyle,
            aspectRatio,
            model: selectedModel,
            customEndpoint,
            negativePrompt,
          }),
        });
        if (!res.ok) throw new Error("Media generation service error.");
      } catch (directErr) {
        console.warn("Direct media service unreachable, using fallback route:", directErr);
        res = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            style: selectedStyle,
            aspectRatio,
            model: selectedModel,
            customEndpoint,
            negativePrompt,
          }),
        });
        if (!res.ok) {
          throw new Error("Media generation service error.");
        }
      }

      const data = await res.json();
      const newItem: GeneratedMediaItem = {
        id: `media_${Date.now()}`,
        title: data.title || prompt.slice(0, 30),
        prompt,
        enhancedPrompt: data.enhancedPrompt || prompt,
        style: selectedStyle,
        aspectRatio,
        imageUrl: data.imageUrl,
        createdAt: Date.now(),
      };

      setMediaGallery((prev) => [newItem, ...prev]);
      setActiveMedia(newItem);
    } catch (err) {
      console.error("Media generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen w-full bg-[#1b1b1b] text-gray-100 overflow-hidden font-sans">
        <AppSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((prev) => !prev)}
        />

        <main className="flex-1 flex flex-col h-full min-w-0 bg-[#212121] relative overflow-y-auto">
          <header className="flex items-center justify-between h-14 px-4 border-b border-white/10 bg-[#212121]/90 backdrop-blur shrink-0 sticky top-0 z-30 overflow-visible">
            <div className="flex items-center gap-3">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Open Sidebar"
                >
                  <PanelLeft size={20} />
                </button>
              )}
              <ModelSwitcher
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
              />
            </div>

            <div className="text-xs text-gray-400 hidden sm:block">
              AI Media Studio • Gemini 3.6 Vision
            </div>
          </header>

          <div className="max-w-6xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Control Panel */}
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Creative Prompt
                </label>
                <div className="bg-[#181818] border border-white/10 rounded-2xl p-3 shadow-lg focus-within:border-emerald-500/50 transition-all relative">
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe the image, art style, lighting, or atmosphere..."
                      className="w-full bg-transparent text-white text-sm focus:outline-none resize-none placeholder-gray-500 pr-10"
                    />
                    <div className="absolute bottom-1 right-1">
                      <VoiceInputButton onTranscript={(txt) => setPrompt((prev) => `${prev} ${txt}`.trim())} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Suggestions */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Quick Prompts
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_SUGGESTIONS.map((sug, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(sug)}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-300 truncate max-w-[220px] transition-colors"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Artistic Style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ART_STYLES.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setSelectedStyle(st.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selectedStyle === st.id
                          ? "bg-emerald-500/15 border-emerald-500/50 text-white"
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-xs font-semibold text-white">{st.label}</div>
                      <div className="text-[10px] text-gray-400 truncate">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.id}
                      onClick={() => setAspectRatio(ar.id)}
                      className={`py-2 px-3 rounded-xl border text-xs font-medium text-center transition-all ${
                        aspectRatio === ar.id
                          ? "bg-white/15 text-white border-white/30"
                          : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerateMedia}
                disabled={isGenerating || !prompt.trim()}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 disabled:opacity-40"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Rendering Artwork...</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    <span>Generate Artwork</span>
                  </>
                )}
              </button>
            </div>

            {/* Display Canvas & Gallery */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              <div className="flex-1 bg-[#181818] border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden shadow-xl">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce">
                      <Sparkles size={24} />
                    </div>
                    <span className="text-sm font-medium text-gray-300">Generating HD Artwork...</span>
                  </div>
                ) : activeMedia ? (
                  <div className="w-full h-full flex flex-col items-center justify-center space-y-3">
                    <img
                      src={activeMedia.imageUrl}
                      alt={activeMedia.title}
                      className="max-h-[450px] w-auto object-contain rounded-xl shadow-2xl border border-white/10"
                    />
                    <div className="w-full flex items-center justify-between pt-2 px-2 text-xs">
                      <span className="text-gray-300 font-medium">{activeMedia.title}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyPrompt(activeMedia.enhancedPrompt)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                          title="Copy Enhanced Prompt"
                        >
                          {copiedPrompt ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                        <a
                          href={activeMedia.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition-colors"
                          title="Download Image"
                        >
                          <Download size={14} />
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center text-gray-500 p-8">
                    <ImageIcon size={48} className="mb-3 opacity-40" />
                    <p className="text-sm font-medium">Your generated artwork will appear here</p>
                    <p className="text-xs opacity-60 mt-1">Enter a prompt and select an artistic style to render</p>
                  </div>
                )}
              </div>

              {/* Gallery Strip */}
              {mediaGallery.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                    Session Gallery ({mediaGallery.length})
                  </span>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {mediaGallery.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setActiveMedia(item)}
                        className={`w-24 h-24 rounded-xl border-2 overflow-hidden shrink-0 cursor-pointer transition-all ${
                          activeMedia?.id === item.id
                            ? "border-emerald-500 scale-105"
                            : "border-white/10 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
