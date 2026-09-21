# Track B — Enquiry container & stage gates

> **You are the second of two agents working on this repo simultaneously.**
> This document is self-contained. You do not need to read the conversation that produced it.
> Every code claim below was verified against the source on 2026-09-11 — line numbers are real.
>
> **Baseline:** branch `feat/custom-param-tolerance`, **228 tests passing**, 4 known type errors,
> 1 known lint error (all pre-existing, all listed in §8).

---

## 1 · What Cable OS is, in one minute

An operations platform for an Indian LT cable manufacturer. First client: **Navya Cables**. It
replaces the paper diary that currently runs their factory floor.

The thing to understand before touching anything: **the documents this system produces are
legally binding.** A GTP (Guaranteed Technical Particulars) is a one-page sheet that a state
electricity board's divisional engineer *stamps* before production may begin, and that a
third-party inspector later measures physical drums against. Every number on it traces to a
clause in an Indian Standard. Getting one wrong means a rejected consignment, not a bug report.

That is why this codebase has rules that look paranoid — no fabricated values, provenance on
every field, an append-only audit log. They are not style preferences. See §7.

The target sequence is:

```
build the cable → quote it → track the sale → track production → inspect → dispatch
```

Most of that spine already exists as data. `Order` carries `quoteId`, `gtpId`, `jobCardId`,
`dispatchId`, `invoiceId`; job cards, QC records, inspection reports and dispatches all carry
`orderId`. **Your track makes that spine enforceable and visible.**

---

## 2 · Your track, and the other agent's

### You own — Track B

```
app/(app)/orders/page.tsx
app/(app)/sales/page.tsx
app/(app)/records/[recordId]/page.tsx
lib/services/index.ts               (transition + gate logic only)
lib/domain/pipeline.ts              (new — gate rules, pure)
lib/domain/pipeline.test.ts         (new)
lib/seed/data.ts
```

### You must not touch — Track A

```
lib/domain/gtp/mass.ts              (new, being written now)
lib/domain/gtp/derive.ts
lib/domain/gtp/derive-lt-fields.ts
lib/domain/gtp/derive-solar-fields.ts
lib/domain/costing.ts
app/(app)/quote/QuoteBuilderClient.tsx
```

### Why this seam is real (verified, not assumed)

- `lib/domain/costing.ts` has **exactly one consumer** — `QuoteBuilderClient.tsx`. Both are Track A's.
- `QuoteBuilderClient.tsx` contains **zero** references to `OrderStage`, `GtpStatus` or `InspectionStatus`.
- `app/(app)/orders/page.tsx` contains **zero** costing references.
- Neither the orders page nor the record-journey page references `specId`.

So your work and theirs genuinely do not overlap. This was checked by grep before the split was
drawn, not assumed from the task list.

---

## 3 · What Track A is changing underneath you

**Read this before you open any Track A file out of curiosity.**

- **`lib/domain/costing.ts` is being rewritten right now.** It currently computes cable mass from
  tunable estimate coefficients (`CONDUCTOR_KG_PER_M_PER_SQMM`, `INSULATION_…`, `SHEATH_…`,
  `ARMOUR_…`). **All four are being deleted.** If you open that file and see estimate coefficients,
  that is a file mid-rewrite — not a bug, not something to fix. Leave it.
- **`lib/domain/gtp/derive-*.ts` are gaining a `fin.totalMass` field** for LT and solar. You have
  no reason to read them, but they are moving.
- **Track A's blast radius is zero outside its own files.** Nothing anywhere imports `computeLine`,
  `ratesForSpec`, `CostingInput` or `CostingResult` except `QuoteBuilderClient.tsx`. The
  coefficient constants are module-private. Verified by grep across `app/`, `lib/`, `components/`.

### One thing you do NOT need to coordinate

Your WP-4 changes `Inquiry.specId` → `specIds: string[]`. The quote builder *does* consume
`Inquiry` (an inquiry-picker at `QuoteBuilderClient.tsx:795`) — but it only reads `inquiry.id` and
`inquiry.requirement`, **never `specId`**. Verified by grep.

**Make the change. Do not block on asking.**

---

## 4 · WP-4 · Enquiry as the job container

### The problem

The data model contradicts itself today:

```ts
export interface Inquiry {
  specId?: string;      // lib/services/types.ts:252  — ONE cable
}
export interface QuoteLine {
  specId: string;       // lib/services/types.ts:267  — and Quote has lines[] — MANY cables
}
```

A quote can cover three cable sizes. The enquiry that produced it can point at one. A WBSEDCL
tender covering three sizes has nowhere to live.

### What to do

- `Inquiry.specId` → `specIds: string[]`. **Keep reading the legacy singular field** so existing
  seed data still loads — a documented migration, not an implicit null. Follow the pattern already
  used for `template.productLine ?? "AB_CABLE"` in `lib/domain/gtp/templates.ts`.
- **Commercial terms live on the enquiry, not the spec.** One tender, one set of terms, many
  cables. Duplicating terms per spec is the thing this change exists to prevent.
- The board card shows a **document tray**: which of quote / GTP / job card / inspection /
  dispatch exist, and their status. This *is* the Kanban the client asked for — it falls out of
  the model rather than being a separate feature.
- Keep it thin. A tracking surface, not a project-management tool. The target user is
  middle-aged to senior and the existing builder is already dense; added density is a regression.

**DoD:** one enquiry carries three specs; the board shows one card with a tray of five document
states. A legacy record with the singular `specId` still loads.

---

## 5 · WP-5 · Stage gates

**The plan you may have been shown says "build two gates". That is wrong, and here is the
correction.** One gate is already fully built; the other genuinely is not.

### 5a · Production gate — ALREADY EXISTS. Do not rebuild it.

`lib/services/index.ts:105`:

```ts
function productionGateBlockers(store: CableStore, order: Order): string[] {
  const blockers: string[] = [];
  const gtp = gtpForOrder(store.gtps, order);
  if (!gtp || gtp.status !== "Approved") { ... }
  const rmc = store.rawMaterialChecks.find((entry) => entry.orderId === order.id);
  if (!rmc || !rmc.checks.every((check) => check.result === "Pass")) { ... }
  return blockers;
}
```

It checks GTP approval **and** raw-material QC, returns human-readable blocker messages, and is
enforced in `orderService.transition` at `:453`.

**The actual gap:** `app/(app)/orders/page.tsx` **never calls `productionBlockers`** (verified:
zero occurrences). So the gate fires as a *thrown error* after the user clicks, rather than as
something they can see coming.

**Your job here is UI, not logic:** surface the blockers on the order card before the user tries.
Name the gate in the interface, not in a toast. Add the test that pins the service-layer
behaviour, which currently has none.

### 5b · Dispatch gate — DOES NOT EXIST. Build it.

`completeDispatchHandoff` (`lib/services/index.ts:1039`) sets `order.stage = "Ready for Dispatch"`
after checking the **invoice balance**. It never looks at an inspection report.

The data is already there and unread — `lib/services/types.ts:527`:

```ts
export interface InspectionReport {
  orderId: string;
  result: "Passed" | "Failed";
  clearanceIssued: boolean;
  diRef?: string;              // the DI (Dispatch Clearance) the client described
}
```

**⚠️ `completeDispatchHandoff` has three call sites** — `:1014`, `:1128`, `:1148`. A gate added at
one of them **leaks**. Put it inside the function, not at its callers.

### Where the gate rules go

`lib/domain/pipeline.ts`, as **pure functions**. Not inside a component.

The reason is mechanical: `npm test` is `node --import tsx --test "lib/**/*.test.ts"`. Logic that
lives in a component is **untestable in this repo**. That is why the file is new and why it is in
`lib/`.

Enforce in the **service layer** so no page can bypass it.

**DoD:** attempting production on an unapproved GTP is refused with the reason stated *before* the
click. Attempting dispatch without inspection clearance is refused, from all three paths.

---

## 6 · The shared file

`lib/services/types.ts` — both tracks add fields, at different line ranges:

| Track | Adds | Near line |
|---|---|---|
| A | mass/rate fields on `QuoteLine`; possibly `Material` | ~265, ~783 |
| **B (you)** | `Inquiry.specIds`; gate-related status fields | ~248, ~297 |

Git merges these cleanly. **Append within your own interface. Never reformat. Never reorder.**

This file has already caused one silent data-loss bug — a duplicated type drifted from its
original and the compiler did not catch it, because the assignment was from a variable rather than
an object literal, so excess-property checking never fired. Run the full suite after any merge.
Do not trust the compiler on this file.

---

## 7 · Repo rules that are not negotiable

1. **Read `node_modules/next/dist/docs/` before writing routing code.** This is Next.js 16.2.9 and
   it differs from training data. Stated in `CLAUDE.md`.
2. **This IS a git repository**, whatever an environment probe reports. A stray
   `git checkout <file>` discards uncommitted work — **this has already happened once on this
   project** and cost an afternoon.
3. **Tests only run from `lib/**`.** `npm test` = `node --import tsx --test "lib/**/*.test.ts"`.
   No Jest, no Vitest, no test framework install.
4. **Never fabricate a value.** Missing data → `gap: true` plus a **named constant** explaining
   what is missing, in the style of `SOLAR_MISSING_TABLES` in `lib/domain/standards/iec62930-2017.ts`.
   Not a default. Not a plausible number.
5. **Pages call `lib/services` only** — never an adapter, connector, `fetch`, or `localStorage`.
6. **Semantic tokens only.** No raw hex/rgb/hsl, no arbitrary Tailwind values, no inline styles.
   Lucide icons only, never emoji.
7. **No `new Date()` in pages or components.** Use `lib/domain/clock.ts`.
8. **Read module header comments before editing.** Several encode corrections already made and
   reverted once.

---

## 8 · Verification, every PR

```bash
npx tsc --noEmit && npm run lint && npm test
```

- **Tests: ≥228, zero failing.**
- **Known pre-existing, not yours** — do not chase these:
  - 4 type errors: `app/(app)/approvals/page.tsx`, `app/(app)/dispatch/DispatchClient.tsx`
  - 1 lint error: `InspectionPanel` not defined in `DispatchClient.tsx`
  - A runtime error from `DispatchCard` — `/dispatch` is currently broken in the browser
- Everything else must be clean.
- One work package, one branch, one PR. Do not merge WP-4 and WP-5 into one PR.

Suggested branch: `track-b/enquiry-stage-gates`.

---

## 9 · WP-3 is the convergence point — do not attempt it

Both tracks eventually need **one** `CableSpec` (a discriminated `Construction` union, persisted
before any document exists). Track A needs it to know which cable to weigh; you need `specIds` to
point at something real.

**Sequence:** both tracks run to their DoDs → both merge → **one** agent does WP-3 on the combined
result.

Until then: work from existing ids. Track A works from the existing GTP-builder inputs.

---

## 10 · Landmines — failures this codebase has already had

Each of these was a real bug, found and fixed. They are listed so you recognise the *shape*.

- **A duplicated type that silently dropped data.** `GtpDerivedField` was a hand-maintained copy
  of `ResolvedField`. A member added to one and not the other compiled clean and vanished on save.
  Now an alias. *Shape: two representations of one thing will drift, and the compiler may not tell you.*
- **A PDF writer that emitted the literal string `undefined` as a coordinate.** Growing a table to
  three columns while leaving `widths` at two produced a malformed content stream, not a layout
  glitch. *Shape: parallel arrays must change together.*
- **`works-data` is not `is-table`.** IS 8130 specifies *no* conductor dimensions for Class 1/2
  (§3.2 — conformance is by resistance), yet buyer schedules ask for them. They come from works
  construction data and are labelled as such. *Shape: never claim a provenance you cannot defend.*
- **A hand-typed value filed as customer-mandated.** `MANUAL` and `QUIRK` both collapsed into
  `client-fixed` on save, so a value an operator typed read identically to one a board required.
  *Shape: collapsing categories destroys the distinction that matters.*
- **The IS 17293 §5.3-vs-§6.3 trap.** Four tolerance formulas look identical; one uses 0.15 where
  the adjacent clause uses 0.1. Collapsing them into one helper would silently widen every solar
  sheath tolerance by half. *Shape: resemblance is not equivalence.*

---

## 11 · Standing risk, owned by neither track

All seven standards datasets are `status: "draft"` and 16 works-data rows are unverified.
Connecting four documents to one engine **multiplies the blast radius of a wrong row**. This is a
human-with-the-PDFs task running in parallel with both tracks. Do not attempt to verify standards
data yourself — you do not have the PDFs.

---

## 12 · Open questions you may hit

1. **Does one tender really resolve to many specs?** Decided structurally (yes, `specIds[]`), but
   unconfirmed against a real tender document. If you find a case that contradicts it, say so
   rather than working around it.
2. **Enquiry stage names are unconfirmed.** The proposed set — Enquiry → Quoted → GTP approved →
   Production → Ready for Inspection → Dispatch — has not been confirmed with the client. **Do not
   invent new stage names.** Use the existing `InquiryStage` and `OrderStage` unions until told
   otherwise.
