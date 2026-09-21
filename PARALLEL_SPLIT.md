# Parallel work split — Cable OS pipeline build

> Two agents, two branches, no shared files except one type file that merges cleanly.
> Full reasoning is in the approved plan (`~/.claude/plans/async-hugging-rossum.md`).
> Baseline: `feat/custom-param-tolerance`, **228 tests passing**, 4 known type errors, 1 known lint error.

---

## Why this split works

Verified against the codebase before writing:

- `lib/domain/costing.ts` has **exactly one consumer** — `QuoteBuilderClient.tsx`. Track A owns both.
- `QuoteBuilderClient.tsx` contains **no** stage or status logic (`OrderStage`, `GtpStatus`, `InspectionStatus` do not appear in it).
- `app/(app)/orders/page.tsx` contains **no** costing logic.
- The orders and record-journey pages never reference `specId`, so Track B's work is genuinely independent of the spec refactor.

The one shared file is `lib/services/types.ts`, and the two tracks edit different line ranges
(Track A near `QuoteLine` ~265 and `Material` ~783; Track B near `Inquiry` ~248 and `OrderStage`
~297). Git merges these without conflict. **Neither track may reformat or reorder that file.**

---

## Track A — "What a cable weighs, and what it costs"

**Branch:** `track-a/derived-mass-costing`
**Work packages:** WP-1, WP-2
**Owns exclusively:**

```
lib/domain/gtp/mass.ts              (new)
lib/domain/gtp/mass.test.ts         (new)
lib/domain/gtp/derive-lt-fields.ts
lib/domain/gtp/derive-solar-fields.ts
lib/domain/gtp/derive.ts
lib/domain/costing.ts
app/(app)/quote/QuoteBuilderClient.tsx
```

### WP-1 · Derive mass for LT and solar

Only AB derives a mass today. Verified:

```
AB     Approx mass = 196 kg/km   ✓
LT     *** NONE ***
Solar  *** NONE ***
```

LT already emits the full geometry — `lt.calc.dL`, `lt.calc.diaOverCore`, `lt.innerSheath`,
`lt.armour`, `lt.outerSheath` — so mass is **derivable**, not estimable.

- Per layer: `π/4 × (D_outer² − D_inner²) × density`. Conductor mass from the IS conductor
  tables, not from geometry.
- Densities as a **named, cited** constant table (Al 2.70, Cu 8.89, XLPE 0.92, PVC 1.40,
  GI 7.85 g/cm³). Any figure not held → `gap: true` plus a named constant. **Never a plausible
  default** — this is the repo's hardest rule.
- Emit `fin.totalMass` on LT and solar with the **same field key and shape** AB already uses, so
  downstream code needs no per-type branching.
- **Reconcile against AB.** AB's existing mass is a works estimate carrying ±5%. Compute both
  ways on the same AB cable. If they disagree beyond that band, **surface it as a finding** —
  do not average, do not quietly prefer one. It is a question for the works.

**DoD:** every cable type emits `fin.totalMass` with a tolerance and a trace. A test asserts
derived AB mass falls within the existing ±5%, or documents why not.

### WP-2 · Quote prices the derived mass

The quote currently estimates from coefficients whose own header admits they exist *"without a
full IS dimensional table"*. That table now exists. Same AB cable: GTP **935 kg/km**, quote
estimate **~1,268 kg/km** — a ~35% gap on the metal that dominates the price.

- `computeLine` takes derived mass instead of `CONDUCTOR_KG_PER_M_PER_SQMM`,
  `INSULATION_KG_PER_M_PER_SQMM`, `SHEATH_KG_PER_M_PER_SQMM`, `ARMOUR_KG_PER_M_PER_SQMM`.
- **Delete those coefficients.** Keeping them "as a fallback" recreates the two-definitions
  problem this whole change exists to remove.
- Rates unchanged: `Material.ratePerKg` already exists with an MCX/manual source.
- Labour, wastage, drum and margin stay **entered inputs**. WP-1 gives mass, not cost. Cost
  modelling is a stated non-goal.
- Show mass with its tolerance and clause trace on the line, so a quoted price answers
  "which clause".

**DoD:** a quote line's mass equals the GTP's `fin.totalMass` for the same spec. Quoting an LT or
solar cable produces a real price, not zero.

### Track A must not touch

`Inquiry`, `OrderStage`, `GtpStatus`, `InspectionStatus`, the orders page, the record-journey
page, or `lib/services/index.ts` transition logic.

---

## Track B — "Tracking the job through its stages"

**Branch:** `track-b/enquiry-stage-gates`
**Work packages:** WP-4, WP-5
**Owns exclusively:**

```
app/(app)/orders/page.tsx
app/(app)/sales/page.tsx
app/(app)/records/[recordId]/page.tsx
lib/services/index.ts               (transition + gate logic only)
lib/domain/pipeline.ts              (new — gate rules, pure)
lib/domain/pipeline.test.ts         (new)
lib/seed/data.ts
```

### WP-4 · Enquiry as the job container

The model contradicts itself today: `Inquiry.specId?: string` is singular while `Quote.lines[]`
is plural. A quote can cover three cable sizes; the enquiry that produced it can point at one.

- `Inquiry.specId` → `specIds: string[]`. Keep reading the legacy singular field so existing seed
  data still loads — a documented migration, not an implicit null.
- Commercial terms live on the **enquiry**, not the spec. One tender, one set of terms, many
  cables.
- Board card shows the **document tray**: which of quote / GTP / job card / inspection / dispatch
  exist and their status. This *is* the Kanban the client asked for — it falls out of the model
  rather than being built as a separate feature.
- Keep it thin. A tracking surface, not a project-management tool.

**DoD:** one enquiry carries three specs; the board shows one card with a tray of five document
states.

### WP-5 · Stage gates, enforced

Every stage type already exists. What is missing is enforcement of the two gates that matter on
the actual factory floor:

- **No production before the GTP is approved.** `GtpStatus: "Approved"` gates
  `OrderStage: "In Production"`.
- **No dispatch before inspection clearance.** `InspectionStatus: "Passed"` gates
  `OrderStage: "Ready for Dispatch"`.

- Gate rules go in `lib/domain/pipeline.ts` as **pure functions**, not inside a component —
  logic in a component is untestable under this repo's `lib/**` test glob.
- Enforced in the **service layer** so no page can bypass it.
- A blocked transition names the gate in the UI, not in a toast.

**DoD:** attempting production on an unapproved GTP is refused with the reason stated.

### Track B must not touch

`costing.ts`, `mass.ts`, any `derive-*.ts`, or `QuoteBuilderClient.tsx`.

---

## The shared file

`lib/services/types.ts` — both tracks add fields:

| Track | Adds | Near line |
|---|---|---|
| A | mass/rate fields on `QuoteLine`; possibly `Material` | ~265, ~783 |
| B | `Inquiry.specIds`; gate-related status fields | ~248, ~297 |

Rules: **append within your own interface, never reformat, never reorder.** Both tracks run the
full suite after any merge — this file has already caused one silent data-loss bug, and the
compiler does not catch that class of error here.

---

## WP-3 is the convergence point — it cannot be split

Both tracks eventually need **one** `CableSpec` (discriminated `Construction` union, persisted
before any document exists). Track A needs it to know which cable to weigh; Track B needs it for
`specIds` to point at something real.

**Do not attempt WP-3 in parallel.** Sequence:

1. Track A and Track B run simultaneously to their DoDs.
2. Both merge.
3. **One** agent does WP-3 on the combined result.

Until then: Track A works from the existing GTP-builder inputs, Track B from existing ids.

---

## Rules for both tracks

1. **Read `node_modules/next/dist/docs/`** before writing routing code. Next.js 16.2.9 differs
   from training data. Stated in `CLAUDE.md`, not optional.
2. **This IS a git repository** whatever an environment probe reports. A stray
   `git checkout <file>` discards uncommitted work — it has already happened once here.
3. **Tests only run from `lib/**`.** `npm test` is `node --import tsx --test "lib/**/*.test.ts"`.
   Logic in a component is untestable. No Jest, no Vitest.
4. **Never fabricate a standards value.** Missing data → `gap: true` plus a named constant in the
   style of `SOLAR_MISSING_TABLES`.
5. **Pages call `lib/services` only** — never an adapter, connector, `fetch`, or `localStorage`.
6. Semantic tokens only, Lucide icons only, no `new Date()` in pages (use `lib/domain/clock.ts`).
7. **Read module header comments before editing.** Several encode corrections already made and
   reverted once — the IS 8130 dimensions story, the IS 17293 §5.3-vs-§6.3 coefficient trap, the
   D10 reason boundary.
8. One task, one branch, one PR. Do not merge two work packages into one PR.

### Verification, every PR

```
npx tsc --noEmit && npm run lint && npm test
```

- Tests: **≥228**, zero failing.
- Known pre-existing and not yours: 4 type errors in `approvals/page.tsx` and
  `dispatch/DispatchClient.tsx`, 1 lint error in the latter. Everything else must be clean.
- AB golden-file test must pass unchanged.

---

## The test that keeps both tracks honest

After both merge and WP-3 lands: **a GTP and a quotation generated from the same spec must never
disagree on a shared value**, asserted across every cable type. If that test is hard to write,
the substrate is wrong.

Track A should write the mass half of it now, so the assertion exists before the substrate does.

---

## Standing risk, owned by neither track

All seven standards datasets are `status: "draft"` and 16 works-data rows are unverified.
Connecting four documents to one engine **multiplies the blast radius of a wrong row**. This is a
human-with-the-PDFs task that must run in parallel with both tracks, not after them.
