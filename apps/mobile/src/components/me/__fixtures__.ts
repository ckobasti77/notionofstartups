/**
 * Fixture podaci za dizajn-katalog (plan K07 §7) — Jovanovih 6 startupa, rokovi
 * za svaki ton i redovi zadatka v1. Samo za `dizajn-katalog.tsx` (dev).
 */
import { addDaysToKey, dayKeyOf, noonOfDayKey } from '@devotion/shared';

import type { MyDayRowData, OverviewStartup } from './my-day/my-day-model';

export const KATALOG_STARTUPS: readonly OverviewStartup[] = [
  { _id: 'katalog-cr', name: 'Cluck Rush', logoUrl: null },
  { _id: 'katalog-sh', name: 'Silly Handyman', logoUrl: null },
  { _id: 'katalog-bm', name: 'Beauty Masterclass', logoUrl: null },
  { _id: 'katalog-ei', name: 'Enigma IT', logoUrl: null },
  { _id: 'katalog-sm', name: 'Scan Me', logoUrl: null },
  { _id: 'katalog-na', name: 'Nauči AI', logoUrl: null },
];

function noonIn(now: number, days: number): number {
  return noonOfDayKey(addDaysToKey(dayKeyOf(now), days));
}

/** Po jedan rok za svaki ton `describeDue`: prekoračeno, danas, uskoro, kasnije, bez roka. */
export function katalogDueDates(now: number): { label: string; dueDate: number | null }[] {
  return [
    { label: 'Prekoračeno', dueDate: noonIn(now, -2) },
    { label: 'Danas', dueDate: noonIn(now, 0) },
    { label: 'Uskoro', dueDate: noonIn(now, 3) },
    { label: 'Kasnije', dueDate: noonIn(now, 12) },
    { label: 'Bez roka', dueDate: null },
  ];
}

/** Redovi zadatka v1: startup sa oblašću, lično, dug naslov, zabranjena kvačica, završen. */
export function katalogRows(now: number): MyDayRowData[] {
  const [cr, , bm, , sm] = KATALOG_STARTUPS;
  return [
    {
      key: 'task:katalog-1',
      kind: 'task',
      id: 'katalog-1',
      title: 'Ugovor sa dobavljačem',
      status: 'next',
      priority: 'urgent',
      dueDate: noonIn(now, -2),
      startup: cr,
      areaLabel: 'Sales',
      done: false,
      canComplete: true,
    },
    {
      key: 'personal:katalog-2',
      kind: 'personal',
      id: 'katalog-2',
      title: 'Faktura za oktobar',
      status: 'open',
      priority: null,
      dueDate: noonIn(now, 0),
      startup: null,
      areaLabel: null,
      done: false,
      canComplete: true,
    },
    {
      key: 'task:katalog-3',
      kind: 'task',
      id: 'katalog-3',
      title: 'Snimiti promo video za jesenju kampanju i poslati montažeru do petka',
      status: 'in_progress',
      priority: 'high',
      dueDate: noonIn(now, 3),
      startup: bm,
      areaLabel: 'Marketing',
      done: false,
      canComplete: true,
    },
    {
      key: 'task:katalog-4',
      kind: 'task',
      id: 'katalog-4',
      title: 'Pregled ponude (tuđ zadatak u planu)',
      status: 'next',
      priority: 'medium',
      dueDate: null,
      startup: sm,
      areaLabel: 'Prodaja',
      done: false,
      canComplete: false,
    },
    {
      key: 'task:katalog-5',
      kind: 'task',
      id: 'katalog-5',
      title: 'Poslati izveštaj timu',
      status: 'done',
      priority: null,
      dueDate: noonIn(now, 0),
      startup: cr,
      areaLabel: 'Operativa',
      done: true,
      canComplete: true,
    },
  ];
}
