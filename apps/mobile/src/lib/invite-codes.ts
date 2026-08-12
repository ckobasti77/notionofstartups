import { useSyncExternalStore } from 'react';

/**
 * Sesijsko pamćenje kodova pozivnica (PARITET-REVIZIJA C17). Server čuva samo
 * `codeHash` (`invites.ts`) — kod posle kreiranja postoji fizički samo u
 * odgovoru mutacije, pa se posle zatvaranja jednokratnog Alert-a gubi zauvek.
 * Ovaj modul ga drži u memoriji procesa dok je sesija živa, da admin može da
 * podeli link i kasnije (npr. posle greške u kucanju adresata u WhatsApp-u).
 *
 * NAMERNO se NE upisuje u `expo-secure-store` ni `AsyncStorage` — kod pozivnice
 * je kredencijal, i njegovo trajno čuvanje na uređaju je veća površina napada
 * nego što je pogodnost vredna. Nestaje sa ubijanjem procesa aplikacije — to je
 * očekivano ponašanje, ne bag.
 *
 * Isti obrazac kao `lib/undo.ts`: modul-store van React-a, Set listenera +
 * `useSyncExternalStore`. `getSnapshot` vraća STABILNU referencu dok se ništa
 * ne menja — `codes` se zamenjuje novim objektom samo pri upisu.
 */
let codes: Readonly<Record<string, string>> = {};
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((listener) => listener());
}

/** Zapamti kod pozivnice za trajanje ove sesije aplikacije. */
export function rememberInviteCode(inviteId: string, code: string): void {
  codes = { ...codes, [inviteId]: code };
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => codes;

/** Kodovi pozivnica zapamćeni u ovoj sesiji, po `inviteId`. */
export function useInviteCodes(): Readonly<Record<string, string>> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
