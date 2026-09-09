"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  GraduationCap,
  BookOpen,
  Calculator,
  Atom,
  Binary,
  FlaskConical,
  Dna,
  FileText,
  Paperclip,
  Send,
  Loader2,
  Check,
  Copy,
  Sparkles,
  PanelLeft,
  X,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { AppSidebar } from "@/components/AppSidebar";
import ModelSwitcher from "@/components/ModelSwitcher";
import VoiceInputButton from "@/components/VoiceInputButton";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

const SUBJECTS = [
  { id: "Mathematics", label: "Mathematics", icon: Calculator, color: "from-blue-500 to-indigo-600" },
  { id: "Physics", label: "Physics", icon: Atom, color: "from-purple-500 to-pink-600" },
  { id: "Computer Science", label: "Computer Science", icon: Binary, color: "from-emerald-500 to-teal-600" },
  { id: "Chemistry", label: "Chemistry", icon: FlaskConical, color: "from-amber-500 to-orange-600" },
  { id: "Biology", label: "Biology", icon: Dna, color: "from-green-500 to-emerald-600" },
  { id: "General Science", label: "General Science", icon: BookOpen, color: "from-cyan-500 to-blue-600" },
];

const SOLUTION_FORMATS = [
  { id: "step-by-step", label: "Step-by-Step Explanation" },
  { id: "quick-summary", label: "Quick Summary & Final Answer" },
  { id: "code-breakdown", label: "Python & Code Breakdown" },
];

export interface AttachedAssignmentFile {
  name: string;
  type: string;
  data: string;
  size: number;
}

import { getBackendUrl, DEFAULT_MODEL_ID } from "@/lib/config";

const LOCAL_STORAGE_MODEL_KEY = "omni_ai_selected_model";
const API_BASE = getBackendUrl();

export default function HomeworkPage() {
  const { getAuthHeaders } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState("Mathematics");
  const [solutionFormat, setSolutionFormat] = useState("step-by-step");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [problemText, setProblemText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedAssignmentFile[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [solutionOutput, setSolutionOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        setAttachedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type || "application/pdf",
            data: base64Data,
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSolve = async () => {
    if (!problemText.trim() && attachedFiles.length === 0) return;

    setIsSolving(true);
    setSolutionOutput("");

    try {
      let customEndpoint = undefined;
      if (selectedModel === "hosted-cloud-llm" && typeof window !== "undefined") {
        customEndpoint = localStorage.getItem("custom_llm_endpoint_url") || undefined;
      }

      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/homework`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            subject: selectedSubject,
            problemText,
            solutionFormat,
            model: selectedModel,
            customEndpoint,
            files: attachedFiles,
          }),
        });
        if (!res.ok) throw new Error(`Backend returned status ${res.status}`);
      } catch (directErr) {
        console.warn("Direct homework service unreachable, using fallback route:", directErr);
        res = await fetch("/api/homework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: selectedSubject,
            problemText,
            solutionFormat,
            model: selectedModel,
            customEndpoint,
            files: attachedFiles,
          }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.error || "Failed to solve problem.");
      }

      if (!res.body) throw new Error("No response stream received.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setSolutionOutput(fullText);
      }
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : "An error occurred.";
      setSolutionOutput(`⚠️ Error: ${errStr}`);
    } finally {
      setIsSolving(false);
    }
  };

  const handleCopySolution = () => {
    if (!solutionOutput) return;
    navigator.clipboard.writeText(solutionOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              Homework Solver • Gemini 3.6 Academic QA
            </div>
          </header>

          <div className="max-w-4xl mx-auto w-full p-4 md:p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Select Subject Area
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {SUBJECTS.map((sub) => {
                  const Icon = sub.icon;
                  const isSelected = selectedSubject === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSubject(sub.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        isSelected
                          ? "bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm"
                          : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10"
                      }`}
                    >
                      <Icon size={20} className={isSelected ? "text-emerald-400" : "text-gray-400"} />
                      <span className="text-xs font-medium mt-1.5">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Output Solution Format
              </label>
              <div className="flex flex-wrap gap-2">
                {SOLUTION_FORMATS.map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => setSolutionFormat(fmt.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      solutionFormat === fmt.id
                        ? "bg-white/15 text-white border-white/30"
                        : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Problem Input Box */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Problem Statement / Assignment Text
              </label>
              <div className="relative bg-[#181818] border border-white/10 rounded-2xl p-4 shadow-lg focus-within:border-emerald-500/50 transition-all">
                <div className="relative">
                  <textarea
                    rows={4}
                    value={problemText}
                    onChange={(e) => setProblemText(e.target.value)}
                    placeholder="Paste math equations, physics prompts, coding challenges, or assignment text..."
                    className="w-full bg-transparent text-white text-sm focus:outline-none resize-none placeholder-gray-500 pr-10"
                  />
                  <div className="absolute bottom-1 right-1">
                    <VoiceInputButton onTranscript={(txt) => setProblemText((prev) => `${prev} ${txt}`.trim())} />
                  </div>
                </div>

                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                    {attachedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300"
                      >
                        <FileText size={14} />
                        <span className="truncate max-w-[150px]">{file.name}</span>
                        <button onClick={() => removeFile(idx)} className="hover:text-red-400 ml-1">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 border border-white/10 transition-colors"
                    >
                      <Paperclip size={14} className="text-emerald-400" />
                      <span>Attach Assignment File</span>
                    </button>
                  </div>

                  <button
                    onClick={handleSolve}
                    disabled={isSolving || (!problemText.trim() && attachedFiles.length === 0)}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium text-xs shadow-md shadow-emerald-950/40 disabled:opacity-40 transition-all"
                  >
                    {isSolving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Solving with Gemini 3.6...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Generate Academic Solution</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Solution Output Container */}
            {solutionOutput && (
              <div className="p-6 rounded-2xl bg-[#181818] border border-emerald-500/30 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <GraduationCap size={18} />
                    <span>Academic Solution Output</span>
                  </div>
                  <button
                    onClick={handleCopySolution}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition-colors"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copied ? "Copied" : "Copy Solution"}</span>
                  </button>
                </div>

                <MarkdownRenderer content={solutionOutput} />
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
