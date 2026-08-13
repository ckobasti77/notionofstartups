import { ChevronDown, ChevronRight, MessageSquareText } from 'lucide-react-native';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ContributionThread } from '@/components/ideja/contribution-thread';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text } from '@/theme/tokens';

/**
 * „Potpisani doprinosi" oblasti (C14) — pandan web `area-signed-contributions.tsx`,
 * koji je montiran u `area-view.tsx` odmah ispod brifinga. Isti raspored i ovde:
 * kolapsibilna sekcija ispod „Brifinga oblasti", iznad liste stranica.
 *
 * Telo se montira TEK na razvijanje (isti obrazac kao `AreaBriefingSection`) — nit
 * je pretplata koju zatvorena sekcija ne treba da plaća.
 *
 * `canAdd` je uvek `true`: `collaboration.addContribution` za metu `area` traži
 * samo `requireStartupMember`, bez vlasničke provere.
 *
 * Bez lokalnog `KeyboardAvoidingView` — Nivo 2 taba „Prostor" već ima bezuslovni
 * `behavior="padding"` oko celog ekrana; drugi bi duplirao kompenzaciju.
 */
export function AreaContributionsSection({
  areaId,
  areaLabel,
}: {
  areaId: Id<'startupAreas'>;
  areaLabel: string;
}) {
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Potpisani doprinosi oblasti ${areaLabel}`}
        accessibilityHint={expanded ? 'Sakriva doprinose' : 'Prikazuje doprinose oblasti'}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.muted }]}>
        {expanded ? (
          <ChevronDown size={18} color={colors.mutedForeground} />
        ) : (
          <ChevronRight size={18} color={colors.mutedForeground} />
        )}
        <MessageSquareText size={18} color={colors.mutedForeground} />
        <Text style={[styles.title, { color: colors.foreground }]}>Potpisani doprinosi</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {/* Ograničena visina + `nestedScrollEnabled`: ispod je `FlatList` stabla
              koji mora da ostane dohvatljiv (isti obrazac kao na stranici). */}
          <ScrollView
            style={{ maxHeight: Math.round(windowHeight * 0.42) }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled">
            <ContributionThread target={{ kind: 'area', id: areaId }} canAdd />
          </ScrollView>
        </View>
      ) : null}
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
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
