import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

export interface AttachedFilePayload {
  name: string;
  type: string;
  data: string; // base64 representation
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], files = [] } = body;

    if (!message && (!files || files.length === 0)) {
      return NextResponse.json(
        { error: "A message string or at least one attached file is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

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

      // Prepare user parts including text message and multimodal inlineData files
      const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (Array.isArray(files) && files.length > 0) {
        for (const file of files as AttachedFilePayload[]) {
          if (file.data) {
            const cleanBase64 = file.data.includes(",")
              ? file.data.split(",")[1]
              : file.data;
            userParts.push({
              inlineData: {
                mimeType: file.type || "application/octet-stream",
                data: cleanBase64,
              },
            });
          }
        }
      }

      if (message) {
        userParts.push({ text: message });
      }

      const resultStream = await chat.sendMessageStream(userParts);

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
      // Demo / Fallback engine when no GEMINI_API_KEY is supplied
      const mockResponseText = generateMockMultimodalResponse(message, files);
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const words = mockResponseText.split(" ");
          for (let i = 0; i < words.length; i++) {
            const wordChunk = (i === 0 ? "" : " ") + words[i];
            controller.enqueue(encoder.encode(wordChunk));
            await new Promise((resolve) => setTimeout(resolve, 20));
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

function generateMockMultimodalResponse(
  prompt: string,
  files: AttachedFilePayload[]
): string {
  const hasFiles = files && files.length > 0;
  const fileNames = hasFiles ? files.map((f) => f.name).join(", ") : "";

  if (hasFiles) {
    return `### Multimodal Analysis Report for Attached File(s): \`${fileNames}\`

I have analyzed your uploaded document/image (\`${fileNames}\`).

**Key Highlights & Summary:**
- **File Format & Structure**: Verified valid document/media input.
- **Content Overview**: The attachment contains structured data, textual paragraphs, or visual components.
- **Query Response**: Addressing your prompt: "${prompt || "Please analyze this file."}"
  
1. **Document Context**: Clean layout parsed successfully.
2. **Key Insights**: Key sections identified and ready for deep inquiry.
3. **Recommended Follow-up**: Ask specific questions using the doubt clarification bar below to inspect individual sections or formulas!

*(Note: Running in **Demo Mode**. Set your \`GEMINI_API_KEY\` in \`.env.local\` to activate full live multimodal processing with Gemini 3.6 Flash.)*`;
  }

  return `I received your message: "${prompt}".

*(Note: Running in **Demo Mode**. Set your \`GEMINI_API_KEY\` in \`.env.local\` to enable live AI responses using Gemini 3.6 Flash.)*`;
}
