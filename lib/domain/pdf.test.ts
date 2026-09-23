/**
 * PDF writer safety.
 *
 * These tests exist because of one specific failure mode: `table()` indexes `widths` by column,
 * and nothing checked that `widths` was as long as the row. A caller that grew `headers` to three
 * columns while leaving `widths` at two produced `Math.floor(undefined / 5.6)` → NaN for the wrap
 * budget, and `xPositions[2]` → undefined for the x-coordinate, which was then interpolated
 * straight into a content-stream operator as the literal text "undefined".
 *
 * That is not a rendering glitch — it is a malformed PDF that a reader may refuse to open. Since
 * the GTP tolerance column is exactly the "grow headers to three" change that triggers it, the
 * guard is pinned here rather than left to a reviewer to notice.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createPdfBytes } from "./pdf";

const decode = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

test("a row with more cells than widths does not corrupt the content stream", () => {
  const text = decode(
    createPdfBytes({
      title: "Mismatch",
      sections: [
        {
          table: {
            headers: ["Particular", "Value", "Tolerance"],
            // Deliberately one short — the exact mistake the guard is for.
            widths: [260, 254],
            rows: [["Insulation thickness", "1.50 mm", "min 1.25 mm"]],
          },
        },
      ],
    }),
  );

  assert.ok(!text.includes("undefined"), "an undefined coordinate reached the content stream");
  assert.ok(!text.includes("NaN"), "a NaN measurement reached the content stream");
  assert.ok(text.includes("min 1.25 mm"), "the third column was dropped instead of being placed");
});

test("every text operator carries two finite coordinates", () => {
  const text = decode(
    createPdfBytes({
      title: "Coordinates",
      sections: [
        {
          table: {
            headers: ["A", "B", "C"],
            widths: [248, 176, 90],
            rows: [
              ["Insulation thickness (power)", "1.50 mm", "min 1.25 mm"],
              ["Max DC resistance @20 °C", "0.868 ohm/km", ""],
            ],
          },
        },
      ],
    }),
  );

  // `BT /F1 8 Tf <x> <y> Td (...) Tj ET` — both operands must be real numbers.
  const operators = [...text.matchAll(/BT \/F\d 8 Tf (\S+) (\S+) Td/g)];
  assert.ok(operators.length > 0, "no text was emitted at all");
  for (const [, x, y] of operators) {
    assert.ok(Number.isFinite(Number(x)), `x coordinate "${x}" is not a number`);
    assert.ok(Number.isFinite(Number(y)), `y coordinate "${y}" is not a number`);
  }
});

test("a three-column table places each column at its declared offset", () => {
  const text = decode(
    createPdfBytes({
      title: "Offsets",
      sections: [
        {
          table: {
            headers: ["Particular", "Value", "Tolerance"],
            widths: [248, 176, 90],
            rows: [["Insulation", "1.50 mm", "min 1.25 mm"]],
          },
        },
      ],
    }),
  );

  // MARGIN is 42, so columns start at 42, 290, 466 — plus the 4pt cell padding.
  for (const [label, x] of [["Insulation", 46], ["1.50 mm", 294], ["min 1.25 mm", 470]] as const) {
    assert.ok(
      text.includes(`${x} `) && text.includes(`(${label}) Tj`),
      `${label} was not placed at x=${x}`,
    );
  }
});

test("an empty tolerance cell prints nothing rather than the word undefined", () => {
  const text = decode(
    createPdfBytes({
      title: "Blanks",
      sections: [
        {
          table: {
            headers: ["Particular", "Value", "Tolerance"],
            widths: [248, 176, 90],
            rows: [["Max DC resistance", "0.868 ohm/km", ""]],
          },
        },
      ],
    }),
  );

  assert.ok(!text.includes("undefined"), "a blank cell rendered as the string undefined");
  assert.ok(text.includes("(0.868 ohm/km) Tj"), "the populated cells still render");
});

test("what a GTP says outside ASCII still says it in the PDF", () => {
  // Each of these printed wrong on every GTP before the fonts declared a character set: the
  // core count lost its half, the insulation tolerance its minus sign, the drum length its band,
  // the expansion coefficient its exponent and multiplication sign, the resistance its unit.
  const text = decode(
    createPdfBytes({
      title: "Characters",
      sections: [
        {
          table: {
            headers: ["Particular", "Value"],
            widths: [200, 311],
            rows: [
              ["No. of cores", "3½"],
              ["Insulation tolerance", "−15.9%"],
              ["Drum length", "±5%"],
              ["Armour size", "4 × 0.8 mm"],
              ["Max conductor temp", "90 °C"],
              ["Tensile strength", "90 N/mm²"],
              ["Expansion", "23.0×10⁻⁶/°C"],
              ["Insulation resistance", "709 MΩ·km"],
            ],
          },
        },
      ],
    }),
  );
  for (const printed of ["(3½)", "(-15.9%)", "(±5%)", "(4 × 0.8 mm)", "(90 °C)", "(90 N/mm²)", "(23.0×10^-6/°C)", "(709 Mohm·km)"]) {
    assert.ok(text.includes(printed), `expected ${printed} in the content stream`);
  }
  assert.match(text, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
});
