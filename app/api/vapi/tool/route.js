import { NextResponse } from "next/server";
import { readRepoFile, searchRepo, getRepoStructureJSON } from "@/lib/repoSearch";

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

function getRepoOptions(body) {
  const candidates = [
    body?.message?.artifact?.variableValues?.repoUrl,
    body?.message?.call?.artifact?.variableValues?.repoUrl,
    body?.message?.call?.assistantOverrides?.variableValues?.repoUrl,
  ];

  const repoUrl = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  return repoUrl ? { repoUrl } : {};
}

async function handleTool(name, args, repoOptions) {
  const a = normalizeArgs(args);
  const rawName = String(name || "");
  const norm = rawName.trim().toLowerCase();
  const normNoUnderscore = norm.replace(/_/g, "");

  if (norm === "search_repo" || normNoUnderscore === "searchrepo") {
    return await searchRepo(a.query, repoOptions);
  }

  // Accept read_repo_file, readRepoFile, etc.
  if (
    norm === "read_repo_file" ||
    normNoUnderscore === "readrepofile" ||
    normNoUnderscore === "readrepofilepath"
  ) {
    return await readRepoFile(a.path, repoOptions);
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
  const repoOptions = getRepoOptions(body);
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
    console.log("[vapi-tool] Full toolCallList:", JSON.stringify(list, null, 2));
  } catch {
    /* ignore logging */
  }

  const results = [];

  for (const toolCall of list) {
    const id = toolCall.id;
    const name = toolCall.name;
    const func = toolCall.function; // Vapi might use "function" instead of direct name

    console.log("[vapi-tool] Received tool call:", {
      id,
      name,
      function: func,
      type: toolCall.type,
      args: toolCall.arguments,
      fullToolCall: JSON.stringify(toolCall)
    });

    // Try to get the actual function name from different possible locations
    const actualName = name || func?.name || toolCall.type;

    try {
      const result = await handleTool(actualName, toolCall.arguments || func?.arguments, repoOptions);
      console.log("[vapi-tool] Tool result for", actualName, ":", result?.substring?.(0, 100) || result);
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

  // ALWAYS add repo context JSON as an additional result for the assistant
  try {
    const repoJson = await getRepoStructureJSON(repoOptions);
    results.push({
      toolCallId: "repo_context",
      result: `Repository context (always available):\n\n${repoJson}`,
    });
  } catch (e) {
    console.error("[vapi-tool] Failed to add repo context:", e);
  }

  return NextResponse.json({ results });
}

/**
 * GET endpoint - returns repo structure JSON for testing
 */
export async function GET() {
  try {
    const json = await getRepoStructureJSON();
    return new NextResponse(json, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
