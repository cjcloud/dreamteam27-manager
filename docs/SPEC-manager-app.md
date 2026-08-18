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
Name matching is **case-insensitive** — `cj` and `Cj` are treated as the same
manager for lookup, edit-matching, and suffix-collision purposes (added
2026-08-18, `src/lib/identity.ts`). The name is still stored and displayed
using whatever casing was typed at registration; only the comparison is
case-insensitive.

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

1. Manager enters **mobile number** first, then **name** (mobile is asked
   for first in the UI since it's also the key used by the "List my teams"
   lookup below). The mobile field only accepts digits, starting `07`,
   exactly 11 digits long (e.g. `07700123456`) — non-digit characters and
   any digits past the 11th are stripped immediately, and a warning
   explains why. This is a client-side UX guard only; it is not (yet)
   re-validated server-side.
2. **List my teams** is enabled only once a *valid-shape* mobile number is
   entered AND a background check (debounced, `/api/teams-by-mobile`)
   confirms at least one team is already registered under it — it stays
   disabled for a mobile number with no teams. It's also disabled/hidden as
   soon as a name is typed (see next point), since at that point the
   Register/Edit check below takes over.
3. As soon as **both** a valid mobile number and a name are entered, a
   second live check (`/api/lookup`) determines whether that exact (name,
   mobile) pair already has a team:
   - **No match** → a **Register** button appears. Proceeds to a fresh
     registration/squad-building form, auto-suffixing the name per §2 if
     the base name is already taken under a different mobile.
   - **Exact match** → **List my teams** is hidden, **Register** is not
     shown, and the *only* button presented is **Edit**, alongside the
     advisory text "This team exists" (or "— editing is closed" once past
     the cutoff, disabling the button). Proceeds to the read-only team
     preview (§2's existing "showExisting" screen) with its own **Edit
     this team** button to start editing.
4. **List my teams** (when shown per point 2 above) looks up every
   non-ADMIN team registered under that mobile via `/api/teams-by-mobile`
   and lists them with an **Edit** button per team, jumping straight into
   editing that team.
5. On save (new registration or an accepted edit), validate against the
   squad rules in §5 before writing to the database.

---

## 3a. Deleting a team

While editing an existing team (squad-building screen, `mode === "edit"`),
a **Delete team** button is available. It's gated behind a browser
`confirm()` prompt ("Delete X's team? This cannot be undone.") before
anything happens — the "usual confirmation" pattern used for any
irreversible action.

- Enforced server-side by `/api/delete`, which re-checks the exact same
  guards as `/api/update`: the edit cutoff (§4) must not have passed, the
  submitted (name, mobile) must match the record being deleted, and
  ADMIN-placeholder records can never be a self-service delete target.
- Deletion removes the record from `/0` entirely (`deleteManagerAt` in
  `src/lib/managersDb.ts`, via Firebase `.remove()`). If `/0` happens to be
  stored as a JS array, this leaves a hole at that index rather than
  shifting later records down — other managers' indices (their edit
  target) must never shift as a side effect of someone else's delete.
- After a successful delete, the manager sees a simple "team deleted"
  confirmation with a button back to the start — no undo.

## 4. Edit cutoff

Edits are permitted **only until Friday 21 August 2026, 19:59 (Europe/London)**.

- Before the cutoff: existing teams can be viewed and edited via the Edit
  button; new registrations are open.
- At/after the cutoff: **the whole app is retired** — resolved 2026-08-18
  (previously an open question, see former §8). New registrations, edits,
  and deletes all close at the same instant; there is no read-only
  "browse existing teams" mode afterward. `/api/register`, `/api/update`,
  and `/api/delete` all enforce this server-side (`isEditingOpen()`), and
  the client shows a static "Registration and editing are now closed"
  message in place of the whole form rather than letting anyone reach the
  identify screen at all.
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

**Player pool shape (`/1/playerData`) — verified live 2026-08-18, found to
differ from documentation:** `API-CONTRACT-player-retrieval.md` §6 (owned by
`dreamteam27-capture`) documents the pool as `playerId`/`playerName`/
`playerPosition`/`playerValue`/`gwpts`/`gwtotalPts`/etc. A live smoke test of
the deployed `/api/players` endpoint found production records actually use a
different shape: `{ id, displayName, firstName, lastName, position,
playerClub, price, status, gameweekPoints, totalPoints }`. Since capture and
display apparently work correctly against this real shape today, the
contract doc's table looks stale rather than production being wrong — so
this app adapts to reality rather than touching capture's contract-governed
pipeline. `src/lib/poolNormalize.ts` handles the mapping (and passes through
unchanged if the pool is ever actually in the documented shape). Worth
flagging to whoever owns the capture contract doc, since it's meant to be
authoritative.

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

- [x] ~~Confirm whether new registrations should also close at the Fri 19:59
      cutoff, or only edits to existing teams.~~ Resolved 2026-08-18: both
      close together, app fully retired at the cutoff (see §4, §11).
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

---

## 11. Mobile number privacy — investigated 2026-08-18, deferred to season novation

**The finding.** `mobile` is stored in plain text on each manager's record
at `/0` (§6), and the shared `footieteamz27` Realtime Database's rules
grant unauthenticated public read on the whole database (currently
time-gated: `.read: "now < <cutoff-ms>"`, no auth requirement). This means
any of the three apps — or literally anyone with the database URL — can
read every manager's mobile number directly, with no login. This is true
today and has been true since the manager app launched; it wasn't
introduced by anything in this section.

**Why it isn't being fixed right now.** A real fix (moving `mobile` off
`/0` into a separately-secured node) touches both this app *and*
`dreamteam27-capture` (which reads `mobile` from `/0` client-side to decide
whether to preserve a real number or write the `ADMIN` placeholder — see
§9), plus a live data migration. Attempting that mid-season, while
dreamteam27-manager is actively being used for registrations, risks
breaking live input for no immediate benefit — the exposure isn't new or
worsening, it's just been correctly identified. CJ's decision (2026-08-18):
leave it as-is until the registration/edit cutoff (§4), then handle it as
part of retiring this season's app rather than as a live hotfix.

**One rules experiment that did NOT work, for the record:** a nested
per-field rule (`"0": { "$index": { "mobile": { ".read": false } } }`)
was tried and published, then verified (via a direct, cache-busted fetch
of `/0.json`) to have **no effect** — `mobile` was still fully readable.
Firebase Realtime Database rules cascade downward and, per Firebase's own
documented behaviour, **cannot be revoked at a deeper path once granted at
a shallower one** — since `/0`'s own `.read` rule already grants access,
a child-level `.read: false` under it is simply not honoured. Field-level
hiding is not achievable without moving the field to its own path outside
`/0`. The database rules have since been reverted to their pre-experiment
state (time-gated, no auth) — nothing about the rules differs from before
this investigation.

**The plan, in order:**

1. **Now → cutoff (§4):** no change. The app continues to accept
   registrations and edits as normal.
2. **At the cutoff:** the app retires itself (§4/§8) — `/api/register`,
   `/api/update`, and `/api/delete` all refuse, and the UI shows a static
   closed message. No mobile numbers are touched at this point.
3. **After the cutoff:** every self-service manager record's `mobile`
   value is bulk-overwritten to the `ADMIN` placeholder (§9). At that
   point mobile numbers no longer serve any purpose for the remainder of
   *this* season — the identity/edit/lookup features that needed them are
   retired along with the app, and the sister apps (capture, display)
   never read `mobile` for their own display/scoring purposes anyway
   (confirmed: `dreamteam27-display` has zero references to `mobile`
   anywhere in its codebase). This isn't yet implemented as of this
   writing — needs a small one-off script (Admin SDK, iterate `/0`,
   overwrite non-`ADMIN` `mobile` values) run once, deliberately after the
   cutoff, not before.
4. **At next season's code novation:** this is when the real fix happens.
   The mobile numbers collected this season are needed again next season
   (re-registering returning managers should presumably be easier, or at
   minimum the historical record has value), so they aren't deleted — but
   the *access model* gets tidied up properly at that point: moving
   `mobile` to its own API-protected path/node (not directly exposed via
   open database rules), updating both this app and capture's reads/writes
   accordingly, and only then re-securing it. Doing this at novation time
   rather than mid-season means it can be done as part of a planned
   rebuild rather than a live patch to a database three apps depend on.
