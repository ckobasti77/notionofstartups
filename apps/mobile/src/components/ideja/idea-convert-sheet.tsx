import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { CheckSquare2, FileText, Lightbulb } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ideaDisplayTitle, type IdeaListNode } from '@/components/ideja/idea-actions-sheet';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { areaColor } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

type TargetKind = 'task' | 'note';

const KIND_OPTIONS: { kind: TargetKind; label: string; Icon: typeof CheckSquare2 }[] = [
  { kind: 'task', label: 'Zadatak', Icon: CheckSquare2 },
  { kind: 'note', label: 'Beleška', Icon: FileText },
];

/**
 * Konverzija odobrene ideje u stranicu (PARITET A4) — pandan web dijalogu
 * „Pretvori Ideju u Radnu Stavku" (`ideas-view.tsx`): traži SAMO vrstu i oblast
 * (opciona polja mutacije ni web ne šalje). Po uspehu vodi pravo na novu
 * stranicu/zadatak, kao web `onOpenPage`. Ideja ostaje u listi, obeležena kao
 * pretvorena.
 */
export function IdeaConvertSheet({
  open,
  idea,
  startupId,
  onClose,
}: {
  open: boolean;
  idea: IdeaListNode | null;
  startupId: Id<'startups'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const convertToPage = useMutation(api.ideas.convertToPage);
  // Oblasti se dovlače lenjo — tek kad se sheet otvori (isti izvor kao Danas).
  const startup = useQuery(api.startups.get, open ? { startupId } : 'skip');

  const [kind, setKind] = useState<TargetKind>('task');
  const [areaId, setAreaId] = useState<Id<'startupAreas'> | null>(null);
  const [busy, setBusy] = useState(false);

  // Poslednji ne-null snimak — telo ostaje tokom izlazne animacije sheet-a.
  const lastIdeaRef = useRef<IdeaListNode | null>(null);
  if (idea !== null) lastIdeaRef.current = idea;
  const renderIdea = idea ?? lastIdeaRef.current;

  // Na otvaranje: vrsta na podrazumevani zadatak (web default), oblast na prvu.
  useEffect(() => {
    if (open) setKind('task');
  }, [open]);
  useEffect(() => {
    if (open) setAreaId(startup?.areas[0]?._id ?? null);
  }, [open, startup]);

  if (renderIdea === null) return null;
  const target = renderIdea;

  const submit = async () => {
    if (busy || areaId === null) return;
    setBusy(true);
    haptics.tap();
    try {
      const pageId = await convertToPage({
        startupId,
        ideaId: target._id,
        areaId,
        kind,
      });
      haptics.success();
      onClose();
      // Direktna navigacija na rezultat (kao web `onOpenPage`) — `pages.get` na
      // cilju je direktan upit, pa nema trke sa pretplatama.
      router.push(
        kind === 'task'
          ? { pathname: '/zadatak/[id]', params: { id: pageId } }
          : { pathname: '/stranica/[id]', params: { id: pageId } },
      );
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Ideja nije pretvorena.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={open && idea !== null} onClose={onClose} maxHeight="85%" style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Pretvori u stranicu
      </Text>
      <Text style={[styles.explain, { color: colors.mutedForeground }]}>
        Odobrena ideja postaje radna stavka u izabranoj oblasti. Ideja ostaje u
        listi, sa vezom ka rezultatu.
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        <View style={[styles.preview, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.previewHead}>
            <Lightbulb size={16} color={colors.warning} />
            <Text numberOfLines={2} style={[styles.previewTitle, { color: colors.foreground }]}>
              {ideaDisplayTitle(target)}
            </Text>
          </View>
          {target.text.trim() ? (
            <Text numberOfLines={3} style={[styles.previewText, { color: colors.mutedForeground }]}>
              {target.text.trim()}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Vrsta</Text>
        <View style={styles.chips}>
          {KIND_OPTIONS.map(({ kind: option, label, Icon }) => {
            const active = kind === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
                disabled={busy}
                onPress={() => {
                  haptics.select();
                  setKind(option);
                }}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accent : colors.secondary,
                    borderColor: active ? colors.primary : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <Icon
                  size={16}
                  color={active ? colors.accentForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.chipLabel,
                    { color: active ? colors.accentForeground : colors.foreground },
                  ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Oblast</Text>
        {startup === undefined ? (
          <View style={styles.areasLoading}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje oblasti" />
          </View>
        ) : startup.areas.length === 0 ? (
          <Text style={[styles.emptyAreas, { color: colors.mutedForeground }]}>
            Ovaj startup još nema oblasti — dodaj ih pre konverzije.
          </Text>
        ) : (
          <View style={styles.chips}>
            {startup.areas.map((area) => {
              const active = area._id === areaId;
              return (
                <Pressable
                  key={area._id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={area.label}
                  disabled={busy}
                  onPress={() => {
                    haptics.select();
                    setAreaId(area._id);
                  }}
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
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button
          label="Pretvori"
          onPress={() => void submit()}
          loading={busy}
          disabled={busy || areaId === null}
          style={styles.flexBtn}
        />
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
    marginBottom: 6,
  },
  explain: {
    ...text.body,
    marginBottom: 10,
  },
  scroll: {
    flexGrow: 0,
  },
  list: {
    gap: 10,
    paddingBottom: 4,
  },
  preview: {
    gap: 6,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewTitle: {
    ...text.body,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
  previewText: {
    ...text.body,
  },
  label: {
    ...text.meta,
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
  areasLoading: {
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  emptyAreas: {
    fontSize: 16,
    lineHeight: 20,
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
