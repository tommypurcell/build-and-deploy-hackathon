"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const mdComponents = {
  h1: ({ children }) => (
    <h1 className="mt-8 border-b border-teal-500/25 pb-2 text-xl font-semibold tracking-tight text-teal-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 border-b border-teal-500/20 pb-1.5 text-lg font-semibold text-teal-100/95 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 text-base font-semibold text-zinc-100 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mt-3 text-[0.9375rem] leading-relaxed text-zinc-200/95 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-5 text-zinc-200/95">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-zinc-200/95">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>p]:mt-2 [&>p:first-child]:mt-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-teal-50/95">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-cyan-300/90 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-200"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-teal-500/40 pl-4 text-zinc-300/90 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-8 border-zinc-600/50" />,
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
      return (
        <code className={`block font-mono text-[0.8125rem] text-teal-50/95 ${className}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[0.8125rem] text-teal-100/95 [overflow-wrap:anywhere]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-700/60 bg-black/55 p-4 text-[0.8125rem] leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-700/50">
      <table className="w-full min-w-[16rem] border-collapse text-left text-[0.875rem]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-zinc-600/60 bg-zinc-900/50">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 font-semibold text-zinc-200">{children}</th>
  ),
  td: ({ children }) => <td className="border-t border-zinc-700/40 px-3 py-2 text-zinc-300">{children}</td>,
};

/**
 * Renders Markdown (GFM) with OWEN / notes HUD styling.
 */
export function MarkdownNotes({ markdown, className = "" }) {
  const src = typeof markdown === "string" ? markdown : "";
  return (
    <div className={`notes-markdown ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {src}
      </ReactMarkdown>
    </div>
  );
}
