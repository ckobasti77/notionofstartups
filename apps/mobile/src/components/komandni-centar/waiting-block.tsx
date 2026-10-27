import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

import { BlockEmpty, BlockLinkRow, useBlockMotion } from './command-block-parts';
import { BLOCK_TEXT, waitingIdeas, type WaitingIdea } from './command-blocks-model';

/**
 * „Čeka tebe" (PROSTOR P22, K19): ideje u fazi „Razmatra se" koje čekaju moj glas —
 * naslov, autor, dugmad „Za" / „Protiv" (≥ 44 pt). Posle glasa red nestaje sam
 * (reaktivni upit). Prezentaciona: `ideas === undefined` je učitavanje.
 */
export function WaitingView({
  ideas,
  hasMore,
  busyId,
  busyType = null,
  onVote,
  onOpen,
  onOpenAll,
}: {
  ideas: ReadonlyArray<WaitingIdea> | undefined;
  /** Ima ih više od prikazanih: red „Sve ideje". */
  hasMore: boolean;
  /** Ideja za koju glas upravo stiže (dugmad miruju) i koji je glas poslat. */
  busyId: string | null;
  busyType?: 'up' | 'down' | null;
  onVote: (ideaId: string, voteType: 'up' | 'down') => void;
  onOpen: (ideaId: string) => void;
  onOpenAll: () => void;
}) {
  const colors = useThemeColors();
  const motion = useBlockMotion(ideas?.length ?? 0, ideas === undefined ? 'ucitavanje' : 'spremno');
  return (
    <View>
      <SectionHeader title="Čeka tebe" />
      {ideas === undefined ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje ideja koje čekaju">
          <SkeletonList
            count={2}
            item={() => (
              <View style={styles.skeletonRow}>
                <View style={styles.skeletonBody}>
                  <Skeleton width="64%" height={16} />
                  <Skeleton width="30%" height={13} />
                </View>
                <Skeleton width={56} height={44} borderRadius={radius.control} />
                <Skeleton width={76} height={44} borderRadius={radius.control} />
              </View>
            )}
          />
        </View>
      ) : ideas.length === 0 ? (
        <BlockEmpty text={BLOCK_TEXT.waitingEmpty} />
      ) : (
        <>
          {ideas.map((idea, index) => {
            const busy = busyId === idea.ideaId;
            const author = idea.authorName ?? 'Član tima';
            return (
              <Animated.View
                key={idea.ideaId}
                entering={motion.entering(index)}
                exiting={motion.exiting}
                layout={motion.layout}
                style={styles.item}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${idea.title}, ${author}`}
                  accessibilityHint="Otvara ideju"
                  onPress={() => {
                    haptics.tap();
                    onOpen(idea.ideaId);
                  }}
                  style={({ pressed }) => [styles.body, pressed && { backgroundColor: colors.muted }]}>
                  <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>
                    {idea.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.meta, { color: colors.mutedForeground }]}>
                    {author}
                    {idea.upvotes + idea.downvotes > 0 ? ` · ${idea.upvotes} za · ${idea.downvotes} protiv` : ''}
                  </Text>
                </Pressable>
                <View style={styles.votes}>
                  <Button
                    label="Za"
                    variant="secondary"
                    size="md"
                    disabled={busyId !== null}
                    loading={busy && busyType === 'up'}
                    accessibilityLabel={`Glasaj za: ${idea.title}`}
                    onPress={() => onVote(idea.ideaId, 'up')}
                    style={styles.voteFor}
                  />
                  <Button
                    label="Protiv"
                    variant="secondary"
                    size="md"
                    disabled={busyId !== null}
                    loading={busy && busyType === 'down'}
                    accessibilityLabel={`Glasaj protiv: ${idea.title}`}
                    onPress={() => onVote(idea.ideaId, 'down')}
                    style={styles.voteAgainst}
                  />
                </View>
              </Animated.View>
            );
          })}
          {hasMore ? <BlockLinkRow title={BLOCK_TEXT.allIdeas} onPress={onOpenAll} /> : null}
        </>
      )}
    </View>
  );
}

/**
 * Kontejner: `inbox.pending({ startupId, include: ['idea_vote'] })` — BEZ `include`
 * server vraća prazno — pa `ideas.vote`. Glas: haptika, najava čitaču ekrana
 * „Glas je sačuvan."; red nestaje kad upit stigne bez te ideje.
 */
export function WaitingBlock({ startupId }: { startupId: Id<'startups'> }) {
  const router = useRouter();
  const pending = useQuery(api.inbox.pending, { startupId, include: ['idea_vote' as const] });
  const vote = useMutation(api.ideas.vote);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Prava zaštita od duplog dodira (zatvarač iz rendera kasni jedan render).
  const busyRef = useRef(false);
  const [busyType, setBusyType] = useState<'up' | 'down' | null>(null);

  const model = useMemo(
    () => (pending ? waitingIdeas(pending.items, pending.truncated) : undefined),
    [pending],
  );

  const onVote = async (ideaId: string, voteType: 'up' | 'down') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(ideaId);
    setBusyType(voteType);
    haptics.tap();
    try {
      const result = await vote({ startupId, ideaId: ideaId as Id<'ideaNodes'>, voteType });
      // `ideas.vote` je prekidač: isti glas ponovo ga skida (npr. glas dat na drugom uređaju).
      if (result.action === 'removed') {
        haptics.warning();
        AccessibilityInfo.announceForAccessibility('Glas je skinut.');
      } else {
        haptics.success();
        AccessibilityInfo.announceForAccessibility(BLOCK_TEXT.voteSaved);
      }
    } catch (error) {
      haptics.error();
      Alert.alert('Glas nije sačuvan', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      busyRef.current = false;
      setBusyId(null);
      setBusyType(null);
    }
  };

  return (
    <WaitingView
      ideas={model?.items}
      hasMore={model?.hasMore ?? false}
      busyId={busyId}
      busyType={busyType}
      onVote={(ideaId, voteType) => void onVote(ideaId, voteType)}
      onOpen={(ideaId) => router.push({ pathname: '/ideja/[id]', params: { id: ideaId } })}
      onOpenAll={() => router.push('/ideje')}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingVertical: 6,
  },
  body: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  title: {
    ...text.body,
    fontWeight: '500',
  },
  meta: {
    ...text.meta,
  },
  votes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Širina ne sme da skoči kad „Za" pokaže spinner (isto kao skeleton: 56 i 76).
  voteFor: {
    minWidth: 56,
    paddingHorizontal: 14,
  },
  voteAgainst: {
    minWidth: 76,
    paddingHorizontal: 14,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingVertical: 6,
  },
  skeletonBody: {
    flex: 1,
    gap: 6,
  },
});
