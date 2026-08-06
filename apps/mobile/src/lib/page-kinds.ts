/**
 * Vrsta stranice → ikona, labela i boja — mobilni port „čistog" dela
 * `apps/web/lib/page-kinds.ts`. Ikone su iz `lucide-react-native` (iste kao web:
 * note→FileText, task→CheckSquare2, file→Paperclip, table→Table2); boje se ne
 * prenose kao Tailwind klase nego kao funkcija koja vraća token iz `useThemeColors()`.
 *
 * Ogledalo: `apps/web/lib/page-kinds.ts`.
 */
import {
  CheckSquare2,
  FileText,
  Paperclip,
  Table2,
  type LucideIcon,
} from 'lucide-react-native';

import type { ColorTokens } from '@/theme/tokens';

export type PageKind = 'note' | 'task' | 'file' | 'table';

export const PAGE_KIND_KEYS: readonly PageKind[] = ['note', 'task', 'file', 'table'];

type PageKindMeta = {
  /** Nominativ: „Beleška". */
  label: string;
  icon: LucideIcon;
};

/**
 * Jedini izvor istine o tome kako se vrsta prikazuje na mobilnom. Sve grananje po
 * vrsti ide kroz ovu mapu — inače nova vrsta tiho dobije izgled beleške.
 */
export const PAGE_KIND_META: Record<PageKind, PageKindMeta> = {
  note: { label: 'Beleška', icon: FileText },
  task: { label: 'Zadatak', icon: CheckSquare2 },
  file: { label: 'Fajl', icon: Paperclip },
  table: { label: 'Tabela', icon: Table2 },
};

export function pageKindMeta(kind: PageKind) {
  return PAGE_KIND_META[kind];
}

export function pageKindLabel(kind: PageKind) {
  return PAGE_KIND_META[kind].label;
}

/**
 * Boja vrste iz semantičkih tokena (web `PAGE_KIND_META`: note sky, task emerald,
 * file amber, table fuchsia → info/success/warning/primary).
 */
export function pageKindColor(colors: ColorTokens, kind: PageKind): string {
  switch (kind) {
    case 'task':
      return colors.success;
    case 'file':
      return colors.warning;
    case 'table':
      return colors.primary;
    case 'note':
    default:
      return colors.info;
  }
}

/** Samo zadatak nosi status, prioritet, rok, izvršioce i checkpointe. */
export function supportsTaskData(kind: PageKind) {
  return kind === 'task';
}
