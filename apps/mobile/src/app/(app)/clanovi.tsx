import { useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ChevronLeft, TriangleAlert, Users } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

/**
 * Članovi tima (M4.4, admin). Ulaz je skriven u tabu „Više" ako korisnik nije
 * admin. Podaci iz `startups.listMembers` (dozvoljen svakom članu; admin gejt je
 * na ulazu). Read-only pregled — dodavanje ide kroz pozivnice.
 */
export default function ClanoviScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const members = useQuery(
    api.startups.listMembers,
    activeStartupId ? { startupId: activeStartupId, limit: 50 } : 'skip',
  );

  const loading = activeStartupId !== null && members === undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Članovi tima" onBack={() => router.back()} colors={colors} />
      {activeStartupId === null ? (
        <EmptyState
          icon={<Users size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Članovi se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje članova" />
        </View>
      ) : members && members.length === 0 ? (
        <EmptyState
          icon={<Users size={40} color={colors.mutedForeground} />}
          title="Nema članova"
          description="Ovaj startup još nema aktivnih članova."
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          {(members ?? []).map((member) => (
            <View
              key={member.membershipId}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Avatar name={member.profile.displayName} uri={member.profile.avatarUrl} size={40} />
              <View style={styles.body}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>
                  {member.profile.displayName}
                </Text>
                <Text numberOfLines={1} style={[styles.email, { color: colors.mutedForeground }]}>
                  {member.profile.email}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Header({ title, onBack, colors }: { title: string; onBack: () => void; colors: ColorTokens }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={onBack}
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ClanoviError message={error.message} onRetry={retry} />;
}

function ClanoviError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Članovi tima" onBack={() => router.back()} colors={colors} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Članovi se ne mogu učitati"
        description={message || 'Došlo je do greške.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginLeft: 2,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    minHeight: 60,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  email: {
    fontSize: 14,
  },
});
