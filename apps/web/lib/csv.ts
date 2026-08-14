/**
 * Jezgro parsera je od lanca 7 u `@devotion/shared` (`packages/shared/src/
 * table-matrix.ts`) — isto jezgro troši i mobilni `lib/table-import.ts`, pa
 * izmene idu tamo, ne ovde. Ovaj fajl ostaje kao stabilna adresa za web
 * importere i njihove testove.
 */
export {
  detectCsvDelimiter,
  normalizeTableMatrix,
  parseCsv,
  type CsvTable,
} from "@devotion/shared";
