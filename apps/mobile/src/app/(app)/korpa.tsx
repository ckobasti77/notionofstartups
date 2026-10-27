import { restoredMessage, type TrashKind } from '@devotion/shared';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Trash2, TriangleAlert } from 'lucide-react-native';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { TrashList, TrashListError, TrashListSkeleton } from '@/components/korpa/trash-list';
import {
  DISMISSED_RECOVERED,
  openTargetAfterRestore,
  restoreTarget,
  TRASH_PAGE_SIZE,
  trashItemKey,
  trashItemTitle,
  type RecoveredTrashItem,
  type RestorableTrashItem,
  type TrashOpenTarget,
} from '@/components/korpa/trash-model';
import { TrashSegments } from '@/components/korpa/trash-segments';
import { ScreenHeader } from '@/components/ui/screen-header';
import { UndoBar } from '@/components/undo-bar';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { announceWithUndoBar } from '@/lib/announce';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { backOrProstor, dismissToProstor } from '@/lib/navigation/back-to-prostor';
import { showUndoNotice } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';

/** „pre N min" se osvežava jednom u minuti (kao web Korpa), ne u renderu. */
const CLOCK_TICK_MS = 60_000;
/** Prostor ispod poslednjeg reda: traka „Vraćeno: …" (≈ 56) + razmak. */
const LIST_BOTTOM_SPACE = 96;

/**
 * Korpa startupa (PROSTOR P3, plan K07 §5.4) — par web `trash-container.tsx`.
 * Svaki član vidi obrisano i vraća ga; trajnog brisanja i roka „30 dana" nema.
 * Segmenti Stranice · Ideje · Prilozi · Oporavljeno, najnovije obrisano prvo.
 * „Vrati" nema „Poništi" (E10): traka kaže „Vraćeno: „X”." i nudi „Otvori".
 * Ulaz: Prostor › Korpa, stara ruta `/odobrenja` i obaveštenja sa ciljem
 * `approvals` (preusmerenje).
 */
export default function KorpaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId, restoring } = useActiveStartup();
  const [kind, setKind] = useState<TrashKind>('page');
  // Brojevi su pratilac: njihov pad ne sme da obori listu, samo nestanu.
  const counts = useQueryTolerant(
    api.trash.counts,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Korpa"
        onBack={() => backOrProstor(router)}
        below={
          activeStartupId ? (
            <TrashSegments value={kind} counts={counts} onChange={setKind} />
          ) : undefined
        }
      />
      {activeStartupId === null ? (
        restoring ? (
          <TrashListSkeleton />
        ) : (
          <EmptyState
            icon={<Trash2 size={20} color={colors.mutedForeground} />}
            title="Izaberi startup"
            description="Korpa se prikazuje po startupu."
            actionLabel="Otvori Prostor"
            onAction={() => dismissToProstor(router)}
          />
        )
      ) : (
        // Ključ: promena startupa ili segmenta je novo punjenje, a greška jednog
        // segmenta ne ostaje zalepljena za drugi.
        <TrashBoundary key={`${activeStartupId}:${kind}`}>
          <TrashSegmentBody
            startupId={activeStartupId}
            kind={kind}
            bottomInset={insets.bottom + LIST_BOTTOM_SPACE}
          />
        </TrashBoundary>
      )}
      <UndoBar />
    </View>
  );
}

function TrashSegmentBody({
  startupId,
  kind,
  bottomInset,
}: {
  startupId: Id<'startups'>;
  kind: TrashKind;
  bottomInset: number;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const restore = useMutation(api.trash.restore);
  const dismissRecovered = useMutation(api.trash.dismissRecovered);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const { results, status, loadMore } = usePaginatedQuery(
    api.trash.list,
    { startupId, kind },
    { initialNumItems: TRASH_PAGE_SIZE },
  );

  const open = (target: TrashOpenTarget) => {
    if (target.kind === 'idea') {
      router.push({ pathname: '/ideja/[id]', params: { id: target.ideaId } });
    } else {
      // Zadatak se sam preusmeri na svoj ekran (`stranica/[id]`).
      router.push({ pathname: '/stranica/[id]', params: { id: target.pageId } });
    }
  };

  const onRestore = async (item: RestorableTrashItem) => {
    if (busyKey !== null) return;
    setBusyKey(trashItemKey(item));
    haptics.tap();
    try {
      const result = await restore({ target: restoreTarget(item) });
      haptics.success();
      const message = restoredMessage({ ...result, title: trashItemTitle(item) });
      const target = openTargetAfterRestore(item);
      showUndoNotice({ label: message, secondary: { label: 'Otvori', onPress: () => open(target) } });
      announceWithUndoBar(message);
    } catch (error) {
      haptics.error();
      Alert.alert('Vraćanje nije uspelo', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setBusyKey(null);
    }
  };

  const onDismiss = async (item: RecoveredTrashItem) => {
    if (busyKey !== null) return;
    setBusyKey(trashItemKey(item));
    haptics.tap();
    try {
      await dismissRecovered({ recoveredId: item.recoveredId });
      haptics.success();
      showUndoNotice({ label: DISMISSED_RECOVERED });
      announceWithUndoBar(DISMISSED_RECOVERED);
    } catch (error) {
      haptics.error();
      Alert.alert('Uklanjanje nije uspelo', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <TrashList
      kind={kind}
      state={
        status === 'LoadingFirstPage'
          ? { status: 'loading' }
          : {
              status: 'ready',
              items: results,
              canLoadMore: status === 'CanLoadMore',
              loadingMore: status === 'LoadingMore',
            }
      }
      now={now}
      busyKey={busyKey}
      onRestore={(item) => void onRestore(item)}
      onDismiss={(item) => void onDismiss(item)}
      onLoadMore={() => loadMore(TRASH_PAGE_SIZE)}
      bottomInset={bottomInset}
    />
  );
}

/**
 * Granica greške segmenta (`trash.list` baca za nečlana, uklonjenog člana ili
 * arhiviran profil): zaglavlje i segmenti ostaju, „Pokušaj ponovo" ponovo montira.
 */
class TrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <TrashListError
          message={accessErrorMessage(this.state.error, 'Proveri vezu i pokušaj ponovo.')}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/** Sve ostalo (npr. aktivan startup): ekran sa „nazad" i „Pokušaj ponovo". */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Korpa" onBack={() => backOrProstor(router)} />
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Korpa nije učitana."
        description={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')}
        actionLabel="Pokušaj ponovo"
        onAction={retry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
