import { NextResponse } from "next/server";
import { readPlayerPool } from "@/lib/managersDb";

// Read-only proxy to /1/playerData. This app never fetches or writes
// player data itself — governed entirely by
// API-CONTRACT-player-retrieval.md, owned by dreamteam27-capture.
export async function GET() {
  try {
    const players = await readPlayerPool();
    return NextResponse.json({ players });
  } catch (err) {
    console.error("[api/players] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to load player pool." }, { status: 500 });
  }
}
