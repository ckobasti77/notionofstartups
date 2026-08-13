/**
 * Boje misli — semantička imena, ista kao backend `thoughtColorValidator`
 * (`packages/backend/convex/thoughts.ts`). Mobilni nema temske tokene za ove boje
 * (postoje samo na webu, u `globals.css`), pa se ovde drži mala mapa swatch-eva
 * (Tailwind-500 ekvivalenti). Koristi se ISKLJUČIVO za kružiće izbora boje u
 * sheet-ovima misli — ne kao opšti stil. Ako web tokeni jednom stignu na mobilni,
 * ovo se menja u njihovu referencu.
 *
 * ISTU šestorku koristi i `ideaColorValidator` (`packages/backend/convex/ideas.ts:27-34`).
 */
export type ThoughtColor =
  | 'neutral'
  | 'violet'
  | 'blue'
  | 'green'
  | 'amber'
  | 'rose';

/** Ideje i misli dele isti union boja — zajednički naziv za deljeni `ColorRow`. */
export type NodeColor = ThoughtColor;

export const THOUGHT_COLORS: readonly ThoughtColor[] = [
  'neutral',
  'violet',
  'blue',
  'green',
  'amber',
  'rose',
];

export const THOUGHT_SWATCH: Record<ThoughtColor, string> = {
  neutral: '#6b7280',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  rose: '#f43f5e',
};

/** Srpski nazivi boja — za `accessibilityLabel` (čitač ekrana), ne sirovi tip. */
export const THOUGHT_COLOR_LABEL: Record<ThoughtColor, string> = {
  neutral: 'Neutralna',
  violet: 'Ljubičasta',
  blue: 'Plava',
  green: 'Zelena',
  amber: 'Žuta',
  rose: 'Roze',
};
