# Cable OS 2 — Product & Engineering Context

> Briefing document for an agent or engineer joining this project cold.
> Written 2026-08-31. Reflects the state of the `feat/gtp-tolerance-column` branch.

---

## 1. What this is

Cable OS 2 is an operations platform for **Indian LT cable manufacturers**. It replaces the paper diary that currently runs the factory floor — order intake, technical documentation, production job cards, QC logs, third-party inspection, dispatch and invoicing — with one system that carries a record from inquiry to invoice without retyping.

The first pilot client is **Navya Cables** (contact: Kamble; owner/approver referred to on the floor as "Gupta ji"). Their QC manager's diary is currently the single source of truth for the entire quality record. No Excel, no software. That diary is the primary replacement target.

**Why this is a real business rather than a CRUD app:** the documents this industry runs on are legally binding and standards-derived. A GTP (General Technical Particulars) is a one-page sheet that a state electricity board's divisional engineer stamps before production may begin, and that a third-party inspector later measures physical drums against. Every number on it traces to a clause in an Indian Standard. Getting one wrong means a rejected consignment, not a bug report.

---

## 2. The domain, for someone who has never seen a cable factory

### The physical product
A power cable is built up in layers, and each layer's dimension is derived from the one beneath it:

```
conductor (aluminium or copper strands, compacted)
  └─ insulation (XLPE or PVC)
      └─ laid-up cores + fillers
          └─ inner sheath
              └─ armour (galvanised steel wire/strip)
                  └─ outer sheath
```

This sequence is the **build-up chain**, and it is the heart of the derivation engine. You cannot know the outer sheath thickness without first computing the diameter under the armour, which needs the diameter over the inner sheath, and so on back to the conductor. IS 10462 §0.7 requires rounding to 0.1 mm at each stage before the next — so the chain must be computed stepwise, not as one collapsed formula.

### The real production flow (from the client meeting)
1. **Order initiation** — marketing receives the client's technical specs
2. **GTP created or received** → requires sign-off + stamp from the client's divisional engineers and AEs *before production starts*
3. **Raw material inspection** on arrival (visual, dimensional, electrical/mechanical) → job card issued to supervisor if passed
4. **Production** — RBD → stranding → insulation → laying-up. Operators watch extruder temperature closely.
5. **Internal QC** — high-voltage test, conductor resistance, insulation resistance. All logged.
6. **Inspection call** placed to the third party → inspector arrives **10–12 days later**
7. **Inspector** checks drums per the IS sampling plan, verifies against the GTP → issues DI (Dispatch Clearance)
8. **Dispatch** — immediately after DI, because floor space is critical

**The scheduling constraint that hurts:** the inspection call must be placed ~10 days before production completes. Call too early and the inspector arrives to unfinished goods; too late and finished cable idles on the floor occupying space. This is a genuine pain point and a product opportunity.

**GTPs are state- and client-specific and heavily reused.** The same electricity board in the same state means the same GTP across repeat orders. A different state means a different GTP and often different cable sizes. Repeat orders are very common — which is why templates matter more than they might appear.

### Four features the client explicitly asked for
1. **GTP generator** — standardised digital template, PDF export, sign-off tracking ✅ *built*
2. **Job card builder** ✅ *built* (`/job-card`)
3. **Drum sticker generator** — per-drum print: drum number, size, length, consignee address, BIS/ISI logo ❌ *not built*
4. **Dispatch checklist** ✅ *built* (`/dispatch`)

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.9**, App Router | ⚠️ Read `node_modules/next/dist/docs/` before writing routing code — this version has breaking changes vs. training data |
| UI | **React 19.2.4** | |
| Language | **TypeScript 5**, strict | |
| Styling | **Tailwind v4** + semantic tokens | No raw hex/rgb/hsl, no arbitrary values, no inline styles |
| Components | **Radix UI** primitives + shadcn-style wrappers in `components/ui/` | |
| Icons | **Lucide** only | No emoji as icons |
| State | **Zustand** (session), **TanStack Query** (server state) | |
| Forms | react-hook-form + Zod | |
| Tables | TanStack Table |
| Motion | Framer Motion |
| Drag & drop | dnd-kit (kanban boards) |
| Tests | `node --test` + `tsx` — **no Jest/Vitest** | `npm test` → `node --import tsx --test "lib/**/*.test.ts"` |
| PDF | **Hand-rolled writer** in `lib/domain/pdf.ts` | ~200 lines emitting raw PDF content streams. No library. |

**Current state: 210 tests passing, 0 failing.** ~116 TS/TSX files.

### Commands
```bash
npm run dev      # next dev
npm run build    # next build
npm run lint     # eslint
npm test         # node --import tsx --test "lib/**/*.test.ts"
npx tsc --noEmit # typecheck
```

**Known pre-existing failures** (not yours, do not be alarmed): 4 type errors across `app/(app)/approvals/page.tsx` and `app/(app)/dispatch/DispatchClient.tsx`, plus 1 lint error in the latter.

---

## 4. Architecture

### The layering rule
```
app/(app)/**/page.tsx        pages — call lib/services ONLY
        ↓
lib/services/index.ts        service layer — RBAC, orchestration
        ↓
lib/adapters/adapter.ts      IDataAdapter interface
        ↓
lib/adapters/mock-adapter.ts localStorage-backed implementation
```

**Pages never call adapters, connectors, `fetch`, or `localStorage` directly.** The adapter interface is generic over a `CableStore` shape (23 collections: specs, customers, inquiries, quotes, orders, gtps, jobCards, rawMaterialChecks, finishedCableQc, machineIncidents, inspectionReports, dispatches, invoices, compliance, activity, signals, approvals, users, integrations, syncLogs, org, policies, materials). Swapping `mock-adapter` for a real backend is meant to be the only change required.

**Everything currently persists to `localStorage`.** This is a proof-of-concept constraint, not a design position. It is the single biggest thing standing between this and production.

### Other conventions from `BUILD_BRIEF.md`
- Dates via `lib/domain/clock.ts` and `format.ts` — **no `new Date()` in pages**
- Money via `MoneyCell` / `formatINR` — no inline `toLocaleString`
- Every data view needs loading, empty, error, and content states
- RBAC via `can`, `requiresApproval`, `<Can>` — Owner can intervene; team roles see only their slice
- Roles: Owner, Sales, Operations, Accounts

### Visual direction
Linear/Vercel-style enterprise operational UI. White light mode, jet-black dark mode, **orange** primary action/active, purple as a rare secondary highlight. Dense, calm, border-led surfaces — no decorative gradients or glows. Machine data (IDs, GSTINs, money, cable codes, e-way bill numbers) is set in mono.

---

## 5. The GTP engine — the technically interesting part

Everything else in this app is competent CRUD. This is the part with real domain complexity, and where a new contributor is most likely to cause harm without realising it.

### Three-layer cascade
```
IS standards  →  customer profile quirks  →  order-level overrides
```
Most specific wins. Three profiles exist: WBSEDCL (West Bengal), UHBVN/DHBVN (Haryana), Navya (self-generated, Maharashtra).

### Four derivable cable types
| Type | Standard | Engine |
|---|---|---|
| AB (aerial bunched) | IS 14255:1995 | `derive.ts` |
| LT XLPE power | IS 7098-1:2025 | `derive-lt.ts` + `derive-lt-fields.ts` |
| LT PVC control | IS 1554-1:1988 | same |
| Solar DC | IS 17293:2020 | `derive-solar-fields.ts` |

Selecting a different cable type produces a **genuinely different field schedule**, not the same fields with different numbers. An LT GTP has an armour and inner sheath; an AB GTP has a messenger and a street-light core. The field keys differ by design.

### Field model
```ts
interface ResolvedField {
  key: string;              // "power.insulationThickness"
  label: string;
  value: string | number;
  tag: "LOOKUP" | "CALC" | "CHOICE" | "QUIRK" | "FIXED" | "MANUAL";
  source: "is-table" | "works-data" | "profile" | "order" | "override" | "calc";
  trace: string;            // "IS 8130:2013, Table 2, 70 sq mm Class 2"
  editable: boolean;
  override?: { previous; reason; by; at };
  gap?: boolean;            // engine couldn't source it — blocks a real GTP
  tolerance?: FieldTolerance;
}
```

`trace` is not a nicety. Every number on a legally-binding document must be answerable to "where did this come from", and the trace is that answer.

### The tolerance column (most recent work)
Every field carries a mandatory tolerance. Printed in engineering notation, and **the sign carries meaning**:

- `−16.7%` — one-sided. The IS thickness clauses set a *floor* and no ceiling; a `±` here would tell an inspector a thicker wall is non-conforming, which no standard says.
- `±3%` — a genuine two-way band (mass, drum length).
- `N/A` — an explicit answer with a stated reason, never a blank. On a document that gets stamped, an empty cell is ambiguous between "does not apply" and "nobody filled this in".

Six tolerance rules are encoded across four standards, in **three distinct formula shapes**. Four look identical (`t − (0.1 + 0.1·t)`) and the IEC pair is algebraically the same rule written multiplicatively (`0.9t − 0.1`) — but IS 17293 §6.3 uses **0.15** where the adjacent §5.3 uses 0.1. Collapsing them into one helper would silently widen every solar sheath tolerance by half. Tests exist specifically to make that refactor fail loudly.

`ToleranceOrigin` (`is-rule` | `works-estimate` | `customer` | `manual` | `not-applicable`) is deliberately **not** `FieldSource`. A works manufacturing spread (mass ±3%) must never be presentable as a standards acceptance limit — an inspector can reject a drum against the latter and not the former.

### Design rules that have already caught real bugs
1. **No-fallback lookups.** A missing standards row throws `StandardsLookupError` rather than defaulting. This has caught three genuine bugs, including an AB size offered with no valid messenger pairing in IS 14255.
2. **Never invent a value.** If the standard doesn't say, the system says it doesn't know. An invented `±5%` on AB insulation thickness survived in the codebase for weeks before being caught — it matched no clause in IS 14255.
3. **`works-data` ≠ `is-table`.** IS 8130 specifies *no conductor dimensions at all* for Class 1/2 (§3.2 — conformance is by resistance). Yet buyer schedules ask for strand count and conductor diameter. Those come from works construction data and are labelled as such. Calling them an IS lookup is a provenance claim that collapses under inspection.
4. **Append-only audit log.** No update, no delete. Corrections are `amend` entries. An audit log that can be rewritten is not an audit log.
5. **Build-plan D10: override reasons never print.** They are internal operational context ("customer asked verbally") and must not reach the buyer. A test serialises the whole PDF document and asserts reason text appears nowhere.

### The PDF writer — read this before touching it
`lib/domain/pdf.ts` emits raw PDF content streams by hand. Constraints:
- Page 595pt wide, 42pt margins → `CONTENT_WIDTH = 511`, but **every caller uses widths summing to 514** (de-facto repo budget)
- Chars-per-line is derived as `width / 5.6`
- `headers`, `widths`, and every row must change **together**. A mismatch used to emit the literal string `undefined` as a coordinate — a malformed content stream, not a layout glitch. Now guarded, with tests.

`SECTION_PLAN` in `pdf-document.ts` keys on `mfr. cable. power. messenger. streetLight. fin. drum. mark. cert.` — note there is **no `lt.` or `solar.` prefix**, so those two cable types render entirely through the "Other particulars" table. That is a wart worth knowing about.

---

## 6. Repository map

```
app/
  (auth)/login/
  (app)/
    dashboard/  sales/  quote/[quoteId]/  contacts/  compliance/
    orders/  job-card/  dispatch/  accounting/  approvals/
    integrations/  settings/  records/[recordId]/
    gtp/          gtp/new/  gtp/review/  gtp/standards/
lib/
  domain/
    gtp/          ← the derivation engine (see §5)
      derive.ts             AB engine
      derive-lt.ts          LT build-up chain
      derive-lt-fields.ts   chain → ResolvedField[]
      derive-solar-fields.ts
      cable-types.ts        registry: which types are derivable, what blocks the rest
      profiles.ts           customer quirks
      templates.ts          saved sheet shapes
      validate.ts           cross-field checks; re-computes CALC fields independently
      audit-log.ts          append-only override trail
      tolerance.ts          tolerance formatters
      pdf-document.ts       ResolvedField[] → PdfDocument
    standards/    ← encoded IS/IEC tables, one module per standard
    pdf.ts        ← hand-rolled PDF writer
  services/       ← the ONLY thing pages may call
  adapters/       ← IDataAdapter + localStorage mock
  rbac/  store/  seed/  integrations/  hooks/
components/
  ui/  domain/  pipeline/  shell/
```

Documentation: `BUILD_BRIEF.md` (build conventions, page ownership), `AGENTS.md`/`CLAUDE.md` (the Next.js 16 warning), and the planning corpus in `../cable os plans/` — including `foundation/architecture.md`, `data-models.md`, `rbac.md`, `integration-layer.md`, and `kamble-meeting-improvements.md`.

---

## 7. Honest status

### Solid
- Four cable types derive end-to-end from encoded standards
- 210 tests, including cross-engine invariants and provenance guards
- Three-layer cascade with full traceability
- Append-only audit trail
- PDF generation for all types
- Template save/reload

### Known gaps
| Gap | Impact |
|---|---|
| **`localStorage` is the only persistence** | Nothing survives a browser clear. Audit log and templates included. This is the top blocker for production. |
| **All standards datasets are `status: "draft"`** | Every encoded table awaits human row-by-row verification against the source PDF. 7 modules affected. |
| **16 unverified works-data rows** | Conductor dimensions Navya must confirm from their own construction data. |
| **Templates only fully round-trip for AB** | LT/solar restore type + customer, but not construction from the designation string. |
| **Drum sticker generator not built** | One of four features the client explicitly asked for. |
| **`tolerance.iec` validation rule declared but unimplemented** | `cable-types.ts:245`. Wiring it means deciding when a solar cable is governed by IEC rather than IS — a standards question, not a UI one. |
| **IEC 62930 / EN 50618 dimensional tables not held** | Only clauses are encoded; the supplied PDFs were preview extracts ending at page 12. `SOLAR_TABLES_HELD = false`. |
| **No auth in this branch** | An Auth0 login exists on `test-product` (see below). |
| Pre-existing type/lint errors | `approvals/page.tsx`, `dispatch/DispatchClient.tsx` |

### ⚠️ Branch divergence — read before pushing
This branch (`feat/gtp-tolerance-column`) is **34 commits ahead of and 15 behind** `origin/test-product`. The remote has since gained an Auth0 login, an `app/(app)/` → `app/(protected)/` restructure, and an AppShell refactor. **13 files overlap.**

The one to watch is `lib/services/types.ts`. It carries a mirror of `FieldTolerance`, and `derivedFields` is assigned there from a *variable*, not an object literal — so TypeScript's excess-property check does not fire, and an unmirrored member is **silently dropped from every saved record with no compile error**. A round-trip test pins this. Run the suite after any merge; do not trust the compiler on that file.

---

## 8. Where to take it next

**Highest leverage, roughly in order:**

1. **Real backend.** Swap `mock-adapter` for a server. The `IDataAdapter` interface was built for exactly this. Until then the audit trail is not an audit trail — it lives in one browser.
2. **Verify the standards corpus.** Every dataset is `draft`. This needs a human with the PDFs, not an agent. Build tooling that makes row-by-row verification fast and records who verified what.
3. **Drum sticker generator.** Explicitly requested, well-scoped, reuses the existing PDF writer.
4. **Inspection scheduling.** The 10-day call-ahead constraint is the client's sharpest operational pain. Predicting production completion and prompting the call at the right moment is genuinely valuable and nobody else does it.
5. **Finish template round-tripping** for LT and solar.

**Ideas worth exploring:** GTP diffing across revisions (boards issue amendments); learning a customer's quirks from their past approved GTPs rather than hand-coding profiles; capturing inspector findings against specific drums so failures trace back to a production batch; multi-tenant support since the pitch to the second manufacturer is the same product.

---

## 9. Working notes for whoever picks this up

- **Read `node_modules/next/dist/docs/` before writing routing code.** Next.js 16 differs from training data. This is stated in `CLAUDE.md` and is not optional.
- **This is a git repository** despite what an environment probe may report. A stray `git checkout <file>` here discards uncommitted work — it has already happened once in this project.
- **Never fabricate a standards value.** If the clause is not in hand, say so and encode the gap explicitly (`gap: true`, `blockedBy`, a `SOLAR_MISSING_TABLES`-style constant). The codebase has a strong existing habit of naming exactly what is missing and why; match it.
- **Read the module header comments.** They explain *why* rather than *what*, and several encode hard-won corrections — the IS 8130 dimensions story, the IS 17293 §5.3-vs-§6.3 coefficient trap, the D10 reason boundary. They will save you from repeating mistakes that have already been made and fixed here.
