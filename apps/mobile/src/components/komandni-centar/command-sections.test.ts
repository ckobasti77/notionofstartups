import { locateStartupRow, type StartupTaskSection } from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import { allSections, registerInto, type SectionsRegistry } from './command-sections';
import { COMMAND_CENTER_LIST } from './startup-task-model';

function section(id: string, ...keys: string[]): StartupTaskSection {
  return {
    id,
    rows: keys.map((key) => ({ key, id: key }) as unknown as StartupTaskSection['rows'][number]),
  };
}

describe('Registar sekcija Komandnog centra (K19)', () => {
  test('blokovi se prijavljuju i odjavljuju; `locate` vidi sve prijavljene sekcije', () => {
    const registry: SectionsRegistry = new Map();
    registerInto(registry, 'za-tebe', [section('za-tebe', 'za-tebe:task:a')]);
    registerInto(registry, 'trijaza', [section('overdue', 'task:a', 'task:b'), section('today', 'task:c')]);

    expect(allSections(registry).map((entry) => entry.id)).toEqual(['za-tebe', 'overdue', 'today']);
    expect(locateStartupRow(COMMAND_CENTER_LIST, allSections(registry), 'task:c')).toEqual({
      section: `${COMMAND_CENTER_LIST}:today`,
      index: 0,
    });
    expect(locateStartupRow(COMMAND_CENTER_LIST, allSections(registry), 'za-tebe:task:a')).toEqual({
      section: `${COMMAND_CENTER_LIST}:za-tebe`,
      index: 0,
    });

    // Blok koji padne (ili se skine) više ne drži svoje redove.
    registerInto(registry, 'trijaza', null);
    expect(allSections(registry).map((entry) => entry.id)).toEqual(['za-tebe']);
    expect(locateStartupRow(COMMAND_CENTER_LIST, allSections(registry), 'task:c')).toBeNull();
  });

  test('ponovna prijava istog bloka zamenjuje njegove sekcije, ne dodaje ih', () => {
    const registry: SectionsRegistry = new Map();
    registerInto(registry, 'trijaza', [section('overdue', 'task:a')]);
    registerInto(registry, 'trijaza', [section('overdue', 'task:b')]);
    expect(allSections(registry)).toHaveLength(1);
    expect(allSections(registry)[0]?.rows[0]?.key).toBe('task:b');
  });
});
