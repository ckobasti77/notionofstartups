import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Semantička haptika — zove se po ZNAČENJU akcije, ne po jačini vibracije.
 * Jedan rečnik za celu aplikaciju da isti događaj svuda oseća isto:
 *
 *  - `tap()`      — primarna akcija (pošalji, sačuvaj, kreiraj, otvori sheet)
 *  - `select()`   — promena izbora bez posledice (segment, čip, checkbox)
 *  - `success()`  — potvrda da je posao završen
 *  - `warning()`  — destruktivna radnja ili odbijena akcija (nemaš pravo)
 *  - `error()`    — neuspeh (mutacija bacila, mreža pukla)
 *
 * Haptika NIJE animacija: „smanji pokret" je ne gasi (to je podešavanje za
 * vizuelni pokret). Na webu je no-op — `react-native-web` nema Taptic Engine.
 */

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Primarna akcija. */
function tap(): void {
  if (!enabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Promena izbora — najtiši mogući signal. */
function select(): void {
  if (!enabled) return;
  void Haptics.selectionAsync();
}

/** Prelazak praga u gestu (svajp uhvatio akciju) — jači od `tap`. */
function threshold(): void {
  if (!enabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Potvrda: radnja je prošla. */
function success(): void {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Destruktivno ili odbijeno. */
function warning(): void {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** Neuspeh. */
function error(): void {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

export const haptics = { tap, select, threshold, success, warning, error };
