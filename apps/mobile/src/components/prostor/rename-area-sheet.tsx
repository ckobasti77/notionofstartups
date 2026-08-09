import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, space, text } from '@/theme/tokens';

/** Ogledalo `cleanRequiredText(..., "Naziv oblasti", 100)` iz `startups.updateArea`. */
const MAX_LABEL = 100;

/**
 * Preimenovanje oblasti — pandan olovke u web `area-view.tsx` i inline izmene u
 * `workspace-sidebar.tsx`. Ista mutacija (`startups.updateArea`), isti limit.
 *
 * Sme svaki član startupa (server proverava kroz `requireStartupMember`, ne
 * `requireAdmin`), pa ekran ne gejtuje dugme dodatno — kao ni `CreateAreaSheet`.
 */
export function RenameAreaSheet({
  open,
  areaId,
  currentLabel,
  onClose,
  onRenamed,
}: {
  open: boolean;
  areaId: Id<'startupAreas'>;
  currentLabel: string;
  onClose: () => void;
  /** Pozivalac drži naziv u svom okviru navigacije, pa ga mora osvežiti sam. */
  onRenamed?: (label: string) => void;
}) {
  const colors = useThemeColors();
  const updateArea = useMutation(api.startups.updateArea);
  const [label, setLabel] = useState(currentLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Otvaranje uvek kreće od aktuelnog naziva — sheet ostaje montiran između
  // otvaranja, pa bi bez ovoga pamtio prethodni draft.
  useEffect(() => {
    if (open) {
      setLabel(currentLabel);
      setError(null);
    }
  }, [open, currentLabel]);

  const submit = async () => {
    const clean = label.trim();
    if (!clean) {
      haptics.warning();
      setError('Naziv ne sme biti prazan.');
      return;
    }
    if (clean === currentLabel) {
      onClose();
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      await updateArea({ areaId, label: clean });
      haptics.success();
      onClose();
      onRenamed?.(clean);
    } catch (caught) {
      haptics.error();
      setError(accessErrorMessage(caught, 'Oblast nije preimenovana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Preimenuj oblast
      </Text>
      {error === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      )}
      <Input
        value={label}
        onChangeText={(next) => {
          setLabel(next);
          if (error !== null) setError(null);
        }}
        autoFocus
        editable={!busy}
        maxLength={MAX_LABEL}
        accessibilityLabel="Naziv oblasti"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <View style={styles.actions}>
        <Button
          label="Otkaži"
          variant="ghost"
          onPress={onClose}
          disabled={busy}
          style={styles.flexBtn}
        />
        <Button
          label="Sačuvaj"
          onPress={() => void submit()}
          loading={busy}
          style={styles.flexBtn}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: space[5],
    gap: space[2],
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  error: {
    ...text.body,
  },
  actions: {
    flexDirection: 'row',
    gap: space[2],
    paddingTop: space[1],
  },
  flexBtn: {
    flex: 1,
  },
});
