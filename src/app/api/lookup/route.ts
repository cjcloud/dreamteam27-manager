import { NextResponse } from "next/server";
import { readManagers } from "@/lib/managersDb";
import { resolveIdentity } from "@/lib/identity";
import { isEditingOpen } from "@/lib/constants";

// Peek only — does not write. Tells the client whether (name, mobile)
// resolves to an existing team (offer Edit, subject to the cutoff) or a
// fresh registration (and what name it would be assigned, including any
// auto-suffix), per docs/SPEC-manager-app.md §2-3.
export async function POST(req: Request) {
  try {
    const { name, mobile } = await req.json();
    if (!name?.trim() || !mobile?.trim()) {
      return NextResponse.json({ error: "Name and mobile number are required." }, { status: 400 });
    }

    const managers = await readManagers();
    const result = resolveIdentity(managers, name, mobile);

    if (result.mode === "edit") {
      return NextResponse.json({
        mode: "edit",
        index: result.index,
        manager: result.record,
        editingOpen: isEditingOpen(),
      });
    }

    return NextResponse.json({ mode: "create", assignedName: result.assignedName });
  } catch (err) {
    console.error("[api/lookup] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
