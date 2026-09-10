/**
 * app/api/chat/route.ts
 * ---------------------
 * Next.js API route that proxies all chat requests to the FastAPI backend.
 * The FastAPI backend handles the Hugging Face Inference API key server-side —
 * no secret is ever exposed to the browser.
 *
 * Fallback chain:
 *   1. FastAPI /api/chat/stream  (primary — Hugging Face via backend)
 *   2. Custom endpoint (if user provided one in settings)
 *   3. Clear error message (no silent mock responses)
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FASTAPI_URL =
  process.env.FASTAPI_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://chatgpt-app-backend-diif.onrender.com";

async function streamFromCustomEndpoint(
  customUrl: string,
  message: string,
  history: Array<{ role: string; content: string }>
) {
  const targetUrl = customUrl.replace(/\/$/, "");
  const fullEndpoint = targetUrl.endsWith("/chat/completions")
    ? targetUrl
    : `${targetUrl}/chat/completions`;

  const messages = (history || []).map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: message });

  const res = await fetch(fullEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "custom-model",
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Custom endpoint response error: ${res.status}`);
  }

  return res.body;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      prompt,
      history = [],
      files = [],
      model_id,
      model = "hf/mistral-7b-instruct",
      sessionId,
      documentId,
      imageUrl,
      messages: messageHistory,
      customEndpoint,
      customEndpointUrl = "",
    } = body;

    // ── 1. Forward to FastAPI backend (Hugging Face handled server-side) ────────
    try {
      const fastApiResponse = await fetch(`${FASTAPI_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          prompt,
          model_id: model_id || model,
          model: model_id || model,
          sessionId,
          documentId,
          imageUrl,
          messages: messageHistory,
          history,
          customEndpoint,
        }),
      });

      if (fastApiResponse.ok && fastApiResponse.body) {
        // Pass the SSE stream straight through to the client
        return new Response(fastApiResponse.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      // FastAPI returned a non-2xx — report the real error
      const errBody = await fastApiResponse.text().catch(() => "No error body");
      console.error(`[OmniAI Route] FastAPI returned ${fastApiResponse.status}: ${errBody}`);
      throw new Error(`Backend error ${fastApiResponse.status}: ${errBody.slice(0, 200)}`);
    } catch (proxyError: unknown) {
      const proxyErrMsg = proxyError instanceof Error ? proxyError.message : String(proxyError);
      console.warn("[OmniAI Route] FastAPI proxy failed:", proxyErrMsg);

      // ── 2. Custom Endpoint Fallback ─────────────────────────────────────────
      if (customEndpointUrl) {
        try {
          const customStream = await streamFromCustomEndpoint(
            customEndpointUrl,
            message || "",
            history
          );
          return new Response(customStream, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        } catch (customErr) {
          console.warn("[OmniAI Route] Custom endpoint fallback failed:", customErr);
        }
      }

      // ── 3. All providers failed — stream a real error message ───────────────
      const encoder = new TextEncoder();
      const errorText =
        `⚠️ **AI Service Unavailable**\n\n` +
        `Could not reach the AI backend server.\n\n` +
        `**Error**: ${proxyErrMsg}\n\n` +
        `Please check your internet connection or try again in a moment. ` +
        `If the problem persists, the backend server (Render) may be waking up from a cold start — ` +
        `wait 30 seconds and retry.`;

      const errorStream = new ReadableStream({
        async start(controller) {
          const errorEvent = JSON.stringify({ content: errorText, chunk: errorText, error: proxyErrMsg });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(errorStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
