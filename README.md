# dreamteam27-manager

Self-service team registration app for DreamTeam27 — the third app in the
suite alongside `dreamteam27-capture` (admin) and `dreamteam27-display`
(public views). Lets an individual manager register and edit their own
fantasy football team without needing capture-app admin access.

Shares the `footieteamz27` Firebase Realtime Database with the other two
apps, writing directly to the same `/0` managers node.

## Source of truth

The authoritative spec for this app's behaviour — identity/uniqueness
rules, the edit cutoff, squad validation, data target, and access model —
is [`docs/SPEC-manager-app.md`](docs/SPEC-manager-app.md). Treat it the
same way `dreamteam27-capture` treats its
`docs/API-CONTRACT-player-retrieval.md`: it's locked/authoritative, and
changes to behaviour should update the doc in the same change.

Overall project status (all three apps, shared decisions, open items) is
tracked centrally in
[`cjcloud/dreamteam27Status`](https://github.com/cjcloud/dreamteam27Status/blob/main/PROJECT-STATUS.md).

## Stack

Next.js (App Router) + TypeScript + Tailwind, matching `dreamteam27-capture`.
Reads/writes Firebase via the Admin SDK server-side only (API routes under
`src/app/api/`) — the client never talks to Firebase directly.

## Getting started (local dev)

1. Copy `.env.local.example` to `.env.local` and fill in the three
   `FIREBASE_ADMIN_*` values — **reuse the same `footieteamz27`
   service-account key already used by `dreamteam27-capture`** (see that
   project's `PROJECT-STATUS.md` §6 for how it was generated); no need to
   create a second key for the same Firebase project.
2. Install and run:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:3000.

## Deploying

Deploys to Vercel the same way as capture/display: import this repo, set
the `FIREBASE_ADMIN_*` env vars in the Vercel project settings (paste
directly, never commit them — watch that `FIREBASE_ADMIN_PRIVATE_KEY`'s
line breaks survive the paste), push to `main`.
