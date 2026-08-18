import { NextResponse } from "next/server";
import { nextIndex, readManagers, writeManagerAt } from "@/lib/managersDb";
import { resolveIdentity } from "@/lib/identity";
import { validateSquadForSave, totalValue } from "@/lib/squadRules";
import type { PlayerDetails } from "@/lib/types";

// Creates a brand-new team. Re-resolves identity server-side at write time
// (not trusting whatever the client last saw from /api/lookup) to avoid a
// race between two people registering the same clashing name at once.
// If identity actually resolves to "edit" by the time this runs, the
// client should have used /api/update instead — this route refuses rather
// than silently overwriting.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, mobile, teamDetails, formation } = body as {
      name: string;
      mobile: string;
      teamDetails: PlayerDetails[];
      formation: string;
    };

    if (!name?.trim() || !mobile?.trim()) {
      return NextResponse.json({ error: "Name and mobile number are required." }, { status: 400 });
    }

    const squadCheck = validateSquadForSave(teamDetails ?? [], formation);
    if (!squadCheck.ok) {
      return NextResponse.json({ error: "Squad is invalid.", details: squadCheck.errors }, { status: 422 });
    }

    const managers = await readManagers();
    const identity = resolveIdentity(managers, name, mobile);

    if (identity.mode === "edit") {
      return NextResponse.json(
        {
          error:
            "A team already exists for this exact name and mobile number. Use the edit flow instead of registering again.",
          index: identity.index,
        },
        { status: 409 }
      );
    }

    const index = nextIndex(managers);
    const now = Date.now();
    await writeManagerAt(index, {
      name: identity.assignedName,
      mobile: mobile.trim(),
      teamDetails,
      formation,
      totalValue: totalValue(teamDetails),
      source: "manager-app",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, index, name: identity.assignedName });
  } catch (err) {
    console.error("[api/register] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
