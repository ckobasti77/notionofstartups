import { parseCsv } from "@/lib/csv";

export function isExcelFile(file: File) {
  return /\.xlsx?$/i.test(file.name);
}

/**
 * Excel čitač se učitava tek na poziv, da ne uđe u glavni bundle. Paket nema
 * root export — browser build je jedini koji radi u pregledaču.
 */
async function readWorkbook(file: File): Promise<string[][]> {
  // `readSheet` vraća prvi list; `readXlsxFile` bi vratio sve listove odjednom.
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  return rows.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell);
    }),
  );
}

/** Učitava .xlsx/.xls ili CSV u matricu stringova (bez normalizacije). */
export async function readTableFile(file: File): Promise<string[][]> {
  return isExcelFile(file)
    ? await readWorkbook(file)
    : parseCsv(await file.text()).rows;
}

type TableJsonNode = {
  type: "table";
  content: Array<{
    type: "tableRow";
    content: Array<{
      type: "tableHeader" | "tableCell";
      content: Array<{
        type: "paragraph";
        content?: Array<{ type: "text"; text: string }>;
      }>;
    }>;
  }>;
};

/**
 * Matrica → Tiptap JSON čvor tabele. JSON umesto HTML stringa da vrednosti
 * ćelija ne bi morale da se escape-uju.
 */
export function noteTableContent(
  matrix: string[][],
  firstRowIsHeader: boolean,
): TableJsonNode {
  return {
    type: "table",
    content: matrix.map((cells, rowIndex) => ({
      type: "tableRow",
      content: cells.map((cell) => ({
        type:
          firstRowIsHeader && rowIndex === 0
            ? ("tableHeader" as const)
            : ("tableCell" as const),
        content: [
          {
            type: "paragraph" as const,
            ...(cell === ""
              ? {}
              : { content: [{ type: "text" as const, text: cell }] }),
          },
        ],
      })),
    })),
  };
}

/**
 * Gruba procena dužine HTML-a koji će Tiptap upisati u telo — telo beleške ima
 * granicu od 80.000 znakova na serveru (`cleanPageContent`), pa se prevelik
 * uvoz odbija pre ubacivanja.
 */
export function estimateTableHtmlLength(matrix: string[][]) {
  let total = 250;
  for (const row of matrix) {
    total += 12;
    for (const cell of row) {
      total += 44 + cell.length;
    }
  }
  return total;
}
