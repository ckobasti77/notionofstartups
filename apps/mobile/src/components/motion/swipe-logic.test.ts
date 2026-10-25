import { SWIPE } from '@devotion/shared';
import { describe, expect, test } from 'vitest';

import {
  armedSide,
  resolveSwipe,
  revealScale,
  rubberband,
  startsInEdgeGuard,
  swipeOffset,
} from './swipe-logic';

describe('resolveSwipe', () => {
  test('preko praga potvrđuje u smeru prsta', () => {
    expect(resolveSwipe({ translationX: 96, velocityX: 0 })).toBe('right');
    expect(resolveSwipe({ translationX: -96, velocityX: 0 })).toBe('left');
    expect(resolveSwipe({ translationX: 140, velocityX: 300 })).toBe('right');
  });

  test('ispod praga i bez trzaja — ništa', () => {
    expect(resolveSwipe({ translationX: 95, velocityX: 0 })).toBeNull();
    expect(resolveSwipe({ translationX: -60, velocityX: -500 })).toBeNull();
    expect(resolveSwipe({ translationX: 0, velocityX: 2_000 })).toBeNull();
  });

  test('trzaj ≥ 800 pt/s posle ≥ 48 pt potvrđuje i pre praga', () => {
    expect(resolveSwipe({ translationX: 48, velocityX: 800 })).toBe('right');
    expect(resolveSwipe({ translationX: -60, velocityX: -1_200 })).toBe('left');
  });

  test('trzaj na premalom putu ne potvrđuje (slučajan dodir)', () => {
    expect(resolveSwipe({ translationX: 47, velocityX: 3_000 })).toBeNull();
    expect(resolveSwipe({ translationX: -20, velocityX: -3_000 })).toBeNull();
  });

  test('trzaj u suprotnom smeru ne potvrđuje', () => {
    expect(resolveSwipe({ translationX: 70, velocityX: -1_500 })).toBeNull();
  });

  test('preko praga, ali prst trza nazad — predomišljanje, nije potvrda', () => {
    expect(resolveSwipe({ translationX: 110, velocityX: -900 })).toBeNull();
    expect(resolveSwipe({ translationX: -110, velocityX: 900 })).toBeNull();
    // Spor povratak preko praga je i dalje potvrda.
    expect(resolveSwipe({ translationX: 110, velocityX: -300 })).toBe('right');
  });

  test('zadat prag menja granicu', () => {
    expect(resolveSwipe({ translationX: 60, velocityX: 0, thresholdPx: 56 })).toBe('right');
    expect(resolveSwipe({ translationX: 60, velocityX: 0, thresholdPx: 120 })).toBeNull();
  });
});

describe('rubberband', () => {
  test('do granice prati prst 1:1', () => {
    expect(rubberband(0, 120)).toBe(0);
    expect(rubberband(80, 120)).toBe(80);
    expect(rubberband(-120, 120)).toBe(-120);
  });

  test('posle granice otpor raste, bez zida i bez prelaska 2 × granica', () => {
    const at = (x: number) => rubberband(x, 120);
    expect(at(121)).toBeGreaterThan(120);
    expect(at(121) - 120).toBeLessThan(1);
    expect(at(200)).toBeLessThan(200);
    expect(at(300)).toBeGreaterThan(at(200));
    expect(at(10_000)).toBeLessThan(240);
    expect(rubberband(-300, 120)).toBe(-at(300));
  });

  test('neispravna granica ne menja vrednost', () => {
    expect(rubberband(50, 0)).toBe(50);
  });
});

describe('swipeOffset', () => {
  test('smer bez radnje se ne pomera', () => {
    expect(swipeOffset(80, { left: true, right: false })).toBe(0);
    expect(swipeOffset(-80, { left: false, right: true })).toBe(0);
  });

  test('dozvoljen smer prati prst, posle 120 pt uz otpor', () => {
    expect(swipeOffset(80, { left: false, right: true })).toBe(80);
    expect(swipeOffset(-80, { left: true, right: false })).toBe(-80);
    expect(swipeOffset(200, { left: false, right: true })).toBeLessThan(200);
    expect(swipeOffset(200, { left: false, right: true })).toBeGreaterThan(SWIPE.resistAfterPx);
  });
});

describe('armedSide i revealScale', () => {
  test('naoružano tek na pragu', () => {
    expect(armedSide(95)).toBeNull();
    expect(armedSide(96)).toBe('right');
    expect(armedSide(-96)).toBe('left');
    expect(armedSide(40, 32)).toBe('right');
  });

  test('ikonica raste od 0,8 do 1 na pragu, pa ostaje 1', () => {
    expect(revealScale(0)).toBeCloseTo(SWIPE.iconScaleFrom);
    expect(revealScale(48)).toBeCloseTo(0.9);
    expect(revealScale(-96)).toBe(1);
    expect(revealScale(400)).toBe(1);
  });
});

describe('startsInEdgeGuard', () => {
  test('prvih 24 pt od leve ivice pripada sistemskom nazad', () => {
    expect(startsInEdgeGuard(0)).toBe(true);
    expect(startsInEdgeGuard(23.5)).toBe(true);
    expect(startsInEdgeGuard(24)).toBe(false);
    expect(startsInEdgeGuard(200)).toBe(false);
  });
});
