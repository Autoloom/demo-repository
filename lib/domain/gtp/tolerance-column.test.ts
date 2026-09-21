/**
 * Cross-engine guarantees about the tolerance column.
 *
 * Three rules hold across all three cable types, and all are about honesty rather than arithmetic:
 *
 *   1. Tolerance is a MANDATORY input. Every field carries one; where no standard specifies a
 *      tolerance the answer is an explicit "N/A" with a stated reason, never a blank. Conductor
 *      resistance is already a maximum (IS 8130 §3.2), overall diameter is explicitly
 *      informational (IS 17293 Tables 1/2), armour wire tolerance lives in IS 3975 which this
 *      system does not hold. Each of those is a reason, and each is recorded.
 *
 *   2. The SIGN carries meaning. A "−16.7%" is a one-sided limit because the IS thickness
 *      clauses set a floor and no ceiling; a "±3%" is a genuine two-way band. Printing ± on a
 *      one-sided rule would assert an upper limit no standard imposes.
 *
 *   3. A tolerance never overstates its own authority. A works manufacturing spread must not be
 *      presentable as a standards acceptance limit, because an inspector can reject a drum
 *      against the latter and not against the former.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { GtpDerivedField } from "@/lib/services/types";

import { constructionFromSelection, defaultSelection } from "./compose-size";
import { deriveFields } from "./derive";
import { deriveLtFields } from "./derive-lt-fields";
import { deriveSolarFields } from "./derive-solar-fields";
import type { ResolvedField } from "./types";

const ab = (quirks = {}) => deriveFields(constructionFromSelection(defaultSelection()), quirks);
const lt = () =>
  deriveLtFields({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
const pvc = () =>
  deriveLtFields({ standard: "IS1554-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
const solar = () =>
  deriveSolarFields({ csaSqMm: 4, directlyConnectedToModules: true, installationMethod: "free-in-air", ambientC: 40 });

const everyEngine = (): [string, ResolvedField[]][] => [
  ["AB", ab()],
  ["LT XLPE", lt()],
  ["LT PVC", pvc()],
  ["solar", solar()],
];

const find = (fields: ResolvedField[], key: string) => fields.find((f) => f.key === key);

test("a standards tolerance always cites the clause it came from", () => {
  // An `is-rule` tolerance is a claim that a published standard sets this limit. Without a
  // clause reference nobody can check the claim, which makes it indistinguishable from a guess.
  for (const [name, fields] of everyEngine()) {
    for (const f of fields) {
      if (f.tolerance?.origin !== "is-rule") continue;
      assert.match(
        f.tolerance.trace,
        /§\d/,
        `${name}: ${f.key} claims a standards tolerance but cites no clause`,
      );
    }
  }
});

test("a works estimate is never dressed up as a standards limit", () => {
  const fields = ab();
  // IS 14255 specifies no mass tolerance at all — these bands are our own manufacturing spread.
  assert.equal(find(fields, "power.massPerKm")?.tolerance?.origin, "works-estimate");
  assert.equal(find(fields, "fin.totalMass")?.tolerance?.origin, "works-estimate");
  // A drum length band is negotiated with the buyer, not published by BIS.
  assert.equal(find(fields, "drum.length")?.tolerance?.origin, "customer");

  // And none of them may carry a clause reference, which would imply standards backing.
  for (const key of ["power.massPerKm", "fin.totalMass", "drum.length"]) {
    assert.doesNotMatch(find(fields, key)?.tolerance?.trace ?? "", /§/, `${key} cites a clause it has no right to`);
  }
});

test("no tolerance is invented where the standards specify none", () => {
  // Each of these states N/A for a stated reason. N/A is an ANSWER — the parameter was
  // considered and has no meaningful tolerance — not a blank nobody filled in.
  const cases: [string, string, string][] = [
    ["AB", "power.maxDcResistance", "already a maximum — IS 8130 §3.2"],
    ["AB", "power.compactedDia", "works construction data, no published limit"],
    ["AB", "fin.overallDia", "an approximation with no stated spread"],
    ["solar", "solar.overallDia", "indicative value for information only"],
    ["solar", "solar.currentRating", "a rating, not a dimension"],
  ];
  const byName = Object.fromEntries(everyEngine());
  for (const [engine, key, why] of cases) {
    const field = find(byName[engine] ?? [], key);
    assert.ok(field, `${engine}: ${key} is missing entirely`);
    assert.equal(field?.tolerance?.origin, "not-applicable", `${engine}: ${key} invented a tolerance — ${why}`);
    assert.equal(field?.tolerance?.value, "N/A");
  }
});

test("tolerance is a mandatory input — every field on every type carries one", () => {
  // The rule the whole column rests on: there is no such thing as a row without an answer.
  for (const [name, fields] of everyEngine()) {
    for (const f of fields) {
      assert.ok(f.tolerance, `${name}: ${f.key} has no tolerance at all`);
      assert.notEqual(f.tolerance?.value.trim(), "", `${name}: ${f.key} carries an empty tolerance`);
    }
  }
});

test("an N/A always says why it does not apply", () => {
  // "N/A" with no reason is indistinguishable from a field nobody looked at.
  for (const [name, fields] of everyEngine()) {
    for (const f of fields) {
      if (f.tolerance?.origin !== "not-applicable") continue;
      assert.ok(f.tolerance.trace.trim().length > 10, `${name}: ${f.key} says N/A without explaining why`);
    }
  }
});

test("the sign distinguishes a one-sided limit from a symmetric band", () => {
  // This is the engineering-notation contract, and it is not cosmetic. The IS thickness clauses
  // set a floor with NO upper limit, so a "±" on one of them would tell an inspector that a
  // thicker-than-nominal wall is non-conforming — which the standard does not say.
  for (const [name, fields] of everyEngine()) {
    for (const f of fields) {
      const tol = f.tolerance;
      if (!tol || tol.origin === "not-applicable" || tol.origin === "manual") continue;

      if (tol.origin === "is-rule") {
        assert.match(tol.value, /^−\d+\.\d%$/, `${name}: ${f.key} is a one-sided IS floor but reads "${tol.value}"`);
        assert.ok(!tol.value.includes("±"), `${name}: ${f.key} claims an upper limit the standard does not set`);
      } else {
        // Mass and drum length genuinely vary in both directions.
        assert.match(tol.value, /^±/, `${name}: ${f.key} is a symmetric band but reads "${tol.value}"`);
      }
    }
  }
});

test("the percentage is computed per row, not applied as a blanket figure", () => {
  // The IS rule is absolute — t − (0.1 + 0.1·t) — so the equivalent percentage varies with
  // thickness. Two different nominals must not produce the same figure.
  const thin = deriveSolarFields({ csaSqMm: 1.5, directlyConnectedToModules: true, installationMethod: "free-in-air", ambientC: 40 });
  const thick = deriveSolarFields({ csaSqMm: 400, directlyConnectedToModules: false, installationMethod: "free-in-air", ambientC: 40 });
  const pctOf = (f: ResolvedField[]) => find(f, "solar.insulationThickness")?.tolerance?.value;

  assert.notEqual(pctOf(thin), pctOf(thick), "the same percentage was applied to different nominals");
  // The fixed 0.1 mm term dominates at small sizes, so thin walls get the WIDER percentage.
  const num = (s?: string) => Number((s ?? "").replace(/[−%]/g, ""));
  assert.ok(num(pctOf(thin)) > num(pctOf(thick)));
});

test("both AB insulated cores carry the same §7.3 floor", () => {
  // The street-light core used to print bare while the power core carried an invented "±5%".
  // One clause governs both.
  const fields = ab();
  for (const key of ["power.insulationThickness", "streetLight.insulationThickness"]) {
    const tol = find(fields, key)?.tolerance;
    assert.equal(tol?.origin, "is-rule", `${key} lost its standards tolerance`);
    assert.match(tol?.trace ?? "", /IS 14255[^§]*§7\.3/, `${key} does not cite §7.3`);
  }
});

test("no dimension smuggles a tolerance back into its value string", () => {
  // The value column states what the cable IS; the tolerance column states how far it may vary.
  // A "±" or "(Min)" in the value means the two have been conflated again.
  for (const [name, fields] of everyEngine()) {
    for (const f of fields) {
      const value = String(f.value);
      assert.doesNotMatch(value, /±/, `${name}: ${f.key} has a band inside its value: "${value}"`);
      assert.doesNotMatch(value, /\(Min\)/i, `${name}: ${f.key} has phrasing inside its value: "${value}"`);
    }
  }
});

test("the two LT standards cite their own clause, not each other's", () => {
  // IS 7098-1 puts the insulation thickness tolerance at §10.3; IS 1554-1 at §9.3. Citing one
  // for the other sends an inspector to a clause about something else entirely.
  assert.match(find(lt(), "lt.insulation")?.tolerance?.trace ?? "", /IS 7098[^§]*§10\.3/);
  assert.match(find(pvc(), "lt.insulation")?.tolerance?.trace ?? "", /IS 1554[^§]*§9\.3/);
});

test("LT sheath thicknesses carry no floor, because they are already minima", () => {
  // The protective-coverings tables publish sheath values as minima. A floor on a minimum would
  // be a second, lower limit that no standard states.
  for (const key of ["lt.innerSheath", "lt.outerSheath"]) {
    const field = find(lt(), key);
    if (!field) continue; // not every construction has both
    assert.equal(
      field.tolerance?.origin,
      "not-applicable",
      `${key} gained a floor on a value that is already one`,
    );
  }
});

test("a tolerance survives being persisted onto a GTP record", () => {
  // Tolerance-specific persistence. The GENERAL guarantee — that every ResolvedField member
  // survives, enumerated rather than spot-checked — now lives in lib/services/types.test.ts,
  // alongside the alias that makes it true. This keeps the tolerance-shaped check next to the
  // tolerance tests.
  const fields = ab();
  const persisted: GtpDerivedField[] = fields;
  const roundTripped: GtpDerivedField[] = JSON.parse(JSON.stringify(persisted));

  const insulation = roundTripped.find((f) => f.key === "power.insulationThickness");
  assert.equal(insulation?.tolerance?.value, "−16.7%", "the tolerance was lost in persistence");
  assert.equal(insulation?.tolerance?.origin, "is-rule");
  assert.match(insulation?.tolerance?.trace ?? "", /§7\.3/);

  // An N/A must survive as an N/A rather than degrading to a blank.
  const resistance = roundTripped.find((f) => f.key === "power.maxDcResistance");
  assert.equal(resistance?.tolerance?.value, "N/A");
  assert.equal(resistance?.tolerance?.origin, "not-applicable");
});

test("customer phrasing changes the trace, never the number or its provenance", () => {
  const plain = find(ab(), "power.insulationThickness");
  const phrased = find(ab({ tolerancePhrasing: "min", customerName: "WBSEDCL" }), "power.insulationThickness");

  assert.equal(plain?.value, phrased?.value);
  assert.equal(plain?.tolerance?.value, phrased?.tolerance?.value);
  // Provenance describes where the VALUE came from — an IS table, in both cases.
  assert.equal(phrased?.tag, "LOOKUP");
  assert.equal(phrased?.source, "is-table");
  assert.equal(phrased?.tolerance?.origin, "is-rule");
  // The customer's convention is recorded, just not in a way that alters the specification.
  assert.match(phrased?.tolerance?.trace ?? "", /WBSEDCL/);
});
