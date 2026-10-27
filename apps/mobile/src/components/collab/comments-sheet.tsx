import type { FunctionArgs } from 'convex/server';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { MessageSquare } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { BlockBoundary } from '@/components/collab/block-boundary';
import { CommentComposer, type MentionMember } from '@/components/collab/comment-composer';
import { CommentRow, type CommentItem } from '@/components/collab/comment-row';
import {
  commentExcerpt,
  commentToDraft,
  commentsEntryTitle,
} from '@/components/collab/collab-model';
import { FIRST_FILL_WINDOW_MS } from '@/components/motion/layout';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pushUndo } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text } from '@/theme/tokens';

/** Cilj komentara: stranica, zadatak (stranica), korak, opis oblasti ili ideja. */
export type CommentTarget = FunctionArgs<typeof api.comments.list>['target'];

/** Strana po kojoj se učitava; lista je rastuća (najnoviji na dnu). */
const PAGE_SIZE = 50;
/** Do ovoliko komentara telefon sam učitava do kraja, da najnoviji budu u vidnom polju. */
const AUTOLOAD_MAX = 200;

// --- Sažetak za red i ikonicu -------------------------------------------------

export type CommentsSummary = {
  /** `null` dok se prva strana učitava. */
  count: number | null;
  /** Ima ih više od prve strane (20): prikaz „20+". */
  capped: boolean;
  /** Poslednji komentar, samo kad je cela lista u prvoj strani. */
  last: { author: string; excerpt: string } | null;
};

/**
 * Broj i poslednji komentar za red „Komentari · N" i ikonicu u zaglavlju. Jedan
 * mali upit (prva strana liste, 20) — `comments.list` je rastuć i nema „najnovije",
 * pa se poslednji komentar zna samo kad lista staje u jednu stranu.
 */
export function useCommentsSummary(target: CommentTarget): CommentsSummary {
  const page = useQueryTolerant(api.comments.list, {
    target,
    paginationOpts: { numItems: 20, cursor: null },
  });
  return useMemo(() => {
    if (page === undefined) return { count: null, capped: false, last: null };
    const capped = !page.isDone;
    const lastItem = page.isDone ? page.page[page.page.length - 1] : undefined;
    return {
      count: page.page.length,
      capped,
      last: lastItem
        ? {
            author: lastItem.author?.displayName ?? 'Raniji tekst tima',
            excerpt: commentExcerpt(lastItem.content),
          }
        : null,
    };
  }, [page]);
}

/** Red „Komentari · N" sa poslednjim komentarom; otvara `CommentsSheet` (E3). */
export function CommentsEntryRow({
  summary,
  onPress,
}: {
  summary: CommentsSummary;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const title = commentsEntryTitle(summary.count, summary.capped);
  return (
    <Row
      title={title}
      subtitle={
        summary.last === null
          ? undefined
          : `${summary.last.author}: ${summary.last.excerpt}`
      }
      onPress={onPress}
      accessibilityLabel={
        summary.last === null
          ? title
          : `${title}. Poslednji: ${summary.last.author}: ${summary.last.excerpt}`
      }
      icon={<MessageSquare size={20} color={colors.mutedForeground} />}
    />
  );
}

// --- Sheet --------------------------------------------------------------------

/**
 * Komentari jedne stavke u sheet-u (E3): lista (najnoviji dole), polje za unos
 * na dnu iznad tastature, izmena u mestu i uklanjanje sa „Poništi". Isti
 * `comments.*` kao web `CommentsSection`; prikaz isključivo kroz shared
 * `parseCommentSegments`. Telo se montira tek kad je sheet otvoren, pa zatvoren
 * ne drži pretplatu.
 */
export function CommentsSheet({
  target,
  startupId,
  visible,
  onClose,
  title = 'Komentari',
}: {
  target: CommentTarget;
  startupId: Id<'startups'>;
  visible: boolean;
  onClose: () => void;
  /** Šta se komentariše (npr. naslov koraka) — ide u zaglavlje sheet-a. */
  title?: string;
}) {
  const colors = useThemeColors();
  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={[styles.heading, { color: colors.foreground }]}>
        {title}
      </Text>
      <BlockBoundary title="Komentari nisu učitani.">
        <CommentsBody target={target} startupId={startupId} onClose={onClose} />
      </BlockBoundary>
    </Sheet>
  );
}

function CommentsBody({
  target,
  startupId,
  onClose,
}: {
  target: CommentTarget;
  startupId: Id<'startups'>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const { results, status, loadMore } = usePaginatedQuery(
    api.comments.list,
    { target },
    { initialNumItems: PAGE_SIZE },
  );
  const membersResult = useQueryTolerant(api.startups.listMembers, { startupId, limit: 50 });
  const profile = useQuery(api.profiles.getCurrent, {});
  const add = useMutation(api.comments.add);
  const update = useMutation(api.comments.update);
  const remove = useMutation(api.comments.remove);

  const members = useMemo<MentionMember[]>(
    () =>
      (membersResult ?? []).map((member) => ({
        profileId: member.profile._id,
        displayName: member.profile.displayName,
        avatarUrl: member.profile.avatarUrl,
      })),
    [membersResult],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CommentItem | null>(null);
  const listRef = useRef<FlatList<CommentItem>>(null);
  // Ostani na dnu dok se lista puni i posle svog komentara; korisnikov skrol to gasi.
  const stickRef = useRef(true);
  const openedAtRef = useRef(Date.now());
  const now = useMemo(() => Date.now(), [results]);

  // Lista je rastuća: dok ima strana, učitaj do kraja (do granice) da najnoviji budu vidljivi.
  useEffect(() => {
    if (status === 'CanLoadMore' && results.length < AUTOLOAD_MAX) loadMore(PAGE_SIZE);
  }, [status, results.length, loadMore]);

  const loadingFirst = status === 'LoadingFirstPage';
  const items = results as CommentItem[];

  const submitNew = async (payload: { content: string; mentionProfileIds: string[] }) => {
    setBusy(true);
    setError(null);
    // Posle slanja ostani na dnu: novi komentar mora da bude u vidnom polju.
    stickRef.current = true;
    try {
      await add({
        target,
        content: payload.content,
        mentionProfileIds: payload.mentionProfileIds as Id<'profiles'>[],
      });
      haptics.success();
      return true;
    } catch (cause) {
      haptics.error();
      setError(accessErrorMessage(cause, 'Komentar nije poslat. Pokušaj ponovo.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (payload: { content: string; mentionProfileIds: string[] }) => {
    if (editing === null) return false;
    setBusy(true);
    setError(null);
    try {
      await update({
        commentId: editing._id as Id<'contentContributions'>,
        content: payload.content,
        mentionProfileIds: payload.mentionProfileIds as Id<'profiles'>[],
      });
      haptics.success();
      setEditing(null);
      return true;
    } catch (cause) {
      haptics.error();
      setError(accessErrorMessage(cause, 'Komentar nije sačuvan. Pokušaj ponovo.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (comment: CommentItem) => {
    try {
      const result = await remove({ commentId: comment._id as Id<'contentContributions'> });
      haptics.success();
      pushUndo({
        label: 'Komentar je uklonjen.',
        action: { kind: 'comment', commentId: comment._id as Id<'contentContributions'> },
        undoUntil: result.undoUntil,
      });
      // Traka „Poništi" je na ekranu ISPOD modala — sheet se zatvara da bi bila dodirljiva.
      onClose();
    } catch (cause) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(cause, 'Komentar nije uklonjen.'));
    }
  };

  const openMenu = (comment: CommentItem) => {
    haptics.tap();
    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [];
    if (comment.permissions.canEdit) {
      buttons.push({
        text: 'Izmeni',
        onPress: () => {
          setError(null);
          setEditing(comment);
        },
      });
    }
    if (comment.permissions.canRemove) {
      buttons.push({
        text: 'Ukloni',
        style: 'destructive',
        onPress: () => void removeComment(comment),
      });
    }
    buttons.push({ text: 'Otkaži', style: 'cancel' });
    Alert.alert('Komentar', undefined, buttons);
  };

  const animateNew = Date.now() - openedAtRef.current > FIRST_FILL_WINDOW_MS;

  return (
    <View style={styles.body}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item._id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onScrollBeginDrag={() => {
          stickRef.current = false;
        }}
        // Vidno polje se skuplja kad tastatura izađe (veličina sadržaja se ne menja), pa i raspored vraća na dno.
        onLayout={() => {
          if (stickRef.current) listRef.current?.scrollToEnd({ animated: false });
        }}
        onContentSizeChange={() => {
          if (stickRef.current) listRef.current?.scrollToEnd({ animated: false });
        }}
        renderItem={({ item }) => (
          <CommentRow comment={item} now={now} animate={animateNew} onMenu={openMenu} />
        )}
        ListEmptyComponent={
          loadingFirst ? (
            <SkeletonList
              count={3}
              item={(index) => <SkeletonRow index={index} leading="circle" subtitle />}
            />
          ) : (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              Još nema komentara.
            </Text>
          )
        }
        ListFooterComponent={
          status === 'CanLoadMore' ? (
            <Row title="Učitaj još" onPress={() => loadMore(PAGE_SIZE)} showChevron={false} />
          ) : null
        }
      />

      {/* Nacrt novog komentara ostaje montiran (samo sakriven) dok se menja tuđi/svoj. */}
      <View style={editing === null ? styles.composer : styles.hidden}>
        <CommentComposer
          members={members}
          selfProfileId={profile?._id ?? null}
          busy={busy}
          error={editing === null ? error : null}
          onChangeText={() => error !== null && setError(null)}
          onSubmit={submitNew}
        />
      </View>
      {editing === null ? null : (
        <View style={styles.composer}>
          <CommentComposer
            // Nova izmena = novo polje: nacrt iz prošle izmene ne sme da procuri.
            key={editing._id}
            members={members}
            selfProfileId={profile?._id ?? null}
            initialDraft={commentToDraft(editing.content)}
            submitLabel="Sačuvaj"
            busy={busy}
            error={error}
            onChangeText={() => error !== null && setError(null)}
            onSubmit={submitEdit}
            onCancel={() => {
              setError(null);
              setEditing(null);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
  },
  heading: {
    ...text.title,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
  },
  // Telo se skuplja uz tastaturu; polje za unos (composer) nikad.
  body: {
    flexShrink: 1,
  },
  composer: {
    flexShrink: 0,
  },
  hidden: {
    display: 'none',
  },
  list: {
    flexGrow: 0,
    maxHeight: 360,
  },
  listContent: {
    paddingBottom: 4,
  },
  empty: {
    ...text.body,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 12,
  },
});
