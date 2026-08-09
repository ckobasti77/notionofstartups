import { ChevronRight, Pencil, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';

const MAX_INSTRUCTIONS = 20_000; // ogledalo `MAX_TASK_INSTRUCTIONS_LENGTH`

/**
 * Sklopiva sekcija instrukcija zadatka (docs/mobile/02-EKRANI.md §9.2). Prikaz za
 * sve; kreator (`canEdit`) dobija olovku koja otvara sheet sa višelinijskim unosom.
 * Snimanje ide kroz `onSave` → `updateMetadata({ instructions })` (prazno = `null`).
 */
export function InstructionsSection({
  instructions,
  canEdit,
  onSave,
}: {
  instructions: string | null | undefined;
  canEdit: boolean;
  onSave: (text: string | null) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const text = instructions?.trim() ?? '';
  const [expanded, setExpanded] = useState(text.length > 0);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const openEditor = () => {
    setDraft(text);
    setEditOpen(true);
  };
  const save = () => {
    const next = draft.trim();
    onSave(next.length > 0 ? next : null);
    setEditOpen(false);
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Skupi instrukcije' : 'Proširi instrukcije'}
          onPress={() => setExpanded((value) => !value)}
          hitSlop={6}
          style={styles.headerLeft}>
          <ChevronRight
            size={18}
            color={colors.mutedForeground}
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          />
          <Text style={[styles.headerLabel, { color: colors.foreground }]}>Instrukcije</Text>
        </Pressable>
        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Uredi instrukcije"
            onPress={openEditor}
            hitSlop={8}
            style={styles.editButton}>
            <Pencil size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {expanded ? (
        text.length > 0 ? (
          <Text style={[styles.body, { color: colors.foreground }]}>{text}</Text>
        ) : (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            {canEdit ? 'Nema instrukcija — dodirni olovku da ih dodaš.' : 'Nema instrukcija.'}
          </Text>
        )
      ) : null}

      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}>
        <Pressable
          accessibilityLabel="Zatvori"
          style={styles.backdrop}
          onPress={() => setEditOpen(false)}
        />
        <KeyboardAvoidingView
          // `padding` na oba: Expo SDK 57 edge-to-edge (Android) razbija OS
          // `adjustResize` (isto kao quick-add-sheet / razgovor).
          behavior="padding"
          style={styles.kav}
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
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Instrukcije</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zatvori"
                onPress={() => setEditOpen(false)}
                hitSlop={8}
                style={styles.sheetClose}>
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="Opiši šta treba uraditi…"
              multiline
              autoFocus
              maxLength={MAX_INSTRUCTIONS}
              style={styles.input}
              accessibilityLabel="Tekst instrukcija"
            />
            <Button label="Sačuvaj" onPress={save} fullWidth style={styles.save} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  headerLabel: {
    ...text.body,
    fontWeight: fontWeight.bold,
  },
  editButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    ...text.body,
  },
  empty: {
    ...text.body,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    ...text.title,
  },
  sheetClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 120,
    maxHeight: 260,
    textAlignVertical: 'top',
  },
  save: {
    marginTop: 12,
  },
});
