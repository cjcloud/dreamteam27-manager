// Squad rules — mirrored from dreamteam27-capture's managers page.
// See docs/SPEC-manager-app.md §5 for the authoritative source.

export const SQUAD_SIZE = 11;

export const POSITION_MAX: Record<"GK" | "DEF" | "MID" | "STR", number> = {
  GK: 1,
  DEF: 5,
  MID: 5,
  STR: 3,
};

export const BUDGET_CAP = 50; // £M

export const ALLOWED_FORMATIONS = [
  "4-4-2",
  "4-3-3",
  "4-5-1",
  "3-4-3",
  "3-5-2",
  "5-4-1",
  "5-3-2",
] as const;

export type Formation = (typeof ALLOWED_FORMATIONS)[number];

// Edit cutoff — docs/SPEC-manager-app.md §4.
// After this instant, existing teams are read-only (server-enforced).
export const EDIT_CUTOFF_ISO = "2026-08-21T19:59:00+01:00";
export const EDIT_CUTOFF_MS = new Date(EDIT_CUTOFF_ISO).getTime();

export function isEditingOpen(now: number = Date.now()): boolean {
  return now < EDIT_CUTOFF_MS;
}

// Database paths (footieteamz27, europe-west1 — shared with capture/display).
export const DB_PATHS = {
  MANAGERS: "/0",
  PLAYER_DATA: "/1/playerData",
};
