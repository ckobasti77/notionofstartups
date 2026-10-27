import { cleanNoteText, NOTE_TEXT_MAX } from '@devotion/shared';
import { ArrowUp } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { StartupChip } from '@/components/me/startup-chip';
import { IconButton } from '@/components/ui/icon-button';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

import { quickNoteHint } from './misli-model';

/**
 * Polje „Brza beleška…" na vrhu liste (PROSTOR P7, K18): višelinijski unos i
 * dugme za čuvanje (Enter pravi novi red). Ispod polja kratko piše gde se
 * beleška čuva — izabrani startup, a pod „Sve" i „Lično" je to Lično.
 * Prezentaciona: čuvanje radi pozivalac (`onSave`), greška se vraća kao `Error`
 * sa porukom za korisnika i ostaje ispod polja uz sačuvan tekst.
 */
export function NoteQuickInput({
  target,
  onSave,
}: {
  /** `null` = Lično. */
  target: { name: string; logoUrl: string | null } | null;
  onSave: (text: string) => Promise<void>;
}) {
  const colors = useThemeColors();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = cleanNoteText(value);
  const canSave = check.ok && !busy;
  // Predug tekst dobija poruku odmah; prazan nema poruku (dugme je samo tiho onemogućeno).
  const shownError = error ?? (check.ok ? null : check.reason);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      setValue('');
      // Tastatura bi sakrila traku „Poništi" koja se pojavljuje odmah posle čuvanja.
      Keyboard.dismiss();
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error && cause.message ? cause.message : 'Beleška nije sačuvana. Pokušaj ponovo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={(next) => {
            setValue(next);
            setError(null);
          }}
          multiline
          maxLength={NOTE_TEXT_MAX + 1}
          placeholder="Brza beleška…"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          accessibilityLabel="Brza beleška"
          editable={!busy}
          textAlignVertical="top"
          style={[
            styles.input,
            {
              color: colors.foreground,
              backgroundColor: colors.surface,
              borderColor: shownError ? colors.danger : colors.input,
            },
          ]}
        />
        <IconButton
          accessibilityLabel="Sačuvaj belešku"
          disabled={!canSave}
          style={styles.send}
          onPress={() => void save()}>
          <ArrowUp size={22} color={canSave ? colors.primaryText : colors.subtle} />
        </IconButton>
      </View>
      <View style={styles.hint}>
        <StartupChip startup={target} size="sm" />
        <Text numberOfLines={1} style={[styles.hintText, { color: colors.mutedForeground }]}>
          {quickNoteHint(target)}
        </Text>
      </View>
      {shownError ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: colors.danger }]}>
          {shownError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    paddingBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  input: {
    ...text.body,
    flex: 1,
    minHeight: MIN_TOUCH_TARGET + 4,
    maxHeight: 140,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  // Dugme je 44 pt, polje 48 pt: poravnanje po sredini prvog reda.
  send: { marginTop: 2 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintText: {
    ...text.meta,
    flexShrink: 1,
  },
  error: {
    ...text.body,
  },
});
