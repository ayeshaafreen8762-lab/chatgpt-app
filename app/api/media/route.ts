import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      style = "Cinematic",
      aspectRatio = "16:9",
      negativePrompt = "",
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "A valid prompt string is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    let enhancedPrompt = `${style} style artwork of ${prompt}. Masterpiece, highly detailed, 8k resolution, vibrant lighting, dramatic composition.`;
    let conceptTitle = `${style} Vision: ${prompt.slice(0, 30)}`;

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

        const promptEnhancementQuery = `You are a world-class prompt engineer and art director for AI image generation.
Expand the following user prompt into an ultra-detailed, vivid image generation prompt.
User Prompt: "${prompt}"
Artistic Style: "${style}"
Negative Prompt: "${negativePrompt}"

Output ONLY a raw JSON object with no markdown formatting:
{
  "title": "A short evocative title for the artwork",
  "enhancedPrompt": "The full detailed masterwork image prompt",
  "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4"]
}`;

        const geminiResult = await model.generateContent(promptEnhancementQuery);
        const rawText = geminiResult.response.text().trim();
        const jsonText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

        const parsed = JSON.parse(jsonText);
        if (parsed.enhancedPrompt) {
          enhancedPrompt = parsed.enhancedPrompt;
        }
        if (parsed.title) {
          conceptTitle = parsed.title;
        }
      } catch (err) {
        console.warn("Gemini prompt enhancement fallback applied:", err);
      }
    }

    // Determine dimensions based on ratio
    let width = 1024;
    let height = 1024;

    if (aspectRatio === "16:9") {
      width = 1280;
      height = 720;
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
      imageUrl,
      seed,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
