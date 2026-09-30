/**
 * Quote module: refusing nonsense, and never overwriting a quote.
 *
 * Both were found by trying to break it. The pricing accepted a length of -500 and produced a
 * negative quote; new quotes drew a random three-digit number and a collision silently replaced an
 * existing quote.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { adapter } from "../adapters/mock-adapter";
import { seedData } from "../seed/data";
import { quotesService } from "../services";
import type { Actor, CableStore, Quote } from "../services/types";
import { commercialProblems, DEFAULT_COST_BUILD_UP } from "./costing";
import { deriveLtFields } from "./gtp/derive-lt-fields";
import { costCable } from "./gtp/quote-costing";
import { specFromFields } from "./gtp/spec-from-fields";
import { FIRST_QUOTE_SUFFIX, nextQuoteId, quotePrefix } from "./quote-number";

const actor: Actor = { id: "test-owner", name: "Test owner", role: "Owner" };

let store: CableStore;
beforeEach(() => {
  store = structuredClone(seedData);
  mock.method(adapter, "read", async () => structuredClone(store));
  mock.method(adapter, "write", async (next: CableStore) => {
    store = structuredClone(next);
    return structuredClone(store);
  });
});
afterEach(() => mock.restoreAll());

const good = { lengthM: 1000, metalRatePerKg: 0, overheadPerM: 0, buildUp: { ...DEFAULT_COST_BUILD_UP } };

// ── Pricing refuses nonsense ──────────────────────────────────────────────────

test("sensible numbers have nothing wrong with them, and so do the edges that are legitimate", () => {
  assert.deepEqual(commercialProblems(good), []);
  // 0 is "use the Materials table" for the metal rate and a legitimate margin; a metre is a metre.
  assert.deepEqual(commercialProblems({ ...good, buildUp: { ...good.buildUp, marginPct: 0 } }), []);
  assert.deepEqual(commercialProblems({ ...good, lengthM: 0.5 }), []);
  assert.deepEqual(commercialProblems({ ...good, buildUp: { ...good.buildUp, marginPct: 100 } }), []);
});

test("each way of entering rubbish is named", () => {
  const one = (patch: { lengthM?: number; metalRatePerKg?: number; overheadPerM?: number; buildUp?: Partial<typeof good.buildUp> }) =>
    commercialProblems({ ...good, ...patch, buildUp: { ...good.buildUp, ...(patch.buildUp ?? {}) } });
  assert.match(one({ lengthM: 0 })[0], /Length must be more than 0/);
  assert.match(one({ lengthM: -500 })[0], /Length must be more than 0/);
  assert.match(one({ lengthM: NaN })[0], /Length must be more than 0/);
  assert.match(one({ metalRatePerKg: -100 })[0], /metal rate cannot be negative/);
  assert.match(one({ overheadPerM: -1 })[0], /overhead cannot be negative/);
  assert.match(one({ buildUp: { marginPct: -20 } })[0], /Margin must be between 0% and 100%/);
  assert.match(one({ buildUp: { marginPct: 10000 } })[0], /Margin must be between 0% and 100%/);
  assert.match(one({ buildUp: { wastagePct: 250 } })[0], /Wastage must be between/);
  assert.match(one({ buildUp: { conversionPct: -5 } })[0], /Manufacturing & overhead must be between/);
  assert.match(one({ buildUp: { freightInr: -1 } })[0], /Freight cannot be negative/);
  assert.match(one({ buildUp: { drumCostInr: NaN } })[0], /drum cost cannot be negative/);
  assert.equal(one({ lengthM: -1, buildUp: { marginPct: 500 } }).length, 2, "every problem is reported, not just the first");
});

function cableSpec() {
  const config = { standard: "IS7098-1" as const, csaSqMm: 240, coreCount: 3.5, material: "AL" as const, armoured: true, armourForm: "formed-wire" as const, armourMethod: "A" as const };
  const fields = deriveLtFields(config).map((f) => (f.key === "mfr.isiLicence" ? { ...f, gap: false, value: "T" } : f));
  const spec = specFromFields({ specId: "S", config, productLine: "XLPE_POWER", armourForm: "formed-wire", fields, designation: "3.5Cx240" });
  assert.ok(!("gap" in spec));
  return spec as Exclude<typeof spec, { gap: true }>;
}

test("the costing will not produce a number for them — it used to give a negative quote", () => {
  const spec = cableSpec();
  const total = (commercial: typeof good) => costCable(spec, commercial, store.materials).lineTotalInr;
  assert.ok(total(good) > 900_000, "a real price for a real cable");
  for (const [label, bad] of [
    ["zero length", { ...good, lengthM: 0 }],
    ["negative length", { ...good, lengthM: -500 }],
    ["blank length", { ...good, lengthM: NaN }],
    ["negative metal rate", { ...good, metalRatePerKg: -100 }],
    ["negative margin", { ...good, buildUp: { ...good.buildUp, marginPct: -20 } }],
    ["margin of 10,000%", { ...good, buildUp: { ...good.buildUp, marginPct: 10000 } }],
  ] as const) {
    assert.throws(() => total(bad), Error, `${label} must not be priced`);
  }
  // …and the legitimate edges still price.
  assert.ok(total({ ...good, buildUp: { ...good.buildUp, marginPct: 0 } }) > 0);
});

// ── Quote numbers ─────────────────────────────────────────────────────────────

test("the next quote number is the next one in the month's series", () => {
  const sept = new Date("2026-09-15T10:00:00+05:30");
  assert.equal(quotePrefix(sept), "Q-2609-");
  assert.equal(nextQuoteId([], sept), "Q-2609-101", "the first of the month");
  assert.equal(nextQuoteId(["Q-2609-101", "Q-2609-102"], sept), "Q-2609-103");
  // Gaps are not refilled and the highest wins — a number, once used, is never reissued.
  assert.equal(nextQuoteId(["Q-2609-101", "Q-2609-140", "Q-2609-120"], sept), "Q-2609-141");
  assert.equal(FIRST_QUOTE_SUFFIX, 101);
});

test("other months, other prefixes and junk do not disturb the series", () => {
  const sept = new Date("2026-09-15T10:00:00+05:30");
  assert.equal(nextQuoteId(["Q-2608-999", "Q-2610-500", "INV-2609-777", "Q-2609-abc", "Q-2609-"], sept), "Q-2609-101");
  assert.equal(nextQuoteId(["Q-2609-101"], new Date("2026-10-01T09:00:00+05:30")), "Q-2610-101", "a new month restarts");
});

test("a run of quotes never repeats a number — the random scheme did, at about one in seven by a dozen", () => {
  const date = new Date("2026-06-23T09:00:00+05:30");
  const seen: string[] = [];
  for (let i = 0; i < 600; i++) seen.push(nextQuoteId(seen, date));
  assert.equal(new Set(seen).size, 600);
  // For reference, what the old scheme risked: 900 possible numbers, so after n quotes the chance
  // that some pair collided is 1 - Π(1 - i/900).
  const collision = (n: number) => 1 - Array.from({ length: n }, (_, i) => 1 - i / 900).reduce((a, b) => a * b, 1);
  assert.ok(collision(12) > 0.07 && collision(30) > 0.38, "the old risk was not theoretical");
});

// ── A new quote can never replace an existing one ─────────────────────────────

function aQuote(id: string): Quote {
  return { ...structuredClone(store.quotes[0]), id, notes: "mine" };
}

test("nextId reads what is actually stored, so it is always free", async () => {
  const id = await quotesService.nextId();
  assert.ok(!store.quotes.some((quote) => quote.id === id));
  // Seeded quotes are Q-2606-118…120 on the pinned June clock; the next is past them.
  assert.equal(id, "Q-2606-121");
  await quotesService.saveDraft(aQuote(id), actor, { isNew: true });
  assert.equal(await quotesService.nextId(), "Q-2606-122");
});

test("a NEW quote that lands on a taken number is refused, and the existing quote is untouched", async () => {
  const taken = store.quotes[0];
  const before = JSON.stringify(taken);
  await assert.rejects(quotesService.saveDraft(aQuote(taken.id), actor, { isNew: true }), /already exists — a new quote cannot replace it/);
  assert.equal(JSON.stringify(store.quotes.find((quote) => quote.id === taken.id)), before, "nothing was overwritten");
  assert.equal(store.quotes.filter((quote) => quote.id === taken.id).length, 1);
});

test("saving an existing quote still updates it in place", async () => {
  const quote = { ...store.quotes[0], notes: "revised" };
  await quotesService.saveDraft(quote, actor); // an update: no isNew
  assert.equal(store.quotes.find((entry) => entry.id === quote.id)?.notes, "revised");
  assert.equal(store.quotes.length, seedData.quotes.length);
});
