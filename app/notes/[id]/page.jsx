"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loadNote } from "@/lib/notesStorage";

export default function NoteFullPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) {
      setMissing(true);
      return;
    }
    const item = loadNote(id);
    if (!item) {
      setMissing(true);
      return;
    }
    setData(item);
  }, [id]);

  if (missing) {
    return (
      <div className="min-h-full owen-shell px-6 py-16 text-zinc-100">
        <div className="mx-auto max-w-2xl notes-hud rounded-xl p-8 text-center">
          <p className="font-mono text-sm text-teal-200/80">NOTE_NOT_FOUND</p>
          <p className="mt-2 text-sm text-zinc-400">
            This note is not in this browser session. Generate notes again from the home screen, or open
            &quot;Read full note&quot; right after creating it.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-200 hover:bg-teal-500/20"
          >
            Back to OWEN
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-full owen-shell px-6 py-16">
        <div className="mx-auto max-w-2xl notes-hud rounded-xl p-8 font-mono text-sm text-teal-300/90">
          LOADING_NOTE…
        </div>
      </div>
    );
  }

  const created = data.createdAt
    ? new Date(data.createdAt).toLocaleString()
    : "";

  return (
    <div className="min-h-full owen-shell text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-teal-400/80">
              OWEN // NOTE_ARCHIVE
            </p>
            <h1 className="mt-1 pixel-title text-lg sm:text-xl">Full session notes</h1>
            {created ? (
              <p className="mt-1 font-mono text-xs text-zinc-500">{created}</p>
            ) : null}
            {data.repoUrl ? (
              <p className="mt-2 font-mono text-xs text-zinc-400 break-all">{data.repoUrl}</p>
            ) : null}
          </div>
          <Link
            href="/"
            className="rounded-lg border border-zinc-600 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-200 hover:border-teal-500/50 hover:text-teal-100"
          >
            Back to OWEN
          </Link>
        </div>

        <article className="notes-hud rounded-xl p-6 sm:p-8">
          <pre className="notes-body whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-zinc-100">
            {data.markdown}
          </pre>
        </article>
      </div>
    </div>
  );
}
