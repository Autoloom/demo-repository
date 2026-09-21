# Build plan — integrating the GTP generator and the quotation builder

> **Status:** ready to build. Every code reference verified against source on 2026-09-12.
> **Baseline:** `track-a/derived-mass-costing`, **280 tests passing**, 4 known type errors,
> 1 known lint error (all pre-existing — listed in §8).
> **Related:** `PRODUCT_CONTEXT.md` (domain), `PARALLEL_SPLIT.md` (track ownership).

---

## 1 · Why this integration, and what is wrong today

### 1.1 The two screens do not describe the same cable

| | Quote builder | GTP generator |
|---|---|---|
| Cable lives in | `CableSpec` in `store.specs` | four `useState` values |
| Has an identity | yes, an id | **no** |
| Persisted | yes | **never** |
| Fields are | **choices** from dropdowns | **derived** from IS tables |

The proof is one line:

```ts
specId: "",            // app/(app)/gtp/new/page.tsx:1119
```

A generated GTP stores an **empty** spec reference. The builder can *read* a spec — a loader was
added in WP-3 — but it never *writes* one, so it can consume a cable and never be the source of
one. That is why adding a link between the screens changed nothing: there was no shared object to
link to.

### 1.2 The direction runs the wrong way

The quote lets an operator choose what the standard derives. Verified against IS 7098-1:

| The quote offers | The standard derives | Evidence |
|---|---|---|
| `armour: "GI strip (GSS)"` | **round wire**, 2.5 mm | Table 6 keys the form to the calculated diameter under armour; every size tested resolves to round wire |
| `neutralSizeSqMm: 120` | Table 2, keyed to phase size | not a choice |
| `insulation`, `sheath`, `conductorClass`, `voltageGrade` | from the build-up chain | — |

It will also price cables that cannot be built. `3.5C × 16 sq mm` quotes without complaint; the
GTP refuses it outright:

```
StandardsLookupError: No row in IS7098-1 Table 2 for phaseSqMm = 16.
The standard does not cover this value — do not substitute a default.
```

**So the GTP generator owns the cable, and the quotation prices what it derives.**

### 1.3 Declared is not built

The works may build toward the bottom of the tolerance band to save metal while staying
conforming. The GTP declares nominal; the cable made is thinner; the quote must price what is
made or its margin is wrong.

Both documents are **bidding instruments** — they go to the buyer as part of a bid — so the build
target must never appear on either.

---

## 2 · Target flow

```
    ┌───────────────────────── GTP GENERATOR ─────────────────────────┐
    │  derive from IS tables → ResolvedField[]                        │
    │  writes  ──────────────────────────────────────────────┐        │
    └────────────────────────────────────────────────────────┼────────┘
                                                             ▼
                                                    CableSpec (store.specs)
                                                    · order inputs
                                                    · DERIVED values
                                                    · approx mass + dia
                                                             │
    ┌──────────────────── QUOTATION BUILDER ──────────────────┼────────┐
    │  reads /quote?specId=…                                  ◀        │
    │  BuildSpec: declared → built (within tolerance)                  │
    │  prices massAtBuilt × ₹/kg                                       │
    └──────────────────────────────────────────────────────────────────┘

    GTP PDF   : declares nominal          ← buyer sees
    Quote PDF : price                     ← buyer sees
    Internal  : build target, saving, who decided   ← never printed
```

One writer, one record, one direction.

---

## 3 · Step 1 — Expose the armour form structurally

**File:** `lib/domain/gtp/derive-lt.ts`

`useRoundWire` is already computed at `:238` from the standard's `roundWireOnly` flag, but the
form survives only inside a human-readable label:

```
label: "Armour round wire diameter"   value: 2.5
```

A mapper that parsed that string would break the first time the wording changed — and the wording
is a display string, not a contract.

**Do:** add `armourForm: "round-wire" | "formed-wire" | null` to the `LtDerivation` return.
`null` when unarmoured. No behaviour change; pure plumbing.

**Why first:** §4 cannot map `ArmourType` honestly without it.

**Done when:** `deriveLtCable(...).armourForm === "round-wire"` for 3.5C × 240 armoured.

---

## 4 · Step 2 — Resolved fields → CableSpec

**New:** `lib/domain/gtp/spec-from-fields.ts` + `spec-from-fields.test.ts`

This is the substance of the integration, not a formatting chore. **The derived values are the
wrong type for `CableSpec`:**

| `CableSpec` field | Type wanted | GTP derives | Mismatch |
|---|---|---|---|
| `insulation` | `"XLPE"` | `lt.insulation` = `1.70 mm` | material vs **thickness** |
| `armour` | `"GI round wire (GSW)"` | `lt.armour` = `2.50 mm` | type vs **diameter** |
| `cores` | `"3.5C"` | `cable.cores` = `"3½"` | format |
| `voltageGrade` | `"650/1100 V (1.1 kV)"` | `"1100 V a.c. / 1500 V d.c."` | format |

So the mapper takes **the construction config *and* the resolved fields** — the config carries
material, standard and armour form; the fields carry the derived dimensions. Neither alone is
enough.

### Signature

```ts
export function specFromFields(input: {
  specId: string;
  productLine: ProductLine;
  config: LtCableConfig;          // or the AB / solar equivalent
  armourForm: "round-wire" | "formed-wire" | null;   // from Step 1
  fields: ResolvedField[];
  designation: string;
}): CableSpec | { gap: true; reason: string };
```

### The two fields the GTP cannot derive

Both are real and must not be invented:

- **`conductorClass`** — an IS 8130 *input*, not an output. The engine is *told* Class 2; it does
  not conclude it. Carry through what the engine was asked for.
- **`flameClass`** — FR / FRLS / LSZH is a **buyer requirement**; no standard derives it. Default
  `"Standard"` and let the quote set it. It selects the sheath compound, so it changes the price —
  worth surfacing in the quote rather than hiding in a default.

### Enum mappings (verified against `lib/services/types.ts`)

```
armourForm "round-wire"  → "GI round wire (GSW)"
armourForm "formed-wire" → "GI strip (GSS)"
armourForm null          → "Unarmoured"
IS7098_1_RATED_VOLTAGE.acMaxV 1100 → "650/1100 V (1.1 kV)"
coreCount 3.5 → "3.5C"   (a float discriminator — never parseInt it)
```

### Also fill what nothing populates today

`approxOuterDiaMm`, `approxWeightKgPerKm` (from `fin.totalMass`, already derived by WP-1),
`technical`. These are declared on `CableSpec` and have always been empty.

### Refuses rather than guesses

Any field carrying `gap: true` → **no spec**. A cable the standard cannot fully describe must
never become a priced line.

**Done when:** a spec built from a 3.5C × 240 derivation carries `"GI round wire (GSW)"` — the
*derived* form, not the preset's `"GI strip (GSS)"` — and `neutralSizeSqMm: 120` from Table 2.

---

## 5 · Step 3 — The GTP generator writes the cable

**File:** `app/(app)/gtp/new/page.tsx`

1. **Upsert the spec once the cable derives cleanly** — via the existing `specsService.upsert`,
   *before* generate, not only on it. A quote is frequently needed before a GTP is stamped, so
   the cable must be addressable first.
2. **Replace `specId: ""` (`:1119`)** with the real id.
3. **Add a "Create quote" action** linking to `/quote?specId=…`. Shown only when the cable
   derives without gaps — a gapped cable must not reach a price.
4. **Remove the WP-3 loader** — `builderInputsFromSpec` and its effect. Two writers for one record
   is exactly the conflict this removes.

**Done when:** generating a GTP produces a stored `CableSpec`, and `gtp.specId` resolves to it.

---

## 6 · Step 4 — BuildSpec: declared vs built

**New:** `lib/domain/gtp/build-spec.ts` + test

```ts
interface BuildLayer {
  layer: string;
  declaredMm: number;        // what the GTP states
  floorMm: number | null;    // null = no headroom
  builtMm: number;           // defaults to declaredMm
  clause: string;            // e.g. "IS 7098-1 §10.3"
}
interface BuildSpec {
  specId: string;
  layers: BuildLayer[];
  massAtDeclaredKgPerKm: number;
  massAtBuiltKgPerKm: number;
}
```

### Floors come from the tolerance column, not a new table

`tolerance.origin === "is-rule"` → a published floor exists.
`origin === "not-applicable"` → the value **is** the floor (a published minimum).

No second source of truth for what a standard permits, and no hardcoded list of which layers
flex — that list would drift from the standards the moment a dataset changed.

### Be honest about the size of this lever

Measured on 3.5C × 240 armoured:

| Layer | kg/km | Share | Headroom |
|---|---|---|---|
| Armour | 2428 | 41.8% | none — dimension derived from diameter |
| Conductor | 1944 | 33.5% | none — CSA fixed by IS 8130 resistance |
| Outer sheath | 535 | 9.2% | none — published minimum |
| Reduced neutral | 324 | 5.6% | none |
| **Insulation** | **283** | **4.9%** | **−15.9%** (1.70 → 1.43 mm) |
| Inner sheath | 125 | 2.2% | none — published minimum |

Building insulation to its floor saves **48 kg/km — 17% of the insulation, 0.83% of the cable**.
Three-quarters of the mass cannot move. Real, worth having, and not a headline number.

### Rejects, never clamps

A `builtMm` below `floorMm` is refused with the clause named. Silently correcting a
non-conforming target would hide the one thing that must not be hidden on a document an inspector
measures drums against.

Mass at both thicknesses reuses `deriveLtMass` (WP-1), so a saving is computed by the same code
that prices the cable.

---

## 7 · Step 5 — The quotation prices the built cable

**File:** `app/(app)/quote/QuoteBuilderClient.tsx`

- **Accept `?specId=`** and seed a `LineDraft` from the stored cable rather than a family preset.
- **Derived fields stay editable** — they arrive as the starting point, not a lock. Each shows its
  clause, so an operator changing one can see what they are contradicting.
- **Price `massAtBuiltKgPerKm`.** Show the saving against declared in kg and rupees, on screen.
- **Audit a build change** with `appendAuditEntry`, exactly as a value override is audited.
- **Remove the WP-3 GTP button** — the reverse direction goes.

The hook point is `lineFromDraft` (`:376`), which already takes an optional `existing` carrying a
`specId`; seeding from a stored spec follows the same shape.

---

## 8 · Step 6 — Keep the build target off both documents

**File:** the existing D10 test in `lib/domain/gtp/field-visibility.test.ts`

A test already serialises the whole GTP document and asserts override reasons never appear —
build-plan D10. Extend it so a **below-nominal build target** is asserted absent from *both* the
GTP and the quotation.

This is the bidding-instrument guarantee. Both documents go to the buyer; the build target is a
commercial position. The test must fail loudly if either ever leaks it.

---

## 9 · Verification

```bash
npx tsc --noEmit && npm run lint && npm test
```

- **Tests: ≥280, zero failing.**
- **Known pre-existing, not yours:** 4 type errors in `app/(app)/approvals/page.tsx` and
  `app/(app)/dispatch/DispatchClient.tsx`; 1 lint error (`InspectionPanel` undefined) in the
  latter. `/dispatch` is also broken in the browser for the same reason.

### New tests

| Test | Pins |
|---|---|
| Spec carries the **derived** armour form | the §1.2 defect — preset said GI strip, standard says round wire |
| `neutralSizeSqMm` = IS 7098-1 Table 2 value | a derived field is not a choice |
| `3.5C × 16 sq mm` yields no spec | an unbuildable cable can never be quoted |
| Only `is-rule` layers expose a floor | sheaths and conductor report none |
| `builtMm` below floor is rejected, clause named | never clamp a non-conforming target |
| mass(built) < mass(declared), matching the annulus | the saving is real arithmetic |
| A generated GTP's `specId` resolves to a stored cable | `specId: ""` is gone |
| Build target absent from both documents | the bidding-instrument guarantee |

### By hand on the demo

1. `/gtp/new` → LT power, 3.5C × 240 aluminium, armoured
2. Confirm armour reads **2.5 mm round wire**, neutral **120 sq mm**
3. **Create quote** → the line carries those values, not preset defaults
4. Move insulation 1.70 → 1.50 mm → price falls, saving shown
5. Try 1.40 mm → **rejected**, §10.3 named
6. Generate both PDFs → neither mentions the build target

---

## 10 · Demo mechanics that have already cost time

**Stale browser bundles.** A UI change once appeared missing for three rounds while the server was
serving correct bytes — confirmed by fetching the chunk over HTTP and grepping it. Turbopack chunk
URLs are stable, so a hard reload does not reliably evict them. **Verify UI changes in a private
window**, and treat "I don't see it" as a caching question before a code question.

**Two servers.** A dev server from the main tree runs on **:3002** serving Track B's uncommitted
work; a worktree server runs on **:3001** serving Track A only. Know which is in front of you.

---

## 11 · Out of scope, with reasons

- **Conductor and sheath thinning** — neither has headroom. Offering a control that cannot move
  implies the standard allows something it does not.
- **Automatic optimisation** — the system shows headroom and prices the decision; a person makes
  it. Auto-thinning every quote to the floor is a commercial policy, not a default to assume.
- **AB and solar quoting** — a flat `CableSpec` cannot express a phase + messenger + street-light
  bundle. LT power and control integrate end to end; the rest needs the discriminated
  `Construction` union, which is the successor to this work.
- **Cost modelling beyond mass × rate** — labour, wastage and overhead stay entered inputs. A
  partial cost model is confidently wrong in a way that loses tenders.

---

## 12 · Risks

| Risk | Mitigation |
|---|---|
| The mapper silently mis-maps an enum and a wrong armour type reaches a bid | Tests assert the *derived* value on a size where preset and standard genuinely differ |
| `conductorClass` / `flameClass` get invented rather than carried | Both named explicitly in §4; neither is derivable and neither may be guessed |
| Build target leaks onto a customer document | §8 extends the existing D10 serialisation test to both documents |
| A non-conforming build target is clamped instead of refused | §6 rejects with the clause named; a test pins it |
| Standards data is still `status: "draft"` | Unchanged standing risk. Integrating two documents onto one engine multiplies the blast radius of a wrong row — verification must run in parallel, not after |
