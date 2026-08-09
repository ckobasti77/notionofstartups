import { useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert, Users } from 'lucide-react-native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/**
 * Gornja granica čitanja članova. `listMembers` nema paginaciju na mobilnom, pa
 * kad se vrati tačno ovoliko stavki — verovatno ima još; to se kaže pošteno
 * umesto tihog odsecanja (rn-review).
 */
const MEMBERS_LIMIT = 50;

/** Srpska množina za brojač članova u zaglavlju. */
function membersWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return 'član';
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'člana';
  return 'članova';
}

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
    activeStartupId ? { startupId: activeStartupId, limit: MEMBERS_LIMIT } : 'skip',
  );

  const loading = activeStartupId !== null && members === undefined;
  const capped = members !== undefined && members.length === MEMBERS_LIMIT;
  const count = members?.length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Članovi tima"
        onBack={() => router.back()}
        eyebrow={count > 0 ? `${capped ? `${count}+` : count} ${membersWord(count)}` : undefined}
      />
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
          {/* Jedna kartica sa vlas-linijama umesto niza odvojenih kartica — ista
              informacija na osetno manje piksela. */}
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(members ?? []).map((member, index) => (
              <Row
                key={member.membershipId}
                style={[
                  styles.row,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
                icon={
                  <Avatar
                    name={member.profile.displayName}
                    uri={member.profile.avatarUrl}
                    size={36}
                  />
                }
                title={member.profile.displayName}
                subtitle={member.profile.email}
                showChevron={false}
                accessibilityLabel={`${member.profile.displayName}, ${member.profile.email}${
                  member.profile.role === 'admin' ? ', administrator' : ''
                }`}
                value={
                  member.profile.role === 'admin' ? (
                    <Pill label="Admin" tone="accent" />
                  ) : undefined
                }
              />
            ))}
          </View>
          {capped ? (
            <Text style={[styles.cappedNote, { color: colors.mutedForeground }]}>
              Prikazano prvih {MEMBERS_LIMIT}.
            </Text>
          ) : null}
        </ScrollView>
      )}
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
      <ScreenHeader title="Članovi tima" onBack={() => router.back()} />
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
  list: {
    padding: 16,
    paddingTop: 8,
    gap: 8,
  },
  group: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 12,
  },
  cappedNote: {
    ...text.meta,
    textAlign: 'center',
    paddingVertical: 4,
  },
});
