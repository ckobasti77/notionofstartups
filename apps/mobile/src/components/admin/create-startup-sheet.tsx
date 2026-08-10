import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, text } from '@/theme/tokens';

/** Ogledalo `cleanRequiredText(..., "Naziv startupa", 100)` iz `startups.create`. */
const MAX_NAME = 100;
/** Ogledalo `cleanOptionalText(..., "Opis", 500)`. */
const MAX_DESCRIPTION = 500;

/**
 * Novi startup — mobilni pandan „Startup" tabu u web `admin-dialog.tsx` (create
 * grana), kao bottom sheet. `startups.create` je admin-only i sam pravi
 * podrazumevane oblasti (Dev/Marketing/Sales/Other) i opšti kanal — logo se ne
 * bira ovde, dodaje se posle kroz „Administracija startupa" (ekran ostaje
 * fokusiran, a admin tako odmah vidi novi startup pre nego što bira sliku).
 */
export function CreateStartupSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (startupId: Id<'startups'>) => void;
}) {
  const colors = useThemeColors();
  const createStartup = useMutation(api.startups.create);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      haptics.warning();
      Alert.alert('Prazan naziv', 'Unesi naziv startupa.');
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      const startupId = await createStartup({ name: cleanName, description: description.trim() });
      haptics.success();
      setName('');
      setDescription('');
      onClose();
      onCreated?.(startupId);
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Startup nije kreiran.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard maxHeight="80%" style={styles.sheet}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
          Novi startup
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Dobija podrazumevane oblasti (Dev, Marketing, Sales, Other) i opšti kanal za tim. Logo
          dodaješ posle, iz administracije startupa.
        </Text>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Naziv</Text>
          <Input
            value={name}
            onChangeText={setName}
            autoFocus
            editable={!busy}
            maxLength={MAX_NAME}
            placeholder="npr. Nesto"
            accessibilityLabel="Naziv startupa"
            returnKeyType="next"
          />
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Opis (opciono)</Text>
          <Input
            value={description}
            onChangeText={setDescription}
            editable={!busy}
            maxLength={MAX_DESCRIPTION}
            multiline
            numberOfLines={3}
            placeholder="Čime se startup bavi…"
            accessibilityLabel="Opis startupa"
            style={styles.multiline}
          />
        </View>
        <View style={styles.actions}>
          <Button
            label="Otkaži"
            variant="ghost"
            onPress={onClose}
            disabled={busy}
            style={styles.flexBtn}
          />
          <Button label="Kreiraj" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  heading: {
    ...text.title,
    marginBottom: 4,
  },
  description: {
    ...text.body,
    marginBottom: 16,
  },
  field: {
    gap: 6,
    marginBottom: 14,
  },
  label: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  multiline: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
    paddingBottom: 4,
  },
  flexBtn: {
    flex: 1,
  },
});
