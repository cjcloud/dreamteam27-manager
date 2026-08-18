import { ALLOWED_FORMATIONS, BUDGET_CAP, POSITION_MAX, SQUAD_SIZE } from "./constants";
import type { PoolPlayer } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function countByPosition(players: PoolPlayer[]) {
  return players.reduce(
    (acc, p) => {
      acc[p.playerPosition] = (acc[p.playerPosition] ?? 0) + 1;
      return acc;
    },
    { GK: 0, DEF: 0, MID: 0, STR: 0 } as Record<string, number>
  );
}

export function totalValue(players: PoolPlayer[]): number {
  return Math.round(players.reduce((sum, p) => sum + (p.playerValue ?? 0), 0) * 10) / 10;
}

// Parses "3-5-2" into { DEF: 3, MID: 5, STR: 2 }, or null if not a
// recognised "D-M-S" shape. GK is always exactly 1 and isn't part of the
// formation string.
export function parseFormationShape(
  formation: string | undefined | null
): { DEF: number; MID: number; STR: number } | null {
  if (!formation) return null;
  const match = formation.trim().match(/^(\d+)-(\d+)-(\d+)$/);
  if (!match) return null;
  return { DEF: Number(match[1]), MID: Number(match[2]), STR: Number(match[3]) };
}

// Entry-stage check: would adding this player break a hard rule?
// Mirrors capture's `handleAddPlayer` hard-blocks, PLUS: if a target
// formation has been picked, its specific DEF/MID/STR split is enforced
// as the effective cap for those positions (never higher than the global
// POSITION_MAX) — so choosing 3-5-2 actually stops a 4th defender being
// added, rather than only catching the mismatch at save time.
export function canAddPlayer(
  current: PoolPlayer[],
  candidate: PoolPlayer,
  targetFormation?: string
): ValidationResult {
  const errors: string[] = [];

  if (current.some((p) => p.playerId === candidate.playerId)) {
    errors.push(`${candidate.playerName} is already in the squad.`);
  }
  if (current.length >= SQUAD_SIZE) {
    errors.push(`Squad is already at ${SQUAD_SIZE} players.`);
  }
  const counts = countByPosition(current);
  const shape = parseFormationShape(targetFormation);
  const posMax =
    shape && candidate.playerPosition !== "GK"
      ? Math.min(POSITION_MAX[candidate.playerPosition], shape[candidate.playerPosition])
      : POSITION_MAX[candidate.playerPosition];
  if ((counts[candidate.playerPosition] ?? 0) >= posMax) {
    errors.push(
      shape
        ? `Cannot add another ${candidate.playerPosition} — ${targetFormation} needs ${posMax}.`
        : `Cannot add another ${candidate.playerPosition} — maximum is ${posMax}.`
    );
  }
  const projectedValue = totalValue(current) + (candidate.playerValue ?? 0);
  if (projectedValue > BUDGET_CAP) {
    errors.push(
      `Adding ${candidate.playerName} would exceed the £${BUDGET_CAP}M budget (would be £${projectedValue}M).`
    );
  }

  return { ok: errors.length === 0, errors };
}

// Save-stage check: mirrors capture's selected-players save validation.
export function validateSquadForSave(
  players: PoolPlayer[],
  formation: string
): ValidationResult {
  const errors: string[] = [];

  if (players.length !== SQUAD_SIZE) {
    errors.push(`Squad must have exactly ${SQUAD_SIZE} players (currently ${players.length}).`);
  }
  const counts = countByPosition(players);
  if ((counts.GK ?? 0) !== 1) {
    errors.push(`Squad must have exactly 1 goalkeeper (currently ${counts.GK ?? 0}).`);
  }
  (Object.keys(POSITION_MAX) as Array<keyof typeof POSITION_MAX>).forEach((pos) => {
    if ((counts[pos] ?? 0) > POSITION_MAX[pos]) {
      errors.push(`Too many ${pos} — maximum is ${POSITION_MAX[pos]}.`);
    }
  });
  if (!ALLOWED_FORMATIONS.includes(formation as (typeof ALLOWED_FORMATIONS)[number])) {
    errors.push(
      `"${formation}" is not an allowed formation. Choose one of: ${ALLOWED_FORMATIONS.join(", ")}.`
    );
  }
  const value = totalValue(players);
  if (value > BUDGET_CAP) {
    errors.push(`Squad value £${value}M exceeds the £${BUDGET_CAP}M budget.`);
  }

  return { ok: errors.length === 0, errors };
}

// Given a valid 11-player squad, which allowed formations does its
// DEF/MID/STR split satisfy? (GK is always 1 and not part of the string.)
export function possibleFormations(players: PoolPlayer[]): string[] {
  const counts = countByPosition(players);
  const shape = `${counts.DEF ?? 0}-${counts.MID ?? 0}-${counts.STR ?? 0}`;
  return ALLOWED_FORMATIONS.filter((f) => f === shape);
}
