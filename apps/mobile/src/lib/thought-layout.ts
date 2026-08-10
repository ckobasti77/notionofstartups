/**
 * Raspored i veličine misli — klijentske konstante, ogledalo weba i backenda:
 *
 * - Preseti veličina su 1:1 iz web `components/workspace/workspace-item-dialog.tsx`
 *   (`ITEM_SIZE_DIMENSIONS`), unutar backend granica (`thoughts.ts`: širina
 *   240–720, visina 160–1000). Ako se web promeni, promeni i ovde.
 * - Detekcija aktivnog preseta je ista logika kao na webu
 *   (`thoughts-canvas-view.tsx`): width ≥ 480 → velika, ≥ 330 → standardna,
 *   inače kompaktna; bez width/height je automatska.
 */
export type ThoughtSizePreset = 'compact' | 'standard' | 'large';

export const THOUGHT_SIZE_DIMENSIONS: Record<ThoughtSizePreset, { width: number; height: number }> =
  {
    compact: { width: 264, height: 196 },
    standard: { width: 360, height: 280 },
    large: { width: 520, height: 420 },
  };

export const THOUGHT_SIZE_LABEL: Record<ThoughtSizePreset, string> = {
  compact: 'Kompaktna',
  standard: 'Standardna',
  large: 'Velika',
};

export const THOUGHT_SIZE_PRESETS: readonly ThoughtSizePreset[] = [
  'compact',
  'standard',
  'large',
];

/** `null` = automatska veličina (bez zadatih dimenzija). */
export function activeThoughtSizePreset(width: number | undefined): ThoughtSizePreset | null {
  if (width === undefined) return null;
  if (width >= 480) return 'large';
  if (width >= 330) return 'standard';
  return 'compact';
}

/**
 * „Sredi raspored": mreža u POZITIVNOM kvadrantu. ReactFlow viewport je
 * `screen = world·zoom + (x,y)`, pa sačuvani viewport `{x:0, y:0}` stavlja
 * svetsku tačku (0,0) u gornji levi ugao ekrana — mreža „oko" početka bi
 * sakrila sve u negativnim kvadrantima. Korak je veći od najveće auto-širine
 * čvora da se kartice ne preklapaju.
 */
const TIDY_ORIGIN_X = 80;
const TIDY_ORIGIN_Y = 80;
const TIDY_STEP_X = 320;
const TIDY_STEP_Y = 260;

export function tidyGridPosition(index: number, total: number): { x: number; y: number } {
  // Kvadratasta mreža (√n kolona) — čitljivija od jedne dugačke kolone ili reda.
  const columns = Math.max(1, Math.ceil(Math.sqrt(total)));
  return {
    x: TIDY_ORIGIN_X + (index % columns) * TIDY_STEP_X,
    y: TIDY_ORIGIN_Y + Math.floor(index / columns) * TIDY_STEP_Y,
  };
}

/**
 * Naslov za prikaz: naslov, pa prvi neprazan red teksta, pa rezerva. Server pri
 * konverziji koristi istu logiku sa rezervom „Nova misao" (`defaultThoughtTitle`).
 */
export function thoughtDisplayTitle(
  node: { title: string | null; text: string },
  fallback = 'Bez naslova',
): string {
  const title = node.title?.trim();
  if (title) return title;
  const line = node.text
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? fallback;
}

/** Srpska množina — „1 misao, 2 misli, 5 misli" (isti obrazac kao `ideasWord`). */
export function misaoWord(count: number): string {
  const absolute = Math.abs(count);
  if (absolute % 10 === 1 && absolute % 100 !== 11) return 'misao';
  return 'misli';
}

/** „1 veza, 2 veze, 5 veza". */
export function vezaWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return 'veza';
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'veze';
  return 'veza';
}
