/**
 * Motion tokeni — mali rečnik, jer je pokret u ovoj aplikaciji suzdržan.
 *
 * PRAVILA (docs/mobile/02-EKRANI.md §11 + zahtev „nikad dekorativno"):
 *  - Nijedna animacija ne sme da odloži trenutak kad korisnik može da nastavi.
 *    Sve što ulazi kroz `opacity`/`transform` je od prvog frejma dodirljivo.
 *  - Ulaz liste traje UKUPNO najviše 300ms — `STAGGER_STEP × STAGGER_MAX_INDEX +
 *    duration.item` je tačno toliko.
 *  - Kad je uključeno „smanji pokret" (`useReducedMotion`), ne skraćujemo — gasimo.
 */

/** Trajanja (ms). */
export const duration = {
  /** Izlaz sheet-a, gašenje skeletona — mora biti kraće od ulaza. */
  exit: 160,
  /** Ulazak jedne stavke liste. */
  item: 180,
  /** Crossfade skeleton → sadržaj. */
  swap: 200,
} as const;

/** Spring za sheet — bez odskoka koji se vidi kao „gumeno". */
export const SHEET_SPRING = {
  damping: 26,
  stiffness: 280,
  mass: 0.9,
  overshootClamping: false,
} as const;

/** Korak zakašnjenja između susednih stavki liste (ms). */
export const STAGGER_STEP = 30;
/** Posle ove stavke se više ne kasni — inače bi dugačka lista trajala sekundama. */
export const STAGGER_MAX_INDEX = 4;

/** Zakašnjenje za `index`-tu stavku; ukupno ≤ 120 + 180 = 300ms. */
export function staggerDelay(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX_INDEX) * STAGGER_STEP;
}

/** Koliko stavka „doputuje" nagore pri ulasku (px). Namerno malo. */
export const STAGGER_TRAVEL = 8;

/** Zatamnjenje backdrop-a ispod sheet-a na punom otvaranju. */
export const BACKDROP_OPACITY = 0.5;
