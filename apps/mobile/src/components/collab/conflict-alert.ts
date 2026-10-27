import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

import {
  conflictCopy,
  OVERWRITE_NOTICE,
  type ConflictSubject,
} from '@/components/collab/collab-model';
import { haptics } from '@/lib/haptics';
import { showUndoNotice } from '@/lib/undo';

/**
 * Konflikt revizije kao `Alert` (K07 §6.5 — telefon za opis oblasti, instrukcije i
 * vraćanje verzije; beleška ima svoj baner u `note-editor.tsx`). Dve odluke:
 * „Učitaj najnoviju" odbacuje tvoju verziju, „Prepiši" ponavlja isti upis preko
 * tuđe izmene (tuđa verzija ostaje u Istoriji izmena). Zatvaranje bez izbora ne
 * menja ništa. Kad je `draftText` zadat, „Učitaj najnoviju" ga prvo kopira u
 * klipbord (kao „Kopiraj moju verziju" na webu), da tekst ne nestane tiho.
 */
export function showConflictAlert(input: {
  subject: ConflictSubject;
  updaterName: string | null;
  updatedAt: number | null;
  onLoadLatest: () => void;
  onOverwrite: () => void;
  /** Tvoj nesačuvan tekst; ako je zadat, kopira se pri „Učitaj najnoviju". */
  draftText?: string | null;
}) {
  haptics.warning();
  const copy = conflictCopy({
    subject: input.subject,
    updaterName: input.updaterName,
    updatedAt: input.updatedAt,
    now: Date.now(),
  });
  const draft = input.draftText?.trim() ?? '';
  const body =
    draft === ''
      ? `${copy.body}\n\n${OVERWRITE_NOTICE}`
      : `${copy.body}\n\n${OVERWRITE_NOTICE} „Učitaj najnoviju" kopira tvoj tekst.`;
  Alert.alert(copy.title, body, [
    {
      text: 'Učitaj najnoviju',
      onPress: () => {
        if (draft !== '') {
          void Clipboard.setStringAsync(draft);
          showUndoNotice({ label: 'Tvoja verzija je kopirana.' });
        }
        input.onLoadLatest();
      },
    },
    { text: 'Prepiši', style: 'destructive', onPress: input.onOverwrite },
    { text: 'Otkaži', style: 'cancel' },
  ]);
}
