const STORAGE_KEY = "owen-session-archive:v1";
const MAX_SESSIONS = 15;

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeSession(session) {
  const startedAt = Number(session?.startedAt);
  if (!Number.isFinite(startedAt)) return null;

  const dialogue = Array.isArray(session?.dialogue) ? session.dialogue : [];
  const transcriptLog = Array.isArray(session?.transcriptLog) ? session.transcriptLog : [];

  const notes = session?.notes && typeof session.notes === "object" ? session.notes : null;
  const notesMarkdown =
    typeof notes?.markdown === "string" ? notes.markdown.slice(0, 200_000) : null;
  const notesNoteId = typeof notes?.noteId === "string" ? notes.noteId : null;
  const notesCreatedAt =
    typeof notes?.createdAt === "string" ? notes.createdAt : new Date().toISOString();

  return {
    id: typeof session?.id === "string" ? session.id : `session_${startedAt}`,
    startedAt,
    endedAt: Number.isFinite(Number(session?.endedAt)) ? Number(session.endedAt) : null,
    repoUrl: typeof session?.repoUrl === "string" ? session.repoUrl : "",
    dialogue: dialogue.slice(-80),
    transcriptLog: transcriptLog.slice(-80),
    notes:
      notesMarkdown && notesNoteId
        ? {
            markdown: notesMarkdown,
            noteId: notesNoteId,
            createdAt: notesCreatedAt,
          }
        : notesMarkdown
          ? {
              markdown: notesMarkdown,
              noteId: notesNoteId || null,
              createdAt: notesCreatedAt,
            }
          : null,
  };
}

export function loadSessions() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function upsertSession(session) {
  if (typeof window === "undefined") return;
  const sanitized = sanitizeSession(session);
  if (!sanitized) return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? safeParseJson(raw) : [];
    const list = Array.isArray(existing) ? existing : [];

    const next = [
      sanitized,
      ...list.filter((s) => s?.id && s.id !== sanitized.id),
    ].slice(0, MAX_SESSIONS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota/private mode */
  }
}

export function clearSessions() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

