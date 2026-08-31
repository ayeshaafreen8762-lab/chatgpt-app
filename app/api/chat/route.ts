import { NextRequest, NextResponse } from "next/server";

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

    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      // Connect to official OpenAI API with streaming
      const systemMessage = {
        role: "system",
        content: "You are a helpful, clever, concise, and friendly AI assistant.",
      };

      const formattedHistory = Array.isArray(history)
        ? history.map((msg: { role: string; content: string }) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          }))
        : [];

      const openAiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [systemMessage, ...formattedHistory, { role: "user", content: message }],
            stream: true,
          }),
        }
      );

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        return NextResponse.json(
          { error: `OpenAI API error: ${openAiResponse.statusText}`, details: errorText },
          { status: openAiResponse.status }
        );
      }

      if (!openAiResponse.body) {
        return NextResponse.json(
          { error: "No response body received from OpenAI." },
          { status: 500 }
        );
      }

      // Transform OpenAI Server-Sent Events (SSE) into plain text stream for front-end
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const customStream = new ReadableStream({
        async start(controller) {
          const reader = openAiResponse.body!.getReader();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  const dataStr = trimmed.replace(/^data: /, "");
                  if (dataStr === "[DONE]") {
                    controller.close();
                    return;
                  }
                  try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                      controller.enqueue(encoder.encode(delta));
                    }
                  } catch {
                    // Ignore JSON parse errors for incomplete chunks
                  }
                }
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
      // Mock Response Engine when no OPENAI_API_KEY is supplied
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
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

function generateMockResponse(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I am your AI assistant. How can I help you today?";
  }

  if (lower.includes("code") || lower.includes("python") || lower.includes("script") || lower.includes("function") || lower.includes("javascript")) {
    return `Here is a sample solution for your request:

\`\`\`typescript
// Quick Example: Asynchronous Fetch in TypeScript
async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }
  return await response.json() as T;
}

// Usage
console.log("Ready to query backend API!");
\`\`\`

You can copy this snippet or ask me to modify it for your specific framework!`;
  }

  if (lower.includes("next") || lower.includes("react") || lower.includes("tailwind")) {
    return `Next.js App Router and Tailwind CSS offer a powerful stack for modern web applications!

Key Highlights:
- **Server & Client Components**: Optimizes performance by shipping minimal JavaScript to the client.
- **Route Handlers**: Easily build API endpoints right inside \`app/api/\`.
- **Tailwind CSS**: Utility-first styling with high customizability and instant dark mode support.

Let me know if you need specific component examples or hook implementations!`;
  }

  return `I received your message: "${prompt}".

*(Note: Running in **Demo Mode**. To enable live AI responses using OpenAI, set your \`OPENAI_API_KEY\` in \`.env.local\`.)*

Is there anything specific you would like me to assist you with, such as writing code, brainstorming ideas, or formatting text?`;
}
