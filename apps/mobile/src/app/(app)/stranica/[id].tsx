import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ChevronLeft, TriangleAlert } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { pageKindLabel, pageKindMeta } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, type ColorTokens } from '@/theme/tokens';

/**
 * Editor stranice — placeholder (docs/mobile/02-EKRANI.md §9.1). Pravi rich-text
 * editor (tentap/Tiptap u WebView-u) stiže u sledećem koraku Faze 3; za sada ekran
 * postoji da bi „Otvori" na belešci/fajlu/tabeli iz „Prostor" taba imalo odredište.
 * Zadatak ima svoj, već napravljen ekran (`zadatak/[id]`).
 */
export default function StranicaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pageId = id as Id<'pages'>;
  const page = useQuery(api.pages.get, { pageId });

  if (page === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <PageHeader title="Stranica" onBack={() => router.back()} colors={colors} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje" />
        </View>
      </View>
    );
  }

  const Icon = pageKindMeta(page.kind).icon;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageHeader title={page.title} onBack={() => router.back()} colors={colors} />
      <EmptyState
        icon={<Icon size={40} color={colors.mutedForeground} />}
        title="Editor stiže uskoro"
        description={`Uređivanje sadržaja (${pageKindLabel(page.kind)}) stiže u sledećem koraku Faze 3.`}
      />
    </View>
  );
}

function PageHeader({
  title,
  onBack,
  colors,
}: {
  title: string;
  onBack: () => void;
  colors: ColorTokens;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 6,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground }]}>
        {title}
      </Text>
    </View>
  );
}

/**
 * Greška: `pages.get` prolazi kroz `requireStartupMember`/`requireVisiblePage` i
 * baca kad korisnik nema pristup — expo-router to hvata ovde umesto pada ekrana.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PageErrorState message={error.message} onRetry={retry} />;
}

function PageErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageHeader title="Stranica" onBack={() => router.back()} colors={colors} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Stranica se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju stranice.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginRight: 8,
  },
});
