import { useMutation, useQuery } from 'convex/react';
import { ChevronDown, ChevronRight, NotebookPen } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Isti limit kao `MAX_AREA_BODY_LENGTH` na backendu (`areasV2.ts`). */
const MAX_BRIEFING_LENGTH = 20_000;

type SaveState = 'idle' | 'saving' | 'error';

/**
 * „Brifing oblasti" — pandan web `area-briefing-dock.tsx`, ali kao kolapsibilna
 * sekcija iznad liste stranica u tabu Prostor (web ga drži na vrhu `area-view`).
 *
 * Skupljena je podrazumevano i **telo se montira tek kad se razvije** — jedini
 * postojeći put do sadržaja brifinga je `areasV2.getAreaCanvasByArea`, koji vraća
 * ceo canvas payload oblasti (sve stranice, ivice, placement-e). Za jedno tekstualno
 * polje je to skupa pretplata, pa se ne plaća dok korisnik ne zatraži brifing.
 * Traženi jeftin upit je zapisan u `docs/mobile/ZA-POPRAVKU.md`.
 *
 * Bez nove backend funkcije: čitanje `getAreaCanvasByArea`, upis `areasV2.updateAreaBody`
 * sa istom `expectedRevision` konflikt-zaštitom kao web.
 */
export function AreaBriefingSection({
  areaId,
  areaLabel,
}: {
  areaId: Id<'startupAreas'>;
  areaLabel: string;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Brifing oblasti ${areaLabel}`}
        accessibilityHint={expanded ? 'Sakriva brifing' : 'Prikazuje brifing oblasti'}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.muted }]}>
        {expanded ? (
          <ChevronDown size={18} color={colors.mutedForeground} />
        ) : (
          <ChevronRight size={18} color={colors.mutedForeground} />
        )}
        <NotebookPen size={18} color={colors.mutedForeground} />
        <Text style={[styles.title, { color: colors.foreground }]}>Brifing oblasti</Text>
      </Pressable>

      {expanded ? <BriefingBody areaId={areaId} areaLabel={areaLabel} /> : null}
    </View>
  );
}

function BriefingBody({
  areaId,
  areaLabel,
}: {
  areaId: Id<'startupAreas'>;
  areaLabel: string;
}) {
  const colors = useThemeColors();
  const canvas = useQuery(api.areasV2.getAreaCanvasByArea, { areaId });
  const updateAreaBody = useMutation(api.areasV2.updateAreaBody);

  // `null` = nacrt nije diran, pa sekcija prati server (realtime izmena drugog
  // člana se vidi odmah). Čim se kucne, nacrt preuzima prikaz dok se ne sačuva.
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  if (canvas === undefined) {
    // Oblik skupljenog zaglavlja: strelica, naslov, pa kratka meta desno.
    return (
      <View style={styles.loading} accessibilityLabel="Učitavanje brifinga">
        <Skeleton width={18} height={18} />
        <Skeleton width={92} height={16} />
        <View style={styles.loadingSpacer} />
        <Skeleton width={54} height={14} />
      </View>
    );
  }

  const briefing = canvas.scope.briefing;
  const value = draft ?? briefing.content;
  const dirty = draft !== null && draft !== briefing.content;

  const save = async () => {
    if (!briefing.canEdit || !dirty || saveState === 'saving') return;
    const snapshot = value;
    setSaveState('saving');
    haptics.tap();
    try {
      await updateAreaBody({
        startupId: canvas.scope.startupId,
        areaId,
        content: snapshot,
        expectedRevision: briefing.revision,
      });
      haptics.success();
      // Nazad na praćenje servera: upravo sačuvan tekst je sad i serverski.
      setDraft(null);
      setSaveState('idle');
    } catch (error) {
      haptics.error();
      setSaveState('error');
      Alert.alert('Brifing nije sačuvan', accessErrorMessage(error, 'Pokušaj ponovo.'));
    }
  };

  const status =
    saveState === 'saving'
      ? 'Čuvam…'
      : saveState === 'error'
        ? 'Čuvanje nije uspelo'
        : dirty
          ? 'Ima nesačuvanih izmena'
          : 'Sačuvano';

  if (!briefing.canEdit) {
    return (
      <View style={styles.body}>
        {briefing.content.trim() ? (
          <ScrollView style={styles.readScroll} nestedScrollEnabled>
            <Text style={[styles.readText, { color: colors.foreground }]}>{briefing.content}</Text>
          </ScrollView>
        ) : (
          <Text style={[styles.readText, { color: colors.mutedForeground }]}>
            Kreator startupa još nije dodao brifing za ovu oblast.
          </Text>
        )}
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          Brifing uređuje kreator startupa.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <TextInput
        value={value}
        multiline
        maxLength={MAX_BRIEFING_LENGTH}
        editable={saveState !== 'saving'}
        accessibilityLabel={`Glavni brifing oblasti ${areaLabel}`}
        placeholder="Zapiši cilj oblasti, važne odluke i zajednički kontekst…"
        placeholderTextColor={colors.mutedForeground}
        onChangeText={(next) => {
          setDraft(next);
          if (saveState === 'error') setSaveState('idle');
        }}
        // Isto kao web: izlazak iz polja snima. Dugme ostaje za one koji ne veruju
        // nevidljivom snimanju (i za čitač ekrana, koji „blur" ne najavljuje).
        onBlur={() => void save()}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.input,
          },
        ]}
      />
      <View style={styles.footer}>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.meta, { color: saveState === 'error' ? colors.danger : colors.mutedForeground }]}>
          {status}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {value.length.toLocaleString('sr-Latn-RS')}/{MAX_BRIEFING_LENGTH.toLocaleString('sr-Latn-RS')}
        </Text>
      </View>
      <Button
        label="Sačuvaj brifing"
        variant="secondary"
        size="sm"
        loading={saveState === 'saving'}
        disabled={!dirty || saveState === 'saving'}
        onPress={() => void save()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
  },
  title: {
    flex: 1,
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
  },
  loadingSpacer: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  readScroll: {
    maxHeight: 220,
  },
  readText: {
    ...text.body,
  },
  input: {
    minHeight: 112,
    maxHeight: 220,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    ...text.body,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: {
    ...text.meta,
  },
});
