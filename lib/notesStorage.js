const PREFIX = "owen-notes:";

/**
 * @param {string} id
 * @param {{ markdown: string, repoUrl?: string, createdAt: string }} payload
 */
export function saveNote(id, payload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PREFIX + id, JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

/**
 * @param {string} id
 * @returns {{ markdown: string, repoUrl?: string, createdAt: string } | null}
 */
export function loadNote(id) {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data?.markdown !== "string") return null;
    return data;
  } catch {
    return null;
  }
}
