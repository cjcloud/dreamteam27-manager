export type Position = "GK" | "DEF" | "MID" | "STR";

// The player pool shape, as returned by /1/playerData (and used while
// building a squad client-side). Matches API-CONTRACT-player-retrieval.md
// §6 exactly — playerId lives at the top level here.
export interface PoolPlayer {
  playerId: string;
  playerName: string;
  playerPosition: Position;
  playerClub: string;
  playerValue: number;
  gwpts: number;
  gwtotalPts: number;
  playerinjured: boolean;
  playerSuspended: boolean;
  playereliminated: boolean;
  playerDNP: boolean;
}

// How a picked player is actually stored inside a manager's `teamDetails`
// array — verified 2026-08-18 against a live record (Jeko/Tatty in /0).
// NOTE: playerId sits OUTSIDE playerDetails here, unlike PoolPlayer above.
export interface TeamDetailEntry {
  playerId: string;
  playerDetails: Omit<PoolPlayer, "playerId">;
}

export function toTeamDetailEntry(p: PoolPlayer): TeamDetailEntry {
  const { playerId, ...rest } = p;
  return { playerId, playerDetails: rest };
}

export function fromTeamDetailEntry(e: TeamDetailEntry): PoolPlayer {
  return { playerId: e.playerId, ...e.playerDetails };
}

// A manager/team record as stored at /0 — verified 2026-08-18 against
// live records. The real identity field is `manager` (present on every
// record, including old-shape seed data); some newer records also
// duplicate it into `name`. Fields marked (manager-app) are additive —
// introduced by dreamteam27-manager, absent from capture-created records
// (which is exactly why they're safe to use for identity: an existing
// capture team never has a `mobile`, so it can never accidentally match a
// self-service lookup).
//
// Some seeded/legacy records use an entirely different shape (a `players`
// array with old field names, no `teamDetails`) — stale 2025/26 test data
// per PROJECT-STATUS.md, not something new writes should mimic. Treat any
// record without `teamDetails` as unreadable-by-this-app and skip it
// during identity resolution rather than crashing on it.
export interface ManagerRecord {
  manager: string;
  name?: string; // duplicate of `manager` on newer records; keep both in sync on write
  managerId?: number;
  mobile?: string; // (manager-app)
  teamDetails?: TeamDetailEntry[];
  teamValue?: number;
  totalPoints?: number;
  posLast?: number;
  posNow?: number;
  lastUpdated?: string; // ISO string, matches existing convention
  formation?: string; // (manager-app)
  source?: "manager-app" | "capture"; // (manager-app)
}

// What /api/lookup actually sends the client: a ManagerRecord with
// teamDetails already flattened from {playerId, playerDetails} into flat
// PoolPlayer objects, since that's the shape the squad builder UI works in.
export type FlatManagerRecord = Omit<ManagerRecord, "teamDetails"> & {
  teamDetails: PoolPlayer[];
};
