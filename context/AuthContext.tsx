"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signInWithGooglePopup, logoutFromFirebase, subscribeToAuthState } from "@/lib/firebase";

export interface User {
  id: number | string;
  email: string;
  fullName?: string;
  photoURL?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, fullName?: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  const getAuthHeaders = useCallback((): Record<string, string> => {
    let activeToken = token;
    if (!activeToken && typeof window !== "undefined") {
      activeToken = localStorage.getItem("omniai_token") || localStorage.getItem("token");
    }
    if (activeToken) {
      return {
        "Authorization": `Bearer ${activeToken}`,
        "Content-Type": "application/json",
      };
    }
    return { "Content-Type": "application/json" };
  }, [token]);

  // Load user session on mount & subscribe to Firebase Auth state
  useEffect(() => {
    const initAuth = async () => {
      if (typeof window === "undefined") return;

      const storedToken = localStorage.getItem("omniai_token") || localStorage.getItem("token");
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      setToken(storedToken);

      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            "Authorization": `Bearer ${storedToken}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
          } else {
            clearClientAuth();
          }
        }
      } catch (err) {
        console.warn("Session verification notice:", err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Subscribe to Firebase Auth changes for seamless persistence across page reloads
    const unsubscribe = subscribeToAuthState((fbUser) => {
      if (fbUser) {
        setUser((prev) => ({
          id: fbUser.uid,
          email: fbUser.email || prev?.email || "",
          fullName: fbUser.displayName || prev?.fullName || fbUser.email?.split("@")[0] || "User",
          photoURL: fbUser.photoURL || prev?.photoURL || undefined,
        }));
      }
    });

    return () => unsubscribe();
  }, []);

  const clearClientAuth = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("omniai_token");
      localStorage.removeItem("token");
      sessionStorage.clear();
      document.cookie = "omniai_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
    setToken(null);
    setUser(null);
  };

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean = true
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember_me: rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsLoading(false);
        return { success: false, error: data.detail || "Login failed. Please check credentials." };
      }

      if (data.token && data.user) {
        const maxAge = rememberMe ? 2592000 : 86400; // 30 days vs 24h
        localStorage.setItem("omniai_token", data.token);
        localStorage.setItem("token", data.token);
        document.cookie = `omniai_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `access_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
        
        setToken(data.token);
        setUser(data.user);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: "Invalid server authentication response" };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || "Could not connect to authentication server" };
    }
  };

  const signup = async (
    email: string,
    password: string,
    fullName?: string,
    rememberMe: boolean = true
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName, remember_me: rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIsLoading(false);
        return { success: false, error: data.detail || "Signup failed." };
      }

      if (data.token && data.user) {
        const maxAge = rememberMe ? 2592000 : 86400;
        localStorage.setItem("omniai_token", data.token);
        localStorage.setItem("token", data.token);
        document.cookie = `omniai_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `access_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
        
        setToken(data.token);
        setUser(data.user);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: "Invalid server authentication response" };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || "Could not connect to authentication server" };
    }
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const fbResult = await signInWithGooglePopup();
      if (!fbResult.success || !fbResult.user) {
        setIsLoading(false);
        return { success: false, error: fbResult.error || "Google Sign-In was cancelled or failed." };
      }

      const fbUser = fbResult.user;
      const idToken = fbResult.idToken;

      // Sync user with backend API
      try {
        const res = await fetch(`${API_BASE}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: fbUser.email,
            fullName: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
            uid: fbUser.uid,
            photoURL: fbUser.photoURL || "",
            idToken: idToken,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.token && data.user) {
            const maxAge = 2592000; // 30 days
            localStorage.setItem("omniai_token", data.token);
            localStorage.setItem("token", data.token);
            document.cookie = `omniai_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
            document.cookie = `access_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;

            setToken(data.token);
            setUser({
              ...data.user,
              photoURL: fbUser.photoURL || undefined,
            });
            setIsLoading(false);
            return { success: true };
          }
        }
      } catch (backendErr) {
        console.warn("Backend Google Auth sync notice, continuing with Firebase session:", backendErr);
      }

      // Fallback: If backend is running standalone or offline, maintain full Firebase session
      const fallbackToken = idToken || `fb_${fbUser.uid}`;
      localStorage.setItem("omniai_token", fallbackToken);
      localStorage.setItem("token", fallbackToken);
      document.cookie = `omniai_token=${fallbackToken}; path=/; max-age=2592000; SameSite=Lax`;

      setToken(fallbackToken);
      setUser({
        id: fbUser.uid,
        email: fbUser.email || "",
        fullName: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
        photoURL: fbUser.photoURL || undefined,
      });
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || "An error occurred during Google Sign-In" };
    }
  };

  const logout = () => {
    try {
      fetch(`${API_BASE}/api/auth/logout`, { method: "POST" }).catch(() => {});
      logoutFromFirebase().catch(() => {});
    } catch {}
    
    clearClientAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        signup,
        loginWithGoogle,
        logout,
        getAuthHeaders,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
