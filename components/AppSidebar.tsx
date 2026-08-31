"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  GraduationCap,
  Sparkles,
  Palette,
  PanelLeft,
  Plus,
  Trash2,
  FileText,
  Compass,
} from "lucide-react";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions?: ChatSession[];
  activeSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onNewChat?: () => void;
  onDeleteSession?: (e: React.MouseEvent, id: string) => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  isOpen,
  onToggle,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}) => {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Chat & Document AI",
      href: "/chat",
      icon: MessageSquare,
      active: pathname === "/chat" || pathname === "/",
      badge: "Multimodal",
    },
    {
      label: "Homework Solver",
      href: "/homework",
      icon: GraduationCap,
      active: pathname === "/homework",
      badge: "Academic",
    },
    {
      label: "AI Media Studio",
      href: "/media",
      icon: Palette,
      active: pathname === "/media",
      badge: "Creative",
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-64 bg-[#171717] border-r border-white/10 transition-all duration-300 ease-in-out select-none ${
          isOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0 md:w-0 md:border-none md:overflow-hidden"
        }`}
      >
        {/* Header / App Brand */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-950/40">
              <Sparkles size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white tracking-wide">
                OmniAI Suite
              </span>
              <span className="text-[10px] font-medium text-emerald-400">
                Powered by Gemini 3.6
              </span>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Toggle Sidebar"
          >
            <PanelLeft size={18} />
          </button>
        </div>

        {/* Action Button for Chat */}
        {(pathname === "/chat" || pathname === "/") && onNewChat && (
          <div className="p-3">
            <button
              onClick={onNewChat}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-medium transition-all group shadow-sm shadow-emerald-950/20"
            >
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" />
                <span>New Analysis</span>
              </div>
              <span className="text-xs bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">
                + Clear
              </span>
            </button>
          </div>
        )}

        {/* Feature Navigation Links */}
        <div className="px-3 py-2 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 px-3 py-1 uppercase tracking-widest">
            Workspace Modules
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  item.active
                    ? "bg-white/10 text-white shadow-sm border border-white/10"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    size={18}
                    className={item.active ? "text-emerald-400" : "text-gray-400"}
                  />
                  <span>{item.label}</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    item.active
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-white/5 text-gray-400 border border-white/5"
                  }`}
                >
                  {item.badge}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Chat Sessions list (only if on chat route) */}
        {(pathname === "/chat" || pathname === "/") && sessions.length > 0 && (
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 border-t border-white/10 mt-2">
            <div className="text-[10px] font-bold text-gray-400 px-3 py-1 uppercase tracking-widest flex items-center justify-between">
              <span>Recent Conversations</span>
              <FileText size={12} className="text-gray-400" />
            </div>
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession?.(session.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                    isActive
                      ? "bg-[#212121] text-white font-medium border border-white/10"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare
                      size={14}
                      className={isActive ? "text-emerald-400" : "text-gray-400"}
                    />
                    <span className="truncate">{session.title}</span>
                  </div>
                  {onDeleteSession && (
                    <button
                      onClick={(e) => onDeleteSession(e, session.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition-opacity"
                      title="Delete session"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!((pathname === "/chat" || pathname === "/") && sessions.length > 0) && (
          <div className="flex-1" />
        )}

        {/* Footer */}
        <div className="p-3 border-t border-white/10 bg-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
              AI
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white">Gemini 3.6 Flash</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Model
              </span>
            </div>
          </div>
          <Compass size={16} className="text-gray-400" />
        </div>
      </aside>
    </>
  );
};
