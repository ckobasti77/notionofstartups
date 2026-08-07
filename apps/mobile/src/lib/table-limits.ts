/**
 * Limiti tabela — ogledalo `packages/backend/convex/lib/validators.ts:156–162`.
 * Vrednosti se namerno dupliraju na klijentu (isti obrazac kao `task-meta.ts`) da
 * RN bundle ne bi uvlačio serverski modul. Klijent ih poštuje da izbegne sirovu
 * server grešku na prekoračenju; server ostaje jedini autoritet.
 *
 * Kad se ovde nešto menja, ogledalo je `packages/backend/convex/lib/validators.ts`.
 */
export const MAX_TABLE_COLUMNS = 64;
export const MAX_TABLE_ROWS = 5_000;
export const MAX_TABLE_CELL_LENGTH = 2_000;
export const MAX_TABLE_LABEL_LENGTH = 120;
/** Jedna serija uvoza; `importRows` mutacija ima transakcione limite. */
export const MAX_TABLE_IMPORT_BATCH = 200;
