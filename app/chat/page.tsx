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
  Copy,
  Check,
  RotateCcw,
  Sun,
  Moon,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { AppSidebar, ChatSession } from "@/components/AppSidebar";
import { VisualRenderer } from "@/components/VisualRenderer";
import { ChatInputBar } from "@/components/ChatInputBar";
import { DocumentPreviewCard, AttachedDoc } from "@/components/DocumentPreviewCard";
import { CameraModal } from "@/components/CameraModal";
import { UserProfileModal } from "@/components/UserProfileModal";
import { ModelSwitcher, readPersistedModelId } from "@/components/ModelSwitcher";
import { useAuth } from "@/context/AuthContext";
import { getBackendUrl, DEFAULT_MODEL_ID } from "@/lib/config";
import { handleResponseError, handleNetworkError } from "@/lib/apiError";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  files?: any[];
}

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // On desktop, open sidebar by default; keep closed on mobile
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSidebarOpen(window.innerWidth >= 768);
      const savedTheme = (localStorage.getItem("omniai_theme") as "dark" | "light") || "dark";
      setTheme(savedTheme);
      if (savedTheme === "light") {
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("omniai_theme", nextTheme);
      if (nextTheme === "light") {
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
      }
    }
  };

  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Record<string, Message[]>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<AttachedDoc | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<{ original: string; used: string } | null>(null);
  const [modelUsed, setModelUsed] = useState<string>("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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

  // Restore persisted model selection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = readPersistedModelId(user?.id, DEFAULT_MODEL_ID);
    if (persisted) setSelectedModel(persisted);
  }, [user?.id]);

  // Load chat sessions from LocalStorage first, then sync with backend
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const localSessJson = localStorage.getItem("omniai_local_sessions");
      const localMsgsJson = localStorage.getItem("omniai_local_messages");
      if (localSessJson) {
        const parsedSess = JSON.parse(localSessJson);
        if (Array.isArray(parsedSess) && parsedSess.length > 0) {
          setSessions(parsedSess);
          const firstId = parsedSess[0].id;
          setActiveSessionId(firstId);
        }
      }
      if (localMsgsJson) {
        const parsedMsgs = JSON.parse(localMsgsJson);
        if (parsedMsgs && typeof parsedMsgs === "object") {
          setSessionMessages(parsedMsgs);
        }
      }
    } catch (e) {
      console.warn("Could not load local session cache:", e);
    }
  }, []);

  // Save session state to LocalStorage
  const persistLocally = (newSessions: ChatSession[], newMessages: Record<string, Message[]>) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("omniai_local_sessions", JSON.stringify(newSessions));
      localStorage.setItem("omniai_local_messages", JSON.stringify(newMessages));
    } catch (e) {
      console.warn("LocalStorage persist error:", e);
    }
  };

  // Fetch or initialize sessions from backend
  const fetchSessions = async () => {
    const apiBase = getBackendUrl();
    try {
      const res = await fetch(`${apiBase}/api/chat/sessions`, {
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
          persistLocally(data.sessions, sessionMessages);
          return;
        }
      }
    } catch (err) {
      console.log(`Backend sessions offline/cold (${apiBase}); using browser-persisted sessions.`);
    }

    // If no sessions exist locally or from backend, create initial one
    setSessions((prev) => {
      if (prev.length > 0) return prev;
      const localId = `sess_${Date.now()}`;
      const initialSess = [{ id: localId, title: "New Doubt Session", createdAt: Date.now() }];
      setActiveSessionId(localId);
      persistLocally(initialSess, sessionMessages);
      return initialSess;
    });
  };

  const fetchSessionMessages = async (sessionId: string) => {
    const apiBase = getBackendUrl();
    try {
      const res = await fetch(`${apiBase}/api/chat/sessions/${sessionId}/messages`, {
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
          setSessionMessages((prev) => {
            const updated = { ...prev, [sessionId]: formatted };
            persistLocally(sessions, updated);
            return updated;
          });
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
    const localId = `sess_${Date.now()}`;
    const newSess: ChatSession = { id: localId, title: "New Doubt Session", createdAt: Date.now() };

    setSessions((prev) => {
      const updated = [newSess, ...prev];
      persistLocally(updated, { ...sessionMessages, [localId]: [] });
      return updated;
    });
    setActiveSessionId(localId);
    setSessionMessages((prev) => ({ ...prev, [localId]: [] }));
    setActiveDocument(null);
    setConnectionError(null);

    const apiBase = getBackendUrl();
    try {
      const res = await fetch(`${apiBase}/api/chat/sessions`, {
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
        if (data.session?.id) {
          setSessions((prev) =>
            prev.map((s) => (s.id === localId ? { ...s, id: data.session.id } : s))
          );
          setActiveSessionId(data.session.id);
        }
      }
    } catch (err) {
      // Offline / Local session works seamlessly
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessId: string) => {
    e.stopPropagation();
    const apiBase = getBackendUrl();
    try {
      await fetch(`${apiBase}/api/chat/sessions/${sessId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.warn("Delete session error:", err);
    }

    const updatedSessions = sessions.filter((s) => s.id !== sessId);
    const updatedMessages = { ...sessionMessages };
    delete updatedMessages[sessId];

    setSessions(updatedSessions);
    setSessionMessages(updatedMessages);
    persistLocally(updatedSessions, updatedMessages);

    if (activeSessionId === sessId) {
      if (updatedSessions.length > 0) {
        setActiveSessionId(updatedSessions[0].id);
        fetchSessionMessages(updatedSessions[0].id);
      } else {
        createNewSession();
      }
    }
  };

  // Handle File Upload (PDF, DOCX, TXT, CSV, Images)
  const handleFileUpload = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const localPreviewUrl = isImage ? URL.createObjectURL(file) : undefined;

    const docData: AttachedDoc = {
      filename: file.name,
      fileType: isImage ? "image" : file.name.split(".").pop() || "document",
      fileSize: file.size,
      pageCount: 1,
      imageDataUrl: localPreviewUrl,
    };
    setActiveDocument(docData);
    setTimeout(() => scrollToBottom("smooth"), 50);

    const apiBase = getBackendUrl();
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadHeaders: Record<string, string> = {};
      const authHeaders = getAuthHeaders();
      if (authHeaders["Authorization"]) {
        uploadHeaders["Authorization"] = authHeaders["Authorization"];
      }

      const res = await fetch(`${apiBase}/api/documents/upload`, {
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
      }
    } catch (err) {
      console.warn("Upload error:", err);
    }
  };

  // Handle Camera Snapshot Capture
  const handleCameraCapture = async (imageDataUrl: string) => {
    const docData: AttachedDoc = {
      filename: `Camera_Doubt_${new Date().toLocaleTimeString().replace(/:/g, "-")}.jpg`,
      fileType: "image",
      fileSize: Math.round((imageDataUrl.length * 3) / 4),
      pageCount: 1,
      imageDataUrl: imageDataUrl,
    };
    setActiveDocument(docData);
    setTimeout(() => scrollToBottom("smooth"), 50);

    try {
      const res = await fetch(imageDataUrl);
      const blob = await res.blob();
      const file = new File([blob], docData.filename, { type: "image/jpeg" });
      handleFileUpload(file);
    } catch (err) {
      console.warn("Camera upload error:", err);
    }
  };

  // Copy message text to clipboard
  const handleCopyMessage = (msgId: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  };

  // Send Chat Message with Real-Time SSE Streaming
  const handleSendMessage = async (userText: string) => {
    if (!userText.trim() && !activeDocument) return;
    if (isStreaming) return;

    const currentSessId = activeSessionId || `sess_${Date.now()}`;
    if (!activeSessionId) {
      setActiveSessionId(currentSessId);
    }

    const userMsgId = `msg_${Date.now()}`;
    const asstMsgId = `asst_${Date.now() + 1}`;
    const attachedDocForMessage = activeDocument;

    const newUserMessage: Message = {
      id: userMsgId,
      role: "user",
      content: userText,
      timestamp: Date.now(),
      files: attachedDocForMessage ? [attachedDocForMessage] : undefined,
    };

    const initialAsstMessage: Message = {
      id: asstMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now() + 1,
    };

    setActiveDocument(null);
    setLastFailedPrompt(userText);

    // Append to local state immediately
    setSessionMessages((prev) => {
      const sessMsgs = prev[currentSessId] || [];
      const updated = {
        ...prev,
        [currentSessId]: [...sessMsgs, newUserMessage, initialAsstMessage],
      };
      persistLocally(sessions, updated);
      return updated;
    });

    // Automatically update session title if it's the first message
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === currentSessId);
      if (existing && existing.title === "New Doubt Session") {
        const titleSnippet = userText.slice(0, 32) + (userText.length > 32 ? "..." : "");
        const updated = prev.map((s) => (s.id === currentSessId ? { ...s, title: titleSnippet } : s));
        persistLocally(updated, sessionMessages);
        return updated;
      }
      return prev;
    });

    setIsStreaming(true);
    setIsSlowConnection(false);
    setConnectionError(null);
    setFallbackNotice(null);
    abortControllerRef.current = new AbortController();
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Show "Waking up AI server" banner if response takes > 3.5s (Render free-tier cold start)
    slowConnectionTimerRef.current = setTimeout(() => {
      setIsSlowConnection(true);
    }, 3500);

    const apiBase = getBackendUrl();
    const streamUrl = `${apiBase}/api/chat/stream`;

    console.info(`[OmniAI Chat] Sending stream request to: ${streamUrl}`);

    try {
      let customEndpoint = undefined;
      if (selectedModel === "hosted-cloud-llm" && typeof window !== "undefined") {
        customEndpoint = localStorage.getItem("custom_llm_endpoint_url") || undefined;
      }

      const response = await fetch(streamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          prompt: userText,
          message: userText,
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
        const classified = await handleResponseError(response, streamUrl);
        console.error("[OmniAI Chat Response Error]", classified);
        setConnectionError(classified.friendlyMessage);
        setSessionMessages((prev) => {
          const sessMsgs = prev[currentSessId] || [];
          const updated = sessMsgs.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: `⚠️ **${classified.title}**\n\n${classified.friendlyMessage}\n\n*Click below to retry.*`,
                }
              : m
          );
          const newMap = { ...prev, [currentSessId]: updated };
          persistLocally(sessions, newMap);
          return newMap;
        });
        return;
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

          if (slowConnectionTimerRef.current) {
            clearTimeout(slowConnectionTimerRef.current);
            slowConnectionTimerRef.current = null;
            setIsSlowConnection(false);
          }

          const chunkTextDecoded = decoder.decode(value, { stream: true });
          sseBuffer += chunkTextDecoded;
          const lines = sseBuffer.split("\n");
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
              if (!metaParsed && parsed.model_used !== undefined) {
                metaParsed = true;
                setModelUsed(parsed.model_used || "");
                if (parsed.fallback_triggered && parsed.original_model) {
                  setFallbackNotice({
                    original: parsed.original_model,
                    used: parsed.model_used,
                  });
                }
                continue;
              }

              const chunkText = parsed.content || parsed.chunk;
              if (chunkText) {
                accumulatedContent += chunkText;
                setSessionMessages((prev) => {
                  const sessMsgs = prev[currentSessId] || [];
                  const updated = sessMsgs.map((m) =>
                    m.id === asstMsgId ? { ...m, content: accumulatedContent } : m
                  );
                  return { ...prev, [currentSessId]: updated };
                });
              }
            } catch (e) {}
          }
        }

        setSessionMessages((prev) => {
          const sessMsgs = prev[currentSessId] || [];
          const finalContent = accumulatedContent.trim()
            ? accumulatedContent
            : "⚠️ The AI service responded with an empty message. Please try asking again.";
          const updated = sessMsgs.map((m) =>
            m.id === asstMsgId ? { ...m, content: finalContent } : m
          );
          const newMap = { ...prev, [currentSessId]: updated };
          persistLocally(sessions, newMap);
          return newMap;
        });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const classified = handleNetworkError(err, streamUrl);
        console.error("[OmniAI Chat Network/CORS Error]", classified);
        setConnectionError(classified.friendlyMessage);
        setSessionMessages((prev) => {
          const sessMsgs = prev[currentSessId] || [];
          const updated = sessMsgs.map((m) =>
            m.id === asstMsgId
              ? {
                  ...m,
                  content: `⚠️ **${classified.title}**\n\n${classified.friendlyMessage}\n\n*Click below to retry.*`,
                }
              : m
          );
          const newMap = { ...prev, [currentSessId]: updated };
          persistLocally(sessions, newMap);
          return newMap;
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

  // Regenerate last response
  const handleRegenerate = (asstMsgIndex: number) => {
    const msgs = currentMessages;
    if (asstMsgIndex <= 0) return;
    const userMsg = msgs[asstMsgIndex - 1];
    if (userMsg && userMsg.role === "user") {
      handleSendMessage(userMsg.content);
    }
  };

  return (
    <div className={`flex h-[100dvh] w-full ${theme === "light" ? "bg-slate-50 text-slate-900" : "bg-[#131315] text-zinc-100"} overflow-hidden font-sans transition-colors duration-200`}>
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
        <header className={`h-14 border-b ${theme === "light" ? "border-slate-200 bg-white/90" : "border-zinc-800 bg-zinc-950/80"} backdrop-blur-md px-3 sm:px-4 flex items-center justify-between z-20`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Always show on mobile; only show on desktop when sidebar is closed */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-2 rounded-lg ${theme === "light" ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100" : "text-zinc-400 hover:text-white hover:bg-zinc-800"} transition-colors md:hidden min-w-[40px] min-h-[40px] flex items-center justify-center`}
              title="Toggle Sidebar"
            >
              <PanelLeft size={18} />
            </button>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className={`hidden md:flex p-1.5 rounded-lg ${theme === "light" ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100" : "text-zinc-400 hover:text-white hover:bg-zinc-800"} transition-colors`}
                title="Open Sidebar"
              >
                <PanelLeft size={18} />
              </button>
            )}
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-xs sm:text-sm truncate">OmniAI Doubt Solver</span>
              <span className="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                100% Free Open-Source
              </span>
            </div>
          </div>

          {/* Controls: Theme Toggle & Model Switcher */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Dark / Light Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-all ${
                theme === "light"
                  ? "border-slate-300 bg-slate-100 text-amber-600 hover:bg-slate-200"
                  : "border-zinc-800 bg-zinc-900 text-yellow-400 hover:bg-zinc-800"
              }`}
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {/* Model Selector */}
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
          className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6"
        >
          <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
            {/* Interactive Document / Image Doubt Preview Card */}
            <DocumentPreviewCard
              document={activeDocument}
              onRemove={() => setActiveDocument(null)}
              onAskContextDoubt={(query) => handleSendMessage(query)}
              onImageLoad={() => scrollToBottom("smooth")}
              isStreaming={isStreaming}
            />

            {/* Empty State / Welcome Hero */}
            {currentMessages.length === 0 && (
              <div className="py-6 sm:py-10 flex flex-col items-center justify-center text-center px-2">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-emerald-950/40 mb-3 sm:mb-4">
                  <Sparkles size={28} />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                  What doubt can we solve today?
                </h1>
                <p className={`text-xs sm:text-sm ${theme === "light" ? "text-slate-600" : "text-zinc-400"} max-w-lg mt-2 leading-relaxed`}>
                  Ask any math, physics, coding, or academic doubt. Upload documents, snap photos of handwritten notes, or record your voice.
                </p>

                {/* Quick Academic Doubt Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 w-full max-w-2xl mt-6 sm:mt-8 text-left">
                  {QUICK_DOUBT_TEMPLATES.map((tpl, idx) => {
                    const Icon = tpl.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(tpl.prompt)}
                        className={`p-3.5 sm:p-4 rounded-xl border transition-all text-xs group ${
                          theme === "light"
                            ? "bg-white border-slate-200 hover:border-emerald-500 hover:shadow-md"
                            : "bg-zinc-900/70 border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold group-hover:text-emerald-500 mb-1">
                          <Icon size={16} className="text-emerald-500" />
                          <span>{tpl.title}</span>
                        </div>
                        <p className={`text-[11px] line-clamp-2 ${theme === "light" ? "text-slate-500" : "text-zinc-400"}`}>
                          {tpl.prompt}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Messages List */}
            {currentMessages.map((message, msgIdx) => {
              const isUser = message.role === "user";

              return (
                <div
                  key={message.id}
                  className={`flex gap-2.5 sm:gap-3.5 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="h-8 w-8 rounded-xl bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-1 shadow-md">
                      <Bot size={17} />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 sm:px-5 sm:py-4 max-w-[94%] sm:max-w-[88%] shadow-md relative group ${
                      isUser
                        ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60 rounded-tr-sm"
                        : theme === "light"
                        ? "bg-white text-slate-800 border border-slate-200 rounded-tl-sm w-full"
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
                      <div className="space-y-3">
                        <VisualRenderer content={message.content} />
                        {isStreaming && message.id === currentMessages[currentMessages.length - 1].id && (
                          <span className="inline-block h-4 w-1.5 bg-emerald-400 ml-1 align-middle animate-blink" />
                        )}

                        {/* Action Buttons below Assistant Response */}
                        {!isStreaming && message.content && (
                          <div className={`flex items-center gap-2 pt-2 border-t ${theme === "light" ? "border-slate-100" : "border-zinc-800/80"} text-xs`}>
                            <button
                              onClick={() => handleCopyMessage(message.id, message.content)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                                copiedMessageId === message.id
                                  ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800/50"
                                  : theme === "light"
                                  ? "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                              }`}
                              title="Copy response to clipboard"
                            >
                              {copiedMessageId === message.id ? (
                                <>
                                  <Check size={13} className="text-emerald-400" />
                                  <span className="text-[11px] font-medium text-emerald-400">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span className="text-[11px]">Copy</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleRegenerate(msgIdx)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                                theme === "light"
                                  ? "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                              }`}
                              title="Regenerate this response"
                            >
                              <RotateCcw size={13} />
                              <span className="text-[11px]">Regenerate</span>
                            </button>
                          </div>
                        )}
                      </div>
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
              <div className="flex justify-center sticky bottom-2 z-10">
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

        {/* Cold-start / Server waking up banner */}
        {isSlowConnection && isStreaming && (
          <div className="px-3 sm:px-4 pb-1">
            <div className="max-w-4xl mx-auto flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-blue-950/70 border border-blue-600/40 text-xs text-blue-200 shadow-lg animate-pulse">
              <Zap className="w-4 h-4 text-blue-400 flex-shrink-0 animate-bounce" />
              <span>
                <span className="font-semibold text-blue-300">Waking up AI Cloud Instance…</span>{" "}
                Render free-tier spins down after inactivity. Cold-start takes ~30 seconds on first request.
              </span>
            </div>
          </div>
        )}

        {/* Connection Error Banner with 1-Click Retry */}
        {connectionError && !isStreaming && (
          <div className="px-3 sm:px-4 pb-1">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-950/60 border border-red-700/50 text-xs text-red-200 shadow-md">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <span className="truncate">{connectionError}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {lastFailedPrompt && (
                  <button
                    onClick={() => handleSendMessage(lastFailedPrompt)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-800/80 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <RefreshCw size={12} />
                    <span>Retry</span>
                  </button>
                )}
                <button
                  onClick={() => setConnectionError(null)}
                  className="text-red-400 hover:text-white px-1.5 py-1"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fallback Notice */}
        {fallbackNotice && (
          <div className="px-3 sm:px-4 pb-1">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-950/50 border border-amber-700/40 text-xs text-amber-300">
              <span>
                <span className="font-semibold">⚠️ Model switched:</span>{" "}
                <span className="font-mono text-amber-400">{fallbackNotice.original}</span> was unavailable — responded with{" "}
                <span className="font-mono text-emerald-400">{fallbackNotice.used}</span>.
              </span>
              <button
                onClick={() => setFallbackNotice(null)}
                className="text-amber-500 hover:text-amber-300 ml-2"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ChatGPT-Style Multimodal Input Bar */}
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

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={user}
        onLogout={logout}
      />
    </div>
  );
}
