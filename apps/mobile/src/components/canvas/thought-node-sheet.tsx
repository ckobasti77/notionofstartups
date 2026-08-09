import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import {
  THOUGHT_COLOR_LABEL,
  THOUGHT_COLORS,
  THOUGHT_SWATCH,
  type ThoughtColor,
} from '@/lib/thought-colors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, type ColorTokens } from '@/theme/tokens';

/** Backend limiti (`thoughts.ts`): naslov ≤200, tekst ≤12000. */
const MAX_TITLE = 200;
const MAX_TEXT = 12_000;

/** Detalj misli razrešen iz `thoughts.listNodes` po `nodeId` iz WebView poruke. */
export type ThoughtDetail = {
  _id: Id<'thoughtNodes'>;
  title: string | null;
  text: string;
  color: ThoughtColor;
  isParent: boolean;
};

/**
 * Bottom sheet sa detaljem misli na tap čvora u canvas WebView-u (M4.4, §9.3:
 * „editovanje sadržaja radi native, layout ostaje u WebView-u"). Misli su privatne
 * po vlasniku — edit ide kroz `thoughts.updateNode`, brisanje kroz `archiveNodes`;
 * WebView (koji sluša `thoughts.listNodes`) sam pokupi promenu realtime. Naslov je
 * obavezan (`cleanRequiredText` na serveru baca na prazan).
 */
export function ThoughtNodeSheet({
  thought,
  onClose,
}: {
  thought: ThoughtDetail | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const updateNode = useMutation(api.thoughts.updateNode);
  const archiveNodes = useMutation(api.thoughts.archiveNodes);

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [color, setColor] = useState<ThoughtColor>('neutral');
  const [busy, setBusy] = useState(false);

  // Kad se otvori nova misao, napuni formu njenim vrednostima.
  useEffect(() => {
    if (thought) {
      setTitle(thought.title ?? '');
      setText(thought.text);
      setColor(thought.color);
    }
  }, [thought]);

  const save = async () => {
    if (!thought) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      haptics.warning();
      Alert.alert('Prazan naslov', 'Misao mora imati naslov.');
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      await updateNode({
        nodeId: thought._id,
        title: cleanTitle,
        text: text.trim(),
        color,
      });
      haptics.success();
      onClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Misao nije sačuvana.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!thought) return;
    haptics.warning();
    Alert.alert('Obriši misao', 'Ova misao će biti uklonjena sa kanvasa.', [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await archiveNodes({ nodeIds: [thought._id] });
            haptics.success();
            onClose();
          } catch (error) {
            haptics.error();
            Alert.alert('Greška', accessErrorMessage(error, 'Misao nije obrisana.'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Sheet
      visible={thought !== null}
      onClose={onClose}
      avoidKeyboard
      maxHeight="85%"
      style={styles.sheet}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: colors.foreground }]}>Misao</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={MAX_TITLE}
          placeholder="Naslov"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          editable={!busy}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]}
        />
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_TEXT}
          placeholder="Tekst (opciono)"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          editable={!busy}
          style={[
            styles.input,
            styles.multiline,
            { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
          ]}
        />
        <ColorRow value={color} onChange={setColor} disabled={busy} colors={colors} />
      </ScrollView>

      <View style={styles.actions}>
        <Button
          label="Obriši"
          variant="ghost"
          onPress={remove}
          disabled={busy}
          style={styles.flexBtn}
        />
        <Button label="Sačuvaj" onPress={() => void save()} loading={busy} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

/** Red kružića za izbor boje misli (≥44pt dodirna meta po swatch-u). */
export function ColorRow({
  value,
  onChange,
  disabled,
  colors,
}: {
  value: ThoughtColor;
  onChange: (next: ThoughtColor) => void;
  disabled: boolean;
  colors: ColorTokens;
}) {
  return (
    <View style={styles.colorRow}>
      {THOUGHT_COLORS.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={`Boja: ${THOUGHT_COLOR_LABEL[option]}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              haptics.select();
              onChange(option);
            }}
            style={styles.swatchHit}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: THOUGHT_SWATCH[option],
                  borderColor: selected ? colors.foreground : 'transparent',
                  opacity: disabled ? 0.5 : 1,
                },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: 10,
    paddingBottom: 4,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  multiline: {
    minHeight: 96,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  swatchHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  flexBtn: {
    flex: 1,
  },
});
