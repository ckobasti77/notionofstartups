import { useMutation, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { LayoutGrid, Lightbulb, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { VoteButtons } from '@/components/ideja/vote-buttons';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SkeletonIdeaCard, SkeletonList } from '@/components/ui/skeletons';
import { StaggerGroup, StaggerItem } from '@/components/ui/stagger';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text, type ColorTokens } from '@/theme/tokens';

type IdeaItem = {
  _id: Id<'ideaNodes'>;
  title: string | null;
  text: string;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  author: { displayName: string } | null;
};

/** Srpska množina za brojač u zaglavlju (isti obrazac kao `tasksWord`). */
function ideasWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return 'ideja';
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'ideje';
  return 'ideja';
}

/**
 * Ekran „Ideje" (M4.4) — native lista sa glasanjem, plus dugme za canvas prikaz
 * (WebView, korak 5). Lista je brža i čitljivija na telefonu od grafa; graf je za
 * pregled i navigaciju. Podaci iz `api.ideas.list` (isti izvor kao canvas).
 */
export default function IdejeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  const ideas = useQuery(
    api.ideas.list,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );

  const openCanvas = () => {
    if (!activeStartupId) return;
    haptics.tap();
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'ideas', id: activeStartupId } });
  };

  const loading = activeStartupId !== null && ideas === undefined;
  const count = ideas?.nodes.length ?? 0;
  const refreshControl = useListRefresh();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Ideje"
        eyebrow={count > 0 ? `${count} ${ideasWord(count)}` : undefined}
        onBack={() => router.back()}
        actions={
          activeStartupId ? (
            <IconButton accessibilityLabel="Canvas prikaz ideja" onPress={openCanvas}>
              <LayoutGrid size={22} color={colors.foreground} />
            </IconButton>
          ) : undefined
        }
      />
      {activeStartupId === null ? (
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Ideje se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : ideas && ideas.nodes.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Još nema ideja"
          description="Ideje tima pojaviće se ovde. Dodaj prvu iz canvas prikaza."
          actionLabel="Otvori canvas"
          onAction={openCanvas}
        />
      ) : (
        <LoadingSwap
          loading={loading}
          skeleton={
            <SkeletonList
              count={4}
              gap={8}
              style={styles.list}
              item={(index) => <SkeletonIdeaCard index={index} />}
            />
          }>
          {ideas ? (
            <ScrollView
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={refreshControl}>
              <StaggerGroup>
                {ideas.nodes.map((node, index) => (
                  <StaggerItem key={node._id} index={index}>
                    <IdeaRow idea={node} startupId={activeStartupId} colors={colors} />
                  </StaggerItem>
                ))}
              </StaggerGroup>
            </ScrollView>
          ) : null}
        </LoadingSwap>
      )}
    </View>
  );
}

function IdeaRow({
  idea,
  startupId,
  colors,
}: {
  idea: IdeaItem;
  startupId: Id<'startups'>;
  colors: ColorTokens;
}) {
  const router = useRouter();
  const vote = useMutation(api.ideas.vote);
  const [busy, setBusy] = useState(false);

  const cast = async (voteType: 'up' | 'down') => {
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

  const title = (idea.title ?? '').trim() || 'Ideja';
  const body = idea.text.trim();
  // Tap na karticu otvara ekran ideje (detalj + diskusija tima). Glasanje je
  // SEKUNDARNO: kompaktan par dugmadi u podnožju, desno od autora — ne traka
  // preko pola kartice.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Otvori ideju: ${title}`}
      onPress={() => {
        haptics.tap();
        router.push({ pathname: '/ideja/[id]', params: { id: idea._id } });
      }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}>
      <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {body ? (
        <Text numberOfLines={2} style={[styles.rowText, { color: colors.mutedForeground }]}>
          {body}
        </Text>
      ) : null}
      <View style={styles.footer}>
        {idea.author ? (
          <>
            <Avatar name={idea.author.displayName} size={22} />
            <Text numberOfLines={1} style={[styles.author, { color: colors.mutedForeground }]}>
              {idea.author.displayName}
            </Text>
          </>
        ) : null}
        <View style={styles.grow} />
        <VoteButtons
          upvotes={idea.upvotes}
          downvotes={idea.downvotes}
          userVote={idea.userVote}
          disabled={busy}
          size="sm"
          onVote={(next) => void cast(next)}
        />
      </View>
    </Pressable>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <IdejeError message={error.message} onRetry={retry} />;
}

function IdejeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Ideje" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Ideje se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju ideja.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grow: { flex: 1 },
  list: {
    padding: 16,
    paddingTop: 8,
    gap: 8,
  },
  // Kartica: naslov → tekst → podnožje (autor + glasovi u istom redu).
  row: {
    gap: 4,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  rowText: {
    ...text.body,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  author: {
    ...text.meta,
    flexShrink: 1,
  },
});
