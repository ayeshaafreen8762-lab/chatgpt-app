"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Send,
  Square,
  PanelLeft,
  Bot,
  User,
  Sparkles,
  Code2,
  Lightbulb,
  Compass,
  PenTool,
  Loader2,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const STARTER_PROMPTS = [
  {
    icon: Code2,
    title: "Code a Next.js App",
    prompt: "Write a React component for an interactive data table with search and pagination in Next.js.",
  },
  {
    icon: Lightbulb,
    title: "Explain Quantum Computing",
    prompt: "Explain quantum computing and qubits in simple terms with an everyday analogy.",
  },
  {
    icon: Compass,
    title: "Plan a Weekend Trip",
    prompt: "Give me a 3-day travel itinerary for exploring Tokyo on a budget.",
  },
  {
    icon: PenTool,
    title: "Help Me Draft an Email",
    prompt: "Draft a professional email requesting a project deadline extension with clear reasons.",
  },
];

const LOCAL_STORAGE_KEY = "chatgpt_clone_sessions_v1";

function generateUniqueId(prefix: string): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
}

function getTimestamp(): number {
  return Date.now();
}

function createInitialSession(): ChatSession {
  return {
    id: generateUniqueId("chat"),
    title: "New Chat",
    messages: [],
    createdAt: getTimestamp(),
  };
}

export default function Home() {
  // Lazy state initialization from localStorage
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed: ChatSession[] = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.error("Failed to load sessions from localStorage", e);
      }
    }
    return [createInitialSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return sessions.length > 0 ? sessions[0].id : null;
  });

  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
      } catch (e) {
        console.error("Failed to save sessions to localStorage", e);
      }
    }
  }, [sessions]);

  // Compute active messages memoized
  const messages = useMemo(() => {
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    return activeSession ? activeSession.messages : [];
  }, [sessions, activeSessionId]);

  // Auto-scroll to bottom of message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  const createNewChat = () => {
    if (isStreaming) stopGeneration();
    const newSession = createInitialSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInputMessage("");
  };

  const deleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isStreaming && activeSessionId === id) stopGeneration();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    if (updated.length === 0) {
      const fallbackSession = createInitialSession();
      setSessions([fallbackSession]);
      setActiveSessionId(fallbackSession.id);
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

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming || !activeSessionId) return;

    setInputMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg: Message = {
      id: generateUniqueId("msg_user"),
      role: "user",
      content: text,
      timestamp: getTimestamp(),
    };

    const assistantMsgId = generateUniqueId("msg_ast");
    const assistantMsgPlaceholder: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: getTimestamp(),
    };

    // Update active session with user message and empty assistant placeholder
    setSessions((prevSessions) =>
      prevSessions.map((s) => {
        if (s.id === activeSessionId) {
          const isFirstMessage = s.messages.length === 0;
          const newTitle = isFirstMessage
            ? text.length > 28
              ? text.substring(0, 28) + "..."
              : text
            : s.title;
          return {
            ...s,
            title: newTitle,
            messages: [...s.messages, userMsg, assistantMsgPlaceholder],
          };
        }
        return s;
      })
    );

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      // Build history payload from current conversation
      const currentHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: currentHistory }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Request failed with status ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body received.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const textChunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        textChunks.push(chunk);
        const fullContent = textChunks.join("");

        // Update assistant message content in real time
        setSessions((prevSessions) =>
          prevSessions.map((s) => {
            if (s.id === activeSessionId) {
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: fullContent } : m
                ),
              };
            }
            return s;
          })
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Stream aborted by user.");
      } else {
        const errorText =
          err instanceof Error
            ? `⚠️ Error: ${err.message}`
            : "⚠️ An unknown error occurred while contacting the server.";

        setSessions((prevSessions) =>
          prevSessions.map((s) => {
            if (s.id === activeSessionId) {
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: errorText } : m
                ),
              };
            }
            return s;
          })
        );
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
    <div className="flex h-screen w-full bg-[#212121] text-gray-100 overflow-hidden font-sans">
      {/* Sidebar Drawer / Overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 flex flex-col w-64 bg-[#171717] border-r border-white/10 transition-transform duration-200 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:border-none md:overflow-hidden"
        }`}
      >
        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={createNewChat}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-white/20 hover:bg-white/10 text-white text-sm font-medium transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Plus size={18} />
              <span>New chat</span>
            </div>
            <PanelLeft size={16} className="text-gray-400 group-hover:text-white" />
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-gray-400 px-3 py-1.5 uppercase tracking-wider">
            Recent Chats
          </div>
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => {
                  if (isStreaming) stopGeneration();
                  setActiveSessionId(session.id);
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                  isActive
                    ? "bg-[#212121] text-white font-medium"
                    : "text-gray-300 hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare size={16} className={isActive ? "text-white" : "text-gray-400"} />
                  <span className="truncate">{session.title}</span>
                </div>
                <button
                  onClick={(e) => deleteChat(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition-opacity"
                  title="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            U
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-white truncate">User Account</span>
            <span className="text-xs text-gray-400 truncate">Free Plan</span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#212121] relative">
        {/* Header Bar */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-white/10 bg-[#212121]/90 backdrop-blur shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Toggle sidebar"
            >
              <PanelLeft size={20} />
            </button>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-200 font-medium">
              <Sparkles size={14} className="text-emerald-400" />
              <span>Gemini 2.5 Flash</span>
            </div>
          </div>

          <button
            onClick={createNewChat}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors md:hidden"
            title="New Chat"
          >
            <Plus size={20} />
          </button>
        </header>

        {/* Message View / Empty State */}
        <div className="flex-1 overflow-y-auto px-4 md:px-0 py-6 scroll-smooth">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <div className="w-16 h-16 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6 shadow-lg shadow-emerald-900/20">
                <Bot size={36} />
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-white mb-2">
                What can I help with today?
              </h1>
              <p className="text-gray-400 text-sm mb-8 max-w-md">
                Ask a question, analyze data, debug code, or brainstorm creative ideas with your AI assistant.
              </p>

              {/* Starter Prompt Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-xl">
                {STARTER_PROMPTS.map((card, idx) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(card.prompt)}
                      className="flex flex-col items-start p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left group"
                    >
                      <div className="flex items-center gap-2 text-emerald-400 mb-1">
                        <Icon size={18} />
                        <span className="text-xs font-semibold text-gray-200">
                          {card.title}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 group-hover:text-gray-300 line-clamp-2">
                        {card.prompt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-4">
              {messages.map((msg, index) => {
                const isUser = msg.role === "user";
                const isLastAssistantMessage =
                  !isUser && index === messages.length - 1 && isStreaming;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-4 p-4 rounded-2xl transition-colors ${
                      isUser ? "bg-white/5 max-w-[85%] ml-auto" : "bg-transparent w-full"
                    }`}
                  >
                    {/* Avatar Icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isUser
                          ? "bg-indigo-600 text-white"
                          : "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                      }`}
                    >
                      {isUser ? <User size={18} /> : <Bot size={18} />}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-400 mb-1">
                        {isUser ? "You" : "ChatGPT"}
                      </div>
                      {msg.content ? (
                        <div className="relative">
                          <MarkdownRenderer content={msg.content} />
                          {isLastAssistantMessage && (
                            <span className="inline-block w-2 h-4 ml-1 bg-emerald-400 animate-blink align-middle" />
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400 text-sm py-1">
                          <Loader2 size={16} className="animate-spin text-emerald-400" />
                          <span>Thinking...</span>
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

        {/* Input Bar Area */}
        <div className="w-full max-w-3xl mx-auto px-4 pb-4">
          <div className="relative bg-[#2f2f2f] rounded-2xl border border-white/10 shadow-xl focus-within:border-white/20 transition-all">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message ChatGPT..."
              rows={1}
              className="w-full bg-transparent text-white placeholder-gray-400 px-4 py-3.5 pr-12 focus:outline-none resize-none text-sm max-h-48 overflow-y-auto"
            />
            <div className="absolute right-2.5 bottom-2.5 flex items-center">
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
                  disabled={!inputMessage.trim()}
                  className={`p-2 rounded-lg transition-colors ${
                    inputMessage.trim()
                      ? "bg-white text-black hover:bg-gray-200"
                      : "bg-white/10 text-gray-500 cursor-not-allowed"
                  }`}
                  title="Send message"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-center text-gray-500 mt-2">
            ChatGPT can make mistakes. Check important info.
          </div>
        </div>
      </main>
    </div>
  );
}
