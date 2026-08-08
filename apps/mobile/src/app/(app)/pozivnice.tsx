import { useMutation, useQuery } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ChevronLeft, Mail, Plus, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

type Invite = {
  _id: Id<'invites'>;
  email: string;
  expiresAt: number;
  claimedAt: number | null;
  revokedAt: number | null;
  claimedBy: { displayName: string } | null;
};

function inviteStatus(invite: Invite, now: number): { label: string; variant: BadgeVariant } {
  if (invite.revokedAt !== null) return { label: 'Opozvana', variant: 'outline' };
  if (invite.claimedAt !== null) return { label: 'Prihvaćena', variant: 'success' };
  if (invite.expiresAt <= now) return { label: 'Istekla', variant: 'secondary' };
  return { label: 'Na čekanju', variant: 'default' };
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

  const confirmRevoke = (inviteId: Id<'invites'>, email: string) => {
    Alert.alert('Opozovi pozivnicu', `Pozivnica za ${email} više neće važiti.`, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Opozovi',
        style: 'destructive',
        onPress: async () => {
          setRevokingId(inviteId);
          try {
            await revoke({ inviteId });
          } catch (error) {
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
      <Header
        title="Pozivnice"
        onBack={() => router.back()}
        onNew={activeStartupId ? () => setCreateOpen(true) : undefined}
        colors={colors}
      />
      {activeStartupId === null ? (
        <EmptyState
          icon={<Mail size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Pozivnice se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje pozivnica" />
        </View>
      ) : invites && invites.length === 0 ? (
        <EmptyState
          icon={<Mail size={40} color={colors.mutedForeground} />}
          title="Nema pozivnica"
          description="Pozovi nekoga u tim — dobiće kod za pristup."
          actionLabel="Nova pozivnica"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          {(invites ?? []).map((invite) => {
            const status = inviteStatus(invite, now);
            const canRevoke = invite.revokedAt === null && invite.claimedAt === null;
            const revoking = revokingId === invite._id;
            return (
              <View
                key={invite._id}
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.rowBody}>
                  <Text numberOfLines={1} style={[styles.email, { color: colors.foreground }]}>
                    {invite.email}
                  </Text>
                  <View style={styles.metaRow}>
                    <Badge label={status.label} variant={status.variant} />
                    {invite.claimedBy ? (
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {invite.claimedBy.displayName}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {canRevoke ? (
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
                      <Text style={[styles.revokeLabel, { color: colors.destructive }]}>Opozovi</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
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
  const insets = useSafeAreaInsets();
  const create = useMutation(api.invites.create);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const clean = email.trim();
    if (!clean) {
      Alert.alert('Nedostaje email', 'Unesi email adresu osobe koju pozivaš.');
      return;
    }
    setBusy(true);
    try {
      const result = await create({ startupId, email: clean });
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
      Alert.alert('Greška', accessErrorMessage(error, 'Pozivnica nije kreirana.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={onClose}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.popover, borderColor: colors.border, paddingBottom: insets.bottom + 12 },
          ]}>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Header({
  title,
  onBack,
  onNew,
  colors,
}: {
  title: string;
  onBack: () => void;
  onNew?: () => void;
  colors: ColorTokens;
}) {
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
      {onNew ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nova pozivnica"
          onPress={onNew}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
          <Plus size={24} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
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
      <Header title="Pozivnice" onBack={() => router.back()} colors={colors} />
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
    padding: 14,
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: 6,
  },
  email: {
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: {
    fontSize: 16,
  },
  revokeBtn: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  revokeLabel: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
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
