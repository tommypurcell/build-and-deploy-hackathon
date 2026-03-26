import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gemini-2.5-flash";

function buildPrompt({ dialogue, repoUrl }) {
  const lines = (dialogue || [])
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => {
      const label = t.role === "user" ? "User" : "Assistant (OWEN)";
      return `${label}: ${t.text.trim()}`;
    })
    .join("\n\n");

  const repoBlock = repoUrl?.trim()
    ? `Repository URL (context only): ${repoUrl.trim()}`
    : "Repository URL: (not provided)";

  return `You are a technical note-taking assistant. Turn the voice conversation below into clean, easy-to-read notes in Markdown.

Strict rules:
- Do NOT invent file paths, APIs, or behaviors that the Assistant (OWEN) did not say.
- If something is unclear, say so briefly instead of guessing.
- Prefer short bullets and clear headings.
- Use this structure:
  ## Summary
  ## Key points
  ## Repo / files (only if paths or filenames were mentioned)
  ## Follow-ups (optional)

${repoBlock}

Conversation:

${lines || "(empty conversation)"}
`;
}

/**
 * POST body: { dialogue: { role: "user"|"assistant", text: string }[], repoUrl?: string }
 */
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing GEMINI_API_KEY. Add it to .env locally and in Vercel project env vars.",
      },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dialogue = Array.isArray(body?.dialogue) ? body.dialogue : [];
  if (dialogue.length === 0) {
    return NextResponse.json(
      { error: "No dialogue to summarize. Talk with OWEN first, then generate notes." },
      { status: 400 },
    );
  }

  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = buildPrompt({
    dialogue,
    repoUrl: typeof body?.repoUrl === "string" ? body.repoUrl : "",
  });

  try {
    const result = await model.generateContent(prompt);
    const notes = result.response.text();
    if (!notes?.trim()) {
      return NextResponse.json(
        { error: "Gemini returned an empty response." },
        { status: 502 },
      );
    }
    return NextResponse.json({ notes: notes.trim() });
  } catch (e) {
    const msg = e?.message || String(e);
    const hint =
      /404|no longer available/i.test(msg)
        ? " Set GEMINI_MODEL in .env to a supported model (see https://ai.google.dev/gemini-api/docs/models)."
        : "";
    return NextResponse.json(
      { error: `Gemini request failed: ${msg}${hint}` },
      { status: 502 },
    );
  }
}
