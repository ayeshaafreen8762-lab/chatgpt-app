"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Parse content into code blocks and normal markdown blocks
  const parts = parseMarkdownContent(content);

  return (
    <div className="space-y-3 text-gray-100 text-sm leading-relaxed overflow-hidden">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <CodeBlock
              key={index}
              language={part.language || "text"}
              code={part.code}
            />
          );
        }
        return <TextSection key={index} text={part.text} />;
      })}
    </div>
  );
};

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-gray-700/60 bg-[#1e1e1e] shadow-md">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#2d2d2d] text-xs text-gray-300 border-b border-gray-700/50">
        <span className="font-mono font-medium lowercase text-gray-400">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors py-0.5 px-2 rounded hover:bg-gray-700/50"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto font-mono text-xs text-gray-200 leading-normal">
        <pre>{code}</pre>
      </div>
    </div>
  );
};

const TextSection: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-1" />;

        // List items starting with - or *
        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-2">
              <span className="text-emerald-400 select-none mt-1">•</span>
              <div>{renderFormattedInlineText(line.trim().substring(2))}</div>
            </div>
          );
        }

        // Ordered list item
        const orderedMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (orderedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-2">
              <span className="text-gray-400 font-mono text-xs select-none">
                {orderedMatch[1]}.
              </span>
              <div>{renderFormattedInlineText(orderedMatch[2])}</div>
            </div>
          );
        }

        return <p key={idx}>{renderFormattedInlineText(line)}</p>;
      })}
    </div>
  );
};

function renderFormattedInlineText(text: string) {
  // Regex to split inline code `...` and bold **...**
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code
          key={index}
          className="bg-gray-800 text-emerald-300 font-mono text-xs px-1.5 py-0.5 rounded border border-gray-700/50"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return token;
  });
}

interface MarkdownPart {
  type: "text" | "code";
  text: string;
  code: string;
  language?: string;
}

function parseMarkdownContent(content: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        text: content.substring(lastIndex, match.index),
        code: "",
      });
    }

    parts.push({
      type: "code",
      language: match[1] || "code",
      code: match[2].trimEnd(),
      text: "",
    });

    lastIndex = codeBlockRegex.lastIndex;
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
