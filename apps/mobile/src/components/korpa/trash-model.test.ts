import { describe, expect, test } from 'vitest';

import {
  FILE_PAGE_IN_TRASH,
  NO_RESTORE_RIGHT,
  openTargetAfterRestore,
  recoveredExcerpts,
  restoreBlockReason,
  restoreTarget,
  RETURNS_TO_AREA_ROOT,
  TRASH_EMPTY_COPY,
  trashCountLabel,
  trashItemKey,
  trashItemLocation,
  trashItemMeta,
  trashItemTitle,
  type TrashItem,
} from './trash-model';

const ZONE = 'Europe/Belgrade';
const NOW = Date.UTC(2026, 9, 26, 10, 0);
const DAY = 86_400_000;
const ana = { _id: 'p1' as never, displayName: 'Ana Petrović', avatarUrl: null };

const page: Extract<TrashItem, { kind: 'page' }> = {
  kind: 'page',
  pageId: 'pg1' as never,
  title: 'Specifikacija API',
  pageKind: 'note',
  areaId: 'a1' as never,
  areaLabel: 'Razvoj',
  parentPageId: 'pg0' as never,
  parentTitle: 'Lansiranje',
  parentAvailable: true,
  descendantCount: 3,
  archivedAt: NOW - 2 * DAY,
  archivedBy: ana,
  canRestore: true,
};

const file: Extract<TrashItem, { kind: 'file' }> = {
  kind: 'file',
  fileId: 'f1' as never,
  name: 'ugovor.pdf',
  category: 'pdf',
  size: 2_516_582,
  pageId: 'pg2' as never,
  pageTitle: 'Pravno',
  pageAvailable: true,
  archivedAt: NOW - 5 * DAY,
  archivedBy: null,
  canRestore: true,
};

const idea: Extract<TrashItem, { kind: 'idea' }> = {
  kind: 'idea',
  ideaId: 'i1' as never,
  title: 'Referral',
  archivedAt: NOW,
  archivedBy: ana,
  canRestore: true,
};

const recovered: Extract<TrashItem, { kind: 'recovered' }> = {
  kind: 'recovered',
  recoveredId: 'r1' as never,
  title: 'Stari plan',
  sourceKind: 'page',
  createdAt: NOW - DAY,
  owner: ana,
  contributions: [1, 2, 3, 4, 5].map((n) => ({
    _id: `c${n}` as never,
    excerpt: `Isečak ${n}`,
    author: n === 2 ? null : ana,
    createdAt: NOW - n * DAY,
  })),
  canDismiss: true,
};

describe('Korpa na telefonu — model reda (K09)', () => {
  test('stranica: mesto, podstranice, ko i kad; roditelj u Korpi → vrh oblasti', () => {
    expect(trashItemTitle(page)).toBe('Specifikacija API');
    expect(trashItemLocation(page)).toBe('Razvoj › Lansiranje');
    expect(trashItemMeta(page, NOW, ZONE)).toBe('Sa 3 podstranice · Obrisao/la Ana Petrović · pre 2 dana');
    const orphan = { ...page, parentAvailable: false, descendantCount: 0 };
    expect(trashItemMeta(orphan, NOW, ZONE)).toBe(
      `Obrisao/la Ana Petrović · pre 2 dana · ${RETURNS_TO_AREA_ROOT}`,
    );
    // Koren oblasti nema roditelja — nema ni napomene o vrhu oblasti.
    const root = { ...page, parentPageId: null, parentTitle: null, parentAvailable: false };
    expect(trashItemLocation(root)).toBe('Razvoj');
    expect(trashItemMeta(root, NOW, ZONE)).not.toContain(RETURNS_TO_AREA_ROOT);
  });

  test('prilog: vrsta, veličina i stranica; nepoznat brisač → „Obrisano"', () => {
    expect(trashItemTitle(file)).toBe('ugovor.pdf');
    expect(trashItemLocation(file)).toBe('PDF · 2.4 MB · na stranici „Pravno”');
    expect(trashItemMeta(file, NOW, ZONE)).toBe('Obrisano · pre 5 dana');
    expect(trashItemLocation({ ...file, category: 'image', size: 900 })).toBe(
      'Slika · 900 B · na stranici „Pravno”',
    );
  });

  test('ideja nema mesto; upravo obrisana kaže „upravo"', () => {
    expect(trashItemLocation(idea)).toBeNull();
    expect(trashItemMeta(idea, NOW, ZONE)).toBe('Obrisao/la Ana Petrović · upravo');
  });

  test('razlog onemogućenog „Vrati": prvo stranica priloga u Korpi, pa pravo', () => {
    expect(restoreBlockReason(page)).toBeNull();
    expect(restoreBlockReason({ ...page, canRestore: false })).toBe(NO_RESTORE_RIGHT);
    expect(restoreBlockReason({ ...file, pageAvailable: false, canRestore: false })).toBe(FILE_PAGE_IN_TRASH);
  });

  test('cilj vraćanja i „Otvori": ideja na detalj ideje, prilog na svoju stranicu', () => {
    expect(restoreTarget(page)).toEqual({ kind: 'page', id: 'pg1' });
    expect(restoreTarget(idea)).toEqual({ kind: 'idea', id: 'i1' });
    expect(restoreTarget(file)).toEqual({ kind: 'file', id: 'f1' });
    expect(openTargetAfterRestore(page)).toEqual({ kind: 'page', pageId: 'pg1' });
    expect(openTargetAfterRestore(idea)).toEqual({ kind: 'idea', ideaId: 'i1' });
    expect(openTargetAfterRestore(file)).toEqual({ kind: 'page', pageId: 'pg2' });
  });

  test('Oporavljeno: vlasnik i množina, tri isečka i „+N", bez autora „Raniji tekst tima"', () => {
    expect(trashItemMeta(recovered, NOW, ZONE)).toBe('Sačuvano za Ana Petrović · 5 tekstova');
    expect(trashItemMeta({ ...recovered, owner: null, contributions: recovered.contributions.slice(0, 1) }, NOW)).toBe(
      'Sačuvano · 1 tekst',
    );
    expect(trashItemMeta({ ...recovered, contributions: recovered.contributions.slice(0, 2) }, NOW)).toContain(
      '2 teksta',
    );
    const excerpts = recoveredExcerpts(recovered);
    expect(excerpts.lines.map((line) => line.author)).toEqual(['Ana Petrović', 'Raniji tekst tima', 'Ana Petrović']);
    expect(excerpts.more).toBe(2);
    expect(recoveredExcerpts({ ...recovered, contributions: [] })).toEqual({ lines: [], more: 0 });
  });

  test('ključevi su jedinstveni po vrsti, broj „99+" i prazna stanja bez roka', () => {
    expect([page, idea, file, recovered].map(trashItemKey)).toEqual([
      'page:pg1',
      'idea:i1',
      'file:f1',
      'recovered:r1',
    ]);
    expect(trashCountLabel(undefined)).toBeNull();
    expect(trashCountLabel({ count: 0, capped: false })).toBeNull();
    expect(trashCountLabel({ count: 7, capped: false })).toBe('7');
    expect(trashCountLabel({ count: 99, capped: true })).toBe('99+');
    for (const copy of Object.values(TRASH_EMPTY_COPY)) {
      expect(`${copy.title} ${copy.description ?? ''}`).not.toMatch(/30 dana|trajno/i);
    }
  });
});
