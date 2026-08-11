import { useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import type { IdeaListEdge } from '@/components/ideja/idea-actions-sheet';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';

/** Backend limit (`ideas.ts`, `MAX_EDGE_LABEL`). */
const MAX_LABEL = 120;

/** Veza kako je vidi detalj ideje: ivica iz `ideas.list` + druga strana. */
export type IdeaEdgeDetail = {
  edge: IdeaListEdge;
  otherTitle: string;
  otherId: Id<'ideaNodes'>;
};

/**
 * Uređivanje jedne veze ideja (PARITET A4) — uzor `thought-edge-sheet.tsx`:
 * naziv (`updateEdgeLabel`, samo autor veze), prekid (`disconnect` + traka
 * „Poništi"; tuđa veza ide kroz glasanje tima — `disconnect` je za nju serverski
 * TIH no-op, pa se red ni ne nudi) i „Otvori ideju" ka drugom kraju veze.
 */
export function IdeaEdgeSheet({
  detail,
  startupId,
  onClose,
  onOpenOther,
}: {
  detail: IdeaEdgeDetail | null;
  startupId: Id<'startups'>;
  onClose: () => void;
  /** Tap na „Otvori …" — roditelj zatvara sheet i navigira na drugi kraj. */
  onOpenOther?: (ideaId: Id<'ideaNodes'>) => void;
}) {
  const colors = useThemeColors();
  const updateEdgeLabel = useMutation(api.ideas.updateEdgeLabel);
  const disconnect = useMutation(api.ideas.disconnect);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);

  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  // Poslednji ne-null snimak — telo ostaje tokom izlazne animacije sheet-a.
  const lastDetailRef = useRef<IdeaEdgeDetail | null>(null);
  if (detail !== null) lastDetailRef.current = detail;
  const renderDetail = detail ?? lastDetailRef.current;

  useEffect(() => {
    if (detail) setLabel(detail.edge.label ?? '');
  }, [detail]);

  if (renderDetail === null) return null;
  const { edge, otherTitle, otherId } = renderDetail;

  const save = async () => {
    setBusy(true);
    haptics.tap();
    try {
      // Prazan naziv briše labelu (server `cleanOptionalText`), kao na webu.
      await updateEdgeLabel({ startupId, edgeId: edge._id, label: label.trim() });
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
    Alert.alert('Prekinuti vezu?', `Veza sa „${otherTitle}" se uklanja sa kanvasa.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Prekini',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await disconnect({ startupId, edgeId: edge._id });
            // `connect` na istom paru OŽIVLJAVA arhiviranu vezu i čuva joj label
            // — traka „Poništi" je tačan inverz. Bez `undoUntil`: server za vezu
            // ne meri rok.
            pushUndo({
              label: 'Veza je uklonjena.',
              action: {
                kind: 'ideaEdge',
                startupId,
                nodeAId: edge.nodeAId,
                nodeBId: edge.nodeBId,
              },
            });
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

  const requestBreak = () => {
    if (busy) return;
    setBusy(true);
    haptics.tap();
    void requestDeletion({ target: { kind: 'idea_edge', id: edge._id } })
      .then(() => {
        haptics.success();
        onClose();
        // Prikaz glasanja već postoji na ekranu Odobrenja („Veza ideja").
        Alert.alert('Poslato', 'Glasanje o brisanju veze je pokrenuto.');
      })
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Zahtev nije poslat.'));
      })
      .finally(() => setBusy(false));
  };

  return (
    <Sheet visible={detail !== null} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={[styles.heading, { color: colors.foreground }]}>
        Veza sa „{otherTitle}"
      </Text>
      {edge.canEdit ? (
        <TextInput
          value={label}
          onChangeText={setLabel}
          maxLength={MAX_LABEL}
          placeholder="Opciono objasni kako su dve ideje povezane."
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          editable={!busy}
          accessibilityLabel="Naziv veze"
          style={[
            styles.input,
            { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
          ]}
        />
      ) : edge.label ? (
        // Tuđa veza: naziv se samo čita (menja ga isključivo autor veze).
        <Text style={[styles.readOnlyLabel, { color: colors.mutedForeground }]}>
          {edge.label}
        </Text>
      ) : null}
      {onOpenOther ? (
        <Row
          title={`Otvori „${otherTitle}"`}
          onPress={() => onOpenOther(otherId)}
          disabled={busy}
          style={styles.linkRow}
        />
      ) : null}
      <View style={styles.actions}>
        {edge.canDeleteDirectly ? (
          <Button
            label="Prekini vezu"
            variant="ghost"
            onPress={breakEdge}
            disabled={busy}
            style={styles.flexBtn}
          />
        ) : (
          <Button
            label="Zatraži brisanje"
            variant="ghost"
            onPress={requestBreak}
            loading={busy && !edge.canEdit}
            disabled={busy}
            style={styles.flexBtn}
          />
        )}
        {edge.canEdit ? (
          <Button
            label="Sačuvaj"
            onPress={() => void save()}
            loading={busy}
            style={styles.flexBtn}
          />
        ) : null}
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
  readOnlyLabel: {
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
