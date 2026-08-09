import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * JEDAN izvor istine za „smanji pokret" (iOS: Settings → Accessibility → Motion;
 * Android: Settings → Accessibility → Remove animations).
 *
 * Zašto store, a ne `useState` po komponenti: podešavanje je globalno i menja se
 * retko, a hook koristi svaki sheet, svaka lista i svaki skeleton. Sa jednim
 * pretplatnikom na `AccessibilityInfo` umesto stotinu, promena šalje jedan
 * re-render talas i nema curenja listener-a pri brzom mount/unmount ciklusu listi.
 *
 * Pravilo korišćenja: kad je `true`, animacija se NE skraćuje — gasi se. Krajnje
 * stanje se postavlja odmah (opacity 1, translate 0), jer je poenta podešavanja da
 * pokreta nema, a ne da ga ima manje.
 */

let reduced = false;
let started = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  if (next === reduced) return;
  reduced = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(publish);
    AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
  }
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => reduced;

/** `true` kad korisnik traži da se pokret ugasi. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
