# Cable OS 3 — GTP generator only

A copy of Cable OS 2 carrying the **whole design system** but only the **GTP generator** and the
**login page**. Everything else was removed, not hidden behind a flag, so a dead tab cannot be
reached by typing its URL.

## What ships

| Route | Purpose |
|---|---|
| `/login` | Sign in |
| `/gtp` | GTP home |
| `/gtp/new` | The generator — derive a cable from the IS tables |
| `/gtp/review` | Generated records, stamps and approval |
| `/gtp/standards` | The standards data behind the derivation |

`/` redirects to `/gtp`, and so does login.

## What was removed

Sales Board, Quote Builder, Contacts, EMD & BG, Order Board, Operator Card, Dispatch,
Invoice Readiness, Approvals, Settings, Integrations, Dashboard and the record drill-down.
Every one now returns 404.

## Consequences worth knowing

- **The quote handoff is gone.** The "Create quote" button and the review page's downstream
  actions (Job card, Quotation, Drum marking) were removed with it. The GTP-to-quote integration
  still lives in Cable OS 2.
- **The domain layer is untouched.** All 299 tests pass here, including the standards derivation,
  mass build-up and costing. `lib/domain/costing.ts` and the quote costing modules are retained
  because the GTP engine and its tests use them.
- **Role switching no longer redirects.** There is no dashboard to return to, so a role without
  GTP access lands back on `/gtp`.

## Running it

```bash
npm ci
npm run dev -- -p 3007
```

Cable OS 2 runs on :3001. Use a different port to run both, and check which one is in front of
you before concluding a change is missing.
