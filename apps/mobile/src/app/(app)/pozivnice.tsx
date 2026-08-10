import { useMutation, useQuery } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Mail, Plus, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Pill, type PillTone } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { inviteLinkUrl } from '@/lib/embed-url';
import { haptics } from '@/lib/haptics';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

type Invite = {
  _id: Id<'invites'>;
  email: string;
  expiresAt: number;
  claimedAt: number | null;
  revokedAt: number | null;
  claimedBy: { displayName: string } | null;
};

function inviteStatus(invite: Invite, now: number): { label: string; tone: PillTone } {
  if (invite.revokedAt !== null) return { label: 'Opozvana', tone: 'neutral' };
  if (invite.claimedAt !== null) return { label: 'Prihvaćena', tone: 'success' };
  if (invite.expiresAt <= now) return { label: 'Istekla', tone: 'warning' };
  return { label: 'Na čekanju', tone: 'accent' };
}

/**
 * Pozivnice (M4.4, admin). Ulaz je u tabu „Više" samo za `role === 'admin'`, a i
 * `invites.list/create/revoke` prolaze kroz `requireAdmin`. Kod se prikazuje samo
 * jednom, odmah po kreiranju (server čuva samo hash) — admin ga tada podeli.
 */
export default function PozivniceScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();
  const [now] = useState(() => Date.now());
  const [createOpen, setCreateOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<Id<'invites'> | null>(null);

  const invites = useQuery(
    api.invites.list,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const revoke = useMutation(api.invites.revoke);
  const refreshControl = useListRefresh();

  const confirmRevoke = (inviteId: Id<'invites'>, email: string) => {
    haptics.warning();
    Alert.alert('Opozovi pozivnicu', `Pozivnica za ${email} više neće važiti.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Opozovi',
        style: 'destructive',
        onPress: async () => {
          setRevokingId(inviteId);
          try {
            await revoke({ inviteId });
            haptics.success();
          } catch (error) {
            haptics.error();
            Alert.alert('Greška', accessErrorMessage(error, 'Pozivnica nije opozvana.'));
          } finally {
            setRevokingId(null);
          }
        },
      },
    ]);
  };

  const loading = activeStartupId !== null && invites === undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Pozivnice"
        onBack={() => router.back()}
        actions={
          activeStartupId ? (
            <IconButton
              accessibilityLabel="Nova pozivnica"
              onPress={() => {
                haptics.tap();
                setCreateOpen(true);
              }}>
              <Plus size={24} color={colors.foreground} />
            </IconButton>
          ) : undefined
        }
      />
      {activeStartupId === null ? (
        <EmptyState
          icon={<Mail size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Pozivnice se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : invites && invites.length === 0 ? (
        <EmptyState
          icon={<Mail size={40} color={colors.mutedForeground} />}
          title="Nema pozivnica"
          description="Pozovi nekoga u tim — dobiće kod za pristup."
          actionLabel="Nova pozivnica"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <LoadingSwap
          loading={loading}
          skeleton={
            <SkeletonList
              count={4}
              gap={8}
              style={styles.list}
              item={(index) => <SkeletonRow index={index} leading="circle" subtitle trailing="value" />}
            />
          }>
          {invites ? (
            <ScrollView
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}>
              <StaggerGroup>
                {invites.map((invite, index) => {
                  const status = inviteStatus(invite, now);
                  const canRevoke = invite.revokedAt === null && invite.claimedAt === null;
                  const revoking = revokingId === invite._id;
                  return (
                    // Red nije dodirljiv (nema `onPress`) — `Row` ga renderuje kao View, pa
                    // je „Opozovi" u `value` slotu samostalno dugme, a ne ugnježdeni tap.
                    <StaggerItem key={invite._id} index={index}>
                      <Row
                        title={invite.email}
                        accessibilityLabel={`Pozivnica za ${invite.email}, ${status.label}${
                          invite.claimedBy ? `, prihvatio ${invite.claimedBy.displayName}` : ''
                        }`}
                        showChevron={false}
                        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
                        // Ko je prihvatio dobija inicijale, ne golo ime — isti jezik kao
                        // svugde gde se prikazuje osoba.
                        icon={<Avatar name={invite.claimedBy?.displayName ?? invite.email} size={36} />}
                        subtitle={
                          <View style={styles.metaRow}>
                            <Pill label={status.label} tone={status.tone} />
                            {invite.claimedBy ? (
                              <Text numberOfLines={1} style={[styles.meta, { color: colors.mutedForeground }]}>
                                {invite.claimedBy.displayName}
                              </Text>
                            ) : null}
                          </View>
                        }
                        value={
                          canRevoke ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Opozovi pozivnicu za ${invite.email}`}
                              accessibilityState={{ disabled: revokingId !== null }}
                              disabled={revokingId !== null}
                              onPress={() => confirmRevoke(invite._id, invite.email)}
                              style={({ pressed }) => [
                                styles.revokeBtn,
                                { borderColor: colors.border },
                                pressed && { backgroundColor: colors.muted },
                                revokingId !== null && { opacity: 0.5 },
                              ]}>
                              {revoking ? (
                                <ActivityIndicator size="small" color={colors.destructive} />
                              ) : (
                                <Text style={[styles.revokeLabel, { color: colors.destructive }]}>
                                  Opozovi
                                </Text>
                              )}
                            </Pressable>
                          ) : undefined
                        }
                      />
                    </StaggerItem>
                  );
                })}
              </StaggerGroup>
            </ScrollView>
          ) : null}
        </LoadingSwap>
      )}

      {activeStartupId ? (
        <CreateInviteSheet
          open={createOpen}
          startupId={activeStartupId}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </View>
  );
}

function CreateInviteSheet({
  open,
  startupId,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const create = useMutation(api.invites.create);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const clean = email.trim();
    if (!clean) {
      haptics.warning();
      Alert.alert('Nedostaje email', 'Unesi email adresu osobe koju pozivaš.');
      return;
    }
    setBusy(true);
    haptics.tap();
    try {
      const result = await create({ startupId, email: clean });
      haptics.success();
      setEmail('');
      onClose();
      // Kod se vidi samo sada (server čuva hash) — admin ga podeli ručno. „Kopiraj
      // kod" ga stavlja u privremenu memoriju da ga ne mora prepisivati (rn-review).
      Alert.alert(
        'Pozivnica kreirana',
        `Kod za ${result.email}:\n\n${result.code}\n\nPošalji ga osobi koju pozivaš — vidi se samo sada.`,
        [
          {
            text: 'Kopiraj kod',
            onPress: () => {
              void Clipboard.setStringAsync(result.code).then(() =>
                Alert.alert('Kopirano', 'Kod pozivnice je kopiran u privremenu memoriju.'),
              );
            },
          },
          { text: 'U redu', style: 'cancel' },
        ],
      );
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Pozivnica nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Nova pozivnica</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoFocus
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="email@primer.com"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]}
      />
      <View style={styles.actions}>
        <Button label="Otkaži" variant="ghost" onPress={onClose} disabled={busy} style={styles.flexBtn} />
        <Button label="Pozovi" onPress={() => void submit()} loading={busy} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PozivniceError message={error.message} onRetry={retry} />;
}

function PozivniceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Pozivnice" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Pozivnice se ne mogu učitati"
        description={message || 'Potreban je administratorski pristup.'}
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
  // Kartica pozivnice kao `Row` override (raspored dolazi iz Row.base).
  row: {
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: {
    ...text.meta,
    flexShrink: 1,
  },
  revokeBtn: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  revokeLabel: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  sheet: {
    paddingHorizontal: 20,
    gap: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  flexBtn: {
    flex: 1,
  },
});
