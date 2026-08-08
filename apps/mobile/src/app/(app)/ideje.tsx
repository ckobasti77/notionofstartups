import { useMutation, useQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ChevronLeft, LayoutGrid, Lightbulb, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, type ColorTokens } from '@/theme/tokens';

type IdeaItem = {
  _id: Id<'ideaNodes'>;
  title: string | null;
  text: string;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  author: { displayName: string } | null;
};

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
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'ideas', id: activeStartupId } });
  };

  const loading = activeStartupId !== null && ideas === undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="Ideje"
        onBack={() => router.back()}
        onCanvas={activeStartupId ? openCanvas : undefined}
        colors={colors}
      />
      {activeStartupId === null ? (
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Ideje se prikazuju po startupu. Izaberi ga iz zaglavlja."
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje ideja" />
        </View>
      ) : ideas && ideas.nodes.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={40} color={colors.mutedForeground} />}
          title="Još nema ideja"
          description="Ideje tima pojaviće se ovde. Dodaj prvu iz canvas prikaza."
          actionLabel="Otvori canvas"
          onAction={openCanvas}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          {(ideas?.nodes ?? []).map((node) => (
            <IdeaRow key={node._id} idea={node} startupId={activeStartupId} colors={colors} />
          ))}
        </ScrollView>
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
  const vote = useMutation(api.ideas.vote);
  const [busy, setBusy] = useState(false);

  const cast = async (voteType: 'up' | 'down') => {
    setBusy(true);
    try {
      await vote({ startupId, ideaId: idea._id, voteType });
    } catch (error) {
      Alert.alert('Greška', accessErrorMessage(error, 'Glas nije zabeležen.'));
    } finally {
      setBusy(false);
    }
  };

  const title = (idea.title ?? '').trim() || 'Ideja';
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        {idea.text.trim() ? (
          <Text numberOfLines={2} style={[styles.rowText, { color: colors.mutedForeground }]}>
            {idea.text.trim()}
          </Text>
        ) : null}
        {idea.author ? (
          <Text style={[styles.rowAuthor, { color: colors.mutedForeground }]}>
            {idea.author.displayName}
          </Text>
        ) : null}
      </View>
      <View style={styles.voteCol}>
        <VotePill
          icon={<ThumbsUp size={16} color={idea.userVote === 'up' ? colors.successForeground : colors.foreground} />}
          count={idea.upvotes}
          active={idea.userVote === 'up'}
          activeBg={colors.success}
          activeFg={colors.successForeground}
          disabled={busy}
          onPress={() => void cast('up')}
          colors={colors}
          label="Glas za"
        />
        <VotePill
          icon={<ThumbsDown size={16} color={idea.userVote === 'down' ? colors.destructiveForeground : colors.foreground} />}
          count={idea.downvotes}
          active={idea.userVote === 'down'}
          activeBg={colors.destructive}
          activeFg={colors.destructiveForeground}
          disabled={busy}
          onPress={() => void cast('down')}
          colors={colors}
          label="Glas protiv"
        />
      </View>
    </View>
  );
}

function VotePill({
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
        styles.pill,
        {
          backgroundColor: active ? activeBg : colors.secondary,
          borderColor: active ? activeBg : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {icon}
      <Text style={[styles.pillCount, { color: active ? activeFg : colors.foreground }]}>{count}</Text>
    </Pressable>
  );
}

function Header({
  title,
  onBack,
  onCanvas,
  colors,
}: {
  title: string;
  onBack: () => void;
  onCanvas?: () => void;
  colors: ColorTokens;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nazad"
        onPress={onBack}
        style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
      {onCanvas ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Canvas prikaz ideja"
          onPress={onCanvas}
          style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.muted }]}>
          <LayoutGrid size={22} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
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
      <Header title="Ideje" onBack={() => router.back()} colors={colors} />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    marginLeft: 2,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: fontWeight.semibold,
  },
  rowText: {
    fontSize: 16,
    lineHeight: 21,
  },
  rowAuthor: {
    fontSize: 16,
    marginTop: 2,
  },
  voteCol: {
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 56,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillCount: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
