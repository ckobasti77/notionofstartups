import {
  Code2,
  Hash,
  Megaphone,
  MoreHorizontal,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react-native';

import { areaIconNameFor, type AreaIconName } from '@/lib/area-meta';

/**
 * Mapa ime → komponenta. Odluka „koji ključ dobija koji izgled" NIJE ovde nego u
 * `lib/area-meta.ts` (gde je testirana) — ovde je samo prevod u lucide, jer se
 * lucide ne može uvesti u vitest projekat (vidi docstring tog modula).
 */
const ICONS: Record<AreaIconName, LucideIcon> = {
  code: Code2,
  megaphone: Megaphone,
  'shopping-bag': ShoppingBag,
  more: MoreHorizontal,
  hash: Hash,
};

/**
 * Ikonica oblasti — pandan web `AREA_ICONS[areaKey]` u zaglavlju kanala
 * (`conversation-pane.tsx:338`) i u listi razgovora (`channel-list.tsx:167`).
 */
export function AreaIcon({
  areaKey,
  size,
  color,
}: {
  areaKey: string;
  size: number;
  color: string;
}) {
  const Icon = ICONS[areaIconNameFor(areaKey)];
  return <Icon size={size} color={color} />;
}
