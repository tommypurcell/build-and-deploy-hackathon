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

async function handleTool(name, args) {
  const a = normalizeArgs(args);
  const rawName = String(name || "");
  const norm = rawName.trim().toLowerCase();
  const normNoUnderscore = norm.replace(/_/g, "");

  if (norm === "search_repo" || normNoUnderscore === "searchrepo") {
    return await searchRepo(a.query);
  }

  // Accept read_repo_file, readRepoFile, etc.
  if (
    norm === "read_repo_file" ||
    normNoUnderscore === "readrepofile" ||
    normNoUnderscore === "readrepofilepath"
  ) {
    return await readRepoFile(a.path);
  }

  return `Unknown tool: ${rawName}. I only support: search_repo(query) and read_repo_file(path).`;
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

  try {
    console.log(
      "[vapi-tool] toolCallList names:",
      list.map((t) => t?.name).filter(Boolean),
    );
  } catch {
    /* ignore logging */
  }

  const results = [];

  for (const toolCall of list) {
    const id = toolCall.id;
    const name = toolCall.name;
    try {
      const result = await handleTool(name, toolCall.arguments);
      results.push({ toolCallId: id, result });
    } catch (e) {
      const errorMsg = `Error: ${e?.message || String(e)}`;
      console.error("[vapi-tool] Error in handleTool:", errorMsg);
      results.push({
        toolCallId: id,
        result: errorMsg,
      });
    }
  }

  return NextResponse.json({ results });
}
