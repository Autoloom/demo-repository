/**
 * Standards layer — shared schemas and lookup primitives (build-plan-v1 §3).
 *
 * Two ideas carry the whole layer:
 *
 *  1. **Every row carries its own provenance.** A value with no `ref` cannot be printed on a
 *     legally-binding document, so `ref` is required, not optional.
 *
 *  2. **A missed lookup is an ERROR, never a default.** Silent fallbacks are how wrong GTPs get
 *     generated. `lookupBand` and `lookupKeyed` throw; callers must handle absence explicitly.
 *
 * Datasets are immutable and versioned. IS 8130:1984 and IS 8130:2013 coexist permanently
 * because different buyers pin different editions; "updating" a standard means adding a new
 * edition module, never mutating an existing one.
 */

/** Standards bodies. Not hard-coded to BIS — solar uses IEC/CENELEC (working rule 7). */
export type StandardsBody = "BIS" | "IEC" | "CENELEC";

/**
 * Encoding status. A dataset only becomes `verified` after a human has checked every row
 * against the rendered PDF page (encoding SOP step 2). Draft datasets are refused for
 * generation — text extraction alone is not trustworthy (finding X-3: OCR rendered
 * "35 times" as "3.5 times").
 */
export type DatasetStatus = "draft" | "verified";

/** Provenance carried by every single row. */
export interface StandardsRow {
  /** e.g. "IS 7098 (Part 1) : 2025, Table 3, Sl. xii" */
  ref: string;
  /** Page in the source PDF, so a reviewer can re-verify quickly. */
  page?: number;
}

/** Exact-match table: one row per key value. */
export interface KeyedTable<T extends StandardsRow = StandardsRow> {
  kind: "keyed";
  keyField: string;
  rows: T[];
}

/**
 * Banded table: rows cover ranges, matching the standards' own wording
 * "Over … / Up to and including …". Used by every calculated-diameter lookup.
 */
export interface BandedTable<V = Record<string, unknown>> {
  kind: "banded";
  keyField: string;
  bands: Array<
    StandardsRow & {
      /** Exclusive lower bound; null = no lower bound. */
      over: number | null;
      /** Inclusive upper bound; null = open ended. */
      upTo: number | null;
      values: V;
    }
  >;
}

export type StandardsTable = KeyedTable<never> | BandedTable | KeyedTable<StandardsRow & Record<string, unknown>>;

export interface StandardsDataset {
  standardId: string; // 'IS7098-1'
  edition: string; // '2025'
  body: StandardsBody;
  title: string;
  status: DatasetStatus;
  reaffirmed?: string;
  supersedes?: string;
  /** Where the licensed PDF lives, for re-verification. */
  sourceFile?: string;
  /** Free-text note on what is NOT in this dataset and why. */
  coverageNote?: string;
}

/** Thrown when a lookup finds nothing. Never swallowed, never defaulted. */
export class StandardsLookupError extends Error {
  constructor(
    readonly standardId: string,
    readonly table: string,
    readonly keyField: string,
    readonly key: number | string,
  ) {
    super(
      `No row in ${standardId} ${table} for ${keyField} = ${key}. ` +
        `The standard does not cover this value — do not substitute a default.`,
    );
    this.name = "StandardsLookupError";
  }
}

/**
 * Banded lookup with the standards' exact semantics: `over < key <= upTo`.
 * Throws rather than returning a fallback.
 */
export function lookupBand<V>(
  standardId: string,
  tableName: string,
  table: BandedTable<V>,
  key: number,
): StandardsRow & { over: number | null; upTo: number | null; values: V } {
  const hit = table.bands.find(
    (b) => (b.over === null || key > b.over) && (b.upTo === null || key <= b.upTo),
  );
  if (!hit) throw new StandardsLookupError(standardId, tableName, table.keyField, key);
  return hit;
}

/** Exact-match lookup. Throws rather than returning a fallback. */
export function lookupKeyed<T extends StandardsRow & Record<string, unknown>>(
  standardId: string,
  tableName: string,
  table: KeyedTable<T>,
  key: number | string,
): T {
  const hit = table.rows.find((r) => r[table.keyField] === key);
  if (!hit) throw new StandardsLookupError(standardId, tableName, table.keyField, key);
  return hit;
}

/**
 * Structural check for a banded table: no gaps, no overlaps, ascending order.
 * Run in tests — a gap means some real cable silently has no answer.
 */
export function validateBands<V>(table: BandedTable<V>): string[] {
  const problems: string[] = [];
  const sorted = [...table.bands].sort((a, b) => (a.over ?? -Infinity) - (b.over ?? -Infinity));
  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i];
    if (band.over !== null && band.upTo !== null && band.over >= band.upTo) {
      problems.push(`band ${i}: over (${band.over}) must be below upTo (${band.upTo})`);
    }
    const next = sorted[i + 1];
    if (!next) continue;
    if (band.upTo === null) {
      problems.push(`band ${i} is open-ended but is not the last band`);
    } else if (next.over === null) {
      problems.push(`band ${i + 1} has no lower bound but follows another band`);
    } else if (next.over > band.upTo) {
      problems.push(`gap between ${band.upTo} and ${next.over} — no band covers it`);
    } else if (next.over < band.upTo) {
      problems.push(`overlap: band ${i} ends at ${band.upTo}, band ${i + 1} starts above ${next.over}`);
    }
  }
  return problems;
}
