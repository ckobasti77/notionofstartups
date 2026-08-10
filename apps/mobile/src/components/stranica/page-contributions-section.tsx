import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ContributionThread } from '@/components/ideja/contribution-thread';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

/**
 * „Doprinosi" na stranici/zadatku — isti `ContributionThread` koji ideje već
 * koriste, sada nad `pages.addEntry` (`target.kind: 'page'`). `canAdd` je uvek
 * `true`: `pages.addEntry` traži samo `requireStartupMember`, bez vlasničke
 * provere (isto kao za ideje).
 *
 * Ograničena visina + interni skrol (isti obrazac kao `SubpagesSection`, rn-review
 * nalaz): montirana je i na `stranica/[id].tsx`, gde je roditelj OBIČAN `View`
 * (ne `ScrollView` — editor/tabela/fajl ispod nje sami skroluju), pa bi duga nit
 * doprinosa inače gurnula sadržaj van ekrana bez načina da se do njega dođe.
 * Lokalni `KeyboardAvoidingView` (isti obrazac kao `ideja/[id].tsx` kompozer) drži
 * kompozer vidljivim iznad tastature bez diranja NoteEditor-ovog sopstvenog
 * `use-keyboard-inset.ts` toka (sused, ne roditelj).
 */
export function PageContributionsSection({ pageId }: { pageId: Id<'pages'> }) {
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
        Doprinosi
      </Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        Potpisan tekst članova tima uz ovu stranicu.
      </Text>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ maxHeight: Math.round(windowHeight * 0.42) }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          <ContributionThread target={{ kind: 'page', id: pageId }} canAdd />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: {
    ...text.title,
  },
  meta: {
    ...text.body,
  },
});
