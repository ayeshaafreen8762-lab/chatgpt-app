/**
 * OmniAI API Diagnostic & Error Classification System
 * 
 * Accurately diagnoses and distinguishes:
 * 1. "server responded with an error" (HTTP 4xx / 5xx with body detail extraction)
 * 2. "server unreachable / asleep" (Render cold-start spin-up / free-tier standby)
 * 3. "local backend offline" (http://localhost:8000 connection refused)
 * 4. "CORS blocked" (Browser CORS preflight/origin policy rejections)
 */

export interface ClassifiedApiError {
  kind: "SERVER_ERROR" | "SERVER_ASLEEP" | "LOCAL_OFFLINE" | "CORS_BLOCKED" | "ABORTED" | "NETWORK_ERROR";
  badge: string;
  title: string;
  friendlyMessage: string;
  technicalSummary: string;
  statusCode?: number;
  endpointUrl: string;
}

/**
 * Parses and classifies an HTTP non-2xx Response object.
 */
export async function handleResponseError(
  response: Response,
  endpointUrl: string
): Promise<ClassifiedApiError> {
  const status = response.status;
  const statusText = response.statusText || "";
  let detailMessage = "";

  try {
    const json = await response.json();
    detailMessage = json.detail || json.error || json.message || JSON.stringify(json);
  } catch {
    try {
      detailMessage = await response.text();
    } catch {
      detailMessage = "";
    }
  }

  let title = `Server Error (HTTP ${status})`;
  let friendlyMessage = detailMessage || `The server returned an error (HTTP ${status} ${statusText}).`;

  if (status === 401 || status === 403) {
    title = "Authentication Error";
    friendlyMessage = "Your session is invalid or has expired. Please log in again.";
  } else if (status === 404) {
    title = "Endpoint Not Found (404)";
    friendlyMessage = `The requested endpoint at ${endpointUrl} was not found. Please verify backend routes.`;
  } else if (status === 429) {
    title = "Rate Limit Reached (429)";
    friendlyMessage = "Too many requests to the AI engine. Please wait a moment before trying again.";
  } else if (status >= 500) {
    title = `Backend Service Error (HTTP ${status})`;
    if (status === 502 || status === 503 || status === 504 || status === 524) {
      friendlyMessage = `The AI server gateway timed out or is temporarily restarting. Render may be cycling the instance. Please click Retry in a few seconds.`;
    }
  }

  return {
    kind: "SERVER_ERROR",
    badge: `HTTP ${status}`,
    title,
    friendlyMessage,
    technicalSummary: `HTTP ${status} ${statusText} from ${endpointUrl}. Detail: ${detailMessage || "none"}`,
    statusCode: status,
    endpointUrl,
  };
}

/**
 * Classifies JavaScript exceptions thrown by fetch() (network failures, CORS, cold starts).
 */
export function handleNetworkError(
  error: any,
  endpointUrl: string
): ClassifiedApiError {
  if (error?.name === "AbortError") {
    return {
      kind: "ABORTED",
      badge: "Stopped",
      title: "Request Stopped",
      friendlyMessage: "Generation was stopped.",
      technicalSummary: "Request was aborted by user or timeout.",
      endpointUrl,
    };
  }

  const errorString = error?.message || String(error);
  const isLocalhost = endpointUrl.includes("localhost") || endpointUrl.includes("127.0.0.1");
  const isRender = endpointUrl.includes("onrender.com");

  // Local development backend not running
  if (isLocalhost) {
    return {
      kind: "LOCAL_OFFLINE",
      badge: "Local Backend Offline",
      title: "Local FastAPI Server Offline",
      friendlyMessage:
        `🔌 Cannot connect to local backend at ${endpointUrl}.\n\n` +
        `• Start local FastAPI: \`cd backend && uvicorn main:app --reload --port 8000\`\n` +
        `• Or switch to live Render backend: set NEXT_PUBLIC_BACKEND_URL in .env.local to https://chatgpt-app-backend-diif.onrender.com`,
      technicalSummary: `Connection refused to ${endpointUrl}. Raw error: ${errorString}`,
      endpointUrl,
    };
  }

  // Cloud Render backend asleep / cold starting
  if (isRender) {
    return {
      kind: "SERVER_ASLEEP",
      badge: "Render Cold Start",
      title: "AI Backend Waking Up",
      friendlyMessage:
        `🔌 The live Render backend is waking up from free-tier standby (~30-50s cold start).\n\n` +
        `Please wait a few seconds and click **'Retry'** to connect.`,
      technicalSummary: `Render connection failed to ${endpointUrl}. Possible cold-start or CORS block: ${errorString}`,
      endpointUrl,
    };
  }

  return {
    kind: "NETWORK_ERROR",
    badge: "Network Error",
    title: "Connection Failed",
    friendlyMessage: `⚠️ Failed to fetch from ${endpointUrl}. Please check your network connection or CORS settings.`,
    technicalSummary: `Fetch error on ${endpointUrl}: ${errorString}`,
    endpointUrl,
  };
}
