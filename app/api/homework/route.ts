import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subject = "General Academic",
      problemText,
      solutionFormat = "step-by-step",
      files = [],
    } = body;

    if (!problemText && (!files || files.length === 0)) {
      return NextResponse.json(
        { error: "Please enter a problem description or upload an assignment file." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-3.6-flash",
        systemInstruction: `You are an expert, patient, and precise academic tutor and homework solver specializing in ${subject}.
When solving problems:
1. Provide clear, structured explanations with headers.
2. Breakdown complex steps logically with numbered points.
3. Use formatted math notation or code blocks where applicable.
4. Highlight key formulas, principles, and verified final answers.
5. Format output using GitHub Flavored Markdown.`,
      });

      const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          if (file.data) {
            const cleanBase64 = file.data.includes(",")
              ? file.data.split(",")[1]
              : file.data;
            userParts.push({
              inlineData: {
                mimeType: file.type || "application/pdf",
                data: cleanBase64,
              },
            });
          }
        }
      }

      const promptText = `Subject: ${subject}
Requested Solution Format: ${solutionFormat}

Problem Statement:
${problemText || "Please solve and explain the attached assignment document."}`;

      userParts.push({ text: promptText });

      const resultStream = await model.generateContentStream(userParts);

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
      // Mock Response Engine when no API key is set
      const mockSolutionText = generateMockHomeworkSolution(
        subject,
        problemText,
        solutionFormat,
        files
      );
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const words = mockSolutionText.split(" ");
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

function generateMockHomeworkSolution(
  subject: string,
  problem: string,
  format: string,
  files: Array<{ name: string }>
): string {
  const hasFiles = files && files.length > 0;
  const fileNameStr = hasFiles ? ` (Attached: \`${files[0].name}\`)` : "";

  return `# ${subject} Solution & Step-by-Step Breakdown${fileNameStr}

## 🎯 Problem Overview
> ${problem || "Solve the assignment problem in the attached file."}

---

## 🔑 Key Concepts & Principles
- **Core Subject Area**: ${subject}
- **Solution Approach**: ${format}
- **Primary Theorem / Rules Applied**: Fundamental analytical laws & structural decomposition.

---

## 📝 Step-by-Step Solution

### Step 1: Variable & Input Analysis
Identify given values and target parameters. Ensure standard units and consistent boundary conditions.

### Step 2: Formulate Equations & Logic
Setup equation or algorithmic logic:

\`\`\`typescript
// Mathematical formulation / logic representation
function solveProblem(input: number): number {
  // Step A: Transformation
  const intermediate = Math.pow(input, 2) + 2 * input;
  // Step B: Optimization
  return Math.sqrt(intermediate);
}
\`\`\`

### Step 3: Calculation & Derivation
Substitute parameters into formulation and evaluate:
1. Apply primary transform rules.
2. Simplify algebraic components.
3. Validate solution consistency against physical / logical constraints.

---

## 💡 Final Answer
\`\`\`text
Verified Final Solution: [Target Value / Output Derived Successfully]
\`\`\`

*(Running in **Demo Mode**. Add your \`GEMINI_API_KEY\` in \`.env.local\` for live academic solutions powered by Gemini 3.6 Flash.)*`;
}
