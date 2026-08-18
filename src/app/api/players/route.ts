import { NextResponse } from "next/server";
import { readPlayerPool } from "@/lib/managersDb";
import { normalizePoolPlayers } from "@/lib/poolNormalize";

// Read-only proxy to /1/playerData. This app never fetches or writes
// player data itself — governed entirely by
// API-CONTRACT-player-retrieval.md, owned by dreamteam27-capture.
//
// Normalises through poolNormalize.ts: verified live 2026-08-18 that
// production /1/playerData does NOT match that contract's documented §6
// shape (playerId/playerName/... ) — real records use id/displayName/
// position/price/status/gameweekPoints/totalPoints instead. See that
// file for the full explanation.
export async function GET() {
  try {
    const rawPlayers = await readPlayerPool();
    const players = normalizePoolPlayers(rawPlayers);
    return NextResponse.json({ players });
  } catch (err) {
    console.error("[api/players] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to load player pool." }, { status: 500 });
  }
}
