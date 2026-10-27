import { MessageSquare } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  commentsLabel,
  ideaAuthorLine,
  ideaTitle,
  type IdeaRowModel,
  type IdeaVote,
} from '@/components/ideja/ideje-model';
import { VoteButtons } from '@/components/ideja/vote-buttons';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/**
 * Red liste Ideja (PROSTOR P16, K07 §5.9): naslov (2 reda) + „Autor · starost",
 * ispod Za/Protiv (44 pt) i broj komentara. Nije kartica — razmak nosi strukturu
 * (SMIRENJE §1.3). Dodir na naslov otvara ideju, dugi pritisak akcije; glas je
 * zaseban dodir, pa se red ne može slučajno otvoriti dok glasaš.
 *
 * Prezentaciona: podaci i obrada kroz props (ide i u Dizajn katalog).
 */
export function IdeaListRow({
  idea,
  now,
  voteBusy,
  onOpen,
  onLongPress,
  onVote,
}: {
  idea: IdeaRowModel;
  now: number;
  /** Glas ove ideje je u toku. */
  voteBusy: boolean;
  onOpen: () => void;
  onLongPress?: () => void;
  onVote: (vote: IdeaVote) => void;
}) {
  const colors = useThemeColors();
  const title = ideaTitle(idea);
  const author = ideaAuthorLine(idea, now);
  const comments = commentsLabel(idea);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Otvori ideju: ${title}. ${author}`}
        accessibilityHint={onLongPress ? 'Dugi pritisak otvara akcije ideje.' : undefined}
        accessibilityActions={
          idea.permissions.canVote
            ? [
                { name: 'vote_up', label: 'Glasaj za' },
                { name: 'vote_down', label: 'Glasaj protiv' },
              ]
            : undefined
        }
        onAccessibilityAction={(event) => {
          if (!idea.permissions.canVote || voteBusy) return;
          if (event.nativeEvent.actionName === 'vote_up') onVote('up');
          else if (event.nativeEvent.actionName === 'vote_down') onVote('down');
        }}
        onPress={onOpen}
        onLongPress={onLongPress}
        style={({ pressed }) => [
          styles.main,
          pressed && { backgroundColor: colors.muted },
        ]}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: colors.mutedForeground }]}>
          {author}
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <VoteButtons
          upvotes={idea.upvotes}
          downvotes={idea.downvotes}
          userVote={idea.userVote}
          disabled={voteBusy || !idea.permissions.canVote}
          size="sm"
          onVote={onVote}
        />
        <View
          accessible
          accessibilityLabel={comments}
          style={styles.comments}>
          <MessageSquare size={16} color={colors.mutedForeground} />
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{comments}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 6,
    gap: 4,
  },
  main: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  title: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  meta: {
    ...text.meta,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  comments: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
});
