/**
 * RFC 4180 parser. Excel izvozi CSV sa navodnicima, zarezima i prelomima reda
 * unutar polja, pa `split(",")` ovde nije opcija. Razdvajač se pogađa iz prvog
 * reda jer srpski Excel često izvozi sa `;`.
 */
export type CsvTable = { rows: string[][] };

const DELIMITERS = [",", ";", "\t"] as const;

export function detectCsvDelimiter(sample: string) {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  let best: (typeof DELIMITERS)[number] = ",";
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let index = 0; index < firstLine.length; index += 1) {
      const char = firstLine[index];
      if (char === '"') {
        if (inQuotes && firstLine[index + 1] === '"') index += 1;
        else inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && char === delimiter) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): CsvTable {
  // BOM bi inače završio kao deo prve ćelije zaglavlja.
  const text = input.replace(/^﻿/, "");
  const separator = delimiter ?? detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    sawAnyChar = true;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (char === separator) {
      endField();
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      endRow();
      continue;
    }
    if (char === "\n") {
      endRow();
      continue;
    }
    field += char;
  }

  if (sawAnyChar && (field !== "" || row.length > 0)) endRow();

  // Prazan poslednji red nastaje od završnog preloma; ne nosi podatke.
  while (
    rows.length > 0 &&
    rows[rows.length - 1].every((cell) => cell.trim() === "")
  ) {
    rows.pop();
  }
  return { rows };
}

/**
 * Poravnava sve redove na istu širinu i seče prazne repove — uvoz mora da dobije
 * pravougaonu matricu bez obzira kako je izvor izgledao.
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
        if (row[index].trim() !== "") lastFilled = index + 1;
      }
      return Math.max(widest, lastFilled);
    }, 0),
  );
  if (width === 0) return [];
  return rows.map((row) =>
    Array.from({ length: width }, (_, index) => (row[index] ?? "").trim()),
  );
}
