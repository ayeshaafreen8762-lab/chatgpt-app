import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
const FASTAPI_URL = process.env.FASTAPI_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://chatgpt-app-backend-diif.onrender.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      style = "Cinematic",
      aspectRatio = "16:9",
      model = "gemini-3.6-flash",
      customEndpoint,
      negativePrompt = "",
    } = body;

    // Forward to FastAPI Python backend
    try {
      const fastApiResponse = await fetch(`${FASTAPI_URL}/api/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style, aspectRatio, model, customEndpoint, negativePrompt }),
      });

      if (fastApiResponse.ok) {
        const data = await fastApiResponse.json();
        return NextResponse.json(data);
      }
    } catch (proxyError) {
      console.log("FastAPI backend note: Using direct fallback for media.", proxyError);
    }

    // Direct fallback
    let enhancedPrompt = `${style} style artwork of ${prompt}. Masterpiece, highly detailed, 8k resolution, dramatic lighting.`;
    let conceptTitle = `${style} Vision: ${prompt.slice(0, 30)}`;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey && model.startsWith("gemini")) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelInstance = genAI.getGenerativeModel({ model });

        const query = `Expand this user prompt into a detailed masterwork image prompt.
Prompt: "${prompt}"
Style: "${style}"
Output ONLY JSON: {"title": "Title", "enhancedPrompt": "Expanded Prompt"}`;

        const result = await modelInstance.generateContent(query);
        const jsonText = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonText);
        if (parsed.enhancedPrompt) enhancedPrompt = parsed.enhancedPrompt;
        if (parsed.title) conceptTitle = parsed.title;
      } catch (e) {
        console.warn("Gemini prompt enhancement fallback applied:", e);
      }
    }

    let width = 1280;
    let height = 720;
    if (aspectRatio === "1:1") {
      width = 1024;
      height = 1024;
    } else if (aspectRatio === "9:16") {
      width = 720;
      height = 1280;
    } else if (aspectRatio === "4:3") {
      width = 1024;
      height = 768;
    }

    const seed = Math.floor(Math.random() * 1000000);
    const encodedPrompt = encodeURIComponent(`${enhancedPrompt} ${style} high quality`);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;

    return NextResponse.json({
      title: conceptTitle,
      enhancedPrompt,
      style,
      aspectRatio,
      modelUsed: model,
      imageUrl,
      seed,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
