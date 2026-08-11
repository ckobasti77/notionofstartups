import { useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { KeyRound, ShieldCheck, TriangleAlert, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SetPasswordSheet, type PasswordTarget } from '@/components/admin/set-password-sheet';
import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { api } from '@/convex/_generated/api';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/** `profiles.listAll` odseca na 50 (boundedLimit). Ako se vrati tačno toliko —
 * verovatno ima još; kaže se pošteno umesto tihog odsecanja (rn-review). */
const PROFILES_LIMIT = 50;

/**
 * „Lozinke" (globalno, admin) — jedini ekran gde glavni admin platforme svakom
 * članu iz SVIH startupova može da postavi novu lozinku. Mobilni pandan „Lozinke"
 * tabu u web `admin-dialog.tsx`. Ulaz je skriven u tabu „Više" ako korisnik nije
 * admin; ekran dodatno ima eksplicitnu brану jer `profiles.listAll` (query iza
 * `requireAdmin`) inače obori render na `ErrorBoundary` za ne-admina koji
 * deep-linkuje.
 */
export default function LozinkeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const profile = useQuery(api.profiles.getCurrent, {});
  const isAdmin = profile?.role === 'admin';
  const profiles = useQuery(
    api.profiles.listAll,
    isAdmin ? { limit: PROFILES_LIMIT } : 'skip',
  );

  const [target, setTarget] = useState<PasswordTarget | null>(null);

  const loading = profile === undefined || (isAdmin && profiles === undefined);
  const capped = profiles !== undefined && profiles.length === PROFILES_LIMIT;
  const refreshControl = useListRefresh();

  // Ne-admin (deep-link): jasna brana umesto praznog/greške.
  if (profile !== undefined && !isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Lozinke" onBack={() => router.back()} />
        <EmptyState
          icon={<ShieldCheck size={40} color={colors.mutedForeground} />}
          title="Potreban je administratorski pristup"
          description="Postavljanje lozinki članovima je dostupno samo administratorima."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Lozinke" onBack={() => router.back()} />

      {profiles && profiles.length === 0 ? (
        <EmptyState
          icon={<Users size={40} color={colors.mutedForeground} />}
          title="Nema članova"
          description="Još nema aktivnih naloga kojima bi se postavila lozinka."
        />
      ) : (
        <LoadingSwap
          loading={loading}
          skeleton={
            <View style={styles.list}>
              <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <SkeletonList
                  count={6}
                  item={(index) => <SkeletonRow index={index} leading="circle" subtitle />}
                />
              </View>
            </View>
          }>
          {profiles ? (
            <ScrollView
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}>
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                Postavi novu lozinku bilo kom članu. Član se odmah prijavljuje novom
                lozinkom; sve njegove/njene ranije prijave se poništavaju.
              </Text>
              <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <StaggerGroup>
                  {profiles.map((item, index) => {
                    const isSelf = profile?._id === item._id;
                    return (
                      <StaggerItem key={item._id} index={index}>
                        <Row
                          style={[
                            styles.row,
                            index > 0 && {
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: colors.border,
                            },
                          ]}
                          icon={<Avatar name={item.displayName} uri={item.avatarUrl} size={36} />}
                          title={item.displayName}
                          subtitle={item.email}
                          showChevron={false}
                          accessibilityLabel={`${item.displayName}, ${item.email}${
                            item.role === 'admin' ? ', administrator' : ''
                          }`}
                          accessibilityHint={isSelf ? undefined : 'Otvara postavljanje nove lozinke'}
                          onPress={
                            isSelf
                              ? undefined
                              : () => {
                                  haptics.tap();
                                  setTarget({
                                    profileId: item._id,
                                    displayName: item.displayName,
                                    email: item.email,
                                  });
                                }
                          }
                          value={
                            isSelf ? (
                              <Pill label="Ti" tone="accent" />
                            ) : (
                              <KeyRound size={18} color={colors.primaryText} />
                            )
                          }
                        />
                      </StaggerItem>
                    );
                  })}
                </StaggerGroup>
              </View>
              {capped ? (
                <Text style={[styles.cappedNote, { color: colors.mutedForeground }]}>
                  Prikazano prvih {PROFILES_LIMIT}.
                </Text>
              ) : null}
            </ScrollView>
          ) : null}
        </LoadingSwap>
      )}

      <SetPasswordSheet target={target} onClose={() => setTarget(null)} />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <LozinkeError message={error.message} onRetry={retry} />;
}

function LozinkeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Lozinke" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Lista se ne može učitati"
        description={message || 'Došlo je do greške.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    padding: 16,
    paddingTop: 8,
    gap: 8,
  },
  note: {
    ...text.meta,
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
