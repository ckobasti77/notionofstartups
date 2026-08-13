/**
 * Koja ikonica pripada kojoj oblasti — mobilni pandan web `AREA_ICONS`
 * (`apps/web/components/workspace/workspace-ui.tsx:24`).
 *
 * Ovde stoji ODLUKA (ključ → ime ikonice), a ne sama ikonica: `lucide-react-native`
 * se ne može uvesti u vitest projekat `mobile` — vuče `react-native-svg` →
 * `react-native`, čiji je izvor u Flow-u i pada na `Unexpected token 'typeof'`.
 * Zato je mapa ime → komponenta u `components/ui/area-icon.tsx`, a testira se ovo.
 *
 * BOJU oblasti NE duplira: nju već daje `areaColor` u `lib/task-meta.ts:103`
 * (pandan web `getAreaTint`).
 *
 * Kad se ovde nešto menja, ogledalo je `AREA_ICONS` na webu.
 */

export type AreaIconName = 'code' | 'megaphone' | 'shopping-bag' | 'more' | 'hash';

const AREA_ICON_NAMES: Record<string, AreaIconName> = {
  dev: 'code',
  marketing: 'megaphone',
  sales: 'shopping-bag',
  other: 'more',
};

/**
 * Nepoznat ključ (oblast koju je tim sam dodao, `custom_…`) dobija `'hash'` —
 * isti fallback koji web ima (`AREA_ICONS[areaKey as AreaKey] ?? Hash`), i isti
 * simbol koji kanal ionako nosi kad oblast nije poznata.
 */
export function areaIconNameFor(key: string): AreaIconName {
  return AREA_ICON_NAMES[key] ?? 'hash';
}
