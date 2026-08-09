import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Lightbulb, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ContributionThread } from '@/components/ideja/contribution-thread';
import { VoteButtons } from '@/components/ideja/vote-buttons';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonCard, SkeletonList, SkeletonMessage } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';

/**
 * Ekran ideje — pandan web `idea-discussion-dialog.tsx`. Do sad je ideja na
 * telefonu bila samo red u listi (bez detalja), pa se diskusija tima uopšte nije
 * videla.
 *
 * Zašto ekran, a ne sheet: nit je duga, ima kompozer i uređivanje teksta —
 * tastatura i sheet na telefonu se tuku za istu polovinu ekrana.
 *
 * Podaci: `ideas.list` (ista pretplata koju lista/canvas već drže, pa ideja stiže
 * bez dodatnog upita) + `collaboration.listContributionsPaginated`. Bez nove
 * backend funkcije.
 */
export default function IdejaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ideaId = id as Id<'ideaNodes'>;
  const { activeStartupId } = useActiveStartup();

  const data = useQuery(
    api.ideas.list,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const vote = useMutation(api.ideas.vote);
  const [voting, setVoting] = useState(false);

  const idea = data?.nodes.find((node) => node._id === ideaId) ?? null;

  const castVote = async (voteType: 'up' | 'down') => {
    if (!activeStartupId || voting) return;
    setVoting(true);
    haptics.tap();
    try {
      await vote({ startupId: activeStartupId, ideaId, voteType });
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Glas nije zabeležen.'));
    } finally {
      setVoting(false);
    }
  };

  if (activeStartupId === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ideja" onBack={() => router.back()} />
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Ideje se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      </View>
    );
  }

  if (data === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ideja" onBack={() => router.back()} />
        <IdeaSkeleton />
      </View>
    );
  }

  if (idea === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ideja" onBack={() => router.back()} />
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Ideja više ne postoji"
          description="Možda je arhivirana ili pripada drugom startupu."
          actionLabel="Nazad"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const title = (idea.title ?? '').trim() || 'Ideja';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            {idea.text.trim() ? (
              <Text style={[styles.body, { color: colors.foreground }]}>{idea.text.trim()}</Text>
            ) : null}
            {idea.author ? (
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                Autor: {idea.author.displayName}
              </Text>
            ) : null}
            <VoteButtons
              upvotes={idea.upvotes}
              downvotes={idea.downvotes}
              userVote={idea.userVote}
              disabled={voting}
              onVote={(next) => void castVote(next)}
            />
          </View>

          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>
            Diskusija
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            Tekst članova ide na odobrenje autoru ideje — dok čeka, stoji označen.
          </Text>
          <ContributionThread target={{ kind: 'idea', id: ideaId }} canAdd />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}


/** Oblik ekrana ideje: kartica (naslov, tekst, autor, glasovi), pa nit diskusije. */
function IdeaSkeleton() {
  const colors = useThemeColors();
  return (
    <View style={styles.content} accessibilityLabel="Učitavanje ideje">
      <SkeletonCard style={[styles.card, { backgroundColor: colors.surface }]}>
        <Skeleton width="62%" height={20} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="78%" height={14} />
        <Skeleton width="30%" height={12} />
        <Skeleton width={140} height={36} borderRadius={radius.control} />
      </SkeletonCard>
      <Skeleton width="35%" height={20} />
      <SkeletonList count={3} item={(index) => <SkeletonMessage index={index} />} />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <IdejaError message={error.message} onRetry={retry} />;
}

function IdejaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Ideja" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Ideja se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju ideje.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    gap: 8,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    ...text.title,
  },
  body: {
    ...text.body,
  },
  meta: {
    ...text.meta,
  },
  sectionTitle: {
    ...text.title,
    marginTop: 8,
  },
});
