import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
const FASTAPI_URL = process.env.FASTAPI_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://chatgpt-app-backend-diif.onrender.com";

async function streamFromCustomEndpoint(customUrl: string, message: string, history: Array<{ role: string; content: string }>) {
  const targetUrl = customUrl.replace(/\/$/, "");
  const fullEndpoint = targetUrl.endsWith("/chat/completions") ? targetUrl : `${targetUrl}/chat/completions`;

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
      history = [],
      files = [],
      model = "gemini-3.6-flash",
      customEndpointUrl = "",
    } = body;

    // 1. Forward request to FastAPI Python service
    try {
      const fastApiResponse = await fetch(`${FASTAPI_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, files, model, customEndpointUrl }),
      });

      if (fastApiResponse.ok && fastApiResponse.body) {
        return new Response(fastApiResponse.body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    } catch (proxyError) {
      console.log("FastAPI backend note: Using direct Next.js fallback handler.", proxyError);
    }

    // 2. Custom Endpoint Direct Fallback
    if (customEndpointUrl) {
      try {
        const customStream = await streamFromCustomEndpoint(customEndpointUrl, message, history);
        return new Response(customStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      } catch (err) {
        console.warn("Custom endpoint direct fallback failed, continuing to default provider:", err);
      }
    }

    // 3. Native Groq Streaming Direct Handler
    const groqKey = process.env.GROQ_API_KEY;
    const keyPrefix = groqKey ? groqKey.slice(0, 6) : "(none)";
    console.log(`[DEBUG process.env.GROQ_API_KEY] loaded prefix: '${keyPrefix}' | length: ${groqKey ? groqKey.length : 0}`);
    if (groqKey && (model.includes("llama") || model.includes("qwen") || model.includes("deepseek") || model.includes("groq") || !model.startsWith("gemini"))) {
      try {
        const groqModel = model === "groq/compound" ? "llama-3.3-70b-versatile" : (model.startsWith("groq/") ? "llama-3.3-70b-versatile" : model);
        const groqMessages = (history || []).map((m: { role: string; content: string }) => ({
          role: m.role === "human" ? "user" : m.role,
          content: m.content,
        }));
        groqMessages.push({ role: "user", content: message });

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: groqModel,
            messages: groqMessages,
            temperature: 0.5,
            stream: true,
          }),
        });

        if (groqRes.ok && groqRes.body) {
          const reader = groqRes.body.getReader();
          const decoder = new TextDecoder("utf-8");
          const encoder = new TextEncoder();
          let sseBuf = "";

          const groqStream = new ReadableStream({
            async start(controller) {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  sseBuf += decoder.decode(value, { stream: true });
                  const lines = sseBuf.split("\n");
                  sseBuf = lines.pop() || "";
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: ")) continue;
                    const dataStr = trimmed.slice(6).trim();
                    if (dataStr === "[DONE]") break;
                    try {
                      const parsed = JSON.parse(dataStr);
                      const delta = parsed.choices?.[0]?.delta?.content;
                      if (delta) controller.enqueue(encoder.encode(delta));
                    } catch {}
                  }
                }
                controller.close();
              } catch (err) {
                controller.error(err);
              }
            },
          });

          return new Response(groqStream, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        }
      } catch (groqErr) {
        console.warn("Direct Groq route failed, falling back to next provider:", groqErr);
      }
    }

    // 4. Gemini API Direct Fallback Handler
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey && model.startsWith("gemini")) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelInstance = genAI.getGenerativeModel({ model });

      const formattedHistory = Array.isArray(history)
        ? history.map((msg: { role: string; content: string }) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          }))
        : [];

      const chat = modelInstance.startChat({ history: formattedHistory });
      const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          if (file.data) {
            const cleanBase64 = file.data.includes(",") ? file.data.split(",")[1] : file.data;
            userParts.push({
              inlineData: {
                mimeType: file.type || "application/octet-stream",
                data: cleanBase64,
              },
            });
          }
        }
      }

      if (message) userParts.push({ text: message });

      const resultStream = await chat.sendMessageStream(userParts);
      const encoder = new TextEncoder();

      const customStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of resultStream.stream) {
              const text = chunk.text();
              if (text) controller.enqueue(encoder.encode(text));
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return new Response(customStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    // 4. Fallback Cloud Streaming Mock Response
    const displayModelName = model === "hosted-cloud-llm" ? "Hosted Cloud LLM Endpoint" : model;
    const urlNote = customEndpointUrl ? `\n\n*(Connected to Hosted Endpoint Link: \`${customEndpointUrl}\`)*` : "";
    const mockText = `Response from **${displayModelName}**:${urlNote}\n\n${message || "Analyzed document query."}`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const words = mockText.split(" ");
        for (let i = 0; i < words.length; i++) {
          const chunk = (i === 0 ? "" : " ") + words[i];
          controller.enqueue(encoder.encode(chunk));
          await new Promise((r) => setTimeout(r, 20));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
