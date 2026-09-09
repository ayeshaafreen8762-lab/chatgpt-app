/**
 * Centralized API & App Configuration
 * Ensures the app seamlessly resolves the active backend URL without
 * trailing slash anomalies or missing environment variables.
 */

export const RENDER_BACKEND_URL = "https://chatgpt-app-backend-diif.onrender.com";
export const DEFAULT_MODEL_ID = "groq/compound";

let hasLoggedRuntimeApiBase = false;

export function getBackendUrl(): string {
  let url = RENDER_BACKEND_URL;

  if (typeof window !== "undefined") {
    // 1. Check for developer override in localStorage
    const localOverride = localStorage.getItem("omniai_backend_override");
    if (localOverride && localOverride.trim()) {
      url = localOverride.trim();
    } else {
      const hostname = window.location.hostname;
      const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
      // If running on cloud hosting (e.g. Firebase hosting chatgpt-app-1c53a.web.app), always use Render
      if (!isLocalhost) {
        url = RENDER_BACKEND_URL;
      } else {
        url = process.env.NEXT_PUBLIC_BACKEND_URL || RENDER_BACKEND_URL;
      }
    }
  } else {
    url = process.env.NEXT_PUBLIC_BACKEND_URL || RENDER_BACKEND_URL;
  }

  // Sanitize trailing slashes and spaces
  const cleanUrl = url.trim().replace(/\/+$/, "");

  // Runtime logging for debug verification
  if (typeof window !== "undefined" && !hasLoggedRuntimeApiBase) {
    hasLoggedRuntimeApiBase = true;
    console.info(`[OmniAI Runtime] Active API_BASE: "${cleanUrl}" (Host: ${window.location.host})`);
  }

  return cleanUrl;
}
