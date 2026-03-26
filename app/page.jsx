"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";

function buildRepoContextSystemMessage(repoContextJson) {
  return [
    "You are helping with questions about a GitHub repository.",
    "Use the repo context JSON below as your primary source of truth for this call.",
    "If the answer is in the JSON, answer directly and do not ask the user for a keyword first.",
    "If the answer is missing from the JSON, say that clearly and then ask a focused follow-up question.",
    "Repo context JSON:",
    repoContextJson,
  ].join("\n\n");
}

export default function Home() {
  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

  const vapiRef = useRef(null);
  const pendingContextMessageRef = useRef("");
  const [connected, setConnected] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
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
      if (pendingContextMessageRef.current) {
        try {
          vapi.send({
            type: "add-message",
            message: {
              role: "system",
              content: pendingContextMessageRef.current,
            },
            triggerResponseEnabled: false,
          });
          pushLog("Injected repo context JSON into the call.");
        } catch (error) {
          pushLog(`Could not inject repo context: ${error?.message || String(error)}`);
        }
      }
    };
    const onEnd = () => {
      setConnected(false);
      pendingContextMessageRef.current = "";
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

  const fetchRepoContext = useCallback(async () => {
    const trimmedRepoUrl = repoUrl.trim();
    const query = trimmedRepoUrl
      ? `?repoUrl=${encodeURIComponent(trimmedRepoUrl)}`
      : "";

    const response = await fetch(`/api/repo-context${query}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      let message = `Repo context request failed with ${response.status}.`;
      try {
        const body = await response.json();
        if (body?.message) {
          message = body.message;
        }
      } catch {
        /* ignore JSON parse failure */
      }
      throw new Error(message);
    }

    return response.json();
  }, [repoUrl]);

  const toggleCall = useCallback(async () => {
    if (!vapi || !assistantId) {
      pushLog("Missing NEXT_PUBLIC_VAPI_PUBLIC_KEY or NEXT_PUBLIC_VAPI_ASSISTANT_ID.");
      return;
    }

    if (connected) {
      await vapi.stop();
      return;
    }

    setLoadingContext(true);
    pushLog("Loading repo context...");

    try {
      const payload = await fetchRepoContext();
      const repoInfo = payload?.repoContext?.repository;

      pendingContextMessageRef.current = buildRepoContextSystemMessage(
        payload?.repoContextJson || "{}",
      );

      if (repoInfo?.fullName) {
        pushLog(`Repo context ready for ${repoInfo.fullName}.`);
      } else if (repoUrl.trim()) {
        pushLog(`Repo context ready for ${repoUrl.trim()}.`);
      } else {
        pushLog("Repo context ready.");
      }

      const assistantOverrides = {
        variableValues: {
          repoUrl: repoInfo?.url || repoUrl.trim() || "",
          repoName: repoInfo?.name || "",
          repoFullName: repoInfo?.fullName || "",
        },
      };

      await vapi.start(assistantId, assistantOverrides);
    } catch (error) {
      pendingContextMessageRef.current = "";
      pushLog(`Could not load repo context: ${error?.message || String(error)}`);
    } finally {
      setLoadingContext(false);
    }
  }, [vapi, assistantId, connected, pushLog, repoUrl, fetchRepoContext]);

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
              <code className="font-mono">.env</code>, then restart{" "}
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
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            OWEN loads repo JSON from this URL before the call starts. Leave it blank to use the
            repo configured in your server env.
          </p>

          <button
            type="button"
            onClick={toggleCall}
            disabled={!ready || loadingContext}
            className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-center text-sm font-medium text-white shadow-sm transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connected
              ? "End voice session"
              : loadingContext
                ? "Loading repo context..."
                : "Start voice session"}
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
