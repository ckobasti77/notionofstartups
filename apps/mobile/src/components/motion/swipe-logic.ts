import { SWIPE } from '@devotion/shared';

/**
 * Čista logika swipe reda (plan K01 §7.2, K07 E5) — bez React-a i Reanimated-a,
 * pa je pokriva vitest. Funkcije su i workleti: `SwipeRow` ih zove sa UI niti
 * usred gesta (`'worklet'` je u telu, van Reanimated-a je samo string).
 */

export type SwipeSide = 'left' | 'right';

/**
 * Odluka pri puštanju prsta: `right` = prst je išao udesno, `left` = ulevo.
 *
 * - Preko praga → potvrda, OSIM kad prst u tom trenutku „trza" nazad ka nuli:
 *   to je predomišljanje, ne potvrda (Apple: animiraj ka onome kuda gest ide).
 * - Ispod praga → potvrda samo brzim trzajem u istom smeru, posle bar
 *   `flickMinPx` puta (mali slučajan trzaj ne sme da završi zadatak).
 */
export function resolveSwipe(input: {
  translationX: number;
  velocityX: number;
  thresholdPx?: number;
}): SwipeSide | null {
  'worklet';
  const { translationX, velocityX } = input;
  const threshold = input.thresholdPx ?? SWIPE.commitPx;
  const distance = Math.abs(translationX);
  if (distance === 0) return null;
  const direction = translationX > 0 ? 1 : -1;
  const flickingBack =
    Math.sign(velocityX) === -direction && Math.abs(velocityX) >= SWIPE.flickVelocity;

  if (distance >= threshold) {
    if (flickingBack) return null;
    return direction > 0 ? 'right' : 'left';
  }
  const flickingForward =
    Math.sign(velocityX) === direction && Math.abs(velocityX) >= SWIPE.flickVelocity;
  if (flickingForward && distance >= SWIPE.flickMinPx) {
    return direction > 0 ? 'right' : 'left';
  }
  return null;
}

/**
 * Gumeni otpor posle `limit`: do granice red prati prst 1:1, posle nje sve
 * manje (Apple: `(o · d · c) / (d + c · o)`), pa nikad ne prelazi `2 · limit`.
 * Neprekidno i monotono — nema „zida" na granici.
 */
export function rubberband(x: number, limit: number): number {
  'worklet';
  const distance = Math.abs(x);
  if (distance <= limit || limit <= 0) return x;
  const overshoot = distance - limit;
  const c = SWIPE.rubberband;
  const resisted = (overshoot * limit * c) / (limit + c * overshoot);
  return Math.sign(x) * (limit + resisted);
}

/**
 * Pomeraj reda za dati put prsta: smer bez radnje se ne pomera (zid je jasniji
 * od praznog otkrivanja), a preko `resistAfterPx` važi gumeni otpor.
 */
export function swipeOffset(
  translationX: number,
  allowed: { left: boolean; right: boolean },
): number {
  'worklet';
  if (translationX > 0 && !allowed.right) return 0;
  if (translationX < 0 && !allowed.left) return 0;
  return rubberband(translationX, SWIPE.resistAfterPx);
}

/** Strana koja je trenutno „naoružana" (prešla prag) — za haptički tik jednom po prelazu. */
export function armedSide(offset: number, thresholdPx: number = SWIPE.commitPx): SwipeSide | null {
  'worklet';
  if (offset >= thresholdPx) return 'right';
  if (offset <= -thresholdPx) return 'left';
  return null;
}

/** Veličina ikonice radnje: raste linearno od `iconScaleFrom` do 1 na pragu. */
export function revealScale(offset: number, thresholdPx: number = SWIPE.commitPx): number {
  'worklet';
  if (thresholdPx <= 0) return 1;
  const progress = Math.min(1, Math.abs(offset) / thresholdPx);
  return SWIPE.iconScaleFrom + (1 - SWIPE.iconScaleFrom) * progress;
}

/** Dodir koji počinje uz levu ivicu ekrana pripada sistemskom „nazad", ne redu. */
export function startsInEdgeGuard(absoluteX: number): boolean {
  'worklet';
  return absoluteX < SWIPE.edgeGuardPx;
}
