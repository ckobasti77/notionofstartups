import { MessageSquare } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { commentsEntryTitle } from '@/components/collab/collab-model';
import type { CommentsSummary } from '@/components/collab/comments-sheet';
import { IconButton } from '@/components/ui/icon-button';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Ikonica „Komentari" u zaglavlju sa brojem (K07 §5.6, E3): otvara sheet komentara.
 * Broj je kratka oznaka u uglu, a čitač ekrana čuje ceo naslov („Komentari · 4").
 */
export function CommentsHeaderButton({
  summary,
  onPress,
}: {
  summary: CommentsSummary;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const showCount = summary.count !== null && summary.count > 0;
  return (
    <IconButton
      accessibilityLabel={commentsEntryTitle(summary.count, summary.capped)}
      onPress={onPress}>
      <View>
        <MessageSquare size={20} color={colors.foreground} />
        {showCount ? (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
              {summary.capped ? `${summary.count}+` : summary.count}
            </Text>
          </View>
        ) : null}
      </View>
    </IconButton>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
});
