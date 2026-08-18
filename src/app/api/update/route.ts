import { NextResponse } from "next/server";
import { readManagers, writeManagerAt } from "@/lib/managersDb";
import { isEditingOpen, EDIT_CUTOFF_ISO } from "@/lib/constants";
import { validateSquadForSave, totalValue } from "@/lib/squadRules";
import { toTeamDetailEntry } from "@/lib/types";
import type { PoolPlayer } from "@/lib/types";

// Edits an existing team in place. The edit cutoff is enforced HERE,
// server-side — this is the real guard, not the client hiding a button.
// docs/SPEC-manager-app.md §4.
export async function POST(req: Request) {
  try {
    if (!isEditingOpen()) {
      return NextResponse.json(
        { error: `Editing closed at ${EDIT_CUTOFF_ISO}. Teams are now locked.` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { index, name, mobile, teamDetails, formation } = body as {
      index: number;
      name: string;
      mobile: string;
      teamDetails: PoolPlayer[];
      formation: string;
    };

    if (typeof index !== "number" || !name?.trim() || !mobile?.trim()) {
      return NextResponse.json({ error: "Missing index, name, or mobile number." }, { status: 400 });
    }

    const squadCheck = validateSquadForSave(teamDetails ?? [], formation);
    if (!squadCheck.ok) {
      return NextResponse.json({ error: "Squad is invalid.", details: squadCheck.errors }, { status: 422 });
    }

    const managers = await readManagers();
    const existing = managers.find((m) => m.index === index);
    if (!existing) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    // Re-confirm identity ownership: the (name, mobile) submitted must
    // match the record being edited, so an edit request can't be pointed
    // at someone else's index.
    if (
      (existing.record.manager ?? "").trim() !== name.trim() ||
      (existing.record.mobile ?? "").trim() !== mobile.trim()
    ) {
      return NextResponse.json({ error: "Name/mobile does not match this team." }, { status: 403 });
    }

    await writeManagerAt(index, {
      ...existing.record,
      teamDetails: (teamDetails ?? []).map(toTeamDetailEntry),
      teamValue: totalValue(teamDetails ?? []),
      formation,
      lastUpdated: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, index });
  } catch (err) {
    console.error("[api/update] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
