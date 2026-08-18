import type { PoolPlayer, Position } from "./types";

// Normalises a raw /1/playerData record into the internal PoolPlayer shape
// used everywhere else in this app (squad rules, teamDetails writes, UI).
//
// Verified live 2026-08-18 by fetching the deployed /api/players endpoint:
// production /1/playerData records do NOT match the shape documented in
// dreamteam27-capture's API-CONTRACT-player-retrieval.md §6 (playerId,
// playerName, playerPosition, playerValue, gwpts, gwtotalPts, ...). The
// real shape is:
//
//   { id, displayName, firstName, lastName, position, playerClub, price,
//     status, gameweekPoints, totalPoints }
//
// Since capture and display apparently work fine against this real shape
// today, the contract doc's §6 table looks stale rather than production
// being wrong — so this app adapts to reality here rather than touching
// capture's contract-governed pipeline. If that pipeline is ever changed
// to actually match the documented shape, this still works: it checks for
// an already-normalised `playerId` field first and passes those records
// through unchanged.
type RawPoolRecord = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizePoolPlayer(raw: RawPoolRecord | null | undefined): PoolPlayer | null {
  if (!raw) return null;

  // Already in the documented/contract shape — pass through.
  if (raw.playerId) {
    return {
      playerId: str(raw.playerId),
      playerName: str(raw.playerName),
      playerPosition: str(raw.playerPosition) as Position,
      playerClub: str(raw.playerClub),
      playerValue: num(raw.playerValue),
      gwpts: num(raw.gwpts),
      gwtotalPts: num(raw.gwtotalPts),
      playerinjured: !!raw.playerinjured,
      playerSuspended: !!raw.playerSuspended,
      playereliminated: !!raw.playereliminated,
      playerDNP: !!raw.playerDNP,
    };
  }

  // Real live shape.
  const id = raw.id ?? raw.playerId;
  if (!id) return null;

  const status = str(raw.status).toLowerCase();
  const playerinjured = status.includes("injur");
  const playerSuspended = status.includes("suspend");
  const playereliminated =
    !playerinjured &&
    !playerSuspended &&
    status.length > 0 &&
    !["playing", "available"].includes(status);

  const displayName = str(raw.displayName) || [str(raw.firstName), str(raw.lastName)].filter(Boolean).join(" ");

  return {
    playerId: str(id),
    playerName: displayName,
    playerPosition: str(raw.position) as Position,
    playerClub: str(raw.playerClub),
    playerValue: num(raw.price),
    gwpts: num(raw.gameweekPoints),
    gwtotalPts: num(raw.totalPoints),
    playerinjured,
    playerSuspended,
    playereliminated,
    playerDNP: false, // not present in the real live shape; no data to derive it from
  };
}

export function normalizePoolPlayers(raw: RawPoolRecord[]): PoolPlayer[] {
  return (raw ?? [])
    .map(normalizePoolPlayer)
    .filter((p): p is PoolPlayer => p !== null && !!p.playerId && !!p.playerPosition);
}
