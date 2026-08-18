import { NextResponse } from "next/server";
import { readManagers, deleteManagerAt } from "@/lib/managersDb";
import { isEditingOpen, EDIT_CUTOFF_ISO } from "@/lib/constants";
import { isAdminPlaceholder } from "@/lib/identity";

// Deletes a self-service team entirely. Mirrors /api/update's guards
// exactly (same edit cutoff, same ownership re-check, same ADMIN-record
// exclusion) since deletion is, if anything, a more destructive form of
// "edit" and must not be allowed anywhere update wouldn't be.
export async function POST(req: Request) {
  try {
    if (!isEditingOpen()) {
      return NextResponse.json(
        { error: `Editing closed at ${EDIT_CUTOFF_ISO}. Teams are now locked and can't be deleted.` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { index, name, mobile } = body as { index: number; name: string; mobile: string };

    if (typeof index !== "number" || !name?.trim() || !mobile?.trim()) {
      return NextResponse.json({ error: "Missing index, name, or mobile number." }, { status: 400 });
    }

    const managers = await readManagers();
    const existing = managers.find((m) => m.index === index);
    if (!existing) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    // Re-confirm identity ownership before deleting — same rules as
    // /api/update: ADMIN-placeholder records are never a valid self-service
    // target, and name comparison is case-insensitive.
    if (
      isAdminPlaceholder(existing.record.mobile) ||
      (existing.record.manager ?? "").trim().toLowerCase() !== name.trim().toLowerCase() ||
      (existing.record.mobile ?? "").trim() !== mobile.trim()
    ) {
      return NextResponse.json({ error: "Name/mobile does not match this team." }, { status: 403 });
    }

    await deleteManagerAt(index);

    return NextResponse.json({ ok: true, index });
  } catch (err) {
    console.error("[api/delete] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
}
