"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";

export default function Home() {
  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

  const vapiRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState([]);
  const [repoUrl, setRepoUrl] = useState("");

  const pushLog = useCallback((line) => {
    setLog((prev) => [...prev.slice(-40), `${new Date().toLocaleTimeString()} ${line}`]);
  }, []);

  const vapi = useMemo(() => {
    if (!publicKey) return null;
    return new Vapi(publicKey);
  }, [publicKey]);

  useEffect(() => {
    if (!vapi) return;
    vapiRef.current = vapi;

    const onStart = () => {
      setConnected(true);
      pushLog("Call started - ask about this repo.");
    };
    const onEnd = () => {
      setConnected(false);
      pushLog("Call ended.");
    };
    const onMessage = (message) => {
      if (message?.type === "transcript" && message.transcript) {
        pushLog(`${message.role || "user"}: ${message.transcript}`);
      }
    };
    const onError = (e) => {
      pushLog(`Error: ${e?.message || String(e)}`);
    };

    vapi.on("call-start", onStart);
    vapi.on("call-end", onEnd);
    vapi.on("message", onMessage);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onStart);
      vapi.off("call-end", onEnd);
      vapi.off("message", onMessage);
      vapi.off("error", onError);
      try {
        vapi.stop();
      } catch {
        /* ignore */
      }
    };
  }, [vapi, pushLog]);

  const toggleCall = useCallback(() => {
    if (!vapi || !assistantId) {
      pushLog("Missing NEXT_PUBLIC_VAPI_PUBLIC_KEY or NEXT_PUBLIC_VAPI_ASSISTANT_ID.");
      return;
    }
    if (connected) {
      vapi.stop();
      return;
    }
    if (repoUrl.trim()) {
      pushLog(`Repo URL: ${repoUrl.trim()}`);
    }

    // Optional: pass repoUrl into the assistant as a dynamic variable.
    // In Vapi prompts you can use {{repoUrl}} if you want.
    const assistantOverrides = {
      variableValues: {
        repoUrl: repoUrl.trim() || "",
      },
    };

    vapi.start(assistantId, assistantOverrides);
  }, [vapi, assistantId, connected, pushLog, repoUrl]);

  const ready = Boolean(publicKey && assistantId);

  return (
    <div className="min-h-full owen-shell text-zinc-900 dark:text-zinc-100">
      <main className="mx-auto flex max-w-lg flex-col items-center px-6 py-16">
        <div className="owen-banner w-full px-4 py-8 text-center sm:px-6 sm:py-10">
          <h1 className="pixel-title text-4xl sm:text-5xl md:text-6xl lg:text-7xl">OWEN</h1>
        </div>
        <p className="mt-3 text-center text-xs text-zinc-600 dark:text-zinc-300">
          Oral Workflow Engine for repo Navigation
        </p>

        <div className="mt-6 w-full owen-card rounded-xl p-5">
          {!ready && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              Add <code className="font-mono">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> and{" "}
              <code className="font-mono">NEXT_PUBLIC_VAPI_ASSISTANT_ID</code> to{" "}
              <code className="font-mono">.env.local</code>, then restart{" "}
              <code className="font-mono">npm run dev</code>.
            </p>
          )}

          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Repo URL
          </label>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/your/repo"
            className="mt-2 w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-500 focus:border-teal-500 dark:border-white/10 dark:bg-zinc-900/20 dark:text-zinc-100"
          />

          <button
            type="button"
            onClick={toggleCall}
            disabled={!ready}
            className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-center text-sm font-medium text-white shadow-sm transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connected ? "End voice session" : "Start voice session"}
          </button>
        </div>

        <div className="mt-6 w-full owen-card rounded-xl p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Transcript log
          </h2>
          <ul className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-white/40 bg-white/60 p-3 font-mono text-[11px] leading-relaxed dark:border-zinc-800 dark:bg-zinc-950/30">
            {log.length === 0 ? (
              <li className="text-zinc-400">No events yet.</li>
            ) : (
              log.map((line, i) => (
                <li
                  key={i}
                  className="border-b border-white/40 py-1 last:border-0 dark:border-zinc-800"
                >
                  {line}
                </li>
              ))
            )}
          </ul>
        </div>
      </main>
    </div>
  );
}
