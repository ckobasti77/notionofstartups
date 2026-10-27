import { revisionMeta } from '@devotion/shared';
import type { FunctionArgs } from 'convex/server';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { BlockBoundary } from '@/components/collab/block-boundary';
import {
  conflictFromError,
  restoreConfirmTitle,
  restoreOutcomeMessage,
  revisionListEntries,
  type ConflictSubject,
} from '@/components/collab/collab-model';
import { showConflictAlert } from '@/components/collab/conflict-alert';
import { NoteReader } from '@/components/stranica/note-reader';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { Row } from '@/components/ui/row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { showUndoNotice } from '@/lib/undo';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, text } from '@/theme/tokens';

export type HistoryTarget = FunctionArgs<typeof api.history.list>['target'];

const PAGE_SIZE = 20;

/**
 * Istorija izmena (P2, K07 §6.2) u JEDNOM sheet-u sa unutrašnjim stanjem lista ↔
 * pregled — nikad dva sestrinska Modal-a (iOS ih ne drži). Lista je `history.list`
 * (20 po strani, najnovije prve) grupisana po danu; pregled je `history.get`
 * (beleška kroz `NoteReader`, ostalo kao tekst). „Vrati ovu verziju" traži
 * potvrdu i šalje `expectedRevision`; konflikt ide kroz `Alert` „Učitaj najnoviju"
 * / „Prepiši". Vraćanje uvek pravi NOVU reviziju — ništa se ne briše.
 */
export function RevisionHistorySheet({
  target,
  visible,
  onClose,
  title = 'Istorija izmena',
  format,
  subject,
  currentRevision,
  lockedReason,
  updaterName = null,
  updatedAt = null,
}: {
  target: HistoryTarget;
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Beleška je HTML (`NoteReader`); instrukcije, opis oblasti i ideja su običan tekst. */
  format: 'html' | 'text';
  subject: ConflictSubject;
  /** Trenutna revizija cilja za `expectedRevision`; ideja je nema. */
  currentRevision: number | undefined;
  /** Razlog zbog kog vraćanje nije dozvoljeno (npr. zaključano); `null` = sme. */
  lockedReason?: string | null;
  /** Ko je poslednji menjao i kad — za tekst konflikta. */
  updaterName?: string | null;
  updatedAt?: number | null;
}) {
  const colors = useThemeColors();
  const [selectedId, setSelectedId] = useState<Id<'contentRevisions'> | null>(null);

  // Pregled se vraća na listu tek kad izlazna animacija sheet-a prođe (inače lista trepne).
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setSelectedId(null), 400);
    return () => clearTimeout(timer);
  }, [visible]);

  const close = () => {
    onClose();
  };

  return (
    // Nazad (Android), escape i prevlačenje iz pregleda vraćaju na listu, ne zatvaraju sve.
    <Sheet
      visible={visible}
      onClose={selectedId === null ? close : () => setSelectedId(null)}
      style={styles.sheet}>
      {selectedId === null ? (
        <>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
            {title}
          </Text>
          <BlockBoundary title="Verzije nisu učitane.">
            <HistoryList target={target} onOpen={setSelectedId} />
          </BlockBoundary>
        </>
      ) : (
        <BlockBoundary title="Verzija nije učitana.">
          <RevisionPreview
            key={selectedId}
            revisionId={selectedId}
            format={format}
            subject={subject}
            currentRevision={currentRevision}
            lockedReason={lockedReason ?? null}
            updaterName={updaterName}
            updatedAt={updatedAt}
            onBack={() => setSelectedId(null)}
            onDone={close}
          />
        </BlockBoundary>
      )}
    </Sheet>
  );
}

function HistoryList({
  target,
  onOpen,
}: {
  target: HistoryTarget;
  onOpen: (id: Id<'contentRevisions'>) => void;
}) {
  const colors = useThemeColors();
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.list,
    { target },
    { initialNumItems: PAGE_SIZE },
  );
  const now = useMemo(() => Date.now(), [results]);
  const entries = useMemo(() => revisionListEntries(results, now), [results, now]);

  if (status === 'LoadingFirstPage') {
    return (
      <SkeletonList
        count={4}
        item={(index) => <SkeletonRow index={index} leading="icon" subtitle />}
      />
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.key}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      nestedScrollEnabled
      ListEmptyComponent={
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>Još nema izmena.</Text>
      }
      ListFooterComponent={
        status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <Row
            title="Učitaj još"
            onPress={() => loadMore(PAGE_SIZE)}
            disabled={status === 'LoadingMore'}
            showChevron={false}
          />
        ) : null
      }
      renderItem={({ item: entry }) => {
        if (entry.kind === 'day') {
          return (
            <Text
              accessibilityRole="header"
              style={[styles.day, { color: colors.mutedForeground }]}>
              {entry.label}
            </Text>
          );
        }
        const revision = entry.revision;
        const meta = revisionMeta(
          {
            kind: revision.kind,
            authorName: revision.author?.displayName ?? null,
            updatedAt: revision.updatedAt,
          },
          now,
        );
        return (
          <Row
            title={meta.title}
            subtitle={
              revision.excerpt === '' ? undefined : (
                <Text numberOfLines={2} style={[styles.excerpt, { color: colors.mutedForeground }]}>
                  {revision.excerpt}
                </Text>
              )
            }
            value={meta.badge === null ? undefined : <Pill label={meta.badge} />}
            accessibilityLabel={`${meta.title}${meta.badge ? `, ${meta.badge}` : ''}. ${revision.excerpt}`}
            onPress={() => {
              haptics.select();
              onOpen(revision._id);
            }}
          />
        );
      }}
    />
  );
}

function RevisionPreview({
  revisionId,
  format,
  subject,
  currentRevision,
  lockedReason,
  updaterName,
  updatedAt,
  onBack,
  onDone,
}: {
  revisionId: Id<'contentRevisions'>;
  format: 'html' | 'text';
  subject: ConflictSubject;
  currentRevision: number | undefined;
  lockedReason: string | null;
  updaterName: string | null;
  updatedAt: number | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const revision = useQuery(api.history.get, { revisionId });
  const restore = useMutation(api.history.restore);
  const [busy, setBusy] = useState(false);

  if (revision === undefined) {
    return (
      <View style={styles.previewBody}>
        <Row
          title="Sve verzije"
          onPress={onBack}
          showChevron={false}
          icon={<ChevronLeft size={22} color={colors.foreground} />}
        />
        <SkeletonList count={3} item={(index) => <SkeletonRow index={index} />} />
      </View>
    );
  }

  const meta = revisionMeta(
    {
      kind: revision.kind,
      authorName: revision.author?.displayName ?? null,
      updatedAt: revision.updatedAt,
    },
    Date.now(),
  );
  const canRestore = revision.canRestore && lockedReason === null;

  const run = async (expectedRevision: number | undefined) => {
    setBusy(true);
    try {
      const result = await restore({
        revisionId,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      });
      haptics.success();
      // Traka je na ekranu ISPOD modala — sheet se zatvara pa se poruka vidi.
      showUndoNotice({
        label: restoreOutcomeMessage(result.changed, revision.updatedAt, Date.now()),
      });
      onDone();
    } catch (cause) {
      const conflict = conflictFromError(cause);
      if (conflict === null) {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(cause, 'Verzija nije vraćena.'));
        return;
      }
      showConflictAlert({
        subject,
        updaterName,
        updatedAt: conflict.updatedAt ?? updatedAt,
        onLoadLatest: onDone,
        onOverwrite: () => void run(conflict.currentRevision ?? currentRevision),
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = () => {
    if (busy || !canRestore) return;
    haptics.warning();
    Alert.alert(
      restoreConfirmTitle(revision.updatedAt, Date.now()),
      'Trenutni tekst ostaje u Istoriji izmena.',
      [
        { text: 'Otkaži', style: 'cancel' },
        { text: 'Vrati verziju', onPress: () => void run(currentRevision) },
      ],
    );
  };

  return (
    <View style={styles.previewBody}>
      <Row
        title="Sve verzije"
        onPress={onBack}
        disabled={busy}
        showChevron={false}
        accessibilityLabel="Nazad na sve verzije"
        icon={<ChevronLeft size={22} color={colors.foreground} />}
      />
      <Text style={[styles.previewMeta, { color: colors.mutedForeground }]}>
        {meta.badge === null ? meta.title : `${meta.title} · ${meta.badge}`}
      </Text>
      {revision.title === null || revision.title === '' ? null : (
        <Text accessibilityRole="header" style={[styles.previewTitle, { color: colors.foreground }]}>
          {revision.title}
        </Text>
      )}
      <View style={{ height: Math.round(windowHeight * 0.32) }}>
        {format === 'html' ? (
          <NoteReader html={revision.content} emptyDescription="Ova verzija nema sadržaj." />
        ) : (
          <ScrollView nestedScrollEnabled>
            <Text style={[styles.plain, { color: colors.foreground }]}>
              {(revision.instructions ?? revision.content) || 'Ova verzija nema sadržaj.'}
            </Text>
          </ScrollView>
        )}
      </View>
      {lockedReason === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.locked, { color: colors.mutedForeground }]}>
          {lockedReason}
        </Text>
      )}
      <Button
        label="Vrati ovu verziju"
        onPress={confirmRestore}
        loading={busy}
        disabled={!canRestore}
        fullWidth
      />
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
  list: {
    flexGrow: 0,
    maxHeight: 460,
  },
  listContent: {
    paddingBottom: 8,
  },
  day: {
    ...text.meta,
    paddingTop: 12,
    paddingBottom: 2,
  },
  excerpt: {
    ...text.body,
  },
  empty: {
    ...text.body,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 12,
  },
  previewBody: {
    gap: 8,
  },
  previewMeta: {
    ...text.meta,
  },
  previewTitle: {
    ...text.title,
    fontWeight: fontWeight.semibold,
  },
  plain: {
    ...text.body,
  },
  locked: {
    ...text.body,
  },
});
