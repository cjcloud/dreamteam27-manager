import type { ManagerRecord } from "./types";

export interface IndexedManager {
  index: number;
  record: ManagerRecord;
}

// Placeholder mobile value written by dreamteam27-capture for admin-entered
// teams (which have no real mobile number). It marks "this record was not
// self-registered" but is NOT a real identifier — capture doesn't
// deduplicate/suffix names, so several admin-entered managers can all carry
// mobile: "ADMIN" at once. Treating "ADMIN" as a normal mobile would let an
// exact (name, mobile) match resolve to an arbitrary one of them, or let a
// self-service user "edit" someone else's admin-entered team just by typing
// ADMIN. So: ADMIN records always count toward name-collision/suffixing,
// but are never eligible to be matched as an "edit" target, and self-service
// users are blocked from entering it as their own mobile (see /api/lookup
// and /api/register).
export const ADMIN_MOBILE_PLACEHOLDER = "ADMIN";

export function isAdminPlaceholder(mobile: string | undefined): boolean {
  return (mobile ?? "").trim().toUpperCase() === ADMIN_MOBILE_PLACEHOLDER;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Everyone whose stored name is `baseName` or `baseName/<digits>`.
// The real identity field on a stored record is `manager` (verified
// 2026-08-18 against live data — present on every record, old-shape or
// new; `name` is a newer duplicate field, not always present).
export function findNameFamily(
  managers: IndexedManager[],
  baseName: string
): IndexedManager[] {
  const trimmed = baseName.trim();
  const re = new RegExp(`^${escapeRegex(trimmed)}(/(\\d+))?$`);
  return managers.filter((m) => re.test((m.record.manager ?? "").trim()));
}

function suffixOf(name: string, baseName: string): number {
  const trimmed = name.trim();
  if (trimmed === baseName.trim()) return 1;
  const match = trimmed.match(/\/(\d+)$/);
  return match ? parseInt(match[1]!, 10) : 1;
}

export function nextAvailableSuffix(
  family: IndexedManager[],
  baseName: string
): number {
  const used = new Set(family.map((m) => suffixOf(m.record.manager ?? "", baseName)));
  let n = 2;
  while (used.has(n)) n++;
  return n;
}

export type ResolveResult =
  | { mode: "edit"; index: number; record: ManagerRecord }
  | { mode: "create"; assignedName: string };

// Core identity rule (docs/SPEC-manager-app.md §2-3, §10).
// - Same base name + same real mobile, anywhere in the name family
//   (including already-suffixed variants) => editing the existing team.
// - ADMIN-placeholder records (capture-entered, mobile: "ADMIN") are never
//   an edit target — they still occupy the name and count toward
//   suffixing, but can't be "matched" since ADMIN isn't unique per person.
// - Base name never used before => fresh registration, no suffix.
// - Base name used before (by a different/no real mobile, or by an ADMIN
//   record) => fresh registration, auto-suffixed to the next free `/N`.
export function resolveIdentity(
  managers: IndexedManager[],
  name: string,
  mobile: string
): ResolveResult {
  const baseName = name.trim();
  const trimmedMobile = mobile.trim();
  const family = findNameFamily(managers, baseName);

  const exact = family.find(
    (m) => !isAdminPlaceholder(m.record.mobile) && (m.record.mobile ?? "").trim() === trimmedMobile
  );
  if (exact) {
    return { mode: "edit", index: exact.index, record: exact.record };
  }

  if (family.length === 0) {
    return { mode: "create", assignedName: baseName };
  }

  const n = nextAvailableSuffix(family, baseName);
  return { mode: "create", assignedName: `${baseName}/${n}` };
}
