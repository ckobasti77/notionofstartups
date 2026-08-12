/**
 * Tabela u TELU beleške (ne „tabela oblačić"). Verni port
 * `apps/web/lib/table-file.ts` — granice i oblik čvora moraju da budu isti na obe
 * platforme, inače isti fajl na jednoj prođe a na drugoj ne.
 *
 * Metro ne sme u `apps/web`, pa je ovo kopija; `note-content.roundtrip.test.ts`
 * je čuva od razlaza (isti obrazac kao `apps/web/lib/canvas-node-size.test.ts`).
 *
 * Granice su uže nego kod tabele oblačića jer telo beleške server seče na 80.000
 * znakova (`cleanPageContent`). Za veće tabele i dalje postoji tabela oblačić —
 * ista poruka koju web daje (`note-table-import-dialog.tsx:79`).
 */
export const NOTE_TABLE_MAX_ROWS = 100;
export const NOTE_TABLE_MAX_COLS = 20;
/** Rezerva ispod serverskih 80.000 — telo raste i posle uvoza. */
export const NOTE_BODY_LIMIT_SAFETY = 78_000;

export type NoteTableJsonNode = {
  type: 'table';
  content: Array<{
    type: 'tableRow';
    content: Array<{
      type: 'tableHeader' | 'tableCell';
      content: Array<{
        type: 'paragraph';
        content?: Array<{ type: 'text'; text: string }>;
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
): NoteTableJsonNode {
  return {
    type: 'table',
    content: matrix.map((cells, rowIndex) => ({
      type: 'tableRow',
      content: cells.map((cell) => ({
        type:
          firstRowIsHeader && rowIndex === 0
            ? ('tableHeader' as const)
            : ('tableCell' as const),
        content: [
          {
            type: 'paragraph' as const,
            ...(cell === ''
              ? {}
              : { content: [{ type: 'text' as const, text: cell }] }),
          },
        ],
      })),
    })),
  };
}

/**
 * Gruba procena dužine HTML-a koji će Tiptap upisati u telo — prevelik uvoz se
 * odbija PRE ubacivanja, umesto da autosave zapne na serverskoj granici.
 */
export function estimateNoteTableHtmlLength(matrix: string[][]): number {
  let total = 250;
  for (const row of matrix) {
    total += 12;
    for (const cell of row) {
      total += 44 + cell.length;
    }
  }
  return total;
}
