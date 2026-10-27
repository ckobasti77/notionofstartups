import {
  arrangeNotes,
  noteCreatedMessage,
  noteFilterKey,
  noteScopeArg,
  NOTE_SEARCH_LIMIT,
  NOTE_SEARCH_MIN,
  NOTES_PAGE_SIZE,
  notesCountLabel,
  notesEmptyText,
  notesMapStartupId,
  resolveNoteFilter,
  type NoteFilter,
} from '@devotion/shared';
import { usePaginatedQuery } from 'convex/react';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { LayoutGrid, NotebookPen, Plus, Search, TriangleAlert } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLiveNow } from '@/components/collab/use-live-now';
import { EmptyState } from '@/components/empty-state';
import {
  hasMoreNotes,
  noteRowModel,
  noteSearchRowModel,
  quickNoteTarget,
  shouldAutoLoadNotes,
  shouldLoadMoreOnEnd,
  filterStartupId,
  type NoteRowModel,
} from '@/components/misli/misli-model';
import { NoteActionsSheet, type ActionNote } from '@/components/misli/note-actions-sheet';
import { NoteCreateSheet } from '@/components/misli/note-create-sheet';
import { NoteQuickInput } from '@/components/misli/note-quick-input';
import { NoteRow } from '@/components/misli/note-row';
import { NoteScopeChips } from '@/components/misli/note-scope-chips';
import { ThoughtConversionSheet, type ThoughtConversionNode } from '@/components/misli/thought-conversion-sheet';
import { TidyNotesButton } from '@/components/misli/tidy-notes-button';
import { useCreateNote } from '@/components/misli/use-create-note';
import { useNoteSearch } from '@/components/misli/use-note-search';
import { useMyStartups } from '@/components/misli/use-note-startups';
import { UndoBar } from '@/components/undo-bar';
import { FAB } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Pauza između zatvaranja jednog i otvaranja drugog sheet-a (radnje → izbor
 * cilja). Dva istovremena RN `Modal`-a na Androidu umeju da progutaju
 * `onRequestClose` (vidi `page-actions-sheet.tsx`), pa se drugi otvara tek kad
 * izlazna animacija prvog (~200ms) sigurno prođe.
 */
const SHEET_HANDOFF_MS = 320;

type ListItem = { key: string; model: NoteRowModel; note: ActionNote };

/**
 * Ekran „Beleške" (PROSTOR P7, K18; ruta ostaje `/misli` zbog deep linkova):
 * moje beleške iz SVIH mojih startupa i lične na jednom mestu. Čipovi
 * Sve · Lično · startup, polje „Brza beleška…" na vrhu liste, FAB „Nova
 * beleška", pretraga (`searchMine`), radnje dugim pritiskom (Otvori · Pošalji u
 * startup · Arhiviraj sa „Poništi"). „Mapa" i „Sredi raspored" postoje samo kad
 * je izabran jedan startup — lične beleške nemaju Mapu.
 *
 * Lista je paginirana (`listMine`); strana može biti KRAĆA od `numItems` (beleške
 * iz napuštenih startupa se izbacuju posle čitanja), pa se dovlači dok status
 * nije `Exhausted` — do 300 beleški sama, dalje skrolom. Beleške su privatne po
 * vlasniku: server vraća samo tvoje.
 */
export default function MisliScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useLiveNow(60_000);
  const { startups, ready: startupsReady } = useMyStartups();
  const createNote = useCreateNote();

  const [chosen, setChosen] = useState<NoteFilter<Id<'startups'>>>({ kind: 'all' });
  // Startup koji je nestao iz mojih (napušten) vraća prikaz na „Sve".
  const filter = useMemo(
    () =>
      startupsReady
        ? resolveNoteFilter(
            chosen,
            startups.map((startup) => startup._id),
          )
        : chosen,
    [chosen, startups, startupsReady],
  );
  const filterKey = noteFilterKey(filter);
  const scope = noteScopeArg(filter);
  const mapStartupId = notesMapStartupId(filter);
  const selectedStartup = mapStartupId === null ? null : (startups.find((item) => item._id === mapStartupId) ?? null);

  const [searchTerm, setSearchTerm] = useState('');
  const list = usePaginatedQuery(api.thoughts.listMine, scope, { initialNumItems: NOTES_PAGE_SIZE });
  const { searching, hits } = useNoteSearch(searchTerm, scope, filterKey);

  const loaded = list.results.length;
  useEffect(() => {
    if (shouldAutoLoadNotes({ status: list.status, loaded, searching })) list.loadMore(NOTES_PAGE_SIZE);
  }, [list.status, list.loadMore, loaded, searching]);

  const items = useMemo<ListItem[]>(() => {
    if (searching) {
      return (hits ?? []).map((hit) => ({
        key: hit._id,
        model: noteSearchRowModel(hit, startups),
        note: { _id: hit._id, title: hit.title, text: hit.text, startupId: hit.startupId },
      }));
    }
    return arrangeNotes(list.results).map((row) => ({
      key: row.note._id,
      model: noteRowModel(row, now),
      note: {
        _id: row.note._id,
        title: row.note.title,
        text: row.note.text,
        startupId: row.note.startupId,
      },
    }));
  }, [searching, hits, startups, list.results, now]);

  const [createOpen, setCreateOpen] = useState(false);
  const [actionNote, setActionNote] = useState<ActionNote | null>(null);
  const [sendNodes, setSendNodes] = useState<ThoughtConversionNode[] | null>(null);
  const [sendSource, setSendSource] = useState<Id<'startups'> | null>(null);

  const openNote = (id: Id<'thoughtNodes'>) => {
    haptics.tap();
    router.push({ pathname: '/misao/[id]', params: { id } });
  };

  const openMap = () => {
    if (mapStartupId === null) return;
    haptics.tap();
    router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'thoughts', id: mapStartupId } });
  };

  // Prazna strana uz „ima još" nije prazna lista (server izbacuje beleške napuštenih
  // startupa posle čitanja): čeka se sledeća strana, kao na webu.
  const loadingFirst =
    list.status === 'LoadingFirstPage' || (!searching && list.results.length === 0 && list.status !== 'Exhausted');
  const searchLoading = searching && hits === undefined;
  const hasMore = hasMoreNotes(list.status);
  const refreshControl = useListRefresh();
  const quickTarget = quickNoteTarget(filter, startups);

  const countSubtitle = loadingFirst
    ? undefined
    : searching
      ? hits === undefined
        ? undefined
        : notesCountLabel(items.length, items.length >= NOTE_SEARCH_LIMIT)
      : items.length > 0 || hasMore
        ? notesCountLabel(items.length, hasMore)
        : undefined;

  const empty = notesEmptyText(filter, {
    searching,
    startupName: selectedStartup?.name ?? null,
  });

  const emptyBody = loadingFirst || searchLoading ? (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje beleški">
      <SkeletonList count={6} item={(index) => <SkeletonRow index={index} subtitle />} />
    </View>
  ) : (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon={
          searching ? (
            <Search size={20} color={colors.mutedForeground} />
          ) : (
            <NotebookPen size={20} color={colors.mutedForeground} />
          )
        }
        title={empty.title}
        description={empty.description ?? undefined}
        actionLabel={searching ? 'Obriši pretragu' : 'Nova beleška'}
        onAction={() => {
          if (searching) {
            setSearchTerm('');
            return;
          }
          haptics.tap();
          setCreateOpen(true);
        }}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Beleške"
        subtitle={countSubtitle}
        onBack={() => router.back()}
        below={
          <View>
            <SearchField
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Pretraži beleške…"
              accessibilityLabel={`Pretraži beleške, najmanje ${NOTE_SEARCH_MIN} znaka`}
            />
            <NoteScopeChips value={filter} startups={startups} onChange={setChosen} />
          </View>
        }
        actions={
          mapStartupId !== null ? (
            <>
              <TidyNotesButton startupId={mapStartupId} notes={list.results} />
              <IconButton accessibilityLabel="Mapa beleški" onPress={openMap}>
                <LayoutGrid size={22} color={colors.foreground} />
              </IconButton>
            </>
          ) : undefined
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <NoteQuickInput
            target={quickTarget === null ? null : { name: quickTarget.name, logoUrl: quickTarget.logoUrl }}
            onSave={async (text) => {
              await createNote({
                startupId: quickTarget === null ? null : quickTarget._id,
                text,
                message: noteCreatedMessage(quickTarget?.name ?? null),
              });
            }}
          />
        }
        ListEmptyComponent={emptyBody}
        renderItem={({ item }) => (
          <NoteRow
            model={item.model}
            onOpen={() => openNote(item.note._id)}
            onLongPress={() => {
              haptics.select();
              setActionNote(item.note);
            }}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!searching && shouldLoadMoreOnEnd(list.status)) list.loadMore(NOTES_PAGE_SIZE);
        }}
        ListFooterComponent={
          !searching && list.status === 'LoadingMore' ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        // Donji padding čisti i FAB (do insets+72) i traku „Poništi" iznad njega
        // (do ~insets+144) — poslednji red ne sme ni pod jedno.
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 152 }]}
      />

      <FAB
        icon={Plus}
        accessibilityLabel="Nova beleška"
        onPress={() => {
          haptics.tap();
          setCreateOpen(true);
        }}
        style={{ bottom: insets.bottom + 16 }}
      />
      <NoteCreateSheet
        open={createOpen}
        startups={startups}
        defaultStartupId={filterStartupId(filter)}
        onClose={() => setCreateOpen(false)}
      />
      <NoteActionsSheet
        open={actionNote !== null}
        note={actionNote}
        canSend={startups.length > 0}
        onClose={() => setActionNote(null)}
        onOpen={(note) => {
          setActionNote(null);
          openNote(note._id);
        }}
        onSend={(note) => {
          setActionNote(null);
          setTimeout(() => {
            setSendSource(note.startupId);
            setSendNodes([{ _id: note._id, title: note.title, text: note.text }]);
          }, SHEET_HANDOFF_MS);
        }}
      />
      <ThoughtConversionSheet
        open={sendNodes !== null}
        targets={startups}
        sourceStartupId={sendSource}
        nodes={sendNodes ?? []}
        onClose={() => setSendNodes(null)}
      />
      {/* Iznad FAB-a (56 + razmak) da „Poništi" ne legne pod dugme. */}
      <UndoBar bottomOffset={72} />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <MisliError message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

function MisliError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Beleške" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Beleške nisu učitane."
        description={message || 'Proveri vezu i pokušaj ponovo.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  emptyWrap: { minHeight: 280 },
  skeleton: { paddingTop: 4 },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
