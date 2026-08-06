import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { areaColor } from '@/lib/task-meta';
import type { StartupArea } from '@/lib/tasks';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

/**
 * Brzo dodavanje zadatka: naslov + izbor oblasti → `pages.create` (kind „task").
 * Rok/prioritet/izvršioci se dodaju kasnije preko menija na kartici. Prva oblast je
 * podrazumevana.
 */
export function QuickAddSheet({
  visible,
  areas,
  submitting,
  onClose,
  onCreate,
}: {
  visible: boolean;
  areas: StartupArea[];
  submitting: boolean;
  onClose: () => void;
  onCreate: (title: string, areaId: Id<'startupAreas'>) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState<Id<'startupAreas'> | null>(null);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setAreaId(areas[0]?._id ?? null);
    }
  }, [visible, areas]);

  const canSubmit = title.trim().length > 0 && areaId !== null && !submitting;
  const submit = () => {
    if (title.trim().length === 0 || areaId === null) return;
    onCreate(title.trim(), areaId);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Zatvori" style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        // `padding` na oba: Expo SDK 57 edge-to-edge (Android) razbija OS
        // `adjustResize`, pa se oslanjamo na JS keyboard evente (isto kao
        // `razgovor/[id].tsx`). Sheet je pri dnu, pa offset nije potreban.
        behavior="padding"
        style={styles.avoider}
        pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.popover,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}>
          <Text style={[styles.heading, { color: colors.foreground }]}>Novi zadatak</Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Šta treba uraditi?"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Oblast</Text>
          {areas.length === 0 ? (
            <Text style={[styles.emptyAreas, { color: colors.mutedForeground }]}>
              Ovaj startup još nema oblasti — dodaj ih pre kreiranja zadatka.
            </Text>
          ) : null}
          <View style={styles.chips}>
            {areas.map((area) => {
              const active = area._id === areaId;
              return (
                <Pressable
                  key={area._id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={area.label}
                  onPress={() => setAreaId(area._id)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: active ? colors.accent : colors.secondary,
                      borderColor: active ? colors.primary : 'transparent',
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <View style={[styles.chipDot, { backgroundColor: areaColor(colors, area.key) }]} />
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: active ? colors.accentForeground : colors.foreground },
                    ]}>
                    {area.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Button label="Otkaži" variant="ghost" size="md" onPress={onClose} style={styles.actionBtn} />
            <Button
              label="Dodaj"
              size="md"
              loading={submitting}
              disabled={!canSubmit}
              onPress={submit}
              style={styles.actionBtn}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipLabel: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  emptyAreas: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    minWidth: 96,
  },
});
