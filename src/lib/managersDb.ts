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

export async function writeManagerAt(index: number, record: ManagerRecord): Promise<void> {
  await adminDb().ref(`${DB_PATHS.MANAGERS}/${index}`).set(record);
}

export async function readPlayerPool() {
  const snap = await adminDb().ref(DB_PATHS.PLAYER_DATA).get();
  const val = snap.val();
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
}
