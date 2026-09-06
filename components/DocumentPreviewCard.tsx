"use client";

import React, { useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  Sparkles,
  Layers,
  Database,
} from "lucide-react";

export interface AttachedDoc {
  id?: string;
  filename: string;
  fileType: string;
  fileSize: number;
  pageCount: number;
  previewSnippet?: string;
  extractedText?: string;
  imageDataUrl?: string;
  chunks?: Array<{ id: string; index: number; content: string; metadata?: any }>;
}

interface DocumentPreviewCardProps {
  document: AttachedDoc | null;
  onRemove: () => void;
  onAskContextDoubt: (query: string) => void;
  onImageLoad?: () => void;
  isStreaming?: boolean;
}

export const DocumentPreviewCard: React.FC<DocumentPreviewCardProps> = ({
  document,
  onRemove,
  onAskContextDoubt,
  onImageLoad,
  isStreaming = false,
}) => {
  const [showExtractedView, setShowExtractedView] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"text" | "chunks">("text");
  const [queryInput, setQueryInput] = useState<string>("");

  if (!document) return null;

  const isImage =
    document.fileType === "image" ||
    document.imageDataUrl ||
    document.filename.match(/\.(png|jpg|jpeg|webp|gif)$/i);

  const formattedSize =
    document.fileSize > 1024 * 1024
      ? `${(document.fileSize / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(document.fileSize / 1024))} KB`;

  const handleQuickDoubtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || isStreaming) return;
    onAskContextDoubt(queryInput.trim());
    setQueryInput("");
  };

  const handleChipClick = (suggestion: string) => {
    if (isStreaming) return;
    onAskContextDoubt(suggestion);
  };

  return (
    <div className="mb-4 rounded-2xl border border-emerald-900/40 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 backdrop-blur-md p-4 shadow-2xl transition-all">
      {/* Header Info Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-emerald-950/80 border border-emerald-700/50 flex items-center justify-center text-emerald-400">
            {isImage ? <ImageIcon size={20} /> : <FileText size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-100 truncate max-w-xs md:max-w-md">
                {document.filename}
              </h4>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                {document.fileType}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
              <span>{formattedSize}</span>
              <span>•</span>
              <span>
                {isImage ? "Vision OCR Ready" : `${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}`}
              </span>
              {document.chunks && document.chunks.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400 font-mono">
                    {document.chunks.length} pgvector chunks
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowExtractedView(!showExtractedView)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-300 transition-colors border border-zinc-700/60"
          >
            <Layers size={13} className="text-emerald-400" />
            <span>{showExtractedView ? "Hide Context" : "Extracted RAG Context"}</span>
            {showExtractedView ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onRemove}
            className="text-zinc-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            title="Remove document context"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Image Thumbnail Preview (if applicable) */}
      {isImage && document.imageDataUrl && (
        <div className="mt-3 relative rounded-xl overflow-hidden border border-zinc-800 bg-black/50 max-h-48 flex items-center justify-center">
          <img
            src={document.imageDataUrl}
            alt="Doubt attachment preview"
            className="max-h-48 object-contain rounded-lg"
            onLoad={onImageLoad}
          />
        </div>
      )}

      {/* Toggle View: Extracted Text / RAG Chunks */}
      {showExtractedView && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-black/60 p-3 text-xs">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-800 text-zinc-400">
            <button
              onClick={() => setActiveTab("text")}
              className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors ${
                activeTab === "text"
                  ? "bg-zinc-800 text-white"
                  : "hover:text-zinc-200"
              }`}
            >
              Raw Extracted Text
            </button>
            <button
              onClick={() => setActiveTab("chunks")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium text-xs transition-colors ${
                activeTab === "chunks"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800/60"
                  : "hover:text-zinc-200"
              }`}
            >
              <Database size={11} />
              pgvector Chunks ({document.chunks ? document.chunks.length : "indexed"})
            </button>
          </div>

          <div className="max-h-44 overflow-y-auto font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {activeTab === "text" ? (
              document.extractedText || document.previewSnippet || "No extracted text found."
            ) : document.chunks && document.chunks.length > 0 ? (
              <div className="space-y-2">
                {document.chunks.map((ch, idx) => (
                  <div
                    key={ch.id || idx}
                    className="p-2 rounded bg-zinc-900 border border-zinc-800"
                  >
                    <div className="text-[10px] text-emerald-400 mb-1">
                      Chunk #{idx + 1} • Page {ch.metadata?.page || 1}
                    </div>
                    <p className="text-zinc-300 text-xs">{ch.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 italic">
                Chunks indexed in PostgreSQL pgvector. Ready for semantic doubt search.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dedicated Context Doubt Bar */}
      <div className="mt-3 pt-3 border-t border-zinc-800/80">
        <form onSubmit={handleQuickDoubtSubmit} className="relative flex items-center">
          <div className="absolute left-3 text-emerald-400">
            <Sparkles size={15} />
          </div>
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={
              isImage
                ? "Ask a doubt about this photo (e.g. 'Solve step-by-step', 'Explain the equation')..."
                : "Ask anything about this document (e.g. 'Summarize key points', 'Explain formula on page 2')..."
            }
            className="w-full pl-9 pr-24 py-2 rounded-xl bg-zinc-950/80 border border-zinc-700/60 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
          />
          <button
            type="submit"
            disabled={!queryInput.trim() || isStreaming}
            className="absolute right-1.5 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-medium text-xs transition-colors flex items-center gap-1"
          >
            <Search size={12} />
            Ask
          </button>
        </form>

        {/* Quick Context Action Chips */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {isImage ? (
            <>
              <button
                type="button"
                onClick={() => handleChipClick("Explain this handwritten formula step-by-step with LaTeX")}
                className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800/70 hover:bg-emerald-950 hover:text-emerald-300 text-zinc-300 border border-zinc-700/50 transition-colors"
              >
                🔢 Solve Handwritten Formula
              </button>
              <button
                type="button"
                onClick={() => handleChipClick("Extract all questions from this photo and provide solutions with visual diagrams")}
                className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800/70 hover:bg-emerald-950 hover:text-emerald-300 text-zinc-300 border border-zinc-700/50 transition-colors"
              >
                📊 Extract & Plot Solution
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleChipClick("Provide a comprehensive executive summary of this document with key formulas")}
                className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800/70 hover:bg-emerald-950 hover:text-emerald-300 text-zinc-300 border border-zinc-700/50 transition-colors"
              >
                📑 Summarize Document
              </button>
              <button
                type="button"
                onClick={() => handleChipClick("Extract all key definitions and create a Mermaid concept map")}
                className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800/70 hover:bg-emerald-950 hover:text-emerald-300 text-zinc-300 border border-zinc-700/50 transition-colors"
              >
                🌳 Create Concept Tree
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
