"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import { MarkdownNotes } from "@/app/components/MarkdownNotes";
import { saveNote } from "@/lib/notesStorage";

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
  const lastTranscriptLogRef = useRef({ role: "", text: "" });
  /** Merge multiple assistant "final" transcript chunks into one log + dialogue turn. */
  const assistantBufferRef = useRef("");
  const assistantDebounceRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [log, setLog] = useState([]);
  const [dialogue, setDialogue] = useState([]);

  const [notesFullText, setNotesFullText] = useState("");
  const [notesDisplayText, setNotesDisplayText] = useState("");
  const [notesSessionId, setNotesSessionId] = useState(null);
  const [notesTypingDone, setNotesTypingDone] = useState(false);
  const [notesPreviewExpanded, setNotesPreviewExpanded] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");

  const [repoUrl, setRepoUrl] = useState("");

  const pushLog = useCallback((line) => {
    setLog((prev) => [...prev.slice(-40), `${new Date().toLocaleTimeString()} ${line}`]);
  }, []);

  const flushAssistantBuffer = useCallback(() => {
    if (assistantDebounceRef.current) {
      clearTimeout(assistantDebounceRef.current);
      assistantDebounceRef.current = null;
    }
    const full = assistantBufferRef.current.trim();
    assistantBufferRef.current = "";
    if (!full) return;
    pushLog(`assistant: ${full}`);
    setDialogue((d) => [...d, { role: "assistant", text: full }]);
    lastTranscriptLogRef.current = { role: "assistant", text: full };
  }, [pushLog]);

  const vapi = useMemo(() => {
    if (!publicKey) return null;
    return new Vapi(publicKey);
  }, [publicKey]);

  useEffect(() => {
    if (!vapi) return;
    vapiRef.current = vapi;

    const onStart = () => {
      setConnected(true);
      lastTranscriptLogRef.current = { role: "", text: "" };
      assistantBufferRef.current = "";
      if (assistantDebounceRef.current) {
        clearTimeout(assistantDebounceRef.current);
        assistantDebounceRef.current = null;
      }
      setDialogue([]);
      setNotesFullText("");
      setNotesDisplayText("");
      setNotesSessionId(null);
      setNotesTypingDone(false);
      setNotesPreviewExpanded(false);
      setNotesError("");
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
      flushAssistantBuffer();
      setConnected(false);
      pendingContextMessageRef.current = "";
      lastTranscriptLogRef.current = { role: "", text: "" };
      pushLog("Call ended.");
    };
    const onSpeechEnd = () => {
      flushAssistantBuffer();
    };
    const onMessage = (message) => {
      if (message?.type === "transcript" && message.transcript) {
        if (message.transcriptType === "partial") {
          return;
        }
        const role = message.role || "user";
        const text = String(message.transcript).trim();
        if (!text) return;

        if (role === "assistant") {
          assistantBufferRef.current = assistantBufferRef.current
            ? `${assistantBufferRef.current} ${text}`
            : text;
          if (assistantDebounceRef.current) {
            clearTimeout(assistantDebounceRef.current);
          }
          assistantDebounceRef.current = setTimeout(() => {
            assistantDebounceRef.current = null;
            flushAssistantBuffer();
          }, 420);
          return;
        }

        flushAssistantBuffer();
        const prev = lastTranscriptLogRef.current;
        if (prev.role === "user" && prev.text === text) {
          return;
        }
        lastTranscriptLogRef.current = { role: "user", text };
        pushLog(`user: ${message.transcript}`);
        setDialogue((d) => [...d, { role: "user", text }]);
      }
    };
    const onError = (e) => {
      pushLog(`Error: ${e?.message || String(e)}`);
    };

    vapi.on("call-start", onStart);
    vapi.on("call-end", onEnd);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("message", onMessage);
    vapi.on("error", onError);

    return () => {
      if (assistantDebounceRef.current) {
        clearTimeout(assistantDebounceRef.current);
        assistantDebounceRef.current = null;
      }
      vapi.off("call-start", onStart);
      vapi.off("call-end", onEnd);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("message", onMessage);
      vapi.off("error", onError);
      try {
        vapi.stop();
      } catch {
        /* ignore */
      }
    };
  }, [vapi, pushLog, flushAssistantBuffer]);

  useEffect(() => {
    if (!notesFullText || !notesSessionId) {
      return;
    }
    setNotesTypingDone(false);
    setNotesDisplayText("");
    let i = 0;
    const full = notesFullText;
    const step = 3;
    const timer = setInterval(() => {
      i += step;
      if (i >= full.length) {
        setNotesDisplayText(full);
        setNotesTypingDone(true);
        clearInterval(timer);
        return;
      }
      setNotesDisplayText(full.slice(0, i));
    }, 14);
    return () => clearInterval(timer);
  }, [notesFullText, notesSessionId]);

  const generateNotes = useCallback(async () => {
    if (dialogue.length === 0) {
      setNotesError("No transcript yet. Finish a voice turn or end the call, then try again.");
      return;
    }
    setNotesLoading(true);
    setNotesError("");
    setNotesFullText("");
    setNotesDisplayText("");
    setNotesSessionId(null);
    setNotesTypingDone(false);
    setNotesPreviewExpanded(false);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dialogue,
          repoUrl: repoUrl.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      if (!data.notes) {
        throw new Error("No notes in response.");
      }
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `note_${Date.now()}`;
      saveNote(id, {
        markdown: data.notes,
        repoUrl: repoUrl.trim(),
        createdAt: new Date().toISOString(),
      });
      setNotesSessionId(id);
      setNotesFullText(data.notes);
    } catch (e) {
      setNotesError(e?.message || String(e));
    } finally {
      setNotesLoading(false);
    }
  }, [dialogue, repoUrl]);

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
        /* ignore */
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
        <div className="owen-banner w-full px-6 py-10 text-center">
          <h1 className="pixel-title text-5xl">OWEN</h1>
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

        <div className="mt-6 w-full notes-hud rounded-xl p-5 text-zinc-100">
          <div className="relative z-[1] flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-teal-400/90">
                OUT // GEMINI_NOTES
              </p>
              <h2 className="mt-1 text-xs font-medium text-zinc-300">Structured notes stream</h2>
            </div>
            <button
              type="button"
              onClick={generateNotes}
              disabled={notesLoading || dialogue.length === 0}
              className="rounded-lg border border-teal-500/50 bg-teal-500/15 px-3 py-1.5 font-mono text-[11px] font-medium text-teal-100 transition hover:bg-teal-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {notesLoading ? "GENERATING…" : "GENERATE_FROM_TRANSCRIPT"}
            </button>
          </div>
          {notesError ? (
            <p className="relative z-[1] mt-2 rounded border border-red-500/40 bg-red-950/50 p-2 font-mono text-[11px] text-red-200">
              {notesError}
            </p>
          ) : null}
          {notesSessionId && notesDisplayText ? (
            <div className="relative z-[1] mt-4 space-y-3">
              <div
                className={`notes-stream-wrap ${notesPreviewExpanded ? "notes-stream-open" : ""}`}
              >
                {notesTypingDone ? (
                  <MarkdownNotes markdown={notesFullText} />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-teal-50/95">
                    {notesDisplayText}
                    <span className="notes-cursor">|</span>
                  </pre>
                )}
                {!notesPreviewExpanded && notesTypingDone ? (
                  <div className="notes-stream-fade" aria-hidden />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {notesTypingDone && !notesPreviewExpanded ? (
                  <button
                    type="button"
                    onClick={() => setNotesPreviewExpanded(true)}
                    className="font-mono text-[11px] text-teal-300/90 underline decoration-teal-500/50 hover:text-teal-100"
                  >
                    Expand preview
                  </button>
                ) : null}
                {notesPreviewExpanded && notesTypingDone ? (
                  <button
                    type="button"
                    onClick={() => setNotesPreviewExpanded(false)}
                    className="font-mono text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    Collapse preview
                  </button>
                ) : null}
                {notesSessionId ? (
                  <Link
                    href={`/notes/${notesSessionId}`}
                    className="inline-flex items-center rounded-md border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 font-mono text-[11px] font-medium text-cyan-100 hover:bg-cyan-900/50"
                  >
                    Read full note
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="relative z-[1] mt-3 font-mono text-[11px] text-zinc-500" />
          )}
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
