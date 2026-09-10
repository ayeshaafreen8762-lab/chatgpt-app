"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  MessageSquare,
  Sparkles,
  PanelLeft,
  Plus,
  Trash2,
  FileText,
  LogOut,
  User as UserIcon,
  LogIn,
  Settings,
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
  onOpenProfile?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  isOpen,
  onToggle,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onOpenProfile,
}) => {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

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
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-64 bg-zinc-950 border-r border-zinc-800 transition-all duration-300 ease-in-out select-none ${
          isOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0 md:w-0 md:border-none md:overflow-hidden"
        }`}
      >
        {/* Header / App Brand */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-emerald-950/40">
              <Sparkles size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white tracking-wide">
                OmniAI Platform
              </span>
              <span className="text-[10px] font-medium text-emerald-400">
                Mistral 7B · Hugging Face
              </span>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Toggle Sidebar"
          >
            <PanelLeft size={18} />
          </button>
        </div>

        {/* Action Button for Chat */}
        {onNewChat && (
          <div className="p-3">
            <button
              onClick={onNewChat}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm font-medium transition-all group shadow-sm shadow-emerald-950/20"
            >
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" />
                <span>New Doubt Session</span>
              </div>
              <span className="text-xs bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">
                + New
              </span>
            </button>
          </div>
        )}

        {/* Chat Sessions list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-[10px] font-bold text-zinc-400 px-3 py-1 uppercase tracking-widest flex items-center justify-between">
            <span>Doubt History</span>
            <FileText size={12} className="text-zinc-500" />
          </div>

          {sessions.length === 0 ? (
            <div className="p-3 text-center text-xs text-zinc-500 italic">
              No conversations yet. Start by asking any doubt!
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession?.(session.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                    isActive
                      ? "bg-zinc-900 text-white font-medium border border-zinc-700/80"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare
                      size={14}
                      className={isActive ? "text-emerald-400" : "text-zinc-500"}
                    />
                    <span className="truncate">{session.title}</span>
                  </div>
                  {onDeleteSession && (
                    <button
                      onClick={(e) => onDeleteSession(e, session.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-400 transition-opacity"
                      title="Delete session"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* User Account / Profile Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950">
          {isAuthenticated && user ? (
            <div className="flex items-center justify-between">
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                title="Open Profile Settings"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold shadow-md shrink-0">
                  {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold text-white truncate">
                    {user.fullName || user.email.split("@")[0]}
                  </span>
                  <span className="text-[10px] text-zinc-400 truncate">
                    {user.email}
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={onOpenProfile}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  title="Settings"
                >
                  <Settings size={15} />
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/40 transition-all text-xs"
                  title="Sign Out / Reset Session"
                >
                  <LogOut size={15} />
                  <span className="hidden sm:inline text-[11px] font-medium">Log Out</span>
                </button>
              </div>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-all"
            >
              <LogIn size={15} />
              <span>Sign In / Register</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
};
