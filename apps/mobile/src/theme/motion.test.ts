import { reanimatedSpring, REDUCED_FADE_MS, SPRING } from '@devotion/shared';
import { describe, expect, test, vi } from 'vitest';

// `theme/motion` uzima samo krivu i konstantu iz Reanimated-a; native modul nije potreban.
vi.mock('react-native-reanimated', () => ({
  Easing: { bezier: () => (value: number) => value },
  ReduceMotion: { Never: 'never' },
}));

describe('telefonski rečnik pokreta (K19)', () => {
  test('SHEET_SPRING je `smooth` iz shared — isti spring kao web panel', async () => {
    const { SHEET_SPRING, SPRINGS } = await import('./motion');
    const smooth = reanimatedSpring(SPRING.smooth);
    expect(SHEET_SPRING.stiffness).toBeCloseTo(smooth.stiffness, 6);
    expect(SHEET_SPRING.damping).toBeCloseTo(smooth.damping, 6);
    expect(SHEET_SPRING.mass).toBe(smooth.mass);
    expect(SHEET_SPRING.overshootClamping).toBe(false);
    expect(SHEET_SPRING).toEqual(SPRINGS.smooth);
    // Kritično prigušen (c² = 4km): sheet nikad ne odskoči i ne otkrije prazninu ispod sebe.
    expect(SHEET_SPRING.damping ** 2).toBeCloseTo(4 * SHEET_SPRING.stiffness * SHEET_SPRING.mass, 6);
    // Raniji lokalni brojevi (280/26/0,9) više nisu u upotrebi.
    expect(SHEET_SPRING.stiffness).not.toBe(280);
  });

  test('smanjen pokret je samo pretapanje iz shared trajanja', async () => {
    const { REDUCED_FADE } = await import('./motion');
    expect(REDUCED_FADE.duration).toBe(REDUCED_FADE_MS);
  });
});
