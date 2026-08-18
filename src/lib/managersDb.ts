import { adminDb } from "./firebaseAdmin";
import { DB_PATHS } from "./constants";
import type { ManagerRecord } from "./types";
import type { IndexedManager } from "./identity";

// /0 is documented as "an array of managers" (PROJECT-STATUS.md §1). Reading
// it back can come out as a JS array OR as an object keyed by numeric
// strings, depending on how sparse it is — handle both. New entries are
// appended at the next integer index, preserving the existing array-like
// shape rather than using Firebase push() ids (which would mix keying
// schemes in a structure shared with capture/display).
export async function readManagers(): Promise<IndexedManager[]> {
  const snap = await adminDb().ref(DB_PATHS.MANAGERS).get();
  const val = snap.val();
  if (!val) return [];

  if (Array.isArray(val)) {
    return val
      .map((record, index) => ({ index, record }))
      .filter((m): m is IndexedManager => !!m.record);
  }

  return Object.entries(val as Record<string, ManagerRecord>)
    .map(([key, record]) => ({ index: Number(key), record }))
    .filter((m) => Number.isInteger(m.index) && !!m.record);
}

export function nextIndex(managers: IndexedManager[]): number {
  if (managers.length === 0) return 0;
  return Math.max(...managers.map((m) => m.index)) + 1;
}

// Verified live data uses a sequential 1-based `managerId` alongside the
// array index (index 0 → managerId 1, etc.). Derive the next one from
// whichever is higher, in case the two ever drift.
export function nextManagerId(managers: IndexedManager[]): number {
  const ids = managers.map((m) => m.record.managerId ?? m.index + 1);
  const maxIndexBased = managers.length === 0 ? 0 : Math.max(...managers.map((m) => m.index)) + 1;
  return Math.max(0, ...ids, maxIndexBased);
}

export async function writeManagerAt(index: number, record: ManagerRecord): Promise<void> {
  await adminDb().ref(`${DB_PATHS.MANAGERS}/${index}`).set(record);
}

// Removes a manager record entirely (self-service team deletion). Uses
// Firebase's `.remove()` rather than `.set(null)` for clarity, though both
// have the same effect. If `/0` is stored as a JS array, this leaves a
// hole (a null entry) at that index rather than shifting everything else
// down — readManagers() already filters those out, and other records'
// indices (used as their identity/edit target) must never shift.
export async function deleteManagerAt(index: number): Promise<void> {
  await adminDb().ref(`${DB_PATHS.MANAGERS}/${index}`).remove();
}

export async function readPlayerPool() {
  const snap = await adminDb().ref(DB_PATHS.PLAYER_DATA).get();
  const val = snap.val();
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
}
