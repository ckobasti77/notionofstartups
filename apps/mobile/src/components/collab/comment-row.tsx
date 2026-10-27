import { parseCommentSegments } from '@devotion/shared';
import { Ellipsis } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  commentAuthorName,
  commentMeta,
} from '@/components/collab/collab-model';
import { enterFadeUp } from '@/components/motion/layout';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

export type CommentItem = {
  _id: string;
  content: string;
  author: { displayName: string; avatarUrl: string | null } | null;
  origin: 'comment' | 'legacy_entry' | 'legacy_shared';
  moderationStatus: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  edited: boolean;
  permissions: { canEdit: boolean; canRemove: boolean };
};

/**
 * Jedan komentar: avatar, „Ime · pre N min · izmenjeno", sadržaj. Sadržaj ide
 * ISKLJUČIVO kroz `parseCommentSegments` (D18) — pominjanje je istaknuto, a HTML
 * se nikad ne renderuje. „…" postoji samo kad nešto smeš da uradiš sa komentarom.
 * `animate` = komentar je stigao posle prvog punjenja liste (K07 §8: `enterFadeUp`).
 */
function CommentRowImpl({
  comment,
  now,
  animate,
  onMenu,
}: {
  comment: CommentItem;
  now: number;
  animate: boolean;
  onMenu: (comment: CommentItem) => void;
}) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const author = commentAuthorName(comment);
  const meta = commentMeta(comment, now);
  const hasMenu = comment.permissions.canEdit || comment.permissions.canRemove;

  return (
    <Animated.View
      entering={animate ? enterFadeUp(0, reduced) : undefined}
      style={styles.row}
      accessible={false}>
      <Avatar name={author} uri={comment.author?.avatarUrl ?? null} size={28} />
      <View style={styles.body}>
        <View
          accessible
          accessibilityLabel={`${author}, ${meta}`}
          style={styles.head}>
          <Text numberOfLines={1} style={[styles.author, { color: colors.foreground }]}>
            {author}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.mutedForeground }]}>
            {meta}
          </Text>
        </View>
        <Text style={[styles.content, { color: colors.foreground }]}>
          {parseCommentSegments(comment.content).map((segment, index) => {
            if (segment.kind === 'break') return '\n';
            if (segment.kind === 'mention') {
              return (
                <Text
                  key={`${index}:${segment.profileId}`}
                  style={{ color: colors.primaryText, fontWeight: '500' }}>
                  {segment.label}
                </Text>
              );
            }
            return segment.text;
          })}
        </Text>
      </View>
      {hasMenu ? (
        <IconButton
          accessibilityLabel={`Radnje za komentar: ${author}`}
          onPress={() => onMenu(comment)}>
          <Ellipsis size={20} color={colors.mutedForeground} />
        </IconButton>
      ) : null}
    </Animated.View>
  );
}

export const CommentRow = memo(CommentRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  author: {
    ...text.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  meta: {
    ...text.meta,
    flexShrink: 0,
  },
  content: {
    ...text.body,
  },
});
