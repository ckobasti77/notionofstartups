/**
 * Čitanje i normalizacija tabele iz Excel/CSV fajla za mobilni uvoz (spec §9.4).
 *
 * ODLUKA O BIBLIOTECI: web koristi `read-excel-file/browser`, koji traži DOM `File`
 * (a Node build traži stream/`Buffer`). React Native nema ni DOM `File` ni `Buffer`,
 * pa `read-excel-file` nije upotrebljiv bez teškog polyfill-a. Zato mobilni koristi
 * `xlsx` (SheetJS), koji parsira iz base64/stringa — SheetJS-ov zvanično preporučen
 * Expo tok. Ako se ovde nešto menja, uporedni web izvor je `apps/web/lib/table-file.ts`
 * i `apps/web/lib/csv.ts`.
 *
 * NE VRAĆAJ `xlsx` na npm! `package.json` namerno gađa SheetJS-ov CDN tarball
 * (`https://cdn.sheetjs.com/...`), a ne npm registry. Poslednja verzija na npm-u je
 * 0.18.5 i nosi CVE-2023-30533 (prototype pollution; fix 0.19.3) i CVE-2024-22363
 * (ReDoS; fix 0.20.2). SheetJS više NE objavljuje na npm, pa `npm update`/`npm i xlsx`
 * vrati ranjivu 0.18.5. CDN paket se i dalje zove `xlsx`, pa import ostaje isti.
 * Nadogradnja: `npm install --workspace @devotion/mobile https://cdn.sheetjs.com/xlsx-<v>/xlsx-<v>.tgz`.
 */
import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';

import { MAX_TABLE_CELL_LENGTH } from '@/lib/table-limits';

export type PickedSpreadsheet = { uri: string; name: string; mimeType?: string };

export type ParsedSpreadsheet = {
  /** Pravougaona matrica, isečena na `maxColumns` zbog pregleda/upisa. */
  matrix: string[][];
  /**
   * Stvaran broj kolona u fajlu, PRE sečenja — da bi se prekoračenje limita
   * moglo odbiti sa tačnom porukom umesto da se višak tiho odbaci.
   */
  columnCount: number;
  /** Koliko je ćelija skraćeno na `MAX_TABLE_CELL_LENGTH` — komponenta to javi korisniku. */
  truncatedCells: number;
};

/** Najveća popunjena širina (broj kolona) u sirovoj matrici, bez sečenja. */
function sourceWidth(rows: string[][]): number {
  return rows.reduce((widest, row) => {
    let lastFilled = 0;
    for (let index = 0; index < row.length; index += 1) {
      if (row[index].trim() !== '') lastFilled = index + 1;
    }
    return Math.max(widest, lastFilled);
  }, 0);
}

function isCsv({ name, mimeType }: PickedSpreadsheet): boolean {
  if (/\.csv$/i.test(name)) return true;
  return mimeType === 'text/csv' || mimeType === 'text/comma-separated-values';
}

/**
 * Seče ćelije duže od `maxCellLength` na klijentu i broji koliko ih je skraćeno.
 * Server (`importRows` → `page_tables.ts#cleanCellValue`) inače BACI grešku i odbije
 * CELU seriju čim ijedna ćelija pređe limit — bolje seći ovde i javiti korisniku
 * nego da ceo uvoz padne na jednoj predugačkoj ćeliji. (Labele zaglavlja server
 * ionako tiho seče na `MAX_TABLE_LABEL_LENGTH`, pa im ovo dodatno ne škodi.)
 */
function clampCellLengths(
  rows: string[][],
  maxCellLength: number,
): { matrix: string[][]; truncated: number } {
  let truncated = 0;
  const matrix = rows.map((row) =>
    row.map((cell) => {
      if (cell.length > maxCellLength) {
        truncated += 1;
        return cell.slice(0, maxCellLength);
      }
      return cell;
    }),
  );
  return { matrix, truncated };
}

/**
 * Poravnava sve redove na istu širinu i seče prazne repove — uvoz mora da dobije
 * pravougaonu matricu bez obzira kako je izvor izgledao. Verni port
 * `apps/web/lib/csv.ts#normalizeTableMatrix`.
 */
export function normalizeTableMatrix(
  rows: string[][],
  maxColumns: number,
): string[][] {
  const width = Math.min(
    maxColumns,
    rows.reduce((widest, row) => {
      let lastFilled = 0;
      for (let index = 0; index < row.length; index += 1) {
        if (row[index].trim() !== '') lastFilled = index + 1;
      }
      return Math.max(widest, lastFilled);
    }, 0),
  );
  if (width === 0) return [];
  return rows.map((row) =>
    Array.from({ length: width }, (_, index) => (row[index] ?? '').trim()),
  );
}

/**
 * Čita izabrani fajl (prvi list, kao na webu) u pravougaonu matricu stringova.
 * `.xlsx`/`.xls` se čitaju kao base64, `.csv` kao UTF-8 string; SheetJS oba
 * parsira bez `Buffer`-a. Baca kad fajl nije čitljiv ili nema listova.
 */
export async function parseSpreadsheet(
  picked: PickedSpreadsheet,
  maxColumns: number,
): Promise<ParsedSpreadsheet> {
  const file = new File(picked.uri);
  const workbook = isCsv(picked)
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.base64(), { type: 'base64' });

  const firstSheetName = workbook.SheetNames[0];
  if (firstSheetName === undefined) {
    throw new Error('Fajl nema nijedan list sa podacima.');
  }
  const sheet = workbook.Sheets[firstSheetName];

  // `header: 1` → matrica; `raw: false` formatira brojeve/datume u prikazani tekst;
  // `defval: ''` popunjava prazne ćelije da red ne bude „rupičav".
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  const asStrings = raw.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) =>
      cell === null || cell === undefined ? '' : String(cell),
    ),
  );
  // Ćelije se seku PRE upisa da server ne odbije celu seriju (vidi `clampCellLengths`);
  // broj skraćenih se vraća komponenti da ga javi korisniku.
  const { matrix, truncated } = clampCellLengths(
    normalizeTableMatrix(asStrings, maxColumns),
    MAX_TABLE_CELL_LENGTH,
  );
  // `columnCount` je STVARNA širina (pre sečenja) — komponenta njome odbija fajl sa
  // previše kolona umesto da se višak tiho izgubi kroz `normalizeTableMatrix`.
  return {
    matrix,
    columnCount: sourceWidth(asStrings),
    truncatedCells: truncated,
  };
}

/** Deli redove na serije ≤ `size` — `importRows` mutacija ima transakcione limite. */
export function chunkRows(rows: string[][], size: number): string[][][] {
  const batches: string[][][] = [];
  for (let start = 0; start < rows.length; start += size) {
    batches.push(rows.slice(start, start + size));
  }
  return batches;
}
