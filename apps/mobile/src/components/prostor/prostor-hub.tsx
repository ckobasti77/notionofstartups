import { hubUnreadLabel, pendingIdeaVotes } from '@devotion/shared';
import { useRouter } from 'expo-router';
import {
  FolderClosed,
  Lightbulb,
  ListTodo,
  MessageCircle,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { UnreadPill } from '@/components/me/chat/hub-row';
import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

import {
  hubRowValue,
  PROSTOR_HUB_ROWS,
  type ProstorHubDestination,
  type ProstorHubRow,
} from './prostor-hub-model';

const ROW_ICON: Record<ProstorHubDestination, LucideIcon> = {
  zadaci: ListTodo,
  oblasti: FolderClosed,
  ideje: Lightbulb,
  kanali: MessageCircle,
  korpa: Trash2,
};

const ROW_HINT: Record<ProstorHubDestination, string> = {
  zadaci: 'Otvara sve zadatke tima',
  oblasti: 'Otvara oblasti i stranice',
  ideje: 'Otvara ideje tima',
  kanali: 'Otvara chat ovog startupa',
  korpa: 'Otvara obrisano',
};

/**
 * Redovi početne startupa (PROSTOR P18, plan K07 §4.2, E4) — prezentacioni:
 * brojevi stižu kroz props. Jedna lista redova bez kartica i ivica po redu
 * (DIZAJN-SMIRENJE §5.2): ikonica 20 u prigušenoj boji, naslov, vrednost desno.
 */
export function ProstorHubRows({
  areaCount,
  ideaVotes = null,
  channelsUnread,
  onOpen,
}: {
  /** Broj oblasti za „Dokumenti"; `null` dok stiže. */
  areaCount: number | null;
  /** Ideje koje čekaju tvoj glas, za „Ideje" (K17); `null` dok stiže. */
  ideaVotes?: number | null;
  /** Nepročitano u chatu ovog startupa (pilula uz „Kanali"). */
  channelsUnread: number;
  onOpen: (destination: ProstorHubDestination) => void;
}) {
  return (
    <View>
      {PROSTOR_HUB_ROWS.map((row) => (
        <HubRow
          key={row.id}
          row={row}
          value={hubRowValue(row.id, areaCount, ideaVotes)}
          unread={row.id === 'kanali' ? channelsUnread : 0}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

function HubRow({
  row,
  value,
  unread,
  onOpen,
}: {
  row: ProstorHubRow;
  value: string | null;
  unread: number;
  onOpen: (destination: ProstorHubDestination) => void;
}) {
  const colors = useThemeColors();
  const Icon = ROW_ICON[row.id];
  const unreadLabel = unread > 0 ? hubUnreadLabel(unread) : null;
  return (
    <Row
      icon={<Icon size={20} color={colors.mutedForeground} />}
      title={row.title}
      value={
        unreadLabel ? (
          <UnreadPill value={unread} accessibilityLabel={unreadLabel} colors={colors} />
        ) : (
          (value ?? undefined)
        )
      }
      accessibilityLabel={[row.title, value, unreadLabel].filter(Boolean).join(', ')}
      accessibilityHint={ROW_HINT[row.id]}
      onPress={() => {
        haptics.tap();
        onOpen(row.id);
      }}
      style={styles.row}
    />
  );
}

/**
 * Kontejner redova: broj oblasti iz `startups.get`, ideje na glasanju iz
 * `inbox.pending` i nepročitano iz `chat.unreadSummary` (isti izvor kao bedž
 * taba). Sve su pratioci — pad upita samo sakrije broj, redovi i dalje vode gde treba.
 */
export function ProstorHub({ startupId }: { startupId: Id<'startups'> }) {
  const router = useRouter();
  const startup = useQueryTolerant(api.startups.get, { startupId });
  const unread = useQueryTolerant(api.chat.unreadSummary, {});
  // Ideje koje čekaju moj glas u OVOM startupu (K17); pratilac — pad samo sakrije broj.
  const pending = useQueryTolerant(api.inbox.pending, {
    startupId,
    include: ['idea_vote' as const],
  });
  const ideaVotes = pending ? pendingIdeaVotes(pending.items).length : null;
  const channelsUnread =
    unread?.byStartup.find((entry) => entry.startupId === startupId)?.unreadCount ?? 0;
  return (
    <ProstorHubRows
      areaCount={startup ? startup.areas.length : null}
      ideaVotes={ideaVotes}
      channelsUnread={channelsUnread}
      onOpen={(destination) => openProstorDestination(router, destination)}
    />
  );
}

/** Kuda vodi red Prostora (stack ekrani iznad tabova, sa „nazad" u Prostor). */
function openProstorDestination(
  router: ReturnType<typeof useRouter>,
  destination: ProstorHubDestination,
): void {
  switch (destination) {
    case 'zadaci':
      router.push('/zadaci');
      return;
    case 'oblasti':
      router.push('/oblasti');
      return;
    case 'ideje':
      router.push('/ideje');
      return;
    case 'kanali':
      router.push('/kanali');
      return;
    case 'korpa':
      router.push('/korpa');
      return;
  }
}

const styles = StyleSheet.create({
  // Lista Prostora već ima razmak ekrana 16 — red ga ne dodaje drugi put, a
  // pritisak se vidi kao zaobljena podloga (DIZAJN-SMIRENJE §3: jedan red 44).
  row: {
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
});
