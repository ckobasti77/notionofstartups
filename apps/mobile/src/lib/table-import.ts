/**
 * Čitanje i normalizacija tabele iz Excel/CSV fajla za mobilni uvoz (spec §9.4).
 *
 * Od lanca 7 je čisto jezgro (CSV parser, normalizacija matrice, sečenje ćelija,
 * serije) u `@devotion/shared` (`packages/shared/src/table-matrix.ts`) — ISTO
 * jezgro troši i web (`apps/web/lib/csv.ts`), pa oba klijenta identično tumače
 * isti fajl (BOM, `;` razdvajač, navodnici). Ovde ostaje samo platformsko:
 * čitanje fajla i binarni XLSX/XLS.
 *
 * ODLUKA O BIBLIOTECI: web koristi `read-excel-file/browser`, koji traži DOM `File`
 * (a Node build traži stream/`Buffer`). React Native nema ni DOM `File` ni `Buffer`,
 * pa `read-excel-file` nije upotrebljiv bez teškog polyfill-a. Zato mobilni koristi
 * `xlsx` (SheetJS), koji parsira iz base64/stringa — SheetJS-ov zvanično preporučen
 * Expo tok. Uporedni web izvor za XLSX je `apps/web/lib/table-file.ts`.
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

import {
  clampCellLengths,
  normalizeTableMatrix,
  parseCsv,
  sourceWidth,
} from '@devotion/shared';

import { MAX_TABLE_CELL_LENGTH } from '@/lib/table-limits';

// Stabilna adresa za postojeće importere (`note-insert-sheet`, `table-import-sheet`).
export { chunkRows, normalizeTableMatrix } from '@devotion/shared';

/** MIME tipovi tabela za `DocumentPicker`; iOS ih mapira u UTI. Jedna lista za sva tri sheeta. */
export const SPREADSHEET_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'text/comma-separated-values',
];

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

function isCsv({ name, mimeType }: PickedSpreadsheet): boolean {
  if (/\.csv$/i.test(name)) return true;
  return mimeType === 'text/csv' || mimeType === 'text/comma-separated-values';
}

/** Prvi list radne sveske (kao na webu) u sirovu matricu stringova. */
function readWorkbookMatrix(base64: string): string[][] {
  const workbook = XLSX.read(base64, { type: 'base64' });
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
  return raw.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) =>
      cell === null || cell === undefined ? '' : String(cell),
    ),
  );
}

/**
 * Čita izabrani fajl u pravougaonu matricu stringova. `.csv` ide kroz ZAJEDNIČKI
 * parser (identično webu); `.xlsx`/`.xls` kroz SheetJS iz base64. Baca kad fajl
 * nije čitljiv ili nema listova.
 */
export async function parseSpreadsheet(
  picked: PickedSpreadsheet,
  maxColumns: number,
): Promise<ParsedSpreadsheet> {
  const file = new File(picked.uri);
  const asStrings = isCsv(picked)
    ? parseCsv(await file.text()).rows
    : readWorkbookMatrix(await file.base64());

  // Ćelije se seku PRE upisa da server ne odbije celu seriju (vidi
  // `clampCellLengths` u shared paketu); broj skraćenih se javlja korisniku.
  const { matrix, truncated } = clampCellLengths(
    normalizeTableMatrix(asStrings, maxColumns),
    MAX_TABLE_CELL_LENGTH,
  );
  // `columnCount` je STVARNA širina (pre sečenja) — komponenta njome odbija fajl
  // sa previše kolona umesto da se višak tiho izgubi kroz `normalizeTableMatrix`.
  return {
    matrix,
    columnCount: sourceWidth(asStrings),
    truncatedCells: truncated,
  };
}
