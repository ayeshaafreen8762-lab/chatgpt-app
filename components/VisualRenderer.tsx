"use client";

import React, { useState, useEffect, useRef } from "react";
import { Check, Copy, BarChart3, Code as CodeIcon, Eye } from "lucide-react";
import mermaid from "mermaid";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import katex from "katex";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface VisualRendererProps {
  content: string;
}

export const VisualRenderer: React.FC<VisualRendererProps> = ({ content }) => {
  const parsedParts = parseContentWithVisuals(content);

  return (
    <div className="space-y-4 text-gray-200 text-sm leading-relaxed overflow-hidden">
      {parsedParts.map((part, index) => {
        if (part.type === "mermaid") {
          return <MermaidBlock key={index} code={part.code} />;
        }
        if (part.type === "recharts") {
          return <RechartsBlock key={index} jsonCode={part.code} />;
        }
        if (part.type === "latex-block") {
          return <KatexBlock key={index} formula={part.code} displayMode={true} />;
        }
        if (part.type === "code") {
          return (
            <CodePlaygroundBlock
              key={index}
              language={part.language || "text"}
              code={part.code}
            />
          );
        }
        return <MarkdownRenderer key={index} content={part.text} />;
      })}
    </div>
  );
};

// Helper to sanitize common LLM Mermaid syntax quirks
function sanitizeMermaidCode(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim();

  // Strip accidental markdown fences
  clean = clean.replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/i, "").trim();

  // Normalize 'graph TD/LR' to 'flowchart TD/LR' for modern parser features
  clean = clean.replace(/^graph\s+(TD|TB|BT|RL|LR)/i, "flowchart $1");

  // Check if any diagram type declaration exists
  const knownHeaders = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|mindmap|timeline)/im;
  if (!knownHeaders.test(clean)) {
    clean = `flowchart TD\n${clean}`;
  }

  // Replace reserved keywords used as standalone node IDs
  clean = clean.replace(/\b(end|subgraph|default|class|style|click)\s*(\[|\(|\{|\>)/gi, (match, p1, p2) => {
    return `node_${p1.toLowerCase()}${p2}`;
  });
  clean = clean.replace(/(-->|---\s*\|[^|]+\|\s*-->|-->\s*\|[^|]+\|)\s*(end|subgraph|default|class|style|click)\b(?!\s*[:;a-zA-Z0-9_])/gi, (match, arrow, kw) => {
    return `${arrow} node_${kw.toLowerCase()}`;
  });

  // Quote unquoted labels in square brackets
  clean = clean.replace(/([a-zA-Z0-9_\-]+)\[([^"\]\n]+)\]/g, (match, id, label) => {
    if (/[\(\)\{\}:\/,\-+='"#&?]/.test(label)) {
      const escaped = label.replace(/"/g, "'");
      return `${id}["${escaped}"]`;
    }
    return match;
  });

  // Quote unquoted labels in curly braces
  clean = clean.replace(/([a-zA-Z0-9_\-]+)\{([^"\}\n]+)\}/g, (match, id, label) => {
    if (/[\(\)\[\]:\/,\-+='"#&?<>]/.test(label)) {
      const escaped = label.replace(/"/g, "'");
      return `${id}{"${escaped}"}`;
    }
    return match;
  });

  // Quote unquoted labels in edge links
  clean = clean.replace(/(\|)([^"\|\n]+)(\|)/g, (match, p1, label, p3) => {
    if (/[\(\)\[\]\{\}:\/,\-+='"#&?<>]/.test(label)) {
      const escaped = label.replace(/"/g, "'");
      return `|"${escaped}"|`;
    }
    return match;
  });

  return clean;
}

// 1. Mermaid.js Flowchart & Diagram Renderer
const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [hasError, setHasError] = useState<boolean>(false);
  const [showRawCode, setShowRawCode] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const sanitized = sanitizeMermaidCode(code);

    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      suppressErrorRendering: true,
      themeVariables: {
        darkMode: true,
        background: "#18181b",
        primaryColor: "#10b981",
        primaryTextColor: "#f3f4f6",
        lineColor: "#60a5fa",
        secondaryColor: "#3b82f6",
        tertiaryColor: "#1e1e24",
      },
    });

    const renderDiagram = async () => {
      const renderId = `mermaid_${Math.random().toString(36).substring(2, 9)}`;
      try {
        if (typeof (mermaid as any).parse === "function") {
          await (mermaid as any).parse(sanitized);
        }
        const { svg } = await mermaid.render(renderId, sanitized);
        if (isMounted) {
          setSvgContent(svg);
          setHasError(false);
        }
      } catch (err: any) {
        if (typeof document !== "undefined") {
          const rogueErrorEl = document.getElementById(`d${renderId}`) || document.getElementById(renderId);
          if (rogueErrorEl) {
            rogueErrorEl.remove();
          }
        }
        if (isMounted) {
          setHasError(true);
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [code]);

  if (hasError || !svgContent) {
    if (hasError) {
      return (
        <div className="my-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 text-xs text-zinc-300 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Diagram Outline
            </span>
            <button
              onClick={() => setShowRawCode((prev) => !prev)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 underline"
            >
              {showRawCode ? "Hide source" : "View source"}
            </button>
          </div>
          <p className="mt-2 text-zinc-400 text-[11px] leading-relaxed">
            Diagram visual rendered as a structured outline:
          </p>
          {showRawCode ? (
            <pre className="mt-2 p-2 rounded-lg bg-zinc-950 font-mono text-[11px] text-zinc-400 overflow-x-auto whitespace-pre-wrap border border-zinc-800">
              {code}
            </pre>
          ) : (
            <div className="mt-2 space-y-1 font-mono text-[11px] text-zinc-300">
              {code
                .split("\n")
                .filter((line) => line.trim() && !line.startsWith("flowchart") && !line.startsWith("graph") && !line.startsWith("```"))
                .map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-zinc-600">›</span>
                    <span>{line.replace(/["\[\]\{\}\(\)]/g, "").replace(/-->/g, " ➔ ").trim()}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="my-4 rounded-xl border border-gray-800 bg-zinc-950/70 p-4 shadow-xl overflow-x-auto">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800/80 text-xs text-gray-400">
        <span className="flex items-center gap-1.5 font-medium text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Interactive Logic / Flow Diagram
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex justify-center items-center py-2 [&>svg]:max-w-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    </div>
  );
};

// 2. Recharts Dynamic Graph & Function Plotting
const RechartsBlock: React.FC<{ jsonCode: string }> = ({ jsonCode }) => {
  let chartData: any = null;
  let parseError = false;

  try {
    chartData = JSON.parse(jsonCode.trim());
  } catch {
    parseError = true;
  }

  if (parseError || !chartData || !Array.isArray(chartData.data)) {
    return (
      <div className="p-3 my-2 bg-gray-800/50 border border-gray-700 rounded text-xs text-gray-400 font-mono">
        <pre>{jsonCode}</pre>
      </div>
    );
  }

  const { type = "line", title, xAxis = "x", yAxis = "y", data = [] } = chartData;
  const sampleKeys = data.length > 0 ? Object.keys(data[0]) : [];
  const yKey = sampleKeys.find((k) => k !== xAxis) || yAxis;

  return (
    <div className="my-4 rounded-xl border border-gray-800 bg-zinc-950/80 p-4 shadow-xl">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-800 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-cyan-400" />
          <span className="font-semibold text-gray-100">
            {title || "Dynamic Mathematical Function Plot"}
          </span>
        </div>
        <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
          {type} plot
        </span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey={xAxis} stroke="#71717a" tick={{ fontSize: 11 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  borderColor: "#3f3f46",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey={yKey} fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : type === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey={xAxis} stroke="#71717a" tick={{ fontSize: 11 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  borderColor: "#3f3f46",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke="#10b981"
                fill="#10b98120"
                strokeWidth={2}
              />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey={xAxis} stroke="#71717a" tick={{ fontSize: 11 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  borderColor: "#3f3f46",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#38bdf8" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// 3. KaTeX Standalone Block
const KatexBlock: React.FC<{ formula: string; displayMode?: boolean }> = ({
  formula,
  displayMode = true,
}) => {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode,
        throwOnError: false,
      });
    } catch {
      return formula;
    }
  }, [formula, displayMode]);

  return (
    <div
      className={`my-3 py-2 px-3 rounded-lg bg-zinc-900/60 border border-zinc-800/70 overflow-x-auto text-emerald-300 font-serif ${
        displayMode ? "text-center" : "inline-block"
      }`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// 4. Code Block with Live HTML/SVG Playground Preview
const CodePlaygroundBlock: React.FC<{ language: string; code: string }> = ({
  language,
  code,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const isPreviewable =
    language.toLowerCase() === "html" ||
    language.toLowerCase() === "svg" ||
    code.trim().startsWith("<svg") ||
    code.trim().startsWith("<div");

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 text-xs text-zinc-300 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="font-mono uppercase font-semibold text-emerald-400">
            {language}
          </span>
          {isPreviewable && (
            <div className="flex items-center rounded-lg bg-zinc-800 p-0.5 border border-zinc-700">
              <button
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  activeTab === "code"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <CodeIcon size={12} />
                Code
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  activeTab === "preview"
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Eye size={12} />
                Live Preview
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors py-1 px-2.5 rounded-md hover:bg-zinc-800"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {isPreviewable && activeTab === "preview" ? (
        <div className="p-4 bg-white/5 flex items-center justify-center min-h-[140px] overflow-auto">
          <div dangerouslySetInnerHTML={{ __html: code }} />
        </div>
      ) : (
        <div className="p-4 overflow-x-auto font-mono text-xs text-zinc-200 leading-normal">
          <pre>{code}</pre>
        </div>
      )}
    </div>
  );
};

interface ParsedVisualPart {
  type: "text" | "code" | "mermaid" | "recharts" | "latex-block";
  text: string;
  code: string;
  language?: string;
}

function parseContentWithVisuals(content: string): ParsedVisualPart[] {
  const parts: ParsedVisualPart[] = [];
  const pattern = /(```[a-zA-Z0-9_+-]*\n[\s\S]*?```|\$\$[\s\S]*?\$\$)/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        text: content.substring(lastIndex, match.index),
        code: "",
      });
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith("$$") && matchedStr.endsWith("$$")) {
      parts.push({
        type: "latex-block",
        code: matchedStr.slice(2, -2).trim(),
        text: "",
      });
    } else {
      const codeMatch = matchedStr.match(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/);
      if (codeMatch) {
        const lang = (codeMatch[1] || "").toLowerCase().trim();
        const codeText = codeMatch[2].trimEnd();

        if (lang === "mermaid") {
          parts.push({ type: "mermaid", code: codeText, text: "" });
        } else if (lang === "recharts" || lang === "chart") {
          parts.push({ type: "recharts", code: codeText, text: "" });
        } else {
          parts.push({ type: "code", language: lang || "code", code: codeText, text: "" });
        }
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      text: content.substring(lastIndex),
      code: "",
    });
  }

  return parts;
}
