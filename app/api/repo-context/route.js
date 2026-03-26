import { NextResponse } from "next/server";
import { getRepoContextPayload } from "@/lib/repoSearch";

export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const repoUrl = searchParams.get("repoUrl") || "";

  try {
    const payload = await getRepoContextPayload({ repoUrl });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: true,
        message: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
