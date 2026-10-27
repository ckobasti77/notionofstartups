import { serializeComment } from '@devotion/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PresenceRow } from '@/components/collab/collab-model';
import { CommentComposer, type MentionMember } from '@/components/collab/comment-composer';
import { CommentRow, type CommentItem } from '@/components/collab/comment-row';
import { CommentsHeaderButton } from '@/components/collab/comments-button';
import { CommentsEntryRow, type CommentsSummary } from '@/components/collab/comments-sheet';
import { LockBadge, LockNotice } from '@/components/collab/lock';
import { PresenceIndicator } from '@/components/collab/presence-indicator';
import { SectionHeader } from '@/components/ui/section-header';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

const MINUTE = 60_000;

const MEMBERS: MentionMember[] = [
  { profileId: 'p1', displayName: 'Ana Ilić' },
  { profileId: 'p2', displayName: 'Marko Jović' },
  { profileId: 'p3', displayName: 'Jelena Petrović' },
  { profileId: 'p4', displayName: 'Željko Đorđević' },
];

function comments(now: number): CommentItem[] {
  return [
    {
      _id: 'c1',
      content: serializeComment('Proveri sa @Marko Jović limit za webhook.', [MEMBERS[1]]).content,
      author: { displayName: 'Ana Ilić', avatarUrl: null },
      origin: 'comment',
      moderationStatus: 'approved',
      createdAt: now - 62 * MINUTE,
      edited: true,
      permissions: { canEdit: true, canRemove: true },
    },
    {
      _id: 'c2',
      content: '<p>Limit je 5000 po minutu, dodaću u dokument.</p>',
      author: { displayName: 'Marko Jović', avatarUrl: null },
      origin: 'comment',
      moderationStatus: 'approved',
      createdAt: now - 20 * MINUTE,
      edited: false,
      permissions: { canEdit: false, canRemove: false },
    },
    {
      _id: 'c3',
      content: '<p>Zatečen zajednički tekst iz vremena pre potpisivanja.</p>',
      author: null,
      origin: 'legacy_shared',
      moderationStatus: 'approved',
      createdAt: now - 3 * 24 * 60 * MINUTE,
      edited: false,
      permissions: { canEdit: false, canRemove: true },
    },
  ];
}

/** Redovi prisustva (isti oblik kao `presence.listForPage`). */
function presence(now: number): PresenceRow[] {
  return MEMBERS.slice(0, 3).map((member) => ({
    profileId: member.profileId,
    displayName: member.displayName,
    avatarUrl: null,
    editing: true,
    expiresAt: now + 45_000,
  }));
}

/** PROSTOR K12: komentari, unos sa @, prisustvo i zaključano — fixture, ništa ne ide na server. */
export function ProstorK12Katalog() {
  const colors = useThemeColors();
  const [now] = useState(() => Date.now());
  const [items] = useState(() => comments(Date.now()));
  const [editors] = useState(() => presence(Date.now()));
  const [log, setLog] = useState('Dodirni „…“ na komentaru ili ukucaj @ u polje.');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const summary: CommentsSummary = {
    count: 3,
    capped: false,
    last: { author: 'Marko Jović', excerpt: 'Limit je 5000 po minutu, dodaću u dokument.' },
  };

  return (
    <View style={styles.root}>
      <SectionHeader title="Komentari — lista i red (K12)" />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        Isti komentar kao u sheet-u: avatar, ime, vreme, „izmenjeno“, pominjanje istaknuto. „…“ samo kad smeš.
      </Text>
      <View style={[styles.frame, { borderColor: colors.border }]}>
        {items.map((item) => (
          <CommentRow
            key={item._id}
            comment={item}
            now={now}
            animate={false}
            onMenu={(comment) => setLog(`Radnje za komentar: ${comment._id}`)}
          />
        ))}
      </View>
      <CommentsEntryRow summary={summary} onPress={() => setLog('Otvori Komentare')} />
      <View style={styles.row}>
        <CommentsHeaderButton summary={summary} onPress={() => setLog('Otvori Komentare (zaglavlje)')} />
        <CommentsHeaderButton
          summary={{ count: 20, capped: true, last: null }}
          onPress={() => setLog('Otvori Komentare (20+)')}
        />
        <CommentsHeaderButton
          summary={{ count: 0, capped: false, last: null }}
          onPress={() => setLog('Otvori Komentare (prazno)')}
        />
      </View>

      <SectionHeader title="Unos komentara (K12)" />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        „@“ otvara članove iznad polja (redovi 44 pt). Greška slanja ostavlja tekst u polju.
      </Text>
      <CommentComposer
        members={MEMBERS}
        selfProfileId="p1"
        busy={busy}
        error={failed ? 'Komentar nije poslat. Pokušaj ponovo.' : null}
        onChangeText={() => setFailed(false)}
        onSubmit={async (payload) => {
          setBusy(true);
          await new Promise((resolve) => setTimeout(resolve, 600));
          setBusy(false);
          const ok = !payload.content.includes('greska');
          setFailed(!ok);
          setLog(`Poslato: ${payload.mentionProfileIds.length} pominjanja`);
          return ok;
        }}
      />

      <SectionHeader title="Zaključano i „uređuje“ (K12)" />
      <View style={styles.row}>
        <LockBadge lockedByName="Ana Ilić" lockedAt={now - 90 * MINUTE} now={now} />
      </View>
      <LockNotice />
      <LockNotice subject="task" />
      <View style={styles.stack}>
        <PresenceIndicator editors={editors.slice(0, 1)} />
        <PresenceIndicator editors={editors.slice(0, 2)} />
        <PresenceIndicator editors={editors} />
      </View>
      <Text style={[styles.log, { color: colors.mutedForeground }]}>{log}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
    paddingTop: 24,
  },
  caption: {
    ...text.body,
  },
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stack: {
    gap: 8,
  },
  log: {
    ...text.meta,
  },
});
