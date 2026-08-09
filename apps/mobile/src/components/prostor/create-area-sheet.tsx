import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

/** Ogledalo `cleanRequiredText(..., "Naziv oblasti", 100)` iz `startups.createArea`. */
const MAX_LABEL = 100;

/**
 * Nova oblast — mobilni pandan web `create-area-dialog.tsx`, kao bottom sheet.
 * Ista mutacija (`startups.createArea`), isti limit naziva; oblast dobija i svoj
 * chat kanal na serveru, pa ovde nema dodatnog koraka.
 *
 * Član startupa sme da pravi oblast (ne samo admin) — server to i proverava kroz
 * `requireStartupMember`, pa ekran ne gejtuje dugme dodatno.
 */
export function CreateAreaSheet({
  open,
  startupId,
  onClose,
  onCreated,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  onClose: () => void;
  onCreated?: (areaId: Id<'startupAreas'>) => void;
}) {
  const colors = useThemeColors();
  const createArea = useMutation(api.startups.createArea);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const clean = label.trim();
    if (!clean) {
      haptics.warning();
      Alert.alert('Prazan naziv', 'Unesi naziv oblasti.');
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      const areaId = await createArea({ startupId, label: clean });
      haptics.success();
      setLabel('');
      onClose();
      onCreated?.(areaId);
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Oblast nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Nova oblast
      </Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Oblast grupiše stranice tima i dobija svoj kanal u ćaskanju.
      </Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        autoFocus
        editable={!busy}
        maxLength={MAX_LABEL}
        placeholder="npr. HR, Finansije, Logistika…"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        accessibilityLabel="Naziv oblasti"
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
        ]}
      />
      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button label="Kreiraj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
    gap: 10,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  description: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  flexBtn: {
    flex: 1,
  },
});
