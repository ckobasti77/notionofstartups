import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/**
 * Dodavanje člana — mobilni pandan „Članovi" tabu u web `admin-dialog.tsx`.
 * `profiles.listAll` je GLOBALNA lista svih aktivnih korisnika (admin-only, do
 * 50, admini pa članovi po imenu) — filtrira se na klijentu protiv već
 * učlanjenih (`existingProfileIds`, prosleđuje ih `clanovi.tsx` iz upita koji
 * već ima). Dodavanje nije destruktivno pa nema potvrde — tap odmah dodaje.
 */
export function AddMemberSheet({
  open,
  startupId,
  existingProfileIds,
  onClose,
}: {
  open: boolean;
  startupId: Id<'startups'>;
  existingProfileIds: ReadonlySet<Id<'profiles'>>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const profiles = useQuery(api.profiles.listAll, open ? { limit: 50 } : 'skip');
  const addMember = useMutation(api.startups.addMember);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<Id<'profiles'> | null>(null);

  const available = (profiles ?? []).filter((profile) => !existingProfileIds.has(profile._id));
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? available.filter((profile) =>
        `${profile.displayName} ${profile.email}`.toLowerCase().includes(needle),
      )
    : available;

  const add = async (profileId: Id<'profiles'>) => {
    if (busyId !== null) return;
    setBusyId(profileId);
    haptics.tap();
    try {
      await addMember({ startupId, profileId });
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Član nije dodat.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard maxHeight="80%" style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Dodaj člana
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Pretraži po imenu ili emailu"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        autoCapitalize="none"
        accessibilityLabel="Pretraga korisnika"
        style={[
          styles.search,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
        ]}
      />
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {profiles === undefined ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Učitavanje…</Text>
        ) : filtered.length === 0 ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {available.length === 0
              ? 'Svi aktivni korisnici su već članovi ovog startupa.'
              : 'Nema rezultata za tu pretragu.'}
          </Text>
        ) : (
          filtered.map((profile) => (
            <Row
              key={profile._id}
              style={styles.row}
              icon={<Avatar name={profile.displayName} uri={profile.avatarUrl} size={36} />}
              title={profile.displayName}
              subtitle={profile.email}
              value={
                busyId === profile._id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : profile.role === 'admin' ? (
                  <Pill label="Admin" tone="accent" />
                ) : undefined
              }
              showChevron={false}
              disabled={busyId !== null}
              onPress={() => void add(profile._id)}
              accessibilityLabel={`Dodaj ${profile.displayName}, ${profile.email}`}
            />
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
    gap: 10,
  },
  heading: {
    ...text.title,
  },
  search: {
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 4,
    gap: 2,
  },
  hint: {
    ...text.body,
    paddingVertical: 12,
  },
  row: {
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
});
