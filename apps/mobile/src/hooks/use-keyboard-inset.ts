import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * Koliko tastatura preklapa dno prozora, u dp; `0` dok je skrivena.
 *
 * Zašto ne `KeyboardAvoidingView`: njegov `onLayout` daje koordinate RELATIVNE
 * roditelju, a visinu tastature poredi sa APSOLUTNIM `screenY` — duboko
 * ugnježden (npr. traka editora ispod zaglavlja i sekcija) izračuna pomak od
 * ~40dp umesto pune visine tastature, pa sadržaj ostane ISPOD nje (bag E10).
 * Preklop se zato računa direktno iz keyboard eventa: `visina prozora −
 * screenY tastature`. Ako OS ipak smanji prozor (adjustResize), razlika sama
 * padne na 0 — nema dvostrukog pomeranja.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // `Will*` postoji samo na iOS-u; Android emituje isključivo `Did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      const windowHeight = Dimensions.get('window').height;
      setInset(Math.max(0, windowHeight - event.endCoordinates.screenY));
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
