import { useMutation } from 'convex/react';
import { ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

/** Detalj ideje razrešen iz `api.ideas.list` po `nodeId` iz WebView poruke. */
export type IdeaDetail = {
  _id: Id<'ideaNodes'>;
  title: string | null;
  text: string;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  author: { displayName: string } | null;
};

/**
 * Bottom sheet sa detaljem ideje na tap čvora u canvas WebView-u (M4.3, §9.3:
 * „editovanje sadržaja radi native, layout ostaje u WebView-u"). Glasanje je
 * native (`ideas.vote`) — ponovni isti glas ga poništava (server toggle).
 */
export function IdeaNodeSheet({
  idea,
  startupId,
  onClose,
}: {
  idea: IdeaDetail | null;
  startupId: Id<'startups'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const vote = useMutation(api.ideas.vote);
  const [busy, setBusy] = useState(false);

  const castVote = async (voteType: 'up' | 'down') => {
    if (!idea) return;
    setBusy(true);
    try {
      await vote({ startupId, ideaId: idea._id, voteType });
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, 'Glas nije zabeležen.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={idea !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zatvori"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.popover, borderColor: colors.border, paddingBottom: insets.bottom + 16 },
        ]}>
        {idea ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {(idea.title ?? '').trim() || 'Ideja'}
            </Text>
            {idea.text.trim() ? (
              <Text style={[styles.text, { color: colors.mutedForeground }]}>{idea.text.trim()}</Text>
            ) : null}
            {idea.author ? (
              <Text style={[styles.author, { color: colors.mutedForeground }]}>
                Autor: {idea.author.displayName}
              </Text>
            ) : null}

            <View style={styles.votes}>
              <VoteButton
                icon={<ThumbsUp size={20} color={idea.userVote === 'up' ? colors.successForeground : colors.foreground} />}
                count={idea.upvotes}
                active={idea.userVote === 'up'}
                activeBg={colors.success}
                activeFg={colors.successForeground}
                disabled={busy}
                onPress={() => void castVote('up')}
                colors={colors}
                label="Glas za"
              />
              <VoteButton
                icon={<ThumbsDown size={20} color={idea.userVote === 'down' ? colors.destructiveForeground : colors.foreground} />}
                count={idea.downvotes}
                active={idea.userVote === 'down'}
                activeBg={colors.destructive}
                activeFg={colors.destructiveForeground}
                disabled={busy}
                onPress={() => void castVote('down')}
                colors={colors}
                label="Glas protiv"
              />
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

function VoteButton({
  icon,
  count,
  active,
  activeBg,
  activeFg,
  disabled,
  onPress,
  colors,
  label,
}: {
  icon: React.ReactNode;
  count: number;
  active: boolean;
  activeBg: string;
  activeFg: string;
  disabled: boolean;
  onPress: () => void;
  colors: ColorTokens;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, trenutno ${count}`}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.voteBtn,
        {
          backgroundColor: active ? activeBg : colors.secondary,
          borderColor: active ? activeBg : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {icon}
      <Text style={[styles.voteCount, { color: active ? activeFg : colors.foreground }]}>
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 20,
    gap: 8,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  author: {
    fontSize: 14,
  },
  votes: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  voteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  voteCount: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
