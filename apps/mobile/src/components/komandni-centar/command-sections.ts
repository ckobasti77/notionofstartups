import type { StartupTaskSection } from '@devotion/shared';

/**
 * Registar sekcija redova Komandnog centra (PROSTOR K19). Svaki blok sa redovima
 * zadataka (Za tebe, Trijaža) prijavljuje svoje sekcije pod svojim ID-jem, a
 * `locate` (zadržavanje posle kvačice) i `getRow` (sheetovi radnji) čitaju SVE
 * sekcije zajedno — red mora da se nađe bez obzira u kom je bloku. Ključevi
 * redova su različiti po bloku (`za-tebe:task:x` ≠ `task:x`).
 */
export type SectionsRegistry = Map<string, ReadonlyArray<StartupTaskSection>>;

/** Blok prijavljuje svoje sekcije; `null` ga odjavljuje (unmount, greška bloka). */
export type RegisterSections = (blockId: string, sections: ReadonlyArray<StartupTaskSection> | null) => void;

export function registerInto(
  registry: SectionsRegistry,
  blockId: string,
  sections: ReadonlyArray<StartupTaskSection> | null,
): void {
  if (sections === null) registry.delete(blockId);
  else registry.set(blockId, sections);
}

/** Sve prijavljene sekcije, redom prijave. */
export function allSections(registry: SectionsRegistry): StartupTaskSection[] {
  return [...registry.values()].flat();
}
