import { arrangeNotes } from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import {
  filterStartupId,
  hasMoreNotes,
  isSearchingNotes,
  noteRowModel,
  noteSearchRowModel,
  NOTE_INDENT_PX,
  NOTES_AUTO_LOAD_MAX,
  quickNoteHint,
  quickNoteTarget,
  shouldAutoLoadNotes,
  shouldLoadMoreOnEnd,
  tidyNoteTargets,
  TIDY_NOTES_MAX,
  type NoteListItem,
  type NoteStartup,
} from './misli-model';

// 26. oktobar 2026, 15:00 po Beogradu.
const NOW = Date.UTC(2026, 9, 26, 14, 0);
const HOUR = 3_600_000;
const BG = 'Europe/Belgrade';

const CR: NoteStartup = { _id: 's1', name: 'Cluck Rush', logoUrl: null };
const SM: NoteStartup = { _id: 's2', name: 'Scan Me', logoUrl: null };

function note(id: string, options: Partial<NoteListItem> = {}): NoteListItem {
  return {
    _id: id,
    startupId: null,
    startup: null,
    title: id,
    text: `tekst ${id}`,
    parentThoughtId: null,
    updatedAt: NOW - 2 * HOUR,
    ...options,
  };
}

describe('Beleške (telefon): red liste', () => {
  test('naslov, isečak i meta dolaze iz shared funkcija', () => {
    const rows = arrangeNotes([note('a', { title: 'Ideja za onboarding', text: 'Kratak video', startupId: 's1', startup: CR })]);
    const model = noteRowModel(rows[0]!, NOW, BG);
    expect(model.title).toBe('Ideja za onboarding');
    expect(model.preview).toBe('Kratak video');
    expect(model.meta).toBe('Cluck Rush · pre 2 h');
    expect(model.startup).toEqual(CR);
  });

  test('lična beleška: meta „Lično", bez čipa startupa', () => {
    const model = noteRowModel(arrangeNotes([note('a')])[0]!, NOW, BG);
    expect(model.meta).toBe('Lično · pre 2 h');
    expect(model.startup).toBeNull();
  });

  test('bez naslova prvi red teksta je naslov, a isečak počinje od drugog reda', () => {
    const model = noteRowModel(arrangeNotes([note('a', { title: null, text: 'Prvi red\nDrugi red' })])[0]!, NOW, BG);
    expect(model.title).toBe('Prvi red');
    expect(model.preview).toBe('Drugi red');
  });

  test('podbeleška je uvučena 16 px po nivou, najviše tri nivoa, i to kaže čitaču', () => {
    const rows = arrangeNotes([
      note('root'),
      note('c1', { parentThoughtId: 'root' }),
      note('c2', { parentThoughtId: 'c1' }),
      note('c3', { parentThoughtId: 'c2' }),
      note('c4', { parentThoughtId: 'c3' }),
    ]);
    const models = rows.map((row) => noteRowModel(row, NOW, BG));
    expect(models.map((model) => model.indent)).toEqual([0, 1, 2, 3, 3].map((level) => level * NOTE_INDENT_PX));
    expect(models[0]!.label).not.toContain('Podbeleška');
    expect(models[1]!.label).toContain('Podbeleška');
  });
});

describe('Beleške (telefon): pretraga', () => {
  const hit = (startupId: string | null) => ({ _id: 'h', title: 'Oprema', text: 'Mikrofon\nStativ', startupId });

  test('rezultat je ravan red, startup se razrešava iz liste startupa', () => {
    const model = noteSearchRowModel(hit('s2'), [CR, SM]);
    expect(model.depth).toBe(0);
    expect(model.indent).toBe(0);
    expect(model.meta).toBe('Scan Me');
    expect(model.startup).toEqual({ name: 'Scan Me', logoUrl: null });
    expect(model.preview).toBe('Mikrofon Stativ');
  });

  test('lična beleška: „Lično"; nepoznat startup se ne izdaje za lično', () => {
    expect(noteSearchRowModel(hit(null), [CR]).meta).toBe('Lično');
    expect(noteSearchRowModel(hit('nema'), [CR]).meta).toBe('Startup');
  });

  test('server se pita tek od dva znaka (razmaci se ne broje)', () => {
    expect(isSearchingNotes('a')).toBe(false);
    expect(isSearchingNotes(' a ')).toBe(false);
    expect(isSearchingNotes('ab')).toBe(true);
    expect(isSearchingNotes('  ab ')).toBe(true);
  });
});

describe('Beleške (telefon): dovlačenje strana', () => {
  test('dovlači se dok nije Exhausted — kraća strana nije kraj', () => {
    expect(shouldAutoLoadNotes({ status: 'CanLoadMore', loaded: 0, searching: false })).toBe(true);
    expect(shouldAutoLoadNotes({ status: 'CanLoadMore', loaded: 12, searching: false })).toBe(true);
    expect(shouldAutoLoadNotes({ status: 'Exhausted', loaded: 12, searching: false })).toBe(false);
    expect(shouldAutoLoadNotes({ status: 'LoadingMore', loaded: 12, searching: false })).toBe(false);
    expect(shouldAutoLoadNotes({ status: 'LoadingFirstPage', loaded: 0, searching: false })).toBe(false);
  });

  test('iza granice staje, u pretrazi se ne dovlači, a skrol nastavlja', () => {
    expect(shouldAutoLoadNotes({ status: 'CanLoadMore', loaded: NOTES_AUTO_LOAD_MAX, searching: false })).toBe(false);
    expect(shouldAutoLoadNotes({ status: 'CanLoadMore', loaded: 10, searching: true })).toBe(false);
    expect(shouldLoadMoreOnEnd('CanLoadMore')).toBe(true);
    expect(shouldLoadMoreOnEnd('LoadingMore')).toBe(false);
    expect(shouldLoadMoreOnEnd('Exhausted')).toBe(false);
  });

  test('broj u zaglavlju dobija „+" dok ima još', () => {
    expect(hasMoreNotes('CanLoadMore')).toBe(true);
    expect(hasMoreNotes('LoadingMore')).toBe(true);
    expect(hasMoreNotes('Exhausted')).toBe(false);
  });
});

describe('Beleške (telefon): brzi unos i Sredi raspored', () => {
  test('odredište brzog unosa: izabran startup, inače Lično', () => {
    expect(quickNoteTarget({ kind: 'all' }, [CR, SM])).toBeNull();
    expect(quickNoteTarget({ kind: 'personal' }, [CR, SM])).toBeNull();
    expect(quickNoteTarget({ kind: 'startup', startupId: 's2' }, [CR, SM])).toEqual(SM);
    // Napušten startup: Lično, ne pad.
    expect(quickNoteTarget({ kind: 'startup', startupId: 'nema' }, [CR])).toBeNull();
    expect(quickNoteHint(null)).toBe('Čuva se u: Lično');
    expect(quickNoteHint(SM)).toBe('Čuva se u: Scan Me');
  });

  test('sheet nove beleške počinje od izabranog startupa, inače od Lično', () => {
    expect(filterStartupId({ kind: 'all' })).toBeNull();
    expect(filterStartupId({ kind: 'personal' })).toBeNull();
    expect(filterStartupId({ kind: 'startup', startupId: 's1' })).toBe('s1');
  });

  test('Sredi raspored: samo beleške bez roditelja, najviše 50', () => {
    const notes = [
      note('a'),
      note('b', { parentThoughtId: 'a' }),
      ...Array.from({ length: TIDY_NOTES_MAX + 3 }, (_, index) => note(`n${index}`)),
    ];
    const result = tidyNoteTargets(notes);
    expect(result.targets).toHaveLength(TIDY_NOTES_MAX);
    expect(result.targets.some((target) => target._id === 'b')).toBe(false);
    expect(result.topLevelCount).toBe(TIDY_NOTES_MAX + 4);
    expect(result.truncated).toBe(true);
    expect(tidyNoteTargets([note('a'), note('b', { parentThoughtId: 'a' })]).truncated).toBe(false);
    expect(tidyNoteTargets([note('b', { parentThoughtId: 'a' })]).targets).toEqual([]);
  });
});
