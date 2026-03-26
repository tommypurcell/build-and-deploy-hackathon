import { NextResponse } from "next/server";
import { readRepoFile, searchRepo } from "@/lib/repoSearch";

export const runtime = "nodejs";

function normalizeArgs(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function handleTool(name, args) {
  const a = normalizeArgs(args);
  switch (name) {
    case "search_repo":
      return searchRepo(a.query);
    case "read_repo_file":
      return readRepoFile(a.path);
    default:
      return `Unknown tool: ${name}`;
  }
}

/**
 * Vapi sends POST with body.message.toolCallList[]
 * @see https://docs.vapi.ai/tools/custom-tools
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body?.message;
  const list = message?.toolCallList;
  if (!Array.isArray(list)) {
    return NextResponse.json(
      { error: "Expected message.toolCallList array" },
      { status: 400 },
    );
  }

  const results = [];
  for (const toolCall of list) {
    const id = toolCall.id;
    const name = toolCall.name;
    try {
      const result = handleTool(name, toolCall.arguments);
      results.push({ toolCallId: id, result });
    } catch (e) {
      results.push({
        toolCallId: id,
        result: `Error: ${e?.message || String(e)}`,
      });
    }
  }

  return NextResponse.json({ results });
}
