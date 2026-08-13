import { useMutation, useQuery } from 'convex/react';
import { Check } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MemberSearchInput } from '@/components/chat/member-search-input';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { MAX_CHAT_CHANNEL_MEMBERS } from '@/convex/lib/validators';
import type { ChatChannel } from '@/lib/chat';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, space, text } from '@/theme/tokens';

/**
 * „Članovi kanala" — izlaz iz ćorsokaka koji je do faze P3 postojao na OBE
 * platforme: članovi privatnog kanala su se birali samo pri kreiranju, a posle
 * toga nigde (`chat.setChannelMembers` uopšte nije postojala).
 *
 * Vlasnik kanala se prikazuje čekiran i nedodirljiv — server ga ionako nikad ne
 * uklanja (`chat.setChannelMembers`), pa kvadratić koji ništa ne radi ne sme ni
 * da postoji. Sopstveni red se ne nudi (isti izbor kao web `NewChannelDialog`).
 *
 * Posle čuvanja ide traka „Poništi": mutacija vraća `previousProfileIds`, a
 * inverz je isti poziv sa tim spiskom (`lib/undo.ts`, `kind: 'channelMembers'`).
 */
export function ChannelMembersSheet({
  open,
  channel,
  onClose,
}: {
  open: boolean;
  channel: ChatChannel;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const current = useQuery(
    api.chat.channelMembers,
    open ? { channelId: channel._id } : 'skip',
  );
  const team = useQuery(
    api.startups.listMembers,
    open ? { startupId: channel.startupId, limit: MAX_CHAT_CHANNEL_MEMBERS } : 'skip',
  );
  const profile = useQuery(api.profiles.getCurrent, {});
  const setChannelMembers = useMutation(api.chat.setChannelMembers);

  /**
   * `null` = korisnik još nije dirao kvadratiće, pa se prikazuje živo stanje sa
   * servera. Prvi dodir „zamrzava" izbor u `draft` i od tada tuđa izmena ne pomera
   * kvadratić pod prstom. Bez efekta — `setState` u efektu pravi kaskadne rendere
   * (isto rešenje i na webu, gde ga `react-hooks` lint izričito zabranjuje).
   */
  const [draft, setDraft] = useState<Set<Id<'profiles'>> | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(
    () =>
      new Set(
        (current ?? [])
          .map((row) => row.profile._id)
          .filter((profileId) => profileId !== profile?._id),
      ),
    [current, profile?._id],
  );
  const selected = draft ?? initial;

  const ownerIds = new Set(
    (current ?? []).filter((row) => row.role === 'owner').map((row) => row.profile._id),
  );
  const others = (team ?? []).filter((member) => member.profile._id !== profile?._id);
  const term = search.trim().toLowerCase();
  const visible =
    term.length === 0
      ? others
      : others.filter((member) =>
          member.profile.displayName.toLowerCase().includes(term),
        );

  const loading = current === undefined || team === undefined || profile === undefined;

  /** Zatvaranje vraća `draft` na `null` — sledeće otvaranje kreće od servera. */
  function close() {
    setDraft(null);
    setSearch('');
    setError(null);
    onClose();
  }

  function toggle(profileId: Id<'profiles'>) {
    haptics.select();
    const next = new Set(selected);
    if (next.has(profileId)) next.delete(profileId);
    else next.add(profileId);
    setDraft(next);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    haptics.tap();
    try {
      const result = await setChannelMembers({
        channelId: channel._id,
        memberProfileIds: [...selected],
      });
      haptics.success();
      // Inverz nije „vrati arhivirano" nego NOV upis sa spiskom OD PRE — jedini
      // izvor tog spiska je sama mutacija (`previousProfileIds`).
      pushUndo({
        label: 'Članovi kanala su izmenjeni.',
        action: {
          kind: 'channelMembers',
          channelId: channel._id,
          profileIds: result.previousProfileIds,
        },
      });
      close();
    } catch (caught) {
      haptics.error();
      setError(accessErrorMessage(caught, 'Članovi nisu sačuvani.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={open} onClose={close} avoidKeyboard style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Članovi kanala
      </Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        Kanal vide samo označeni članovi. Tvorac kanala ostaje uvek.
      </Text>

      {error === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      )}

      <MemberSearchInput value={search} onChange={setSearch} editable={!loading && !saving} />

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje članova">
            <SkeletonList
              count={4}
              item={(index) => <SkeletonRow index={index} leading="circle" subtitle />}
            />
          </View>
        ) : others.length === 0 ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            U timu nema drugih članova.
          </Text>
        ) : visible.length === 0 ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Nema rezultata za „{search.trim()}".
          </Text>
        ) : (
          visible.map((member) => {
            const isOwner = ownerIds.has(member.profile._id);
            const checked = isOwner || selected.has(member.profile._id);
            return (
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
                subtitle={
                  isOwner
                    ? 'Tvorac kanala — ostaje uvek'
                    : member.profile.role === 'admin'
                      ? 'Administrator'
                      : undefined
                }
                value={checked ? <Check size={18} color={colors.primary} /> : undefined}
                showChevron={false}
                disabled={isOwner || saving}
                onPress={() => toggle(member.profile._id)}
                accessibilityLabel={
                  isOwner
                    ? `${member.profile.displayName}, tvorac kanala, uvek član`
                    : checked
                      ? `${member.profile.displayName}, izabran`
                      : `${member.profile.displayName}, nije izabran`
                }
              />
            );
          })
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button
          label="Otkaži"
          variant="ghost"
          disabled={saving}
          onPress={() => {
            haptics.tap();
            close();
          }}
          style={styles.flexBtn}
        />
        <Button
          label="Sačuvaj"
          loading={saving}
          disabled={loading}
          onPress={() => void save()}
          style={styles.flexBtn}
        />
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
  meta: {
    ...text.meta,
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
    maxHeight: 320,
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
