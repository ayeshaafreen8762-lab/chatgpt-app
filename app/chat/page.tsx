"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  Send,
  Square,
  PanelLeft,
  Bot,
  User,
  Sparkles,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
  HelpCircle,
  Zap,
  Lightbulb,
  FileSearch,
  CheckCircle2,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { AppSidebar, ChatSession } from "@/components/AppSidebar";

export interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64 string
  previewUrl?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  files?: AttachedFile[];
}

const LOCAL_STORAGE_KEY = "omni_ai_chat_sessions_v2";

const DOUBT_CHIPS = [
  {
    label: "Summarize Document",
    prompt: "Provide a comprehensive summary of this document highlighting the key takeaways.",
    icon: FileSearch,
  },
  {
    label: "Key Formulas & Data",
    prompt: "Extract all important metrics, numerical data, and key formulas from this file.",
    icon: Zap,
  },
  {
    label: "Explain Key Sections",
    prompt: "Break down the core sections of this file in simple, easy-to-understand terms.",
    icon: Lightbulb,
  },
  {
    label: "Action Items & Risks",
    prompt: "Identify any action items, recommendations, or potential risks mentioned in this attached file.",
    icon: CheckCircle2,
  },
];

function generateUniqueId(prefix: string): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
}

function createInitialSession(): ChatSession {
  return {
    id: generateUniqueId("chat"),
    title: "New Analysis",
    createdAt: Date.now(),
  };
}

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.error("Failed to load chat sessions", e);
      }
    }
    return [createInitialSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return sessions.length > 0 ? sessions[0].id : null;
  });

  const [sessionMessages, setSessionMessages] = useState<Record<string, Message[]>>({});
  const [inputMessage, setInputMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [doubtInput, setDoubtInput] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
      } catch (e) {
        console.error("Failed to save sessions", e);
      }
    }
  }, [sessions]);

  const currentMessages = useMemo(() => {
    return activeSessionId ? sessionMessages[activeSessionId] || [] : [];
  }, [sessionMessages, activeSessionId]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages, isStreaming]);

  // Handle file uploads
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        const isImage = file.type.startsWith("image/");
        const newFile: AttachedFile = {
          id: generateUniqueId("file"),
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          data: base64Data,
          previewUrl: isImage ? base64Data : undefined,
        };
        setAttachedFiles((prev) => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachedFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const createNewChat = () => {
    if (isStreaming) stopGeneration();
    const newSession = createInitialSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setAttachedFiles([]);
    setInputMessage("");
  };

  const deleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isStreaming && activeSessionId === id) stopGeneration();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    setSessionMessages((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    if (updated.length === 0) {
      const fallback = createInitialSession();
      setSessions([fallback]);
      setActiveSessionId(fallback.id);
    } else if (activeSessionId === id) {
      setActiveSessionId(updated[0].id);
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleSendMessage = async (customText?: string, filesToSend?: AttachedFile[]) => {
    const text = (customText || inputMessage).trim();
    const activeFiles = filesToSend || attachedFiles;

    if ((!text && activeFiles.length === 0) || isStreaming || !activeSessionId) return;

    setInputMessage("");
    setDoubtInput("");
    setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: generateUniqueId("msg_user"),
      role: "user",
      content: text || (activeFiles.length > 0 ? `Analyzed file: ${activeFiles[0].name}` : ""),
      timestamp: Date.now(),
      files: activeFiles.length > 0 ? activeFiles : undefined,
    };

    const assistantMsgId = generateUniqueId("msg_ast");
    const assistantPlaceholder: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    // Update active session messages
    setSessionMessages((prev) => {
      const existing = prev[activeSessionId] || [];
      return {
        ...prev,
        [activeSessionId]: [...existing, userMsg, assistantPlaceholder],
      };
    });

    // Update session title if first message
    setSessions((prevSessions) =>
      prevSessions.map((s) => {
        if (s.id === activeSessionId && s.title === "New Analysis") {
          const newTitle = text.length > 25 ? text.substring(0, 25) + "..." : text || activeFiles[0]?.name || "Document Analysis";
          return { ...s, title: newTitle };
        }
        return s;
      })
    );

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      const historyPayload = currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const filesPayload = activeFiles.map((f) => ({
        name: f.name,
        type: f.type,
        data: f.data,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          files: filesPayload,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Server responded with status ${res.status}`);
      }

      if (!res.body) throw new Error("No response body received.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        setSessionMessages((prev) => {
          const list = prev[activeSessionId] || [];
          return {
            ...prev,
            [activeSessionId]: list.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullContent } : m
            ),
          };
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Stream stopped by user.");
      } else {
        const errStr =
          err instanceof Error
            ? `⚠️ Error: ${err.message}`
            : "⚠️ An error occurred while generating response.";

        setSessionMessages((prev) => {
          const list = prev[activeSessionId] || [];
          return {
            ...prev,
            [activeSessionId]: list.map((m) =>
              m.id === assistantMsgId ? { ...m, content: errStr } : m
            ),
          };
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#1b1b1b] text-gray-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <AppSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={createNewChat}
        onDeleteSession={deleteChat}
      />

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#212121] relative">
        {/* Header Bar */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-white/10 bg-[#212121]/90 backdrop-blur shrink-0 z-10">
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
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 font-medium">
              <Sparkles size={14} className="text-emerald-400" />
              <span>Gemini 3.6 Multimodal</span>
            </div>
          </div>

          <button
            onClick={createNewChat}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="New Chat"
          >
            <Plus size={20} />
          </button>
        </header>

        {/* Message View Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 scroll-smooth">
          {currentMessages.length === 0 ? (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white mb-6 shadow-xl shadow-emerald-950/40">
                <Bot size={36} />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                Chat & Multimodal Document Intelligence
              </h1>
              <p className="text-gray-400 text-sm mb-8 max-w-lg leading-relaxed">
                Upload PDFs, documents, or images to analyze formulas, summarize content, and clear instant doubts powered by Gemini 3.6.
              </p>

              {/* Upload Drop Zone / Quick Upload Prompt */}
              <div className="w-full max-w-xl p-6 rounded-2xl border-2 border-dashed border-white/15 bg-white/5 hover:bg-white/10 transition-all flex flex-col items-center justify-center cursor-pointer mb-8 group"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={32} className="text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-white">Click or drag & drop files here</span>
                <span className="text-xs text-gray-400 mt-1">Supports PDFs, PNG, JPG, TXT, and Markdown files</span>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-6">
              {currentMessages.map((msg, idx) => {
                const isUser = msg.role === "user";
                const isLastAssistant = !isUser && idx === currentMessages.length - 1 && isStreaming;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-4 p-4 rounded-2xl transition-colors ${
                      isUser
                        ? "bg-white/5 border border-white/10 max-w-[88%] ml-auto"
                        : "bg-transparent w-full"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isUser
                          ? "bg-indigo-600 text-white"
                          : "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                      }`}
                    >
                      {isUser ? <User size={18} /> : <Bot size={18} />}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="text-xs font-semibold text-gray-400">
                        {isUser ? "You" : "Gemini 3.6"}
                      </div>

                      {/* Display attached files if any */}
                      {msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 py-1">
                          {msg.files.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium"
                            >
                              {file.previewUrl ? (
                                <img
                                  src={file.previewUrl}
                                  alt={file.name}
                                  className="w-6 h-6 object-cover rounded"
                                />
                              ) : (
                                <FileText size={16} className="text-emerald-400" />
                              )}
                              <span className="truncate max-w-[150px]">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.content ? (
                        <div className="relative">
                          <MarkdownRenderer content={msg.content} />
                          {isLastAssistant && (
                            <span className="inline-block w-2 h-4 ml-1 bg-emerald-400 animate-pulse align-middle" />
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                          <Loader2 size={16} className="animate-spin text-emerald-400" />
                          <span>Analyzing content with Gemini 3.6...</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Document Doubt Clarification Bar (Context Aware) */}
        {attachedFiles.length > 0 && (
          <div className="w-full max-w-3xl mx-auto px-4 mb-2">
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 backdrop-blur shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
                <div className="flex items-center gap-1.5">
                  <HelpCircle size={14} className="text-emerald-400" />
                  <span>Clarify Doubts on Attached File ({attachedFiles.length})</span>
                </div>
                <button
                  onClick={() => setAttachedFiles([])}
                  className="text-gray-400 hover:text-white text-[11px]"
                >
                  Clear Files
                </button>
              </div>

              {/* Doubt Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {DOUBT_CHIPS.map((chip, idx) => {
                  const ChipIcon = chip.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(chip.prompt)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-medium shrink-0 transition-colors border border-emerald-500/20"
                    >
                      <ChipIcon size={12} className="text-emerald-300" />
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Input Bar Area */}
        <div className="w-full max-w-3xl mx-auto px-4 pb-4">
          {/* File Attachment Previews */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-[#2a2a2a] rounded-t-xl border-t border-x border-white/10">
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-1.5 rounded-lg"
                >
                  {file.previewUrl ? (
                    <img src={file.previewUrl} alt={file.name} className="w-5 h-5 object-cover rounded" />
                  ) : (
                    <FileText size={14} />
                  )}
                  <span className="truncate max-w-[140px] font-medium">{file.name}</span>
                  <button
                    onClick={() => removeAttachedFile(file.id)}
                    className="p-0.5 hover:text-white text-emerald-400"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative bg-[#2f2f2f] rounded-2xl border border-white/10 shadow-xl focus-within:border-white/20 transition-all">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or clarify doubts about your files..."
              rows={1}
              className="w-full bg-transparent text-white placeholder-gray-400 px-4 py-3.5 pr-24 focus:outline-none resize-none text-sm max-h-48 overflow-y-auto"
            />

            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Attach Document or Image"
              >
                <Paperclip size={18} />
              </button>

              {isStreaming ? (
                <button
                  onClick={stopGeneration}
                  className="p-2 rounded-lg bg-white text-black hover:bg-gray-200 transition-colors"
                  title="Stop generating"
                >
                  <Square size={16} className="fill-black" />
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() && attachedFiles.length === 0}
                  className={`p-2 rounded-lg transition-colors ${
                    inputMessage.trim() || attachedFiles.length > 0
                      ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-950/30"
                      : "bg-white/10 text-gray-500 cursor-not-allowed"
                  }`}
                  title="Send Message"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-center text-gray-500 mt-2">
            Gemini 3.6 Multimodal AI • Check important file data.
          </div>
        </div>
      </main>
    </div>
  );
}
