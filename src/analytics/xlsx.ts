import { unzipSync } from 'fflate';

/** A cell value as stored in the sheet: text, a number, or empty. */
export type Cell = string | number | null;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

/** Text of every <t> inside an XML fragment (handles rich-text runs). */
function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decode(out);
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * Read the first worksheet of an .xlsx file into rows of cells.
 * Small and dependency-light on purpose: the POS exports are plain single-sheet tables.
 * Their size metadata is often wrong, so every cell is read from its own reference.
 */
export function readXlsx(data: ArrayBuffer | Uint8Array): Cell[][] {
  const files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  const dec = new TextDecoder();
  const sheetName =
    Object.keys(files)
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
      .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))[0] ?? '';
  if (!sheetName) throw new Error('This file has no worksheet. Is it an Excel (.xlsx) export?');

  const shared: string[] = [];
  const ss = Object.keys(files).find((n) => /^xl\/sharedStrings\.xml$/i.test(n));
  if (ss) for (const m of dec.decode(files[ss]).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const xml = dec.decode(files[sheetName]);
  const rows: Cell[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = /\br="(\d+)"/.exec(rm[1]);
    const rowIdx = rAttr ? parseInt(rAttr[1], 10) - 1 : rows.length;
    const row: Cell[] = [];
    const body = rm[2] ?? '';
    let next = 0;
    for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
      const ci = ref ? colIndex(ref[1]) : next;
      next = ci + 1;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const inner = cm[2] ?? '';
      let v: Cell = null;
      if (type === 'inlineStr') v = textOf(inner);
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw !== undefined) {
          if (type === 's') v = shared[parseInt(raw, 10)] ?? '';
          else if (type === 'str' || type === 'e') v = decode(raw);
          else if (type === 'b') v = raw === '1' ? 1 : 0;
          else {
            const n = Number(raw);
            v = Number.isFinite(n) ? n : decode(raw);
          }
        }
      }
      if (v === '') v = null;
      row[ci] = v;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[rowIdx] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}
