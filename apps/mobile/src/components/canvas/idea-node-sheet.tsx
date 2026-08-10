import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { MessagesSquare } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VoteButtons } from '@/components/ideja/vote-buttons';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

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
  const router = useRouter();
  const vote = useMutation(api.ideas.vote);
  const [busy, setBusy] = useState(false);

  const castVote = async (voteType: 'up' | 'down') => {
    if (!idea) return;
    setBusy(true);
    haptics.tap();
    try {
      await vote({ startupId, ideaId: idea._id, voteType });
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Glas nije zabeležen.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={idea !== null} onClose={onClose} maxHeight="70%">
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
            <VoteButtons
              upvotes={idea.upvotes}
              downvotes={idea.downvotes}
              userVote={idea.userVote}
              disabled={busy}
              onVote={(next) => void castVote(next)}
            />
          </View>

          {/* Diskusija je duga i ima kompozer — otvara se kao ekran, ne u sheet-u
              nad canvasom (tastatura i WebView ispod se tuku za isti prostor). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Otvori diskusiju o ideji"
            onPress={() => {
              const ideaId = idea._id;
              haptics.tap();
              onClose();
              router.push({ pathname: '/ideja/[id]', params: { id: ideaId } });
            }}
            style={({ pressed }) => [
              styles.discussion,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <MessagesSquare size={18} color={colors.foreground} />
            <Text style={[styles.discussionText, { color: colors.foreground }]}>Diskusija</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 16,
  },
  votes: {
    marginTop: 8,
  },
  discussion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    marginTop: 4,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  discussionText: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
});
