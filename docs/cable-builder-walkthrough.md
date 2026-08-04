# Cable Builder — team walkthrough

**Status:** on branch `review/cable-builder-abc` ([PR #4](https://github.com/Autoloom/demo-repository/pull/4)) · review only, not merged
**Built from:** a real approved GTP — WBSEDCL / RDSS Project-II, Navya Cables via KRYFS, provisionally approved 14 May 2024

---

## 1. What this is

A **cable builder covering the product range from our brochure** — pick a family, spec the cable, cost it live, and (for ABC) issue the GTP.

The family picker lists **all twelve product lines** with honest status:

| Status | Meaning | Lines |
|---|---|---|
| ✅ **Ready** | Fully modelled, costed on approved weights | Aerial bunched |
| ◐ **Costing only** | Costs correctly, but no verified weight table yet | LT XLPE · LT PVC power · Control |
| ○ **Not modelled** | Listed, with exactly what's needed to build it | The other eight |

Unbuilt lines are *visibly* unbuilt — they say what's missing rather than quietly producing a wrong quote. Adding a line is a data edit in `lib/domain/families.ts`.

> **Highest-value next task:** the brochure's dimension tables (XLPE 3.5-core 25/16→500/240, control 1.5/2.5 sq mm) carry approved kg/km per size. Transcribing those moves LT XLPE / LT PVC / Control from *costing only* to *ready*.

Aerial bunched has its own editor rather than sharing one form, because the families are genuinely different things:

| | Armoured LT/HT (existing Quote Builder) | ABC (this) |
|---|---|---|
| Standard | IS 1554 / IS 7098 | IS 14255 |
| Structure | one conductor size × N identical cores | 3 × 70 power **+** 1 × 50 messenger **+** 1 × 16 street-light |
| Has | armour, inner + outer sheath | no armour, no overall sheath |

One form can't serve both without lying about one of them. So "cable family" is a real branch in the schema.

---

## 2. See it running

```sh
npm install
npx next dev -p 3456
```

Then open **http://localhost:3456/login** → sign in (Owner is pre-filled) → **Cable Builder** in the sidebar.

> ⚠️ If the dev server takes minutes to boot, the repo is on an **iCloud-synced folder**. Move it to e.g. `~/dev/` — boot goes from ~126 minutes to under a second. Same code.

---

## 3. Five-minute walkthrough

**① The cable identity** — designation and size are *generated*, never typed. Change any core and they regenerate.

**② The Cores table** — the heart of it. Each row is a different conductor with its own size, strand count, dia, insulation and rating. Add or remove cores from the buttons above.

**③ Now change something.** Set the Power core's **SQ MM** from `70` to `95` and watch three things happen at once:

- a banner appears: *"1 change from the approved GTP — Re-approval is required before manufacturing to this spec"*
- the edited cell highlights amber
- the **Source** badge flips `Approved` → `Estimated`, and the cost jumps

That third one matters most. The GTP's approved conductor mass (196 kg/km) was approved **for 70 sq mm**. At 95 sq mm it's meaningless, so the app throws it away rather than quietly quoting a 95 sq mm cable at 70 sq mm metal cost. *(This was a live bug, caught in testing: weight sat at 0.588 kg/m and the total didn't move. Now 0.926 kg/m, ₹146 → ₹230/m.)*

**④ Hit "Reset to approved"** to snap back to the approved spec.

**⑤ Order panel** — drum length and count, metal rate (flagged when manually overridden), scrap %, margin in 0.5% steps with the 12% approval gate. Bottom right shows **metal on drum** vs **metal to procure** — delivery and purchasing are different numbers.

**⑥ "View GTP"** — the printable Guaranteed Technical Particulars, laid out in the source document's own 1.0–20 numbering so an inspector can read ours beside theirs. Note the **Approver corrections** block: the sag was submitted at 3% and approved at 1.5%. Submitted ≠ approved, and we keep both.

---

## 4. What's real vs. deliberately not built

**Real:** the ABC schema, the costing engine, the GTP document, and the seeded spec (transcribed from the approved PDF — nothing interpolated).

**Deliberately stubbed** — these throw an error naming what they're blocked on, rather than returning plausible-looking output:

- **Drum sticker** — blocked on a real sticker sample. We know the *content* from GTP item 17, but not the label's size, layout, or which fields are pre-printed.
- **Third document** — we've been assuming it's a quote, but the GTP itself names MQP, test certificate and packing list as required deliverables. Any of them is as likely.
- **GTP PDF parsing** — one sample isn't enough to generalise a parser. Needs 5–10 across cable types first.

A stub that returns believable fake data gets demoed, believed, and shipped. These don't.

---

## 5. What we need from the client

1. **The de-rating table on the approved GTP looks wrong.** It doesn't decrease monotonically (20°C → 1.22, 25°C → **1.25**, 35°C → 1.09, 40°C → **1.10**), and lists seven temperatures against six factors. We reproduce it exactly as printed rather than guessing the intended sequence — **needs raising with WBSEDCL.**
2. **Scrap / wastage %** — currently defaults to 0 because nobody has confirmed the real figure. Needs the production supervisor.
3. **What is the third output document?** (see above)
4. **Which cable family dominates the order book?** Our one sample is a DISCOM ABC tender; discovery notes describe armoured work. This drives what we build next.
5. **Accounts:** Zoho Books is now the recommended platform, but Navya's data lives in Tally + Excel today. Open: migrate to Zoho, or bridge Tally → Zoho and keep Tally as the book of record?

---

## 6. Where the code lives

| Path | What |
|---|---|
| `lib/domain/abc.ts` | ABC family, `SpecValue`, standards lookup, weights, `computeAbcLine` |
| `lib/domain/gtp-document.ts` | GTP model + section renderer |
| `lib/seed/abc-gtp-sample.ts` | The approved GTP, transcribed |
| `lib/domain/documents.ts` | Sticker / third-doc stubs |
| `app/(app)/cable-builder/` | The builder + GTP pages |

Costing stays in `lib/domain/costing.ts` — the existing engine, unchanged in behaviour. **Engines stay deterministic: never let an LLM produce a figure.**

---

## 7. Known gaps

- **No persistence.** It edits one cable in memory; there's no save, no spec library, no "new cable from scratch" (reset returns you to the seeded GTP). If this is used daily, that's the next thing to build.
- **ABC only.** Armoured cable still lives in the Quote Builder.
- No DB or backend — data is a localStorage mock behind `lib/services`, deliberately backend-ready for Shaun.
