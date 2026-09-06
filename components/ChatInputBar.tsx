"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Camera,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Paperclip,
  GitFork,
  HelpCircle,
  FileUp,
  FileText,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import VoiceInputButton from "./VoiceInputButton";
import { AttachedDoc } from "./DocumentPreviewCard";

export interface ChatInputBarProps {
  onSendMessage: (message: string) => void;
  onFileUpload: (file: File) => void;
  onOpenCamera: () => void;
  attachedDocument?: AttachedDoc | null;
  onRemoveAttachment?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSendMessage,
  onFileUpload,
  onOpenCamera,
  attachedDocument,
  onRemoveAttachment,
  isStreaming,
  disabled = false,
}) => {
  const [inputText, setInputText] = useState("");
  const baseVoiceTextRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-expand textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 2. Absolute clear-on-send: capture text, clear immediately, then dispatch async call
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isStreaming || disabled) return;

    const cleanMessage = inputText.trim();

    // Clear textarea state and DOM value before the async API call fires
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }

    onSendMessage(cleanMessage);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log("[ChatInputBar] Selected file:", file.name, file.size, file.type);
      onFileUpload(file);
    }
    // reset input so same file can be selected again
    e.target.value = "";
  };

  // 1. Chip clicks REPLACE the prompt entirely instead of appending
  const handleChipSelect = (chipText: string) => {
    setInputText(chipText);
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Move caret to end of newly set text
      const len = chipText.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4">
      {/* Hidden File Input (Accepts ANY file) */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,.csv,.json,.png,.jpg,.jpeg,.webp,.md"
      />

      {/* Interactive Action Chips Above Input Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors whitespace-nowrap"
        >
          <FileUp size={13} className="text-emerald-400" />
          <span>Upload Document</span>
        </button>

        <button
          type="button"
          onClick={onOpenCamera}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors whitespace-nowrap"
        >
          <Camera size={13} className="text-cyan-400" />
          <span>Take Picture</span>
        </button>

        <button
          type="button"
          onClick={() => handleChipSelect("Explain this step-by-step with intuitive analogies:")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors whitespace-nowrap"
        >
          <Sparkles size={13} className="text-amber-400" />
          <span>Explain Step-by-Step</span>
        </button>

        <button
          type="button"
          onClick={() => handleChipSelect("Generate a visual flowchart or dynamic graph for:")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors whitespace-nowrap"
        >
          <GitFork size={13} className="text-purple-400" />
          <span>Generate Visual Diagram</span>
        </button>
      </div>

      {/* Main Unified Input Box */}
      <div className="relative rounded-2xl border border-zinc-700/80 bg-zinc-900/90 shadow-2xl focus-within:border-emerald-500/80 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
        {/* Visible Attached File / Image Chip in the Input Bar */}
        {attachedDocument && (
          <div className="mx-3 mt-2.5 p-2 rounded-xl bg-zinc-800/90 border border-emerald-500/30 flex items-center justify-between gap-2.5 text-xs shadow-inner">
            <div className="flex items-center gap-2.5 min-w-0">
              {attachedDocument.imageDataUrl || attachedDocument.fileType === "image" ? (
                <div className="h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 bg-black/50 border border-zinc-700 flex items-center justify-center">
                  <img
                    src={attachedDocument.imageDataUrl}
                    alt={attachedDocument.filename}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-lg bg-emerald-950/90 border border-emerald-600/50 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <FileText size={18} />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-zinc-100 truncate max-w-[180px] sm:max-w-xs md:max-w-md">
                    {attachedDocument.filename}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                    {attachedDocument.fileType}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                  <span>
                    {attachedDocument.fileSize > 1024 * 1024
                      ? `${(attachedDocument.fileSize / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(attachedDocument.fileSize / 1024))} KB`}
                  </span>
                  <span>•</span>
                  {attachedDocument.id ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 size={11} />
                      Ready for questions
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Loader2 size={11} className="animate-spin" />
                      Uploading & Indexing...
                    </span>
                  )}
                </div>
              </div>
            </div>
            {onRemoveAttachment && (
              <button
                type="button"
                onClick={onRemoveAttachment}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-700/60 transition-colors flex-shrink-0"
                title="Remove attached document"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        <div className="flex items-end px-3 py-2.5 gap-2">
          {/* Attachment Button (+) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach any document or photo (PDF, DOCX, CSV, TXT, Images)"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
          >
            <Plus size={20} />
          </button>

          {/* Camera Button */}
          <button
            type="button"
            onClick={onOpenCamera}
            title="Take photo of handwritten math or textbook doubt"
            className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-colors flex-shrink-0"
          >
            <Camera size={20} />
          </button>

          {/* Auto-expanding Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask any math, physics, or coding doubt (e.g., 'Derive Schrödinger wave equation', 'Graph quadratic root')..."
            className="w-full max-h-[200px] resize-none bg-transparent border-0 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-0 leading-relaxed py-1.5"
          />

          {/* Microphone Voice Button */}
          <VoiceInputButton 
            onStart={() => {
              baseVoiceTextRef.current = inputText.trim();
            }}
            onTranscript={(liveTranscript) => {
              const base = baseVoiceTextRef.current;
              const newText = base ? `${base} ${liveTranscript}` : liveTranscript;
              setInputText(newText);
            }} 
            className="flex-shrink-0"
          />

          {/* Send Message Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!inputText.trim() || isStreaming || disabled}
            className="p-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 disabled:hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-950 flex-shrink-0"
            title="Send doubt query"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      <div className="text-center mt-2 text-[11px] text-zinc-500">
        Free & Open-Source AI Tutor powered by Groq Llama 3.3 70B & Vision. Verify critical academic calculations.
      </div>
    </div>
  );
};
