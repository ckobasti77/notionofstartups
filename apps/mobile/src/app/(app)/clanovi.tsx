import { useMutation, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Trash2, TriangleAlert, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddMemberSheet } from '@/components/admin/add-member-sheet';
import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

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
 * Članovi tima (M4.4, admin; PARITET A2 dodaje dodavanje/uklanjanje). Ulaz je
 * skriven u tabu „Više" ako korisnik nije admin. `listMembers` je dozvoljen
 * svakom članu (admin gejt je na ulazu) — uklanjanje (`removeMember`) je
 * mutacija iza `requireAdmin` pa ne-admin koji nekako stigne ovde dobija
 * običan `Alert` iz `.catch()`, ekran ostaje čitljiv.
 *
 * Dodavanje je drugačije: `AddMemberSheet` čita `profiles.listAll`, koja je
 * TAKOĐE iza `requireAdmin`, ali kao QUERY — Convex baca tokom rendera, pa bi
 * ne-admin koji otvori sheet oborio ceo ekran (uključujući listu koju sme da
 * vidi) na `ErrorBoundary`. Zato dugme „Dodaj člana" ovde IMA eksplicitnu
 * `profile.role === 'admin'` proveru — jedini klijentski gejt u ovom fajlu,
 * dodat namerno da spreči taj rušilački put, ne kao opšte pravilo.
 */
export default function ClanoviScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const profile = useQuery(api.profiles.getCurrent, {});
  const isAdmin = profile?.role === 'admin';
  const members = useQuery(
    api.startups.listMembers,
    activeStartupId ? { startupId: activeStartupId, limit: MEMBERS_LIMIT } : 'skip',
  );
  const removeMember = useMutation(api.startups.removeMember);

  const [addOpen, setAddOpen] = useState(false);
  const [removingId, setRemovingId] = useState<Id<'profiles'> | null>(null);

  const loading = activeStartupId !== null && members === undefined;
  const capped = members !== undefined && members.length === MEMBERS_LIMIT;
  const count = members?.length ?? 0;
  const refreshControl = useListRefresh();
  const existingProfileIds = new Set(members?.map((member) => member.profile._id) ?? []);

  const confirmRemove = (profileId: Id<'profiles'>, displayName: string) => {
    if (!activeStartupId) return;
    haptics.warning();
    Alert.alert(
      `Ukloniti ${displayName}?`,
      'Odmah gubi pristup ovom startupu i skida se sa svih zadataka gde je izvršilac — zadaci ostaju, samo bez njega/nje.',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Ukloni',
          style: 'destructive',
          onPress: () => {
            setRemovingId(profileId);
            void removeMember({ startupId: activeStartupId, profileId })
              .then(() => haptics.success())
              .catch((error: unknown) => {
                haptics.error();
                Alert.alert('Greška', accessErrorMessage(error, 'Član nije uklonjen.'));
              })
              .finally(() => setRemovingId(null));
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Članovi tima"
        onBack={() => router.back()}
        eyebrow={count > 0 ? `${capped ? `${count}+` : count} ${membersWord(count)}` : undefined}
        actions={
          activeStartupId && isAdmin ? (
            <IconButton
              accessibilityLabel="Dodaj člana"
              onPress={() => {
                haptics.tap();
                setAddOpen(true);
              }}>
              <UserPlus size={22} color={colors.foreground} />
            </IconButton>
          ) : undefined
        }
      />
      {activeStartupId === null ? (
        <EmptyState
          icon={<Users size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Članovi se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : members && members.length === 0 ? (
        <EmptyState
          icon={<Users size={40} color={colors.mutedForeground} />}
          title="Nema članova"
          description="Ovaj startup još nema aktivnih članova."
        />
      ) : (
        <LoadingSwap
          loading={loading}
          // Ista kartica sa vlas-linijama: avatar 36 + ime + email.
          skeleton={
            <View style={styles.list}>
              <View
                style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <SkeletonList
                  count={5}
                  item={(index) => <SkeletonRow index={index} leading="circle" subtitle />}
                />
              </View>
            </View>
          }>
          {members ? (
            <ScrollView
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}>
              {/* Jedna kartica sa vlas-linijama umesto niza odvojenih kartica — ista
                  informacija na osetno manje piksela. */}
              <View
                style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <StaggerGroup>
                  {members.map((member, index) => (
                    <StaggerItem key={member.membershipId} index={index}>
                      <Row
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
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Ukloni ${member.profile.displayName} iz startupa`}
                              disabled={removingId !== null}
                              onPress={() => confirmRemove(member.profile._id, member.profile.displayName)}
                              hitSlop={8}
                              style={({ pressed }) => [
                                styles.removeBtn,
                                pressed && { backgroundColor: colors.muted },
                                removingId !== null && removingId !== member.profile._id && styles.dimmed,
                              ]}>
                              {removingId === member.profile._id ? (
                                <ActivityIndicator size="small" color={colors.danger} />
                              ) : (
                                <Trash2 size={18} color={colors.danger} />
                              )}
                            </Pressable>
                          )
                        }
                      />
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </View>
              {capped ? (
                <Text style={[styles.cappedNote, { color: colors.mutedForeground }]}>
                  Prikazano prvih {MEMBERS_LIMIT}.
                </Text>
              ) : null}
            </ScrollView>
          ) : null}
        </LoadingSwap>
      )}

      {activeStartupId ? (
        <AddMemberSheet
          open={addOpen}
          startupId={activeStartupId}
          existingProfileIds={existingProfileIds}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
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
  removeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  dimmed: {
    opacity: 0.4,
  },
  cappedNote: {
    ...text.meta,
    textAlign: 'center',
    paddingVertical: 4,
  },
});
