"use client";

import React, { useState, useRef } from "react";
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
  HelpCircle,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { AppSidebar } from "@/components/AppSidebar";

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

export default function HomeworkPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState("Mathematics");
  const [solutionFormat, setSolutionFormat] = useState("step-by-step");
  const [problemText, setProblemText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedAssignmentFile[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [solutionOutput, setSolutionOutput] = useState("");
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      const res = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: selectedSubject,
          problemText,
          solutionFormat,
          files: attachedFiles,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Failed to solve problem.");
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
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 font-medium">
              <GraduationCap size={16} className="text-indigo-400" />
              <span>Homework & Academic Solver</span>
            </div>
          </div>

          <div className="text-xs text-gray-400 hidden sm:block">
            Step-by-Step Logic & Math Breakdown
          </div>
        </header>

        {/* Workspace Content */}
        <div className="max-w-4xl mx-auto w-full p-4 md:p-6 space-y-6">
          {/* Subject Pills Selection */}
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
                        ? `bg-gradient-to-br ${sub.color} border-white/30 text-white shadow-lg shadow-indigo-950/30 font-semibold scale-[1.02]`
                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon size={20} className="mb-1.5" />
                    <span className="text-xs">{sub.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Problem Input & File Upload Card */}
          <div className="p-5 rounded-2xl bg-[#2a2a2a] border border-white/10 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-400" />
                Problem Statement & Assignment Upload
              </span>

              {/* Solution Format Picker */}
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                {SOLUTION_FORMATS.map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => setSolutionFormat(fmt.id)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors font-medium ${
                      solutionFormat === fmt.id
                        ? "bg-indigo-600 text-white shadow"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={problemText}
              onChange={(e) => setProblemText(e.target.value)}
              placeholder={`Paste your ${selectedSubject} problem, equation, prompt, or assignment question here...`}
              rows={4}
              className="w-full bg-[#1e1e1e] text-white placeholder-gray-500 p-4 rounded-xl border border-white/10 focus:outline-none focus:border-indigo-500/50 text-sm resize-none"
            />

            {/* Attached Assignment Files */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs px-3 py-1.5 rounded-lg"
                  >
                    <FileText size={14} />
                    <span className="truncate max-w-[150px] font-medium">{file.name}</span>
                    <button
                      onClick={() => removeFile(idx)}
                      className="p-0.5 hover:text-white text-indigo-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg,text/plain"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium border border-white/10 transition-colors"
              >
                <Paperclip size={16} className="text-indigo-400" />
                <span>Upload PDF / Image Assignment</span>
              </button>

              <button
                onClick={handleSolve}
                disabled={(!problemText.trim() && attachedFiles.length === 0) || isSolving}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md ${
                  (!problemText.trim() && attachedFiles.length === 0) || isSolving
                    ? "bg-white/10 text-gray-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-90 shadow-indigo-950/40"
                }`}
              >
                {isSolving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Solving with Gemini...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Solve Homework</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Solution Output Box */}
          {(solutionOutput || isSolving) && (
            <div className="p-6 rounded-2xl bg-[#2a2a2a] border border-white/10 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <GraduationCap size={18} />
                  <span>Structured Solution & Explanation</span>
                </div>
                {solutionOutput && (
                  <button
                    onClick={handleCopySolution}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy Solution</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {solutionOutput ? (
                <MarkdownRenderer content={solutionOutput} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                  <Loader2 size={32} className="animate-spin text-indigo-400" />
                  <span className="text-sm font-medium">Formulating step-by-step derivation...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
