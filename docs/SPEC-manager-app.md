# 🔒 SPEC — dreamteam27-manager (Self-Service Team Registration)

> **STATUS: LOCKED / AUTHORITATIVE** for the initial v1 build. This document is
> the source of truth for how the `dreamteam27-manager` app identifies teams,
> handles edits, and enforces squad rules. Follow the same change-control
> discipline as `API-CONTRACT-player-retrieval.md`: don't silently diverge from
> this doc — update it when a decision changes.

**Owner:** CJ · **Created:** 2026-08-18 · **Target go-live:** 2026-08-18 · **Season:** 2026/27

---

## 1. Purpose

`dreamteam27-manager` is the third app in the DreamTeam27 suite, alongside
`dreamteam27-capture` (admin data/team entry) and `dreamteam27-display`
(public read-only views). It gives an individual manager a self-service
equivalent of capture's "managers" page: they register and build their own
team, without needing admin access to the capture app.

All three apps share the same Firebase Realtime Database (`footieteamz27`,
europe-west1).

---

## 2. Identity model — the core rule

A team is uniquely identified by the pair **(manager name, mobile number)**.

| Scenario | Behaviour |
|---|---|
| New name + new mobile | Fresh registration. New team created. |
| Existing name + **different** mobile | Treated as a distinct manager. The name is auto-suffixed (`Brian` → `Brian/2`, next collision → `Brian/3`, ...) so it doesn't collide with the existing team. A new team is created under the suffixed name. |
| Existing name + **same** mobile (exact match on both fields) | This is the *same* manager returning. Their existing team is looked up and shown **read-only**, with an **Edit** button. No new team is created and no suffix is applied. |
| Same mobile number, but a genuinely different name | Allowed — one person/phone can register more than one team, as long as each name is distinct (subject to the suffix rule above if that name is also already taken by someone else). |

Suffixing is **assigned once, at creation**, and persists as part of the
stored manager name — it is not recalculated on every read.

---

## 3. Lookup-before-save flow

1. Manager enters **name** + **mobile number**.
2. App queries existing teams in `/0` for an exact (name, mobile) match.
   - **Match found** → display that team's current squad, formation, and
     value, read-only. Show an **Edit** button (see §4 for the cutoff rule).
   - **No match, but name exists under a different mobile** → proceed to
     registration, auto-suffixing the name per §2.
   - **No match at all** → proceed to a fresh registration form.
3. On save (new registration or an accepted edit), validate against the
   squad rules in §5 before writing to the database.

---

## 4. Edit cutoff

Edits are permitted **only until Friday 21 August 2026, 19:59 (Europe/London)**.

- Before the cutoff: existing teams can be viewed and edited via the Edit
  button; new registrations are open.
- At/after the cutoff: existing teams remain viewable (read-only) but the
  Edit button is disabled/hidden. New registrations should also be
  considered closed at this point unless explicitly reopened by CJ — **to be
  confirmed**; v1 assumes registration and editing share the same cutoff
  unless told otherwise.
- The cutoff must be enforced **server-side** (API route / server action) as
  the source of truth. Client-side hiding of the Edit button is a UX nicety
  only — it must not be the only guard, since a direct API call could
  otherwise bypass a client-only check.
- Store the cutoff as a single constant (ISO 8601 with explicit London
  offset, e.g. `2026-08-21T19:59:00+01:00`) in one place (e.g.
  `src/lib/constants.ts`) so it's trivial to find and change for future
  seasons/gameweeks.

---

## 5. Squad validation rules (identical to capture's managers page)

Enforced at two layers, matching capture's existing pattern:

**Entry stage** (as players are added): hard-block any addition that would
violate:
- 11-player squad cap
- Position maximums: 1 GK, 5 DEF, 5 MID, 3 STR
- £50M budget ceiling

**Save stage**: before writing, confirm:
- Exactly 11 players, exactly 1 GK
- An allowed formation: **4-4-2, 4-3-3, 4-5-1, 3-4-3, 3-5-2, 5-4-1, 5-3-2**
- Total squad value ≤ £50M

Player values lock at selection and are not overwritten by later
data-retrieval refreshes (same invariant as capture, §8.6 of the API
contract).

---

## 6. Data target

Writes go **directly into the existing `/0` managers node** in
`footieteamz27` — the same node and shape that `dreamteam27-capture`
writes to. No separate staging node for v1. This means self-service entries
and admin-entered entries are indistinguishable in storage; if that turns
out to be a problem (e.g. for moderation), a `source: "manager-app"` /
`source: "capture"` tag on each record is a cheap addition worth
considering in a follow-up (this app does add a `source` field to its own
writes already — capture's existing records just don't have one).

**Record shape — verified live 2026-08-18** (see `src/lib/types.ts` for the
canonical TypeScript types):

- The identity field on a stored record is **`manager`** (a `name` field
  duplicating it also appears on newer records — both are kept in sync on
  write, but `manager` is authoritative for lookups).
- Squad picks live in **`teamDetails`**: an array of
  `{ playerId, playerDetails: {...} }` — note `playerId` sits *outside*
  `playerDetails`, not nested inside it.
- Squad value is stored as **`teamValue`** (not `totalValue`).
- `mobile` and `formation` are additive fields this app introduces;
  capture-created records never have a `mobile`, which is exactly what
  makes them safe from ever colliding with a self-service lookup.
- Some seeded/legacy records use an entirely different, older shape (a
  `players` array with different field names, no `teamDetails`) — stale
  2025/26 test data. This app skips records without `teamDetails` during
  identity resolution rather than erroring on them.

---

## 7. Access control

**v1 is an open form — no authentication, no mobile verification (e.g. no
OTP/SMS).** Anyone with the link can register a team or attempt to view/edit
one, using only the name+mobile pairing as "proof" of identity. This is a
known, accepted risk for launch speed; flagged here so it isn't forgotten:

- Nothing stops someone from entering another person's real name+mobile and
  editing their team before the cutoff.
- Nothing stops someone from registering junk/offensive team names.

If abuse becomes a problem, the natural next step is mobile OTP
verification before save/edit — out of scope for v1.

---

## 8. Open items / follow-ups (not blocking launch)

- [ ] Confirm whether new registrations should also close at the Fri 19:59
      cutoff, or only edits to existing teams.
- [ ] Decide whether to tag records with their originating app (`source`
      field) for future moderation/audit.
- [ ] Decide on abuse mitigation (rate limiting, mobile verification) if
      needed post-launch.
- [ ] Confirm error/empty states: what a manager sees if they try to edit
      after the cutoff, and what "team not found" looks like on first-time
      lookup vs. a genuine typo.

---

## 9. Interop with `dreamteam27-capture` — the `mobile: "ADMIN"` convention

Added 2026-08-18, after launch. Because `mobile` is the second half of this
app's identity key, but `dreamteam27-capture` doesn't collect a mobile
number at all, capture needs to write a placeholder so every record at `/0`
has *some* `mobile` value — otherwise a capture-entered "Brian" and a
self-service "Brian" would both have `mobile: undefined` and silently
collide.

**Convention:** every team created or edited via `dreamteam27-capture`
writes **`mobile: "ADMIN"`** (this is a `capture`-side change — tracked in
`PROJECT-STATUS.md` §13, not yet implemented as of this writing).

**Why `"ADMIN"` isn't treated as a real mobile number here:** unlike a real
phone number, `"ADMIN"` is not unique per person — capture can (and does)
create several differently-named managers that would all carry the exact
same placeholder. So this app's identity resolution (`src/lib/identity.ts`)
gives it special handling:

- An `ADMIN` record **still occupies its name** for collision purposes — a
  self-service registration using the same base name gets auto-suffixed
  (`Brian` → `Brian/2`) exactly as if a real mobile had taken it.
- An `ADMIN` record is **never a valid edit-match target** — even if a
  self-service (name, mobile) pair happened to equal (`Brian`, `ADMIN`),
  this does not resolve to editing that admin-entered team.
- Self-service users are **blocked from entering `"ADMIN"` as their own
  mobile number** (case/whitespace-insensitive) at both `/api/lookup` and
  `/api/register` — it's reserved, not a value a manager can legitimately
  hold.

Net effect: capture-entered teams and self-service teams can share a name
freely without either app corrupting the other's record, and an
admin-entered team is always recognisable as its own separate record by
manager-app tooling, per the requirement that motivated this section.

---

## 10. Relationship to other project docs

- Squad/validation rules mirror `dreamteam27-capture`'s managers page —
  see the capture app's own internal validation logic (no separate contract
  doc exists for that yet; this spec restates the rules as currently
  understood and should be corrected if capture's actual logic differs).
- Shares the same Firebase project (`footieteamz27`) and `/0` schema as
  described in `PROJECT-STATUS.md` (source: `cjcloud/dreamteam27Status`).
- Player pool / pricing data is read-only from this app's perspective and
  governed entirely by `API-CONTRACT-player-retrieval.md` — this app does
  not fetch or write player data, only manager/team records.
