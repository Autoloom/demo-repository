type PdfCell = string | number | undefined | null;

export interface PdfTable {
  headers: string[];
  rows: PdfCell[][];
  widths?: number[];
}

export interface PdfSection {
  title?: string;
  lines?: PdfCell[];
  table?: PdfTable;
}

export interface PdfDocument {
  title: string;
  subtitle?: string;
  meta?: PdfCell[];
  sections: PdfSection[];
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const SMALL_LINE_HEIGHT = 12;

function clean(value: PdfCell): string {
  return String(value ?? "")
    .replace(/[₹]/g, "INR ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[•]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function esc(value: PdfCell): string {
  return clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: PdfCell, maxChars: number): string[] {
  const text = clean(value).trim();
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

class PdfBuilder {
  private pages: string[][] = [[]];
  private y = PAGE_HEIGHT - MARGIN;

  private page() {
    return this.pages[this.pages.length - 1];
  }

  private add(command: string) {
    this.page().push(command);
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.pages.push([]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  text(value: PdfCell, x = MARGIN, size = 10, bold = false, maxChars = 96) {
    for (const line of wrapText(value, maxChars)) {
      this.ensure(size + 6);
      this.add(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${this.y} Td (${esc(line)}) Tj ET`);
      this.y -= size + 4;
    }
  }

  gap(size = 8) {
    this.y -= size;
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

    const renderRow = (cells: PdfCell[], bold = false) => {
      const wrapped = cells.map((cell, index) => wrapText(cell, Math.max(8, Math.floor(widths[index] / 5.6))));
      const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * SMALL_LINE_HEIGHT + 8;
      this.ensure(rowHeight + 2);
      this.add(`${MARGIN} ${this.y + 4} m ${PAGE_WIDTH - MARGIN} ${this.y + 4} l S`);
      wrapped.forEach((lines, colIndex) => {
        lines.forEach((line, lineIndex) => {
          const x = xPositions[colIndex] + 4;
          const y = this.y - 9 - lineIndex * SMALL_LINE_HEIGHT;
          this.add(`BT /${bold ? "F2" : "F1"} 8 Tf ${x} ${y} Td (${esc(line)}) Tj ET`);
        });
      });
      this.y -= rowHeight;
    };

    renderRow(table.headers, true);
    table.rows.forEach((row) => renderRow(row));
    this.add(`${MARGIN} ${this.y + 4} m ${PAGE_WIDTH - MARGIN} ${this.y + 4} l S`);
    this.y -= 8;
  }

  bytes(doc: PdfDocument): Uint8Array {
    this.text(doc.title, MARGIN, 16, true, 72);
    if (doc.subtitle) this.text(doc.subtitle, MARGIN, 10, false, 96);
    if (doc.meta?.length) {
      this.gap(2);
      doc.meta.forEach((item) => this.text(item, MARGIN, 9, false, 110));
    }
    this.rule();

    for (const section of doc.sections) {
      if (section.title) {
        this.gap(4);
        this.text(section.title, MARGIN, 12, true, 90);
      }
      section.lines?.forEach((line) => this.text(line, MARGIN, 9, false, 110));
      if (section.table) this.table(section.table);
      this.gap(4);
    }

    return buildPdfFile(this.pages.map((page) => page.join("\n")));
  }
}

function buildPdfFile(pageStreams: string[]): Uint8Array {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageIds: number[] = [];

  for (const stream of pageStreams) {
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new TextEncoder().encode(body);
}

export function createPdfBytes(doc: PdfDocument): Uint8Array {
  return new PdfBuilder().bytes(doc);
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
