import type { ManagerRecord } from "./types";

export interface IndexedManager {
  index: number;
  record: ManagerRecord;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Everyone whose stored name is `baseName` or `baseName/<digits>`.
export function findNameFamily(
  managers: IndexedManager[],
  baseName: string
): IndexedManager[] {
  const trimmed = baseName.trim();
  const re = new RegExp(`^${escapeRegex(trimmed)}(/(\\d+))?$`);
  return managers.filter((m) => re.test((m.record.name ?? "").trim()));
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
  const used = new Set(family.map((m) => suffixOf(m.record.name, baseName)));
  let n = 2;
  while (used.has(n)) n++;
  return n;
}

export type ResolveResult =
  | { mode: "edit"; index: number; record: ManagerRecord }
  | { mode: "create"; assignedName: string };

// Core identity rule (docs/SPEC-manager-app.md §2-3).
// - Same base name + same mobile, anywhere in the name family (including
//   already-suffixed variants) => editing the existing team.
// - Base name never used before => fresh registration, no suffix.
// - Base name used before (by a different mobile) => fresh registration,
//   auto-suffixed to the next free `/N`.
export function resolveIdentity(
  managers: IndexedManager[],
  name: string,
  mobile: string
): ResolveResult {
  const baseName = name.trim();
  const trimmedMobile = mobile.trim();
  const family = findNameFamily(managers, baseName);

  const exact = family.find((m) => (m.record.mobile ?? "").trim() === trimmedMobile);
  if (exact) {
    return { mode: "edit", index: exact.index, record: exact.record };
  }

  if (family.length === 0) {
    return { mode: "create", assignedName: baseName };
  }

  const n = nextAvailableSuffix(family, baseName);
  return { mode: "create", assignedName: `${baseName}/${n}` };
}
