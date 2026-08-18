# dreamteam27-manager

Self-service team registration app for DreamTeam27 — the third app in the
suite alongside `dreamteam27-capture` (admin) and `dreamteam27-display`
(public views). Lets an individual manager register and edit their own
fantasy football team without needing capture-app admin access.

Shares the `footieteamz27` Firebase Realtime Database with the other two
apps.

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
