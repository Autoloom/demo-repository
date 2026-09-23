type PdfCell = string | number | undefined | null;

export type PdfAlign = "left" | "center" | "right";

/** An RGB colour, each channel 0–1, as the PDF `rg` operator takes it. */
export type PdfColor = readonly [number, number, number];

export interface PdfTable {
  headers: string[];
  rows: PdfCell[][];
  widths?: number[];
  /** Per-column alignment for body cells. Absent means left, which is every table before this. */
  align?: PdfAlign[];
  /** Alignment of the header row. Defaults to left. */
  headerAlign?: PdfAlign;
  /**
   * Draw every cell boxed, rules on all four sides, across the table's own width.
   *
   * Off by default so the GTP and costing sheets keep the ruled-row look they have always had.
   * On for documents copied from a buyer-facing format that boxes its tables — the works' own
   * offers do, and a schedule that looks different from the last one they sent reads as a
   * different company.
   */
  grid?: boolean;
  /**
   * No rules at all — a layout block, for text that has to sit in columns without looking like
   * a table: the offer number on the left and the date on the right of a covering letter.
   */
  plain?: boolean;
}

/** A line of body text with its own layout, for documents that are letters rather than sheets. */
export interface PdfLine {
  text: PdfCell;
  align?: PdfAlign;
  bold?: boolean;
  underline?: boolean;
  /** Point size. Defaults to the body size. */
  size?: number;
  /** Left indent in points — leading spaces do not survive wrapping, so indent is explicit. */
  indent?: number;
}

export interface PdfSection {
  title?: string;
  titleAlign?: PdfAlign;
  titleUnderline?: boolean;
  lines?: (PdfCell | PdfLine)[];
  table?: PdfTable;
  /**
   * Start this section on a fresh page.
   *
   * Needed for documents whose parts are separate sheets rather than a continuous flow — a
   * customer offer is a covering letter, a priced schedule and a terms page, each headed and
   * each footed, and letting the schedule begin halfway down the letter would not be the same
   * document. Ignored when the page is already empty, so it never leaves a blank sheet.
   */
  pageBreak?: boolean;
}

/** A JPEG to embed. Width and height are the image's own pixel dimensions. */
export interface PdfImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/**
 * The works' letterhead, drawn at the head and foot of EVERY page.
 *
 * Per page rather than once, because that is what a letterhead is: a schedule or a terms sheet
 * that becomes separated from its covering letter still says whose it is. The layout follows
 * the works' own offers — logo at the left, name centred and coloured, address and contact
 * centred beneath it, a double rule, and a footer pinned to the bottom of the sheet.
 */
export interface PdfLetterhead {
  name: string;
  nameColor?: PdfColor;
  /** Address, phone and e-mail lines, centred under the name. */
  lines: string[];
  footerLines: string[];
  footerColor?: PdfColor;
  logo?: PdfImage;
}

export interface PdfDocument {
  /** Printed as the document heading. Empty means none — a letter headed by its letterhead. */
  title: string;
  subtitle?: string;
  meta?: PdfCell[];
  sections: PdfSection[];
  letterhead?: PdfLetterhead;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const SMALL_LINE_HEIGHT = 12;
const BODY_SIZE = 9;
const TABLE_SIZE = 8;
const CELL_PAD = 4;

/** Height the letterhead takes at the top of a page, and the footer at the bottom. */
const HEADER_HEIGHT = 92;
const FOOTER_HEIGHT = 54;

/**
 * Helvetica and Helvetica-Bold advance widths for printable ASCII (32–126), in 1/1000 em, from
 * the standard Adobe font metrics. Needed to centre and right-align text and to wrap it by the
 * width it actually takes: wrapping by character count put "WWW" and "iii" on lines of the same
 * length, which is why narrow columns used to overflow and wide ones wrapped early.
 */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 222, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/**
 * Characters the Windows character set (the fonts' encoding) carries at 0x80–0x9F, where it
 * differs from Latin-1. Everything from 0xA0 to 0xFF is Latin-1 unchanged — °, ±, ×, ·, ½, ²,
 * ³, µ — so those print as themselves.
 */
const WIN_ANSI_HIGH: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94,
  "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99,
};

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8",
  "⁹": "9", "⁻": "-", "⁺": "+",
};

/**
 * Text as the PDF will print it: a string whose every character code IS the byte written.
 *
 * ── Why this is not just "strip non-ASCII" any more ────────────────────────────
 * It was, and a GTP carries a lot of meaning outside ASCII. Stripping it printed "3½" core as
 * "3" core; the insulation tolerance "−15.9%" as "15.9%", dropping the minus from a one-sided
 * limit; "± 10%" drum length as "10%"; "23.0×10⁻⁶/°C" expansion as "23.010/C"; "N/mm²" as
 * "N/mm"; "MΩ·km" as "Mkm". Every one is a different statement from the one the engine made,
 * on a document a buyer stamps.
 *
 * The fonts are now declared in the Windows character set, which the standard PDF fonts carry,
 * so °, ±, ×, ·, ½, ², ³ and the dashes print as real glyphs. What that set lacks is spelled
 * out rather than dropped: the rupee sign as "INR", the minus sign as a hyphen, Ω as "ohm", and
 * a superscript exponent as "^" ("10^-6"). Anything still unrepresentable is removed.
 */
function clean(value: PdfCell): string {
  const text = String(value ?? "")
    .replace(/[₹]/g, "INR ")
    .replace(/−/g, "-")
    .replace(/Ω/g, "ohm")
    .replace(/●/g, "•")
    // A superscript run that is only ², ³ or ¹ prints as those glyphs ("N/mm²"); any other
    // run — an exponent such as ⁻⁶ — becomes caret notation, which every engineer reads.
    .replace(/[⁰¹²³⁴-⁹⁻⁺]+/g, (run) => (/^[¹²³]+$/.test(run) ? run : `^${[...run].map((c) => SUPERSCRIPT[c]).join("")}`));

  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code <= 0x7e)) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += ch;
    else if (WIN_ANSI_HIGH[ch] !== undefined) out += String.fromCharCode(WIN_ANSI_HIGH[ch]);
  }
  return out;
}

/** Widths of the printable characters above 0x7F that GTPs and offers actually use. */
const HIGH_WIDTHS: Record<number, [number, number]> = {
  0x80: [556, 556], 0x85: [1000, 1000], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500],
  0x94: [333, 500], 0x95: [350, 350], 0x96: [556, 556], 0x97: [1000, 1000], 0x99: [1000, 1000],
  0xa0: [278, 278], 0xb0: [400, 400], 0xb1: [584, 584], 0xb2: [333, 333], 0xb3: [333, 333],
  0xb5: [556, 611], 0xb7: [278, 278], 0xb9: [333, 333], 0xbc: [834, 834], 0xbd: [834, 834],
  0xbe: [834, 834], 0xd7: [584, 584],
};

/** Width of already-cleaned text, in points. */
function measure(text: string, size: number, bold = false): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    units +=
      code >= 32 && code <= 126 ? table[code - 32] : (HIGH_WIDTHS[code]?.[bold ? 1 : 0] ?? 556);
  }
  return (units * size) / 1000;
}

/** Wrap to a width in points, measured — not to a character count. */
function wrapToWidth(value: PdfCell, maxWidth: number, size: number, bold = false): string[] {
  const text = clean(value).trim();
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measure(next, size, bold) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function colorOp(color: PdfColor): string {
  return `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} rg`;
}

function isLine(value: PdfCell | PdfLine): value is PdfLine {
  return typeof value === "object" && value !== null;
}

class PdfBuilder {
  private pages: string[][] = [];
  private y = PAGE_HEIGHT - MARGIN;
  private letterhead?: PdfLetterhead;
  /** Commands on the current page that belong to the letterhead, not the content. */
  private contentStart = 0;

  constructor(letterhead?: PdfLetterhead) {
    this.letterhead = letterhead;
    this.startPage();
  }

  private get top() {
    return PAGE_HEIGHT - MARGIN - (this.letterhead ? HEADER_HEIGHT : 0);
  }

  private get bottom() {
    return MARGIN + (this.letterhead ? FOOTER_HEIGHT : 0);
  }

  private page() {
    return this.pages[this.pages.length - 1];
  }

  private add(command: string) {
    this.page().push(command);
  }

  private startPage() {
    this.pages.push([]);
    if (this.letterhead) this.drawLetterhead(this.letterhead);
    this.contentStart = this.page().length;
    this.y = this.top;
  }

  private ensure(height: number) {
    if (this.y - height < this.bottom) this.startPage();
  }

  /** Draw already-cleaned text at an exact position, aligned within [x, x + width]. */
  private place(
    text: string,
    x: number,
    y: number,
    width: number,
    { size, bold = false, align = "left", color, underline = false }: {
      size: number;
      bold?: boolean;
      align?: PdfAlign;
      color?: PdfColor;
      underline?: boolean;
    },
  ) {
    const w = measure(text, size, bold);
    const x0 = align === "center" ? x + (width - w) / 2 : align === "right" ? x + width - w : x;
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    if (color) this.add(colorOp(color));
    this.add(`BT /${bold ? "F2" : "F1"} ${size} Tf ${fmt(x0)} ${fmt(y)} Td (${escaped}) Tj ET`);
    if (color) this.add("0 0 0 rg");
    if (underline && text) {
      this.add(`0.6 w ${fmt(x0)} ${fmt(y - 2)} m ${fmt(x0 + w)} ${fmt(y - 2)} l S 1 w`);
    }
  }

  private drawLetterhead(lh: PdfLetterhead) {
    const topY = PAGE_HEIGHT - MARGIN;
    if (lh.logo) {
      // Fit the logo in a 62pt box, keeping its proportions.
      const box = 62;
      const scale = Math.min(box / lh.logo.width, box / lh.logo.height);
      const w = lh.logo.width * scale;
      const h = lh.logo.height * scale;
      this.add(`q ${fmt(w)} 0 0 ${fmt(h)} ${MARGIN} ${fmt(topY - h + 8)} cm /Im1 Do Q`);
    }
    // Centred across the page, as theirs is — the logo sits in the left margin of the block.
    let y = topY - 12;
    this.place(clean(lh.name), MARGIN, y, CONTENT_WIDTH, { size: 20, bold: true, align: "center", color: lh.nameColor });
    y -= 16;
    for (const line of lh.lines) {
      this.place(clean(line), MARGIN, y, CONTENT_WIDTH, { size: 8.5, align: "center" });
      y -= 11;
    }
    // The double rule under the heading.
    const ruleY = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT + 18;
    this.add(`1.4 w ${MARGIN} ${ruleY} m ${PAGE_WIDTH - MARGIN} ${ruleY} l S`);
    this.add(`0.5 w ${MARGIN} ${ruleY - 3} m ${PAGE_WIDTH - MARGIN} ${ruleY - 3} l S 1 w`);

    // Footer, pinned to the bottom of the sheet whatever the content above it does.
    const footerRule = MARGIN + FOOTER_HEIGHT - 14;
    this.add(`0.8 w ${MARGIN} ${footerRule} m ${PAGE_WIDTH - MARGIN} ${footerRule} l S 1 w`);
    let fy = footerRule - 13;
    for (const line of lh.footerLines) {
      this.place(clean(line), MARGIN, fy, CONTENT_WIDTH, { size: 8.5, bold: true, align: "center", color: lh.footerColor });
      fy -= 11;
    }
  }

  text(value: PdfCell, x = MARGIN, size = 10, bold = false, maxChars = 96) {
    // `maxChars` is kept for callers' sake; the wrap is by measured width, which the character
    // count approximated at about 0.56 em per character.
    const maxWidth = Math.min(CONTENT_WIDTH, maxChars * size * 0.56);
    for (const line of wrapToWidth(value, maxWidth, size, bold)) {
      this.ensure(size + 6);
      this.place(line, x, this.y, maxWidth, { size, bold });
      this.y -= size + 4;
    }
  }

  line(entry: PdfLine) {
    const size = entry.size ?? BODY_SIZE;
    const indent = entry.indent ?? 0;
    for (const line of wrapToWidth(entry.text, CONTENT_WIDTH - indent, size, entry.bold)) {
      this.ensure(size + 6);
      this.place(line, MARGIN + indent, this.y, CONTENT_WIDTH - indent, {
        size,
        bold: entry.bold,
        align: entry.align,
        underline: entry.underline,
      });
      this.y -= size + 5;
    }
  }

  gap(size = 8) {
    this.y -= size;
  }

  /** Begin a fresh page, unless nothing has been drawn on this one yet. */
  newPage() {
    if (this.page().length === this.contentStart) return;
    this.startPage();
  }

  rule() {
    this.ensure(10);
    this.add(`${MARGIN} ${this.y} m ${PAGE_WIDTH - MARGIN} ${this.y} l S`);
    this.y -= 10;
  }

  table(table: PdfTable) {
    const widths = table.widths ?? table.headers.map(() => CONTENT_WIDTH / table.headers.length);
    const xPositions = widths.reduce<number[]>((acc, width, index) => {
      acc[index] = index === 0 ? MARGIN : acc[index - 1] + widths[index - 1];
      return acc;
    }, []);

    // A row with more cells than `widths` has entries used to be a silent PDF corruption: the
    // missing width made the wrap budget NaN, and the missing x-position emitted the literal
    // "undefined" as a coordinate operator. Fall back to an even share instead — an ugly table
    // is recoverable, a malformed content stream is not.
    const columnWidth = (index: number, columnCount: number) =>
      widths[index] ?? CONTENT_WIDTH / Math.max(columnCount, 1);
    const columnX = (index: number, columnCount: number) =>
      xPositions[index] ??
      (xPositions.length > 0
        ? xPositions[xPositions.length - 1] + columnWidth(xPositions.length - 1, columnCount)
        : MARGIN);

    const tableRight = table.grid
      ? MARGIN + widths.reduce((sum, w) => sum + w, 0)
      : PAGE_WIDTH - MARGIN;

    const renderRow = (cells: PdfCell[], bold = false, rowAlign?: PdfAlign) => {
      const wrapped = cells.map((cell, index) =>
        wrapToWidth(cell, Math.max(12, columnWidth(index, cells.length) - CELL_PAD * 2), TABLE_SIZE, bold),
      );
      const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * SMALL_LINE_HEIGHT + 8;
      this.ensure(rowHeight + 2);
      const rowTop = this.y + 4;
      if (!table.plain) this.add(`${MARGIN} ${fmt(rowTop)} m ${fmt(tableRight)} ${fmt(rowTop)} l S`);
      if (table.grid) {
        // Verticals at every column boundary, including both outer edges.
        const edges = [...cells.map((_, i) => columnX(i, cells.length)), tableRight];
        for (const x of edges) {
          this.add(`${fmt(x)} ${fmt(rowTop)} m ${fmt(x)} ${fmt(rowTop - rowHeight)} l S`);
        }
      }
      wrapped.forEach((lines, colIndex) => {
        const x0 = columnX(colIndex, cells.length);
        const width = columnWidth(colIndex, cells.length) - CELL_PAD * 2;
        const align = rowAlign ?? table.align?.[colIndex] ?? "left";
        lines.forEach((line, lineIndex) => {
          this.place(line, x0 + CELL_PAD, this.y - 9 - lineIndex * SMALL_LINE_HEIGHT, width, {
            size: TABLE_SIZE,
            bold,
            align,
          });
        });
      });
      this.y -= rowHeight;
    };

    // A table whose headers are all blank has no header row — it is a layout block, not a
    // table of data. The customer offer's client/project/offer-no header is one: rendering an
    // empty bold row above it left four ruled blank lines at the top of every page.
    if (table.headers.some((header) => header.trim().length > 0)) {
      renderRow(table.headers, true, table.headerAlign);
    }
    table.rows.forEach((row) => renderRow(row));
    if (!table.plain) this.add(`${MARGIN} ${fmt(this.y + 4)} m ${fmt(tableRight)} ${fmt(this.y + 4)} l S`);
    this.y -= 8;
  }

  bytes(doc: PdfDocument): Uint8Array {
    if (doc.title) this.text(doc.title, MARGIN, 16, true, 72);
    if (doc.subtitle) this.text(doc.subtitle, MARGIN, 10, false, 96);
    if (doc.meta?.length) {
      this.gap(2);
      doc.meta.forEach((item) => this.text(item, MARGIN, 9, false, 110));
    }
    if (doc.title || doc.subtitle || doc.meta?.length) this.rule();

    for (const section of doc.sections) {
      if (section.pageBreak) this.newPage();
      if (section.title) {
        this.gap(4);
        if (section.titleAlign || section.titleUnderline) {
          this.line({
            text: section.title,
            bold: true,
            size: 11,
            align: section.titleAlign,
            underline: section.titleUnderline,
          });
        } else {
          this.text(section.title, MARGIN, 12, true, 90);
        }
      }
      section.lines?.forEach((line) =>
        isLine(line) ? this.line(line) : this.text(line, MARGIN, BODY_SIZE, false, 110),
      );
      if (section.table) this.table(section.table);
      this.gap(4);
    }

    return buildPdfFile(this.pages.map((page) => page.join("\n")), this.letterhead?.logo);
  }
}

const ascii = (text: string) => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
};

/**
 * Assemble the file as BYTES.
 *
 * It used to be assembled as a string and UTF-8 encoded at the end, which was fine while every
 * byte was ASCII and cannot carry an image: a JPEG is binary, and UTF-8 would have rewritten
 * every byte above 0x7F as two, corrupting the image and every xref offset after it. Offsets are
 * now counted in bytes, which is what the xref table has always meant.
 */
function buildPdfFile(pageStreams: string[], logo?: PdfImage): Uint8Array {
  const objects: Uint8Array[][] = [
    [ascii("<< /Type /Catalog /Pages 2 0 R >>")],
    [],
    [ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")],
    [ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")],
  ];

  let imageId: number | undefined;
  if (logo) {
    objects.push([
      ascii(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.jpeg.length} >>\nstream\n`,
      ),
      logo.jpeg,
      ascii("\nendstream"),
    ]);
    imageId = objects.length;
  }

  const pageIds: number[] = [];
  for (const stream of pageStreams) {
    objects.push([ascii(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)]);
    const contentId = objects.length;
    const xobject = imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : "";
    objects.push([
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobject} >> /Contents ${contentId} 0 R >>`,
      ),
    ]);
    pageIds.push(objects.length);
  }

  objects[1] = [
    ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`),
  ];

  const chunks: Uint8Array[] = [ascii("%PDF-1.4\n")];
  let length = chunks[0].length;
  const offsets: number[] = [];
  objects.forEach((parts, index) => {
    offsets.push(length);
    for (const part of [ascii(`${index + 1} 0 obj\n`), ...parts, ascii("\nendobj\n")]) {
      chunks.push(part);
      length += part.length;
    }
  });
  const xref = length;
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) tail += `${String(offset).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(ascii(tail));

  const out = new Uint8Array(length + tail.length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export function createPdfBytes(doc: PdfDocument): Uint8Array {
  return new PdfBuilder(doc.letterhead).bytes(doc);
}

export function downloadPdf(filename: string, doc: PdfDocument) {
  const bytes = createPdfBytes(doc);
  // Copy into a fresh ArrayBuffer-backed view: Uint8Array<ArrayBufferLike> isn't assignable to
  // BlobPart, because its buffer could in principle be a SharedArrayBuffer.
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
