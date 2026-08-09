import { ChevronRight, Pencil, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

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
  const text = instructions?.trim() ?? '';
  const [expanded, setExpanded] = useState(text.length > 0);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const openEditor = () => {
    haptics.tap();
    setDraft(text);
    setEditOpen(true);
  };
  const save = () => {
    const next = draft.trim();
    haptics.success();
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

      <Sheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        avoidKeyboard
        style={styles.sheet}>
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
      </Sheet>
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
  sheet: {
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
