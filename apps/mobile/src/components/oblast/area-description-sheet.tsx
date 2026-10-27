import { useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AREA_DESCRIPTION_MAX,
  canSaveDescription,
  descriptionCounter,
  overwriteRevision,
} from '@/components/oblast/area-model';
import { conflictFromError } from '@/components/collab/collab-model';
import { showConflictAlert } from '@/components/collab/conflict-alert';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { showUndoNotice } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, space, text } from '@/theme/tokens';

/** Ono što izmena opisa čita iz živog `areasV2.getAreaBody`. */
export type AreaDescriptionSnapshot = {
  content: string;
  revision: number;
  updatedAt: number | null;
  lastEditorName: string | null;
};

/**
 * Izmena opisa oblasti u sheet-u (plan K07 §5.5): polje za tekst + „Sačuvaj".
 * Opis je dokument tima — menja ga svaki član (`areasV2.updateAreaBody`), a svaka
 * izmena ostaje u Istoriji izmena. Čuvanje ide sa revizijom SA KOJE SE KRENULO
 * (ne sa živom), pa tuđa izmena tokom pisanja daje konflikt umesto tihog
 * prepisivanja: `Alert` „Učitaj najnoviju" (tvoj tekst se kopira u klipbord) /
 * „Prepiši" (tuđa verzija ostaje u Istoriji). Zatvaranje sa nesačuvanim tekstom
 * traži potvrdu.
 */
export function AreaDescriptionSheet({
  visible,
  onClose,
  startupId,
  areaId,
  body,
}: {
  visible: boolean;
  onClose: () => void;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  body: AreaDescriptionSnapshot;
}) {
  const colors = useThemeColors();
  const update = useMutation(api.areasV2.updateAreaBody);
  const [draft, setDraft] = useState(body.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tekst i revizija sa kojih se krenulo; živi `body` se samo čita kad zatreba.
  const baseRef = useRef({ content: body.content, revision: body.revision });
  const latestRef = useRef(body);
  useEffect(() => {
    latestRef.current = body;
  }, [body]);

  // Svako otvaranje kreće od aktuelnog stanja — sheet ostaje montiran između otvaranja.
  useEffect(() => {
    if (!visible) return;
    const latest = latestRef.current;
    baseRef.current = { content: latest.content, revision: latest.revision };
    setDraft(latest.content);
    setError(null);
  }, [visible]);

  const dirty = draft !== baseRef.current.content;

  const save = async (expectedRevision: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    haptics.tap();
    try {
      await update({ startupId, areaId, content: draft, expectedRevision });
      haptics.success();
      onClose();
      showUndoNotice({ label: 'Opis oblasti je sačuvan.' });
    } catch (caught) {
      const conflict = conflictFromError(caught);
      if (conflict === null) {
        haptics.error();
        setError(accessErrorMessage(caught, 'Opis nije sačuvan. Pokušaj ponovo.'));
        return;
      }
      const latest = latestRef.current;
      showConflictAlert({
        subject: 'area',
        updaterName: latest.lastEditorName,
        updatedAt: conflict.updatedAt ?? latest.updatedAt,
        draftText: draft,
        // Tvoj tekst je već u klipbordu; sheet se zatvara, a prikaz prati server.
        onLoadLatest: onClose,
        onOverwrite: () => void save(overwriteRevision(conflict.currentRevision, latestRef.current.revision)),
      });
    } finally {
      setBusy(false);
    }
  };

  // Zatvaranje sa nesačuvanim tekstom traži potvrdu; bez izmene zatvara odmah.
  const requestClose = () => {
    if (busy) return;
    if (!dirty) {
      onClose();
      return;
    }
    haptics.warning();
    Alert.alert('Odbaciti izmene?', 'Opis oblasti još nije sačuvan.', [
      { text: 'Nastavi da pišeš', style: 'cancel' },
      { text: 'Odbaci', style: 'destructive', onPress: onClose },
    ]);
  };

  const canSave = canSaveDescription({ draft, original: baseRef.current.content, busy });

  return (
    <Sheet visible={visible} onClose={requestClose} avoidKeyboard style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Opis oblasti
      </Text>
      {error === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      )}
      <TextInput
        value={draft}
        multiline
        autoFocus
        maxLength={AREA_DESCRIPTION_MAX}
        editable={!busy}
        accessibilityLabel="Opis oblasti"
        placeholder="Cilj oblasti, važne odluke, zajednički kontekst…"
        placeholderTextColor={colors.mutedForeground}
        onChangeText={(next) => {
          setDraft(next);
          if (error !== null) setError(null);
        }}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.input },
        ]}
      />
      <Text style={[styles.counter, { color: colors.mutedForeground }]}>
        {descriptionCounter(draft.length)}
      </Text>
      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={requestClose} disabled={busy} style={styles.flexBtn} />
        <Button
          label="Sačuvaj"
          onPress={() => void save(baseRef.current.revision)}
          loading={busy}
          disabled={!canSave}
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
    ...text.title,
    fontWeight: fontWeight.semibold,
  },
  error: {
    ...text.body,
  },
  input: {
    minHeight: 96,
    maxHeight: 280,
    // Uz tastaturu polje se skuplja, a dugmad ostaju iznad nje.
    flexShrink: 1,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    ...text.body,
  },
  counter: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
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
