"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Sparkles,
  Bot,
  User as UserIcon,
  PanelLeft,
  Square,
  FileSearch,
  BookOpen,
  Cpu,
  RefreshCw,
  Atom,
  Sigma,
  FileText,
} from "lucide-react";
import { AppSidebar, ChatSession } from "@/components/AppSidebar";
import { VisualRenderer } from "@/components/VisualRenderer";
import { ChatInputBar } from "@/components/ChatInputBar";
import { DocumentPreviewCard, AttachedDoc } from "@/components/DocumentPreviewCard";
import { CameraModal } from "@/components/CameraModal";
import { UserProfileModal } from "@/components/UserProfileModal";
import { ModelSwitcher, readPersistedModelId } from "@/components/ModelSwitcher";
import { useAuth } from "@/context/AuthContext";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  files?: any[];
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";

const QUICK_DOUBT_TEMPLATES = [
  {
    title: "Derive Physics Law",
    prompt: "Derive the law of conservation of angular momentum and show a Mermaid flowchart of the steps.",
    icon: Atom,
  },
  {
    title: "Plot Math Equation",
    prompt: "Solve and plot the roots of the quadratic function f(x) = x^2 - 4x + 3 using Recharts with step-by-step LaTeX derivation.",
    icon: Sigma,
  },
  {
    title: "Algorithm Flowchart",
    prompt: "Explain Dijkstra's shortest path algorithm step-by-step with a Mermaid logic tree and time complexity formula in LaTeX.",
    icon: Cpu,
  },
  {
    title: "Textbook Doubt Solver",
    prompt: "Explain the Heisenberg uncertainty principle and state its mathematical formulation using display math LaTeX.",
    icon: BookOpen,
  },
];

export default function ChatPage() {
  const { user, getAuthHeaders, isAuthenticated, logout } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // On desktop, open sidebar by default; keep closed on mobile
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSidebarOpen(window.innerWidth >= 768);
    }
  }, []);
  // Default model is loaded from localStorage (scoped per user) after mount
  const [selectedModel, setSelectedModel] = useState("groq/compound");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Record<string, Message[]>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<AttachedDoc | null>(null);
  // Fallback notice: shown when the backend switched to a different model
  const [fallbackNotice, setFallbackNotice] = useState<{ original: string; used: string } | null>(null);
  const [modelUsed, setModelUsed] = useState<string>("");
  const slowConnectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    }
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  // Restore persisted model selection scoped to the logged-in user
  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = readPersistedModelId(user?.id, "groq/compound");
    if (persisted) setSelectedModel(persisted);
  }, [user?.id]);

  // Fetch or initialize sessions
  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/sessions`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && Array.isArray(data.sessions) && data.sessions.length > 0) {
          setSessions(data.sessions);
          if (!activeSessionId) {
            setActiveSessionId(data.sessions[0].id);
            fetchSessionMessages(data.sessions[0].id);
          }
        } else {
          await createNewSession();
        }
      }
    } catch (err) {
      console.warn("Could not connect to backend sessions, using local mode:", err);
      // Fallback local session
      const localId = `sess_${Date.now()}`;
      setSessions([{ id: localId, title: "New Doubt Session", createdAt: Date.now() }]);
      setActiveSessionId(localId);
    }
  };

  const fetchSessionMessages = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/messages`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          const formatted: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp * 1000,
          }));
          setSessionMessages((prev) => ({ ...prev, [sessionId]: formatted }));
        }
      }
    } catch (err) {
      console.warn("Fetch messages note:", err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [isAuthenticated]);

  const currentMessages = useMemo(() => {
    return activeSessionId ? sessionMessages[activeSessionId] || [] : [];
  }, [sessionMessages, activeSessionId]);

  useEffect(() => {
    scrollToBottom("smooth");
  }, [currentMessages, isStreaming, activeDocument, scrollToBottom]);

  const createNewSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title: "New Doubt Session",
          model: selectedModel,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newSess = {
          id: data.session.id,
          title: data.session.title,
          createdAt: Date.now(),
        };
        setSessions((prev) => [newSess, ...prev]);
        setActiveSessionId(newSess.id);
        setSessionMessages((prev) => ({ ...prev, [newSess.id]: [] }));
        setActiveDocument(null);
      }
    } catch (err) {
      const localId = `sess_${Date.now()}`;
      const newSess = { id: localId, title: "New Doubt Session", createdAt: Date.now() };
      setSessions((prev) => [newSess, ...prev]);
      setActiveSessionId(localId);
      setSessionMessages((prev) => ({ ...prev, [localId]: [] }));
      setActiveDocument(null);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessId: string) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/chat/sessions/${sessId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.warn("Delete session error:", err);
    }

    setSessions((prev) => prev.filter((s) => s.id !== sessId));
    setSessionMessages((prev) => {
      const copy = { ...prev };
      delete copy[sessId];
      return copy;
    });

    if (activeSessionId === sessId) {
      const remaining = sessions.filter((s) => s.id !== sessId);
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
        fetchSessionMessages(remaining[0].id);
      } else {
        createNewSession();
      }
    }
  };

  // Handle ANY File Upload (PDF, DOCX, TXT, CSV, Images) via RAG endpoint
  const handleFileUpload = async (file: File) => {
    console.log("[handleFileUpload] Processing file:", file.name, file.size, file.type);
    const isImage = file.type.startsWith("image/");
    const localPreviewUrl = isImage ? URL.createObjectURL(file) : undefined;

    // Set preliminary document state so chip appears immediately in the input bar
    const docData: AttachedDoc = {
      filename: file.name,
      fileType: isImage ? "image" : file.name.split(".").pop() || "document",
      fileSize: file.size,
      pageCount: 1,
      imageDataUrl: localPreviewUrl,
    };
    setActiveDocument(docData);
    setTimeout(() => scrollToBottom("smooth"), 50);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Do NOT set Content-Type manually for FormData - browser sets multipart/form-data + boundary automatically
      const uploadHeaders: Record<string, string> = {};
      const authHeaders = getAuthHeaders();
      if (authHeaders["Authorization"]) {
        uploadHeaders["Authorization"] = authHeaders["Authorization"];
      }

      const res = await fetch(`${API_BASE}/api/documents/upload`, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const docInfo = data.document;
        setActiveDocument({
          id: docInfo.id,
          filename: docInfo.filename,
          fileType: docInfo.fileType,
          fileSize: docInfo.fileSize,
          pageCount: docInfo.pageCount,
          previewSnippet: docInfo.previewSnippet,
          imageDataUrl: localPreviewUrl,
        });
        setTimeout(() => scrollToBottom("smooth"), 50);

        // Optionally fetch full chunk details for inspector
        if (docInfo.id) {
          const detailRes = await fetch(`${API_BASE}/api/documents/${docInfo.id}`);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setActiveDocument((prev) =>
              prev
                ? {
                    ...prev,
                    extractedText: detailData.document.extractedText,
                    chunks: detailData.document.chunks,
                  }
                : null
            );
          }
        }
      }
    } catch (err) {
      console.warn("Upload to backend error, using local fallback:", err);
    }
  };

  // Handle Camera Snapshot Capture
  const handleCameraCapture = async (imageDataUrl: string) => {
    console.log("[handleCameraCapture] Camera capture received, bytes length:", imageDataUrl.length);
    const docData: AttachedDoc = {
      filename: `Camera_Doubt_${new Date().toLocaleTimeString().replace(/:/g, "-")}.jpg`,
      fileType: "image",
      fileSize: Math.round((imageDataUrl.length * 3) / 4),
      pageCount: 1,
      imageDataUrl: imageDataUrl,
    };
    setActiveDocument(docData);
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Send snapshot as file to backend RAG
    try {
      const res = await fetch(imageDataUrl);
      const blob = await res.blob();
      const file = new File([blob], docData.filename, { type: "image/jpeg" });
      handleFileUpload(file);
    } catch (err) {
      console.warn("Camera blob conversion error:", err);
    }
  };

  // Main SSE Message Sender with Groq / RAG
  const handleSendMessage = async (userText: string) => {
    if (!userText.trim() || isStreaming) return;

    const currentSessId = activeSessionId || `sess_${Date.now()}`;
    const userMsgId = `msg_user_${Date.now()}`;
    const asstMsgId = `msg_asst_${Date.now()}`;

    // Snapshot attached document for this message and clear input bar attachment state
    const attachedDocForMessage = activeDocument;
    setActiveDocument(null);

    const newUserMsg: Message = {
      id: userMsgId,
      role: "user",
      content: userText,
      timestamp: Date.now(),
      files: attachedDocForMessage ? [{ ...attachedDocForMessage }] : undefined,
    };

    const initialAsstMsg: Message = {
      id: asstMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setSessionMessages((prev) => ({
      ...prev,
      [currentSessId]: [...(prev[currentSessId] || []), newUserMsg, initialAsstMsg],
    }));

    setIsStreaming(true);
    setIsSlowConnection(false);
    setConnectionError(null);
    setFallbackNotice(null);
    abortControllerRef.current = new AbortController();
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Show "waking up server" banner if response takes > 5s (Render free-tier cold start)
    slowConnectionTimerRef.current = setTimeout(() => {
      setIsSlowConnection(true);
    }, 5000);

    try {
      let customEndpoint = undefined;
      if (selectedModel === "hosted-cloud-llm" && typeof window !== "undefined") {
        customEndpoint = localStorage.getItem("custom_llm_endpoint_url") || undefined;
      }

      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          prompt: userText,
          message: userText,
          // Send both model_id (new) and model (legacy) for maximum compatibility
          model_id: selectedModel,
          model: selectedModel,
          sessionId: currentSessId,
          customEndpoint,
          documentId: attachedDocForMessage?.id,
          imageUrl: attachedDocForMessage?.imageDataUrl,
          messages: (sessionMessages[currentSessId] || []).slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedContent = "";
      let sseBuffer = "";
      let metaParsed = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          // Retain any trailing partial line in the buffer
          sseBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const dataStr = trimmed.slice(6).trim();
            if (dataStr === "[DONE]") {
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);

              // First event is always the metadata event
              if (!metaParsed && parsed.model_used !== undefined) {
                metaParsed = true;
                setModelUsed(parsed.model_used || "");
                if (parsed.fallback_triggered && parsed.original_model) {
                  setFallbackNotice({
                    original: parsed.original_model,
                    used: parsed.model_used,
                  });
                }
                continue; // don't render metadata as chat content
              }

              const chunkText = parsed.content || parsed.chunk;
              if (parsed.error && !chunkText) {
                accumulatedContent += `\n\n⚠️ **Service Notice**: ${parsed.error}\n\n`;
                setSessionMessages((prev) => {
                  const sessMsgs = prev[currentSessId] || [];
                  const updated = sessMsgs.map((m) =>
                    m.id === asstMsgId ? { ...m, content: accumulatedContent } : m
                  );
                  return { ...prev, [currentSessId]: updated };
                });
              } else if (chunkText) {
                accumulatedContent += chunkText;
                setSessionMessages((prev) => {
                  const sessMsgs = prev[currentSessId] || [];
                  const updated = sessMsgs.map((m) =>
                    m.id === asstMsgId ? { ...m, content: accumulatedContent } : m
                  );
                  return { ...prev, [currentSessId]: updated };
                });
              }
            } catch (e) {
              // Ignore partial JSON parse errors
            }
          }
        }

        // If after streaming finished, no content was accumulated, display clean message
        if (!accumulatedContent.trim()) {
          setSessionMessages((prev) => {
            const sessMsgs = prev[currentSessId] || [];
            const updated = sessMsgs.map((m) =>
              m.id === asstMsgId
                ? {
                    ...m,
                    content:
                      "⚠️ The inference service responded with an empty payload. Please verify your `GROQ_API_KEY` in `backend/.env` or try asking again.",
                  }
                : m
            );
            return { ...prev, [currentSessId]: updated };
          });
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Chat streaming error:", err);
        const isNetworkErr = err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError") || err.message?.includes("ECONNREFUSED");
        const friendlyMsg = isNetworkErr
          ? "🔌 Having trouble connecting — the server may still be waking up. Please try again in a moment."
          : `⚠️ Something went wrong: ${err.message || "Unknown error"}. Please try again.`;
        setConnectionError(friendlyMsg);
        setSessionMessages((prev) => {
          const sessMsgs = prev[currentSessId] || [];
          const updated = sessMsgs.map((m) =>
            m.id === asstMsgId
              ? { ...m, content: friendlyMsg }
              : m
          );
          return { ...prev, [currentSessId]: updated };
        });
      }
    } finally {
      setIsStreaming(false);
      setIsSlowConnection(false);
      if (slowConnectionTimerRef.current) {
        clearTimeout(slowConnectionTimerRef.current);
        slowConnectionTimerRef.current = null;
      }
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#131315] text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar Component */}
      <AppSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => {
          setActiveSessionId(id);
          fetchSessionMessages(id);
        }}
        onNewChat={createNewSession}
        onDeleteSession={handleDeleteSession}
        onOpenProfile={() => setIsProfileOpen(true)}
      />

      {/* Main Chat Workspace */}
      <div className="flex flex-col flex-1 h-full min-w-0 relative overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            {/* Always show on mobile; only show on desktop when sidebar is closed */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Toggle Sidebar"
            >
              <PanelLeft size={18} />
            </button>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="hidden md:flex p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Open Sidebar"
              >
                <PanelLeft size={18} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-100">OmniAI Doubt Solver</span>
              <span className="hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                100% Free Open-Source
              </span>
            </div>
          </div>


          {/* Model Selector — fetches live list from /api/models */}
          <div className="flex items-center gap-2">
            {/* Active model pill */}
            {modelUsed && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {modelUsed}
              </span>
            )}
            <ModelSwitcher
              selectedModelId={selectedModel}
              onModelChange={(modelId) => setSelectedModel(modelId)}
              userId={user?.id}
            />
          </div>
        </header>

        {/* Message Thread Scroll Area */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 py-6"
        >
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Interactive Document / Image Doubt Preview Card (If file attached) */}
            <DocumentPreviewCard
              document={activeDocument}
              onRemove={() => setActiveDocument(null)}
              onAskContextDoubt={(query) => handleSendMessage(query)}
              onImageLoad={() => scrollToBottom("smooth")}
              isStreaming={isStreaming}
            />

            {/* Empty State / Welcome Hero */}
            {currentMessages.length === 0 && (
              <div className="py-8 flex flex-col items-center justify-center text-center">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-emerald-950/60 mb-4">
                  <Sparkles size={32} />
                </div>
                <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
                  What doubt can we solve today?
                </h1>
                <p className="text-sm text-zinc-400 max-w-lg mt-2 leading-relaxed">
                  Ask any math, physics, coding, or academic doubt. Upload documents, snap photos of handwritten notes, or record your voice.
                </p>

                {/* Quick Academic Doubt Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mt-8 text-left">
                  {QUICK_DOUBT_TEMPLATES.map((tpl, idx) => {
                    const Icon = tpl.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(tpl.prompt)}
                        className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900 transition-all text-xs group"
                      >
                        <div className="flex items-center gap-2 font-semibold text-zinc-200 group-hover:text-emerald-400 mb-1">
                          <Icon size={16} className="text-emerald-400" />
                          <span>{tpl.title}</span>
                        </div>
                        <p className="text-zinc-400 text-[11px] line-clamp-2">
                          {tpl.prompt}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Messages List */}
            {currentMessages.map((message) => {
              const isUser = message.role === "user";

              return (
                <div
                  key={message.id}
                  className={`flex gap-3.5 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="h-8 w-8 rounded-xl bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-1 shadow-md">
                      <Bot size={17} />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 sm:px-5 sm:py-4 max-w-[92%] sm:max-w-[88%] shadow-md ${
                      isUser
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60 rounded-tr-sm"
                        : "bg-zinc-900/90 text-zinc-200 border border-zinc-800 rounded-tl-sm w-full"
                    }`}
                  >
                    {isUser ? (
                      <div className="space-y-2">
                        {message.files && message.files.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {message.files.map((f: any, fIdx: number) => {
                              const isImg = f.fileType === "image" || f.imageDataUrl;
                              return isImg && f.imageDataUrl ? (
                                <div
                                  key={fIdx}
                                  className="relative rounded-xl overflow-hidden border border-zinc-700/80 max-w-xs max-h-56 bg-black/50 shadow-md"
                                >
                                  <img
                                    src={f.imageDataUrl}
                                    alt={f.filename || "Attached photo doubt"}
                                    className="max-h-56 w-auto object-contain rounded-lg"
                                    onLoad={() => scrollToBottom("smooth")}
                                  />
                                </div>
                              ) : (
                                <div
                                  key={fIdx}
                                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-zinc-900/90 border border-emerald-500/40 text-xs shadow-md"
                                >
                                  <FileText size={16} className="text-emerald-400 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-zinc-100 truncate max-w-[200px]">
                                      {f.filename}
                                    </p>
                                    <p className="text-[10px] text-zinc-400">
                                      {f.fileType?.toUpperCase()} • {f.fileSize ? `${Math.max(1, Math.round(f.fileSize / 1024))} KB` : ""}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                    ) : (
                      <>
                        <VisualRenderer content={message.content} />
                        {isStreaming && message.id === currentMessages[currentMessages.length - 1].id && (
                          <span className="inline-block h-4 w-1.5 bg-emerald-400 ml-1 align-middle animate-blink" />
                        )}
                      </>
                    )}
                  </div>

                  {isUser && (
                    <div className="h-8 w-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 flex-shrink-0 mt-1">
                      <UserIcon size={17} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Stop Generation Button when streaming */}
            {isStreaming && (
              <div className="flex justify-center sticky bottom-2">
                <button
                  onClick={handleStopStreaming}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-xs font-medium text-zinc-300 border border-zinc-700 shadow-xl backdrop-blur-md transition-all"
                >
                  <Square size={13} className="fill-red-400 text-red-400" />
                  <span>Stop generating</span>
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Slow connection / cold-start banner */}
        {isSlowConnection && isStreaming && (
          <div className="px-4 pb-1">
            <div className="max-w-4xl mx-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-950/60 border border-blue-700/40 text-xs text-blue-200 animate-pulse">
              <svg className="w-4 h-4 text-blue-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>
                <span className="font-semibold">Waking up the server…</span>{" "}
                The free-tier backend spins down after 15 min of inactivity. First response may take 20–40 seconds. Please hang tight!
              </span>
            </div>
          </div>
        )}

        {/* Connection error banner */}
        {connectionError && !isStreaming && (
          <div className="px-4 pb-1">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-red-950/50 border border-red-700/40 text-xs text-red-300">
              <span>{connectionError}</span>
              <button
                onClick={() => setConnectionError(null)}
                className="text-red-500 hover:text-red-300 transition-colors ml-2 shrink-0"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Fallback notice — shown when backend switched to a different model */}
        {fallbackNotice && (
          <div className="px-4 pb-1">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-950/50 border border-amber-700/40 text-xs text-amber-300">
              <span>
                <span className="font-semibold">⚠️ Model switched:</span>{" "}
                <span className="font-mono text-amber-400">{fallbackNotice.original}</span> was unavailable — responded with{" "}
                <span className="font-mono text-emerald-400">{fallbackNotice.used}</span> instead.
              </span>
              <button
                onClick={() => setFallbackNotice(null)}
                className="text-amber-500 hover:text-amber-300 transition-colors ml-2 shrink-0"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ChatGPT-Style Unified Multimodal Input Bar */}
        <ChatInputBar
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUpload}
          onOpenCamera={() => setIsCameraOpen(true)}
          attachedDocument={activeDocument}
          onRemoveAttachment={() => setActiveDocument(null)}
          isStreaming={isStreaming}
        />
      </div>

      {/* Webcam Photo Snapshot Capture Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* User Profile & Chat Export Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={user}
        onLogout={logout}
      />
    </div>
  );
}
