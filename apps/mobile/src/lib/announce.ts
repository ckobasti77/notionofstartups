import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Najava čitaču ekrana za radnju koja je upravo pokazala traku „Poništi" sa
 * ISTIM tekstom (K12). Na Androidu traku čita njen `accessibilityLiveRegion`,
 * pa bi druga najava bila dupla; iOS live region nema, pa tamo najavljujemo.
 */
export function announceWithUndoBar(message: string): void {
  if (Platform.OS !== 'android') AccessibilityInfo.announceForAccessibility(message);
}
