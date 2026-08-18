"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ALLOWED_FORMATIONS, BUDGET_CAP, POSITION_MAX, SQUAD_SIZE } from "@/lib/constants";
import {
  canAddPlayer,
  parseFormationShape,
  possibleFormations,
  totalValue,
  validateSquadForSave,
} from "@/lib/squadRules";
import type { FlatManagerRecord, PoolPlayer, Position } from "@/lib/types";

type Step = "identify" | "showExisting" | "squad" | "done" | "teamsList" | "deleted";
type Mode = "create" | "edit";

interface TeamSummary {
  index: number;
  name: string;
  formation: string | null;
  teamValue: number;
  playerCount: number;
}

const MOBILE_LENGTH = 11;

// Mobile numbers must be digits only, starting "07", exactly 11 digits
// long (e.g. 07700123456). Strips anything typed that isn't a digit (so
// letters/symbols can never end up in the field), truncates anything past
// the 12th digit, and reports a warning describing why, so the manager
// sees why their input changed or is being rejected rather than it just
// silently not working.
function sanitizeMobileInput(raw: string): { digits: string; warning: string | null } {
  const digitsOnly = raw.replace(/\D/g, "");
  const digits = digitsOnly.slice(0, MOBILE_LENGTH);
  if (raw !== digitsOnly) {
    return { digits, warning: "Mobile numbers can only contain digits — letters and symbols were removed." };
  }
  if (digitsOnly.length > MOBILE_LENGTH) {
    return {
      digits,
      warning: `Mobile number must be exactly ${MOBILE_LENGTH} digits (07XXXXXXXXX) — extra digits were removed.`,
    };
  }
  if (digits.length > 0 && !"07".startsWith(digits) && !digits.startsWith("07")) {
    return { digits, warning: "Mobile number must start with 07 (a UK mobile number)." };
  }
  return { digits, warning: null };
}

export default function Page() {
  const [step, setStep] = useState<Step>("identify");
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [assignedName, setAssignedName] = useState("");
  const [existingIndex, setExistingIndex] = useState<number | null>(null);
  const [existingManager, setExistingManager] = useState<FlatManagerRecord | null>(null);
  const [editingOpen, setEditingOpen] = useState(true);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);
  // Whether the current (valid-format) mobile number has any team already
  // registered under it — drives whether "List my teams" is enabled at
  // all, refreshed by a debounced background check as the manager types.
  const [mobileHasTeams, setMobileHasTeams] = useState(false);
  const [mobileCheckLoading, setMobileCheckLoading] = useState(false);
  // Live result of checking the current (name, mobile) pair against the
  // database, refreshed automatically as the manager types — drives which
  // action button (Register vs. Edit) is active on the identify screen.
  const [checkResult, setCheckResult] = useState<
    | { mode: "edit"; index: number; manager: FlatManagerRecord; editingOpen: boolean }
    | { mode: "create"; assignedName: string }
    | null
  >(null);
  // Which step to return to from the "List your teams" results — set to
  // whichever step the button was pressed from (identify screen or the
  // post-save "done" screen), so Back doesn't always dump the user back at
  // the start.
  const [teamsListReturnStep, setTeamsListReturnStep] = useState<Step>("identify");

  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [squad, setSquad] = useState<PoolPlayer[]>([]);
  const [formation, setFormation] = useState("");
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalName, setFinalName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletedName, setDeletedName] = useState("");

  const [teamsList, setTeamsList] = useState<TeamSummary[]>([]);
  const [teamsListLoading, setTeamsListLoading] = useState(false);
  const [teamsListError, setTeamsListError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "squad" || pool.length > 0) return;
    setPoolLoading(true);
    fetch("/api/players")
      .then((r) => r.json())
      .then((d) => setPool(d.players ?? []))
      .catch(() => setIdentifyError("Could not load the player list."))
      .finally(() => setPoolLoading(false));
  }, [step, pool.length]);

  // A plausible UK mobile number: digits only, starting "07", exactly 12
  // digits long — see sanitizeMobileInput, which already strips/truncates
  // as the manager types, so this is really just the shape check.
  const mobileValid = mobile.length === MOBILE_LENGTH && mobile.startsWith("07");

  function handleMobileChange(e: ChangeEvent<HTMLInputElement>) {
    const { digits, warning } = sanitizeMobileInput(e.target.value);
    setMobile(digits);
    setMobileWarning(warning);
  }

  // As soon as the mobile number is a valid shape, silently check
  // (debounced) whether ANY team is already registered under it — this is
  // what gates "List my teams" being enabled at all, independent of
  // whatever's typed in the name field.
  useEffect(() => {
    if (step !== "identify" || !mobileValid) {
      setMobileHasTeams(false);
      return;
    }
    const handle = setTimeout(async () => {
      setMobileCheckLoading(true);
      try {
        const res = await fetch("/api/teams-by-mobile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mobile }),
        });
        const data = await res.json();
        setMobileHasTeams(res.ok && Array.isArray(data.teams) && data.teams.length > 0);
      } catch {
        setMobileHasTeams(false);
      } finally {
        setMobileCheckLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [step, mobile, mobileValid]);

  // As soon as both a name and a valid mobile number are entered on the
  // identify screen, silently check (debounced) whether that exact pair
  // already has a team, so the Register/Edit button can reflect reality
  // without the manager having to press a "Continue" button first.
  useEffect(() => {
    if (step !== "identify") return;
    if (!name.trim() || !mobile.trim() || !mobileValid) {
      setCheckResult(null);
      setIdentifyError(null);
      return;
    }
    const handle = setTimeout(async () => {
      setIdentifyLoading(true);
      setIdentifyError(null);
      try {
        const res = await fetch("/api/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mobile }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Lookup failed.");
        if (data.mode === "edit") {
          setCheckResult({ mode: "edit", index: data.index, manager: data.manager, editingOpen: data.editingOpen });
        } else {
          setCheckResult({ mode: "create", assignedName: data.assignedName });
        }
      } catch (err) {
        setCheckResult(null);
        setIdentifyError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setIdentifyLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [step, name, mobile, mobileValid]);

  function confirmRegisterFromCheck() {
    if (checkResult?.mode !== "create") return;
    setAssignedName(checkResult.assignedName);
    setMode("create");
    setStep("squad");
  }

  function confirmEditFromCheck() {
    if (checkResult?.mode !== "edit") return;
    setExistingIndex(checkResult.index);
    setExistingManager(checkResult.manager);
    setEditingOpen(checkResult.editingOpen);
    setStep("showExisting");
  }

  function startEdit() {
    if (!existingManager) return;
    setMode("edit");
    setSquad(existingManager.teamDetails ?? []);
    setFormation(existingManager.formation ?? "");
    setStep("squad");
  }

  const counts = useMemo(() => {
    const c: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, STR: 0 };
    squad.forEach((p) => (c[p.playerPosition] += 1));
    return c;
  }, [squad]);

  const value = useMemo(() => totalValue(squad), [squad]);
  // Formations the CURRENT squad's DEF/MID/STR split already matches — used
  // only to auto-select once there's a unique match, not to restrict what's
  // choosable (see the dropdown below: all 7 are always offered, since a
  // manager should be able to pick a target formation before finishing
  // their squad, not just after).
  const matchingFormations = useMemo(() => possibleFormations(squad), [squad]);

  // Only fills in a default when nothing's been chosen yet — must NOT fire
  // whenever the squad happens to uniquely match a formation, or it fights
  // a manual selection: pick a squad that matches 4-4-2, manually switch to
  // 4-3-3, and on the next render matchingFormations would still be
  // ["4-4-2"], silently snapping the dropdown back. The user must always be
  // able to change formation freely.
  useEffect(() => {
    if (!formation && matchingFormations.length === 1) setFormation(matchingFormations[0]!);
  }, [matchingFormations, formation]);

  // If the currently-selected formation's DEF/MID/STR target is already
  // exceeded by the squad as it stands (can happen if a formation is
  // picked/changed after some players are already added), flag it — even
  // before 11 players are in, since it's actionable info the moment it's
  // true, not just at the end.
  const formationOverTarget = useMemo(() => {
    const shape = parseFormationShape(formation);
    if (!shape) return null;
    const over = (["DEF", "MID", "STR"] as const).filter((pos) => counts[pos] > shape[pos]);
    return over.length > 0 ? { shape, over } : null;
  }, [formation, counts]);

  const filteredPool = useMemo(() => {
    return pool.filter((p) => {
      if (posFilter !== "ALL" && p.playerPosition !== posFilter) return false;
      if (search.trim() && !p.playerName.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [pool, posFilter, search]);

  function addPlayer(p: PoolPlayer) {
    const check = canAddPlayer(squad, p, formation);
    if (!check.ok) {
      setSaveError(check.errors);
      return;
    }
    setSaveError(null);
    setSquad((s) => [...s, p]);
    // Clear the search box and put focus back in it so the manager can
    // immediately keep typing to find the next player, rather than having
    // to click back into the field each time.
    setSearch("");
    searchInputRef.current?.focus();
  }

  function removePlayer(playerId: string) {
    setSquad((s) => s.filter((p) => p.playerId !== playerId));
    setSaveError(null);
  }

  async function handleSave() {
    const check = validateSquadForSave(squad, formation);
    if (!check.ok) {
      setSaveError(check.errors);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const url = mode === "edit" ? "/api/update" : "/api/register";
      const payload =
        mode === "edit"
          ? { index: existingIndex, name, mobile, teamDetails: squad, formation }
          : { name, mobile, teamDetails: squad, formation };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setFinalName(data.name ?? name);
      setStep("done");
    } catch (err) {
      setSaveError([err instanceof Error ? err.message : "Save failed."]);
    } finally {
      setSaving(false);
    }
  }

  // Deletes the team currently being edited. Only reachable when
  // mode === "edit" (there's an existingIndex to delete), and gated on the
  // "usual" browser confirm() prompt before anything irreversible happens —
  // the actual authorization/ownership re-check still happens server-side
  // in /api/delete, same as every other write in this app.
  async function handleDelete() {
    if (existingIndex == null) return;
    const confirmed = window.confirm(
      `Delete ${name}'s team? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: existingIndex, name, mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed.");
      setDeletedName(name);
      setStep("deleted");
    } catch (err) {
      setSaveError([err instanceof Error ? err.message : "Delete failed."]);
    } finally {
      setDeleting(false);
    }
  }

  // Resets everything back to the identify step so someone can register
  // (or look up) another team without reloading the page — e.g. the same
  // mobile number registering a second team under a different name, per
  // docs/SPEC-manager-app.md §2 ("one person/phone can register more than
  // one team, as long as each name is distinct").
  function startAnotherTeam() {
    setStep("identify");
    setMode("create");
    setName("");
    setAssignedName("");
    setExistingIndex(null);
    setExistingManager(null);
    setEditingOpen(true);
    setIdentifyError(null);
    setCheckResult(null);
    setSearch("");
    setPosFilter("ALL");
    setSquad([]);
    setFormation("");
    setSaveError(null);
    setFinalName("");
    setDeletedName("");
    // Deliberately NOT resetting `mobile`/`mobileWarning` or `pool` — the
    // same manager registering a second team almost always uses the same
    // phone number (per docs/SPEC-manager-app.md §2), so pre-filling it
    // saves re-typing; they can still edit or clear it manually if it's a
    // different number this time. The player list doesn't change between
    // registrations in the same session either, so no need to refetch it.
  }

  // Looks up every team registered under the mobile number just used (the
  // one still sitting in `mobile` state from the identify/registration
  // step) — lets a manager who's registered more than one team (e.g. one
  // per family member) see all of them at once.
  async function listMyTeams() {
    setTeamsListError(null);
    setTeamsListLoading(true);
    const returnStep = step;
    try {
      const res = await fetch("/api/teams-by-mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed.");
      setTeamsList(data.teams ?? []);
      setTeamsListReturnStep(returnStep);
      setStep("teamsList");
    } catch (err) {
      setTeamsListError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setTeamsListLoading(false);
    }
  }

  // Jumps straight from a "List your teams" result row into editing that
  // team, re-resolving identity server-side via /api/lookup (using the
  // team's stored name + the mobile number already entered) rather than
  // trusting the summary row alone, so the edit cutoff and ADMIN-record
  // guard are re-checked with fresh data.
  async function editTeamFromList(t: TeamSummary) {
    setTeamsListError(null);
    setTeamsListLoading(true);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t.name, mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed.");
      if (data.mode !== "edit") throw new Error("Could not find that team.");
      if (!data.editingOpen) {
        setTeamsListError("Editing closed Friday 21 August 2026, 19:59 — this team is now locked.");
        return;
      }
      setName(t.name);
      setMode("edit");
      setExistingIndex(data.index);
      setExistingManager(data.manager);
      setEditingOpen(data.editingOpen);
      setSquad(data.manager.teamDetails ?? []);
      setFormation(data.manager.formation ?? "");
      setStep("squad");
    } catch (err) {
      setTeamsListError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setTeamsListLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-4 mb-2">
        <Image
          src="/logo.png"
          alt="DreamTeam27"
          width={56}
          height={56}
          className="h-14 w-14 rounded-full shrink-0"
          priority
        />
        <div>
          <h1 className="text-2xl font-bold leading-tight">
            Dream<span className="text-[var(--dt-team-red)]">Team</span>27
          </h1>
          <p className="text-sm text-[var(--dt-content-muted)] leading-tight">Register Your Team</p>
        </div>
      </div>
      <p className="text-[var(--dt-content-muted)] mb-8">
        Build and manage your own fantasy squad. Edits close Friday 21 August 2026, 19:59 (UK time).
      </p>

      {step === "identify" && (
        <div className="space-y-4 bg-[var(--dt-surface)] p-6 rounded-lg">
          <div>
            <label className="block mb-1 text-sm">Mobile number</label>
            <input
              className="w-full rounded px-3 py-2 bg-[var(--dt-input-bg)] border border-[var(--dt-border)] focus:border-[var(--dt-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--dt-border-focus)]"
              value={mobile}
              onChange={handleMobileChange}
              inputMode="numeric"
              placeholder="e.g. 07700123456"
            />
            {mobileWarning && <p className="mt-1 text-xs text-[var(--dt-danger)]">{mobileWarning}</p>}
            {!mobileWarning && mobile.length > 0 && mobile.length < MOBILE_LENGTH && (
              <p className="mt-1 text-xs text-[var(--dt-content-muted)]">
                Must start with 07 and be {MOBILE_LENGTH} digits long ({MOBILE_LENGTH - mobile.length} more to go).
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--dt-content-muted)]">
              Your mobile number is only used to identify your team (e.g. to tell two managers with the
              same name apart) — it&apos;s never shown publicly or displayed anywhere in the league.
            </p>
          </div>
          <div>
            <label className="block mb-1 text-sm">Your name</label>
            <input
              className="w-full rounded px-3 py-2 bg-[var(--dt-input-bg)] border border-[var(--dt-border)] focus:border-[var(--dt-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--dt-border-focus)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brian"
            />
          </div>
          {identifyError && <p className="text-[var(--dt-danger)] text-sm">{identifyError}</p>}
          <div className="flex flex-wrap gap-3 items-center pt-1">
            {checkResult?.mode !== "edit" && (
              <button
                type="button"
                onClick={listMyTeams}
                disabled={!mobileValid || !!name.trim() || !mobileHasTeams || teamsListLoading}
                className="bg-[var(--dt-surface-2)] hover:opacity-90 text-[var(--dt-content)] px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {teamsListLoading
                  ? "Looking up…"
                  : mobileCheckLoading
                  ? "Checking…"
                  : "List my teams"}
              </button>
            )}

            {checkResult?.mode === "edit" && (
              <>
                <button
                  type="button"
                  onClick={confirmEditFromCheck}
                  disabled={!checkResult.editingOpen}
                  className="bg-[var(--dt-primary)] hover:bg-[var(--dt-primary-hover)] text-[var(--dt-primary-contrast)] px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Edit
                </button>
                <span className="text-sm text-[var(--dt-content-muted)]">
                  This team exists{!checkResult.editingOpen ? " — editing is closed" : ""}
                </span>
              </>
            )}

            {checkResult?.mode === "create" && (
              <button
                type="button"
                onClick={confirmRegisterFromCheck}
                className="bg-[var(--dt-primary)] hover:bg-[var(--dt-primary-hover)] text-[var(--dt-primary-contrast)] px-4 py-2 rounded font-semibold transition-colors"
              >
                Register
              </button>
            )}

            {!checkResult && identifyLoading && (
              <span className="text-sm text-[var(--dt-content-muted)]">Checking…</span>
            )}
          </div>
        </div>
      )}

      {step === "showExisting" && existingManager && (
        <div className="space-y-4 bg-[var(--dt-surface)] p-6 rounded-lg">
          <p>
            A team already exists for <strong>{existingManager.manager}</strong>.
          </p>
          <div className="text-sm text-[var(--dt-content-muted)]">
            Formation: {existingManager.formation ?? "—"} · Value: £
            {existingManager.teamValue ?? totalValue(existingManager.teamDetails ?? [])}M
          </div>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {(existingManager.teamDetails ?? []).map((p) => (
              <li key={p.playerId}>
                {p.playerName} <span className="text-[var(--dt-content-muted)]">({p.playerPosition})</span>
              </li>
            ))}
          </ul>
          {editingOpen ? (
            <button onClick={startEdit} className="bg-[var(--dt-primary)] hover:bg-[var(--dt-primary-hover)] text-[var(--dt-primary-contrast)] px-4 py-2 rounded font-semibold transition-colors">
              Edit this team
            </button>
          ) : (
            <p className="text-[var(--dt-danger)] text-sm">
              Editing closed Friday 21 August 2026, 19:59 — this team is now locked.
            </p>
          )}
          <button onClick={() => setStep("identify")} className="block text-sm underline text-[var(--dt-content-muted)] hover:text-[var(--dt-content)] transition-colors">
            ← Not you? Go back
          </button>
        </div>
      )}

      {step === "squad" && (
        <div className="space-y-6">
          <div className="bg-[var(--dt-surface)] p-4 rounded-lg flex flex-wrap gap-4 items-center justify-between">
            <div>
              <div className="font-semibold">{mode === "edit" ? name : assignedName}</div>
              <div className="text-sm text-[var(--dt-content-muted)]">
                {squad.length}/{SQUAD_SIZE} players · £{value}M / £{BUDGET_CAP}M
              </div>
            </div>
            <div className="flex gap-3 text-sm">
              {(Object.keys(POSITION_MAX) as Position[]).map((pos) => (
                <span key={pos}>
                  {pos} {counts[pos]}/{POSITION_MAX[pos]}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[var(--dt-surface)] p-4 rounded-lg">
            <label className="block mb-1 text-sm">Formation</label>
            <p className="text-xs text-[var(--dt-content-muted)] mb-2">
              Pick your target formation, or leave it — it&apos;ll auto-select once your squad&apos;s
              DEF/MID/STR split uniquely matches one.
            </p>
            <select
              className="rounded px-3 py-2 bg-[var(--dt-input-bg)] border border-[var(--dt-border)] focus:border-[var(--dt-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--dt-border-focus)]"
              value={formation}
              onChange={(e) => setFormation(e.target.value)}
            >
              <option value="">Select formation…</option>
              {ALLOWED_FORMATIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {formationOverTarget && (
              <p className="text-[var(--dt-danger)] text-sm mt-2">
                Your squad already has more {formationOverTarget.over.join("/")} than {formation} allows
                (needs {formationOverTarget.shape.DEF} DEF, {formationOverTarget.shape.MID} MID,{" "}
                {formationOverTarget.shape.STR} STR) — remove some, or pick a different formation.
              </p>
            )}
            {squad.length === SQUAD_SIZE && matchingFormations.length === 0 && (
              <p className="text-[var(--dt-danger)] text-sm mt-2">
                This DEF/MID/STR split doesn&apos;t match any allowed formation.
              </p>
            )}
            {squad.length === SQUAD_SIZE &&
              matchingFormations.length > 0 &&
              formation &&
              !matchingFormations.includes(formation) && (
                <p className="text-[var(--dt-danger)] text-sm mt-2">
                  Your squad&apos;s actual split is {matchingFormations.join(" or ")}, not {formation}
                  — update the formation to match before saving.
                </p>
              )}
          </div>

          {saveError && (
            <div className="bg-[var(--dt-surface)] p-4 rounded-lg text-[var(--dt-danger)] text-sm space-y-1">
              {saveError.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[var(--dt-surface)] p-4 rounded-lg">
              <h2 className="font-semibold mb-2 text-[var(--dt-content)]">Your squad</h2>
              <ul className="space-y-1">
                {squad.map((p) => (
                  <li key={p.playerId} className="flex justify-between text-sm">
                    <span>
                      {p.playerName} ({p.playerPosition}, {p.playerClub}) · £{p.playerValue}M
                    </span>
                    <button onClick={() => removePlayer(p.playerId)} className="text-[var(--dt-danger)] font-medium hover:underline shrink-0 ml-2">
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[var(--dt-surface)] p-4 rounded-lg">
              <h2 className="font-semibold mb-2 text-[var(--dt-content)]">Add players</h2>
              <div className="flex gap-2 mb-2">
                <input
                  ref={searchInputRef}
                  className="flex-1 rounded px-2 py-1 bg-[var(--dt-input-bg)] border border-[var(--dt-border)] focus:border-[var(--dt-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--dt-border-focus)] text-sm"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="rounded px-2 py-1 bg-[var(--dt-input-bg)] border border-[var(--dt-border)] focus:border-[var(--dt-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--dt-border-focus)] text-sm"
                  value={posFilter}
                  onChange={(e) => setPosFilter(e.target.value as Position | "ALL")}
                >
                  <option value="ALL">All</option>
                  <option value="GK">GK</option>
                  <option value="DEF">DEF</option>
                  <option value="MID">MID</option>
                  <option value="STR">STR</option>
                </select>
              </div>
              {poolLoading ? (
                <p className="text-sm text-[var(--dt-content-muted)]">Loading players…</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto space-y-1">
                  {filteredPool.slice(0, 100).map((p) => (
                    <li key={p.playerId} className="flex justify-between text-sm">
                      <span>
                        {p.playerName} ({p.playerPosition}, {p.playerClub}) · £{p.playerValue}M
                      </span>
                      <button onClick={() => addPlayer(p)} className="text-[var(--dt-accent)] font-semibold hover:underline shrink-0 ml-2">
                        add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="bg-[var(--dt-primary)] hover:bg-[var(--dt-primary-hover)] text-[var(--dt-primary-contrast)] px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Register team"}
            </button>
            {mode === "edit" && (
              <button
                onClick={handleDelete}
                disabled={saving || deleting}
                className="bg-transparent border border-[var(--dt-danger)] text-[var(--dt-danger)] hover:bg-[var(--dt-danger)] hover:text-[var(--dt-bg)] px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Delete team"}
              </button>
            )}
          </div>
        </div>
      )}

      {step === "deleted" && (
        <div className="bg-[var(--dt-surface)] p-6 rounded-lg space-y-2">
          <p className="text-lg">
            <strong>{deletedName}</strong>&apos;s team has been deleted.
          </p>
          <button
            onClick={startAnotherTeam}
            className="bg-[var(--dt-primary)] hover:bg-[var(--dt-primary-hover)] text-[var(--dt-primary-contrast)] px-4 py-2 rounded font-semibold transition-colors mt-2"
          >
            Back to start
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="bg-[var(--dt-surface)] p-6 rounded-lg space-y-2">
          <p className="text-lg">
            Team saved as <strong>{finalName}</strong>.
          </p>
          {finalName !== name.trim() && (
            <p className="text-sm text-[var(--dt-content-muted)]">
              Note: because &quot;{name}&quot; was already taken by a different mobile number, your team was
              registered as <strong>{finalName}</strong>.
            </p>
          )}
          {teamsListError && <p className="text-[var(--dt-danger)] text-sm">{teamsListError}</p>}
          <div className="flex flex-wrap gap-3 mt-2">
            <button
              onClick={startAnotherTeam}
              className="bg-[var(--dt-primary)] hover:bg-[var(--dt-primary-hover)] text-[var(--dt-primary-contrast)] px-4 py-2 rounded font-semibold transition-colors"
            >
              Add another team?
            </button>
            <button
              onClick={listMyTeams}
              disabled={teamsListLoading}
              className="bg-[var(--dt-surface-2)] hover:opacity-90 text-[var(--dt-content)] px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {teamsListLoading ? "Looking up…" : "List your teams"}
            </button>
          </div>
        </div>
      )}

      {step === "teamsList" && (
        <div className="bg-[var(--dt-surface)] p-6 rounded-lg space-y-4">
          <p className="text-lg">
            Teams registered under <strong>{mobile}</strong>
          </p>
          {teamsList.length === 0 ? (
            <p className="text-sm text-[var(--dt-content-muted)]">No teams found for this mobile number.</p>
          ) : (
            <ul className="space-y-2">
              {teamsList.map((t) => (
                <li key={t.index} className="bg-[var(--dt-input-bg)] rounded p-3 text-sm flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-[var(--dt-content-muted)]">
                      Formation: {t.formation ?? "—"} · {t.playerCount}/{SQUAD_SIZE} players · £{t.teamValue}M
                    </div>
                  </div>
                  <button
                    onClick={() => editTeamFromList(t)}
                    disabled={teamsListLoading}
                    className="shrink-0 bg-[var(--dt-primary)] hover:bg-[var(--dt-primary-hover)] text-[var(--dt-primary-contrast)] px-3 py-1.5 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setStep(teamsListReturnStep)}
            className="block text-sm underline text-[var(--dt-content-muted)] hover:text-[var(--dt-content)] transition-colors"
          >
            ← Back
          </button>
        </div>
      )}
    </main>
  );
}
