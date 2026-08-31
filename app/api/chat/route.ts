import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [] } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "A valid 'message' string is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Convert standard role 'assistant' to Gemini role 'model'
      const formattedHistory = Array.isArray(history)
        ? history.map((msg: { role: string; content: string }) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          }))
        : [];

      const chat = model.startChat({
        history: formattedHistory,
      });

      const resultStream = await chat.sendMessageStream(message);

      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of resultStream.stream) {
              const text = chunk.text();
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
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
    } else {
      // Mock Response Engine when no GEMINI_API_KEY is supplied
      const mockResponseText = generateMockResponse(message);
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          // Stream words gradually to simulate AI generation
          const words = mockResponseText.split(" ");
          for (let i = 0; i < words.length; i++) {
            const wordChunk = (i === 0 ? "" : " ") + words[i];
            controller.enqueue(encoder.encode(wordChunk));
            await new Promise((resolve) => setTimeout(resolve, 25));
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
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

function generateMockResponse(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I am your Gemini AI assistant. How can I help you today?";
  }

  if (
    lower.includes("code") ||
    lower.includes("python") ||
    lower.includes("script") ||
    lower.includes("function") ||
    lower.includes("javascript")
  ) {
    return `Here is a sample solution using Gemini API:

\`\`\`typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function run() {
  const result = await model.generateContent("Hello Gemini!");
  console.log(result.response.text());
}
run();
\`\`\`

Let me know if you need specific component examples or hook implementations!`;
  }

  return `I received your message: "${prompt}".

*(Note: Running in **Demo Mode**. To enable live AI responses using Gemini, set your \`GEMINI_API_KEY\` in \`.env.local\`.)*`;
}
