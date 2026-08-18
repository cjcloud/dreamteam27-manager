export type Position = "GK" | "DEF" | "MID" | "STR";

// Mirrors the `playerDetails` shape written by dreamteam27-capture
// (API-CONTRACT-player-retrieval.md §6). Player pool is read-only from
// this app's perspective.
export interface PlayerDetails {
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

// A manager/team record as stored at /0. Existing capture-created records
// are expected to have at least `name` and `teamDetails`. Fields marked
// (manager-app) are additive — introduced by dreamteam27-manager and not
// guaranteed to exist on older capture-created records. This shape is a
// best-effort reconstruction from documentation (PROJECT-STATUS.md,
// API-CONTRACT-player-retrieval.md) since this app could not read the
// live database directly during the build (network egress restriction in
// the build sandbox) — verify against a live record before trusting this
// blindly in production.
export interface ManagerRecord {
  name: string;
  mobile?: string; // (manager-app)
  teamDetails: PlayerDetails[];
  formation?: string; // (manager-app)
  totalValue?: number; // (manager-app)
  source?: "manager-app" | "capture"; // (manager-app)
  createdAt?: number; // (manager-app)
  updatedAt?: number; // (manager-app)
}

export interface LookupResult {
  found: boolean;
  index?: number;
  manager?: ManagerRecord;
}
