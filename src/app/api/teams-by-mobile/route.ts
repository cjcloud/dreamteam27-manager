import { NextResponse } from "next/server";
import { readManagers } from "@/lib/managersDb";
import { isAdminPlaceholder } from "@/lib/identity";
import { totalValue } from "@/lib/squadRules";
import { fromTeamDetailEntry } from "@/lib/types";

// Lists every team registered under a given mobile number — lets a manager
// who's registered more than one team (e.g. one per family member, per
// docs/SPEC-manager-app.md §2) see all of them at once, since auto-suffixed
// names (Brian/2, Brian/3) can otherwise be easy to lose track of.
//
// "ADMIN" is deliberately excluded even on an exact match: it's a shared
// placeholder written by dreamteam27-capture (see spec §9), not a real
// identity, so listing "everyone capture ever entered" under it would be
// meaningless and would leak unrelated managers' teams to whoever typed it.
export async function POST(req: Request) {
  try {
    const { mobile } = await req.json();
    if (!mobile?.trim()) {
      return NextResponse.json({ error: "Mobile number is required." }, { status: 400 });
    }
    if (isAdminPlaceholder(mobile)) {
      return NextResponse.json(
        { error: "\"ADMIN\" is reserved for admin-entered teams and can't be looked up here." },
        { status: 400 }
      );
    }

    const trimmedMobile = mobile.trim();
    const managers = await readManagers();
    const matches = managers
      .filter((m) => !isAdminPlaceholder(m.record.mobile) && (m.record.mobile ?? "").trim() === trimmedMobile)
      .map((m) => ({
        index: m.index,
        name: m.record.manager,
        formation: m.record.formation ?? null,
        teamValue: m.record.teamValue ?? totalValue((m.record.teamDetails ?? []).map(fromTeamDetailEntry)),
        playerCount: (m.record.teamDetails ?? []).length,
      }));

    return NextResponse.json({ teams: matches });
  } catch (err) {
    console.error("[api/teams-by-mobile] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
