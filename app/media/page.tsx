"use client";

import React, { useState } from "react";
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
  Maximize2,
  RefreshCw,
  Sliders,
  Layers,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";

const ART_STYLES = [
  { id: "Cinematic", label: "Cinematic", desc: "Dramatic lighting & movie depth" },
  { id: "Cyberpunk", label: "Cyberpunk", desc: "Neon lights & futuristic tech" },
  { id: "Anime", label: "Anime / Manga", desc: "Vibrant cel-shaded illustrations" },
  { id: "Photorealistic", label: "Photorealistic", desc: "Hyper-detailed camera render" },
  { id: "3D Render", label: "3D Digital Art", desc: "Octane render & smooth textures" },
  { id: "Oil Painting", label: "Oil Painting", desc: "Classic textured brushstrokes" },
];

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 Landscape", ratioClass: "aspect-video" },
  { id: "1:1", label: "1:1 Square", ratioClass: "aspect-square" },
  { id: "9:16", label: "9:16 Story/Mobile", ratioClass: "aspect-[9/16]" },
  { id: "4:3", label: "4:3 Classic", ratioClass: "aspect-[4/3]" },
];

const PROMPT_SUGGESTIONS = [
  "A futuristic neon cyberpunk metropolis during rain at dusk",
  "A majestic glowing cosmic whale soaring through nebulae in deep space",
  "An ancient mystical library inside a giant hollow ancient tree with sunbeams",
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

export default function MediaStudioPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("Cinematic");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [mediaGallery, setMediaGallery] = useState<GeneratedMediaItem[]>([]);
  const [activeMedia, setActiveMedia] = useState<GeneratedMediaItem | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleGenerateMedia = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);

    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          style: selectedStyle,
          aspectRatio,
          negativePrompt,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Failed to generate media.");
      }

      const data = await res.json();

      const newMediaItem: GeneratedMediaItem = {
        id: `media_${Date.now()}`,
        title: data.title || "AI Concept Art",
        prompt: prompt,
        enhancedPrompt: data.enhancedPrompt,
        style: selectedStyle,
        aspectRatio: aspectRatio,
        imageUrl: data.imageUrl,
        createdAt: Date.now(),
      };

      setMediaGallery((prev) => [newMediaItem, ...prev]);
      setActiveMedia(newMediaItem);
    } catch (err: unknown) {
      console.error("Media generation failed", err);
      alert(err instanceof Error ? err.message : "Media generation failed.");
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
    <div className="flex h-screen w-full bg-[#1b1b1b] text-gray-100 overflow-hidden font-sans">
      <AppSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
      />

      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#212121] relative overflow-y-auto">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-white/10 bg-[#212121]/90 backdrop-blur shrink-0 sticky top-0 z-10">
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
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 font-medium">
              <Palette size={16} className="text-purple-400" />
              <span>AI Media & Concept Studio</span>
            </div>
          </div>

          <div className="text-xs text-gray-400 hidden sm:block">
            Gemini Prompt Engineering & Concept Art Studio
          </div>
        </header>

        {/* Content Layout */}
        <div className="max-w-6xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Controls Column (Prompt & Controls) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="p-5 rounded-2xl bg-[#2a2a2a] border border-white/10 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <Wand2 size={16} className="text-purple-400" />
                  Prompt & Concept Idea
                </span>
                <span className="text-xs text-purple-400 font-medium">Gemini 3.6 Enhanced</span>
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your visual concept, scene, or character art..."
                rows={3}
                className="w-full bg-[#1e1e1e] text-white placeholder-gray-500 p-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500/50 text-sm resize-none"
              />

              {/* Sample Prompt Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                  Quick Prompt Ideas
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_SUGGESTIONS.map((sug, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(sug)}
                      className="text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 px-2.5 py-1 rounded-lg border border-white/5 truncate max-w-xs transition-colors"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Art Style Options */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Artistic Style Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ART_STYLES.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setSelectedStyle(st.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selectedStyle === st.id
                          ? "bg-purple-600/30 border-purple-500 text-white font-medium shadow-md shadow-purple-950/30"
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">{st.label}</div>
                      <div className="text-[10px] text-gray-400 line-clamp-1">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio Picker */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.id}
                      onClick={() => setAspectRatio(ar.id)}
                      className={`py-2 px-3 rounded-lg border text-xs text-center font-medium transition-all ${
                        aspectRatio === ar.id
                          ? "bg-purple-600 text-white border-purple-400 shadow"
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Action Button */}
              <button
                onClick={handleGenerateMedia}
                disabled={!prompt.trim() || isGenerating}
                className={`w-full py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                  !prompt.trim() || isGenerating
                    ? "bg-white/10 text-gray-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 text-white hover:opacity-95 shadow-purple-950/40"
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Engaging Gemini Art Engine...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Generate Concept Art</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Preview Column (Canvas & Gallery) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Main Canvas Display */}
            <div className="p-5 rounded-2xl bg-[#2a2a2a] border border-white/10 shadow-2xl flex flex-col min-h-[420px] justify-between">
              {activeMedia ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white">{activeMedia.title}</h3>
                      <span className="text-xs text-purple-400 font-medium">
                        Style: {activeMedia.style} • {activeMedia.aspectRatio}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyPrompt(activeMedia.enhancedPrompt)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                        title="Copy Enhanced Prompt"
                      >
                        {copiedPrompt ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      </button>
                      <a
                        href={activeMedia.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center gap-1 text-xs font-semibold"
                        title="Download Full Resolution"
                      >
                        <Download size={14} />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>

                  {/* Rendered Image */}
                  <div className="relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/10 group flex items-center justify-center">
                    <img
                      src={activeMedia.imageUrl}
                      alt={activeMedia.title}
                      className="w-full h-auto max-h-[500px] object-contain rounded-xl"
                    />
                  </div>

                  {/* Enhanced Gemini Prompt info box */}
                  <div className="p-3.5 rounded-xl bg-[#1e1e1e] border border-white/5 space-y-1">
                    <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
                      Gemini Enhanced Master Prompt
                    </span>
                    <p className="text-xs text-gray-300 leading-relaxed font-mono">
                      {activeMedia.enhancedPrompt}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-gray-400 space-y-3">
                  {isGenerating ? (
                    <>
                      <Loader2 size={40} className="animate-spin text-purple-400" />
                      <div className="text-sm font-semibold text-white">Generating AI Concept Art...</div>
                      <p className="text-xs text-gray-400 max-w-xs">
                        Gemini is enhancing visual prompts & rendering high resolution lighting vectors.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
                        <ImageIcon size={32} />
                      </div>
                      <div className="text-base font-semibold text-white">Creative Studio Canvas</div>
                      <p className="text-xs text-gray-400 max-w-sm">
                        Select an artistic style, enter your visual prompt, and click Generate Concept Art!
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Recent Gallery Thumbnails */}
            {mediaGallery.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                  Generated Studio Gallery ({mediaGallery.length})
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {mediaGallery.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveMedia(item)}
                      className={`relative rounded-xl overflow-hidden border transition-all aspect-video bg-[#1a1a1a] ${
                        activeMedia?.id === item.id
                          ? "border-purple-500 ring-2 ring-purple-500/50 scale-[1.02]"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
