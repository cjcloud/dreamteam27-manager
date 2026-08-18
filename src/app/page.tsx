"use client";

import { useEffect, useMemo, useState } from "react";
import { BUDGET_CAP, POSITION_MAX, SQUAD_SIZE } from "@/lib/constants";
import { canAddPlayer, possibleFormations, totalValue, validateSquadForSave } from "@/lib/squadRules";
import type { FlatManagerRecord, PoolPlayer, Position } from "@/lib/types";

type Step = "identify" | "showExisting" | "squad" | "done";
type Mode = "create" | "edit";

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

  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [squad, setSquad] = useState<PoolPlayer[]>([]);
  const [formation, setFormation] = useState("");
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalName, setFinalName] = useState("");

  useEffect(() => {
    if (step !== "squad" || pool.length > 0) return;
    setPoolLoading(true);
    fetch("/api/players")
      .then((r) => r.json())
      .then((d) => setPool(d.players ?? []))
      .catch(() => setIdentifyError("Could not load the player list."))
      .finally(() => setPoolLoading(false));
  }, [step, pool.length]);

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault();
    setIdentifyError(null);
    if (!name.trim() || !mobile.trim()) {
      setIdentifyError("Enter both your name and mobile number.");
      return;
    }
    setIdentifyLoading(true);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed.");

      if (data.mode === "edit") {
        setExistingIndex(data.index);
        setExistingManager(data.manager);
        setEditingOpen(data.editingOpen);
        setStep("showExisting");
      } else {
        setAssignedName(data.assignedName);
        setMode("create");
        setStep("squad");
      }
    } catch (err) {
      setIdentifyError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIdentifyLoading(false);
    }
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
  const formationOptions = useMemo(() => possibleFormations(squad), [squad]);

  useEffect(() => {
    if (formationOptions.length === 1) setFormation(formationOptions[0]!);
  }, [formationOptions]);

  const filteredPool = useMemo(() => {
    return pool.filter((p) => {
      if (posFilter !== "ALL" && p.playerPosition !== posFilter) return false;
      if (search.trim() && !p.playerName.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [pool, posFilter, search]);

  function addPlayer(p: PoolPlayer) {
    const check = canAddPlayer(squad, p);
    if (!check.ok) {
      setSaveError(check.errors);
      return;
    }
    setSaveError(null);
    setSquad((s) => [...s, p]);
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">DreamTeam27 — Register Your Team</h1>
      <p className="text-[var(--dt-content-muted)] mb-8">
        Build and manage your own fantasy squad. Edits close Friday 21 August 2026, 19:59 (UK time).
      </p>

      {step === "identify" && (
        <form onSubmit={handleIdentify} className="space-y-4 bg-[var(--dt-surface)] p-6 rounded-lg">
          <div>
            <label className="block mb-1 text-sm">Your name</label>
            <input
              className="w-full rounded px-3 py-2 bg-black/30 border border-[var(--dt-border)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brian"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Mobile number</label>
            <input
              className="w-full rounded px-3 py-2 bg-black/30 border border-[var(--dt-border)]"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="e.g. 07700 900123"
            />
          </div>
          {identifyError && <p className="text-[var(--dt-danger)] text-sm">{identifyError}</p>}
          <button
            type="submit"
            disabled={identifyLoading}
            className="bg-[var(--dt-primary)] px-4 py-2 rounded font-medium disabled:opacity-50"
          >
            {identifyLoading ? "Checking…" : "Continue"}
          </button>
        </form>
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
            <button onClick={startEdit} className="bg-[var(--dt-primary)] px-4 py-2 rounded font-medium">
              Edit this team
            </button>
          ) : (
            <p className="text-[var(--dt-danger)] text-sm">
              Editing closed Friday 21 August 2026, 19:59 — this team is now locked.
            </p>
          )}
          <button onClick={() => setStep("identify")} className="block text-sm underline text-[var(--dt-content-muted)]">
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
            <select
              className="rounded px-3 py-2 bg-black/30 border border-[var(--dt-border)]"
              value={formation}
              onChange={(e) => setFormation(e.target.value)}
              disabled={formationOptions.length === 0}
            >
              <option value="">Select formation…</option>
              {formationOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {squad.length === SQUAD_SIZE && formationOptions.length === 0 && (
              <p className="text-[var(--dt-danger)] text-sm mt-2">
                This DEF/MID/STR split doesn&apos;t match any allowed formation.
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[var(--dt-surface)] p-4 rounded-lg">
              <h2 className="font-semibold mb-2">Your squad</h2>
              <ul className="space-y-1">
                {squad.map((p) => (
                  <li key={p.playerId} className="flex justify-between text-sm">
                    <span>
                      {p.playerName} ({p.playerPosition}, {p.playerClub}) · £{p.playerValue}M
                    </span>
                    <button onClick={() => removePlayer(p.playerId)} className="text-[var(--dt-danger)]">
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[var(--dt-surface)] p-4 rounded-lg">
              <h2 className="font-semibold mb-2">Add players</h2>
              <div className="flex gap-2 mb-2">
                <input
                  className="flex-1 rounded px-2 py-1 bg-black/30 border border-[var(--dt-border)] text-sm"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="rounded px-2 py-1 bg-black/30 border border-[var(--dt-border)] text-sm"
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
                      <button onClick={() => addPlayer(p)} className="text-[var(--dt-accent)]">
                        add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {saveError && (
            <div className="bg-[var(--dt-surface)] p-4 rounded-lg text-[var(--dt-danger)] text-sm space-y-1">
              {saveError.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[var(--dt-primary)] px-4 py-2 rounded font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Register team"}
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
        </div>
      )}
    </main>
  );
}
