"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="text-gray-100 text-sm leading-relaxed overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ node, ...props }) => (
            <div className="my-4 w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/70 shadow-lg scrollbar-thin scrollbar-thumb-zinc-700">
              <table className="w-full text-left border-collapse text-xs sm:text-sm text-zinc-200" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-zinc-900/90 text-emerald-400 font-semibold border-b border-zinc-800" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-zinc-800/60" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-zinc-900/40 transition-colors" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-3 font-semibold tracking-wide border-r border-zinc-800/60 last:border-r-0 whitespace-nowrap" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 border-r border-zinc-800/60 last:border-r-0 break-words max-w-xs sm:max-w-md" {...props} />
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");

            if (!inline && match) {
              return <CodeBlock language={match[1]} code={codeString} />;
            }
            if (!inline && codeString.includes("\n")) {
              return <CodeBlock language="code" code={codeString} />;
            }

            return (
              <code
                className="bg-zinc-800 text-emerald-300 font-mono text-xs px-1.5 py-0.5 rounded border border-zinc-700/60"
                {...props}
              >
                {children}
              </code>
            );
          },
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-inside space-y-1.5 my-2 text-zinc-200" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-inside space-y-1.5 my-2 text-zinc-200" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="ml-1 leading-relaxed" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="my-2 leading-relaxed" {...props} />
          ),
          h1: ({ node, ...props }) => (
            <h1 className="text-xl font-bold text-white mt-4 mb-2 border-b border-zinc-800 pb-1" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-lg font-semibold text-emerald-400 mt-3 mb-2" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-base font-medium text-emerald-300 mt-2 mb-1" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-emerald-500 pl-4 py-1.5 my-3 bg-emerald-950/20 text-zinc-300 rounded-r-lg italic" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
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
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-800 bg-[#18181b] shadow-md">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#27272a] text-xs text-zinc-300 border-b border-zinc-800">
        <span className="font-mono font-medium lowercase text-emerald-400">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors py-0.5 px-2 rounded hover:bg-zinc-700/50"
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
      <div className="p-4 overflow-x-auto font-mono text-xs text-zinc-200 leading-normal">
        <pre>{code}</pre>
      </div>
    </div>
  );
};
