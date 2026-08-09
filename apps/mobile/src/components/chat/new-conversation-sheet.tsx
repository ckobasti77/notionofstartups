import { useMutation, useQuery } from 'convex/react';
import { Hash, Lock, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, radius, space, text } from '@/theme/tokens';

/** Ogledalo `MAX_CHANNEL_NAME_LENGTH` iz `chat.ts`. */
const MAX_CHANNEL_NAME = 80;
/** Isti limit koji `startups.listMembers` ionako nameće (`boundedLimit(…, 25, 50)`). */
const MEMBER_LIMIT = 50;

type Mode = 'menu' | 'direct' | 'channel';

/**
 * „Nova poruka" — mobilni pandan web `chat/new-conversation.tsx`. Dva puta:
 *
 *  - **Direktna poruka** — lista članova → `chat.openDirectMessage` (idempotentno:
 *    ako DM već postoji, vraća postojeći kanal).
 *  - **Novi kanal** — naziv + privatnost → `chat.createChannel`. Backend traži
 *    `role === 'admin'` (`createCustomChannel`), pa se ovaj put nudi samo
 *    administratoru; članu se ne prikazuje dugme koje bi sigurno puklo.
 *
 * Izbor članova privatnog kanala namerno NIJE ovde: web ga ima, ali na telefonu
 * bi to bio treći korak u sheet-u za radnju koja se radi jednom. Privatan kanal
 * se pravi prazan, a članovi se dodaju kroz `chat.setChannelMembers` na webu —
 * zapisano kao IZUZETAK u docs/mobile/02-EKRANI.md §13.
 */
export function NewConversationSheet({
  open,
  startupId,
  isAdmin,
  onClose,
  onOpened,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  isAdmin: boolean;
  onClose: () => void;
  /** Poziva se sa id-jem kanala koji treba otvoriti. */
  onOpened: (channelId: Id<'chatChannels'>) => void;
}) {
  const colors = useThemeColors();
  const [mode, setMode] = useState<Mode>('menu');
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useQuery(api.profiles.getCurrent, {});
  // Lista se povlači tek kad je korisnik zaista otvorio korak „Direktna poruka" —
  // inače bi svaki ulazak u tab Chat platio upit koji se retko koristi.
  const members = useQuery(
    api.startups.listMembers,
    open && mode === 'direct' ? { startupId, limit: MEMBER_LIMIT } : 'skip',
  );
  const openDirectMessage = useMutation(api.chat.openDirectMessage);
  const createChannel = useMutation(api.chat.createChannel);

  const others = useMemo(
    () => (members ?? []).filter((member) => member.profile._id !== profile?._id),
    [members, profile?._id],
  );

  function reset() {
    setMode('menu');
    setName('');
    setIsPrivate(false);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function startDirect(otherProfileId: Id<'profiles'>) {
    setBusy(true);
    setError(null);
    haptics.tap();
    try {
      const channelId = await openDirectMessage({ startupId, otherProfileId });
      haptics.success();
      reset();
      onClose();
      onOpened(channelId);
    } catch (caught) {
      haptics.error();
      setError(accessErrorMessage(caught, 'Razgovor nije otvoren.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitChannel() {
    const clean = name.trim();
    if (!clean) {
      // Inline greška umesto `Alert`-a: sheet je već otvoren i polje fokusirano,
      // pa nativni modal preko njega samo prekida tok.
      haptics.warning();
      setError('Unesi naziv kanala.');
      return;
    }
    setBusy(true);
    setError(null);
    haptics.tap();
    try {
      const channelId = await createChannel({ startupId, name: clean, isPrivate });
      haptics.success();
      reset();
      onClose();
      onOpened(channelId);
    } catch (caught) {
      haptics.error();
      setError(accessErrorMessage(caught, 'Kanal nije kreiran.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={open}
      onClose={close}
      avoidKeyboard={mode === 'channel'}
      dragAnywhere={mode !== 'direct'}
      style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        {mode === 'menu' ? 'Nova poruka' : mode === 'direct' ? 'Direktna poruka' : 'Novi kanal'}
      </Text>

      {error === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      )}

      {mode === 'menu' ? (
        <>
          <Row
            icon={<Users size={20} color={colors.foreground} />}
            title="Direktna poruka"
            subtitle="Razgovor jedan na jedan sa članom tima"
            onPress={() => {
              haptics.tap();
              setMode('direct');
            }}
          />
          {isAdmin ? (
            <Row
              icon={<Hash size={20} color={colors.foreground} />}
              title="Novi kanal"
              subtitle="Tematski kanal za ceo tim ili odabrane članove"
              onPress={() => {
                haptics.tap();
                setMode('channel');
              }}
            />
          ) : (
            <Row
              icon={<Hash size={20} color={colors.mutedForeground} />}
              title="Novi kanal"
              subtitle="Kanale pravi administrator tima"
              disabled
            />
          )}
        </>
      ) : mode === 'direct' ? (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {members === undefined ? (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Učitavam članove…</Text>
          ) : others.length === 0 ? (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              U timu za sada nema drugih članova.
            </Text>
          ) : (
            others.map((member) => (
              <Row
                key={member.membershipId}
                icon={
                  <Avatar
                    name={member.profile.displayName}
                    uri={member.profile.avatarUrl}
                    size={32}
                  />
                }
                title={member.profile.displayName}
                subtitle={member.profile.role === 'admin' ? 'Administrator' : undefined}
                disabled={busy}
                onPress={() => void startDirect(member.profile._id)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <>
          <TextInput
            value={name}
            onChangeText={(next) => {
              setName(next);
              if (error !== null) setError(null);
            }}
            autoFocus
            editable={!busy}
            maxLength={MAX_CHANNEL_NAME}
            placeholder="npr. marketing, hitno, ideje-za-v2…"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            returnKeyType="done"
            onSubmitEditing={() => void submitChannel()}
            accessibilityLabel="Naziv kanala"
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
            ]}
          />
          <Row
            variant="toggle"
            icon={<Lock size={20} color={colors.foreground} />}
            title="Privatan kanal"
            subtitle="Vide ga samo pozvani članovi"
            checked={isPrivate}
            onToggle={setIsPrivate}
            disabled={busy}
          />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Članove privatnog kanala za sada dodaje administrator na webu.
          </Text>
        </>
      )}

      <View style={styles.actions}>
        <Button
          label={mode === 'menu' ? 'Zatvori' : 'Nazad'}
          variant="ghost"
          disabled={busy}
          onPress={() => {
            haptics.tap();
            if (mode === 'menu') close();
            else {
              setMode('menu');
              setError(null);
            }
          }}
          style={styles.flexBtn}
        />
        {mode === 'channel' ? (
          <Button
            label="Kreiraj"
            loading={busy}
            onPress={() => void submitChannel()}
            style={styles.flexBtn}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: space[5],
    gap: space[2],
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  error: {
    ...text.body,
  },
  hint: {
    ...text.body,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  list: {
    maxHeight: 360,
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
    gap: space[2],
    paddingTop: space[1],
  },
  flexBtn: {
    flex: 1,
  },
});
