import { useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushThoughtUndo } from '@/lib/thought-undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';

/** Backend limit (`thoughts.ts`, `MAX_EDGE_LABEL`). */
const MAX_LABEL = 120;

/** Veza kako je vidi detalj misli: id + naziv + naslov misli na drugom kraju. */
export type ThoughtEdgeDetail = {
  edgeId: Id<'thoughtEdges'>;
  label: string | null;
  otherTitle: string;
  otherNodeId: Id<'thoughtNodes'>;
};

/**
 * Uređivanje jedne veze (PARITET A1): naziv (`updateEdge`) i prekid
 * (`archiveEdges` + traka „Poništi"). Pandan web `EdgeEditorDialog` + Scissors
 * akciji na edge piluli. „Otvori misao" vodi na drugi kraj veze — roditelj
 * (detalj misli) prosleđuje navigaciju.
 */
export function ThoughtEdgeSheet({
  edge,
  onClose,
  onOpenOther,
}: {
  edge: ThoughtEdgeDetail | null;
  onClose: () => void;
  /** Tap na „Otvori misao" — roditelj zatvara sheet i navigira na drugi kraj. */
  onOpenOther?: (nodeId: Id<'thoughtNodes'>) => void;
}) {
  const colors = useThemeColors();
  const updateEdge = useMutation(api.thoughts.updateEdge);
  const archiveEdges = useMutation(api.thoughts.archiveEdges);

  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  // Poslednji ne-null snimak — telo ostaje tokom izlazne animacije sheet-a.
  const lastEdgeRef = useRef<ThoughtEdgeDetail | null>(null);
  if (edge !== null) lastEdgeRef.current = edge;
  const renderEdge = edge ?? lastEdgeRef.current;

  useEffect(() => {
    if (edge) setLabel(edge.label ?? '');
  }, [edge]);

  if (renderEdge === null) return null;
  const target = renderEdge;

  const save = async () => {
    setBusy(true);
    haptics.tap();
    try {
      const clean = label.trim();
      // Prazan naziv briše labelu (`null`), kao na webu.
      await updateEdge({ edgeId: target.edgeId, label: clean || null });
      haptics.success();
      onClose();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Naziv veze nije sačuvan.'));
    } finally {
      setBusy(false);
    }
  };

  const breakEdge = () => {
    if (busy) return;
    haptics.warning();
    Alert.alert('Prekinuti vezu?', `Veza sa „${target.otherTitle}" se uklanja sa kanvasa.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Prekini',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await archiveEdges({ edgeIds: [target.edgeId] });
            // Ručno prekinuta veza se NE vraća sama uz čvor — traka „Poništi"
            // (`restoreEdges`) je jedini put nazad.
            pushThoughtUndo({ label: 'Veza je prekinuta.', edgeIds: [target.edgeId] });
            haptics.success();
            onClose();
          } catch (error) {
            haptics.error();
            Alert.alert('Greška', accessErrorMessage(error, 'Veza nije prekinuta.'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Sheet visible={edge !== null} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={[styles.heading, { color: colors.foreground }]}>
        Veza sa „{target.otherTitle}"
      </Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        maxLength={MAX_LABEL}
        placeholder="npr. vodi ka, zavisi od…"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        editable={!busy}
        accessibilityLabel="Naziv veze"
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
        ]}
      />
      {onOpenOther ? (
        <Row
          title={`Otvori „${target.otherTitle}"`}
          onPress={() => onOpenOther(target.otherNodeId)}
          disabled={busy}
          style={styles.linkRow}
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Prekini vezu"
          variant="ghost"
          onPress={breakEdge}
          disabled={busy}
          style={styles.flexBtn}
        />
        <Button label="Sačuvaj" onPress={() => void save()} loading={busy} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginBottom: 10,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...text.body,
  },
  linkRow: {
    paddingHorizontal: 0,
    marginTop: 4,
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
