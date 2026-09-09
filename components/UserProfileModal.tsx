"use client";

import React, { useState } from "react";
import {
  User,
  Key,
  Download,
  Trash2,
  LogOut,
  X,
  Check,
  AlertCircle,
  Shield,
  FileJson,
  FileCode,
} from "lucide-react";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: { email: string; fullName?: string; id?: number | string; photoURL?: string } | null;
  onLogout: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<"account" | "security" | "export">("account");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatusMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    if (newPassword.length < 6) {
      setStatusMsg({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setIsLoading(true);
    setStatusMsg(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const res = await fetch(`${backendUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update password");
      }

      setStatusMsg({ type: "success", text: "Password updated successfully!" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "An error occurred" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: "json" | "markdown") => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const res = await fetch(`${backendUrl}/api/user/export?format=${format}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error("Failed to export chats");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `omniai_chat_history.${format === "markdown" ? "md" : "json"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Chat export note: " + (err.message || "Could not complete export."));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2 text-emerald-400">
            <User size={20} />
            <span className="font-semibold text-sm text-gray-100">User Profile & Settings</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-5 pt-2 gap-4 text-xs font-medium">
          <button
            onClick={() => {
              setActiveTab("account");
              setStatusMsg(null);
            }}
            className={`pb-2.5 transition-colors border-b-2 ${
              activeTab === "account"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Account Details
          </button>
          <button
            onClick={() => {
              setActiveTab("security");
              setStatusMsg(null);
            }}
            className={`pb-2.5 transition-colors border-b-2 ${
              activeTab === "security"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Security & Password
          </button>
          <button
            onClick={() => {
              setActiveTab("export");
              setStatusMsg(null);
            }}
            className={`pb-2.5 transition-colors border-b-2 ${
              activeTab === "export"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Data & Export
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {activeTab === "account" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="h-12 w-12 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 font-bold text-lg overflow-hidden shrink-0">
                  {currentUser?.photoURL ? (
                    <img src={currentUser.photoURL} alt="User Avatar" className="w-full h-full object-cover" />
                  ) : (
                    currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : "U"
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {currentUser?.fullName || "OmniAI Scholar"}
                  </h3>
                  <p className="text-xs text-zinc-400">{currentUser?.email || "Signed in"}</p>
                </div>
              </div>

              <div className="rounded-xl bg-zinc-950/60 border border-zinc-800/80 p-4 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Authentication Method</span>
                  <span className="text-emerald-400 font-mono">JWT Bearer / Bcrypt</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Cloud Tier</span>
                  <span className="text-zinc-200">100% Free Open-Source</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Inference Engine</span>
                  <span className="text-zinc-200">Groq Cloud (Llama 3.3 70B & Vision)</span>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 text-xs font-medium transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <form onSubmit={handlePasswordReset} className="space-y-3">
              {statusMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    statusMsg.type === "success"
                      ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800"
                      : "bg-red-950/70 text-red-300 border border-red-800"
                  }`}
                >
                  {statusMsg.type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
                  <span>{statusMsg.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs transition-colors"
                >
                  {isLoading ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          )}

          {activeTab === "export" && (
            <div className="space-y-4 text-xs">
              <p className="text-zinc-400">
                Download your complete conversation history, doubt derivations, and visual charts.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleExport("json")}
                  className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 flex flex-col items-center gap-2 text-zinc-200 transition-all hover:bg-zinc-850"
                >
                  <FileJson size={28} className="text-emerald-400" />
                  <span className="font-medium text-xs">Export as JSON</span>
                  <span className="text-[10px] text-zinc-500 text-center">
                    Structured data with message timestamps & metadata
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport("markdown")}
                  className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 flex flex-col items-center gap-2 text-zinc-200 transition-all hover:bg-zinc-850"
                >
                  <FileCode size={28} className="text-cyan-400" />
                  <span className="font-medium text-xs">Export as Markdown</span>
                  <span className="text-[10px] text-zinc-500 text-center">
                    Formatted text with LaTeX equations and code blocks
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
