import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { History, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlockBoundary } from '@/components/collab/block-boundary';
import {
  CommentsEntryRow,
  CommentsSheet,
  useCommentsSummary,
} from '@/components/collab/comments-sheet';
import { RevisionHistorySheet } from '@/components/collab/revision-history-sheet';
import { useLiveNow } from '@/components/collab/use-live-now';
import {
  AreaDescriptionSheet,
  type AreaDescriptionSnapshot,
} from '@/components/oblast/area-description-sheet';
import { descriptionMeta, recentMeta } from '@/components/oblast/area-model';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { haptics } from '@/lib/haptics';
import { pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Koliko nedavnih izmena Pregled pokazuje (isto kao web K13). */
const RECENT_LIMIT = 8;

/**
 * Kartica Pregled ekrana oblasti (plan K07 §5.5, K14): Opis oblasti (dokument tima,
 * sa izmenom i Istorijom izmena), Komentari oblasti i Nedavne izmene. Svaki blok ima
 * sopstvenu granicu greške — blok koji padne ne obara susedne. Opis i komentari su
 * isti `areasV2.getAreaBody` / `comments.*` / `history.*` kao na webu (K13).
 */
export function AreaOverview({
  startupId,
  areaId,
  areaLabel,
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  areaLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const refreshControl = useListRefresh();
  const now = useLiveNow();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 160 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}>
      <BlockBoundary title="Opis oblasti nije učitan.">
        <DescriptionBlock startupId={startupId} areaId={areaId} now={now} />
      </BlockBoundary>
      <View style={styles.section}>
        <BlockBoundary title="Komentari nisu učitani.">
          <CommentsBlock startupId={startupId} areaId={areaId} areaLabel={areaLabel} />
        </BlockBoundary>
      </View>
      <View style={styles.section}>
        <BlockBoundary title="Nedavne izmene nisu učitane.">
          <RecentBlock startupId={startupId} areaId={areaId} now={now} />
        </BlockBoundary>
      </View>
    </ScrollView>
  );
}

/* ── Opis oblasti + Istorija izmena ────────────────────────────────────── */

/**
 * Opis oblasti kao prikaz (bez upita, ide i u Dizajn katalog): naslov sekcije sa
 * „Izmeni", tekst ili prazno stanje, meta „Marko · pre 2 dana" i red „Istorija izmena".
 */
export function AreaDescriptionView({
  content,
  meta,
  canEdit,
  onEdit,
  onOpenHistory,
}: {
  content: string;
  meta: string | null;
  canEdit: boolean;
  onEdit: () => void;
  onOpenHistory: () => void;
}) {
  const colors = useThemeColors();
  const hasContent = content.trim() !== '';
  return (
    <View>
      <SectionHeader
        title="Opis oblasti"
        action={
          canEdit && hasContent ? (
            <Button
              label="Izmeni"
              accessibilityLabel="Izmeni opis oblasti"
              variant="ghost"
              size="sm"
              onPress={onEdit}
            />
          ) : undefined
        }
      />
      {hasContent ? (
        <>
          <Text selectable style={[styles.body, { color: colors.foreground }]}>
            {content}
          </Text>
          {meta === null ? null : (
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>{meta}</Text>
          )}
        </>
      ) : (
        <View style={styles.emptyBlock}>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Oblast još nema opis.</Text>
          {canEdit ? (
            <Button
              label="Napiši opis"
              variant="secondary"
              size="sm"
              onPress={onEdit}
              style={styles.emptyAction}
            />
          ) : null}
        </View>
      )}
      <Row
        icon={<History size={20} color={colors.mutedForeground} />}
        title="Istorija izmena"
        onPress={onOpenHistory}
        style={styles.row}
      />
    </View>
  );
}

function DescriptionBlock({
  startupId,
  areaId,
  now,
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  now: number;
}) {
  const body = useQuery(api.areasV2.getAreaBody, { startupId, areaId });
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (body === undefined) {
    return (
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel="Učitavanje opisa oblasti">
        <SectionHeader title="Opis oblasti" />
        <View style={styles.descriptionSkeleton}>
          <Skeleton width="92%" height={16} />
          <Skeleton width="78%" height={16} />
          <Skeleton width="40%" height={13} />
        </View>
      </View>
    );
  }

  const snapshot: AreaDescriptionSnapshot = {
    content: body.content,
    revision: body.revision,
    updatedAt: body.updatedAt,
    lastEditorName: body.lastEditor?.displayName ?? null,
  };
  const meta = descriptionMeta({
    hasContent: body.content.trim() !== '',
    lastEditorName: snapshot.lastEditorName,
    updatedAt: body.updatedAt,
    now,
  });

  return (
    <View>
      <AreaDescriptionView
        content={body.content}
        meta={meta}
        canEdit={body.permissions.canEdit}
        onEdit={() => {
          haptics.tap();
          setEditing(true);
        }}
        onOpenHistory={() => {
          haptics.tap();
          setHistoryOpen(true);
        }}
      />

      <AreaDescriptionSheet
        visible={editing}
        onClose={() => setEditing(false)}
        startupId={startupId}
        areaId={areaId}
        body={snapshot}
      />
      <RevisionHistorySheet
        target={{ kind: 'area', id: areaId }}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        format="text"
        subject="area"
        currentRevision={body.revision}
        lockedReason={body.permissions.canEdit ? null : 'Opis oblasti ne možeš da menjaš.'}
        updaterName={snapshot.lastEditorName}
        updatedAt={body.updatedAt}
      />
    </View>
  );
}

/* ── Komentari oblasti ─────────────────────────────────────────────────── */

function CommentsBlock({
  startupId,
  areaId,
  areaLabel,
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  areaLabel: string;
}) {
  const target = { kind: 'area', id: areaId } as const;
  const summary = useCommentsSummary(target);
  const [open, setOpen] = useState(false);
  return (
    <View>
      <CommentsEntryRow
        summary={summary}
        onPress={() => {
          haptics.tap();
          setOpen(true);
        }}
      />
      <CommentsSheet
        target={target}
        startupId={startupId}
        visible={open}
        onClose={() => setOpen(false)}
        title={`Komentari · ${areaLabel}`}
      />
    </View>
  );
}

/* ── Nedavne izmene ────────────────────────────────────────────────────── */

function RecentBlock({
  startupId,
  areaId,
  now,
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  now: number;
}) {
  const router = useRouter();
  // Pad upita hvata BlockBoundary oko bloka (Nedavne izmene nisu učitane + ponovo).
  const recent = useQuery(api.pages.recentForArea, { startupId, areaId, limit: RECENT_LIMIT });

  const open = (page: { _id: Id<'pages'>; kind: PageKind }) => {
    haptics.tap();
    if (page.kind === 'task') {
      router.push({ pathname: '/zadatak/[id]', params: { id: page._id } });
    } else {
      router.push({ pathname: '/stranica/[id]', params: { id: page._id } });
    }
  };

  return <AreaRecentList items={recent} now={now} onOpen={open} />;
}

/** Jedna nedavna izmena u oblasti (oblik `pages.recentForArea`, samo ono što red koristi). */
export type AreaRecentItem = {
  _id: Id<'pages'>;
  kind: PageKind;
  title: string;
  updatedAt: number;
  lockedAt?: number | null;
  updatedBy: { displayName: string } | null;
};

/**
 * „Nedavne izmene" kao prikaz (bez upita, ide i u Dizajn katalog): `undefined` je
 * učitavanje, prazna lista je „Ovde još niko nije menjao.".
 */
export function AreaRecentList({
  items,
  now,
  onOpen,
}: {
  items: ReadonlyArray<AreaRecentItem> | undefined;
  now: number;
  onOpen: (page: AreaRecentItem) => void;
}) {
  const colors = useThemeColors();
  return (
    <View>
      <SectionHeader title="Nedavne izmene" />
      {items === undefined ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje nedavnih izmena">
          <SkeletonList
            count={3}
            gap={0}
            item={(index) => <SkeletonRow index={index} leading="icon" subtitle />}
          />
        </View>
      ) : items.length === 0 ? (
        <Text style={[styles.body, styles.emptyText, { color: colors.mutedForeground }]}>
          Ovde još niko nije menjao.
        </Text>
      ) : (
        items.map((page) => {
          const Icon = pageKindMeta(page.kind).icon;
          const meta = recentMeta(page.updatedBy?.displayName ?? null, page.updatedAt, now);
          const locked = page.lockedAt != null;
          const title = page.title.trim() === '' ? 'Bez naslova' : page.title;
          return (
            <Row
              key={page._id}
              icon={<Icon size={20} color={colors.mutedForeground} />}
              title={title}
              subtitle={meta}
              value={locked ? <Lock size={16} color={colors.mutedForeground} /> : undefined}
              showChevron={false}
              accessibilityLabel={`Otvori ${title}, ${meta}${locked ? ', zaključano' : ''}`}
              onPress={() => onOpen(page)}
              style={styles.row}
            />
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // Između sekcija ekrana 24 (DIZAJN-SMIRENJE §3).
  section: {
    marginTop: 24,
  },
  body: {
    ...text.body,
  },
  meta: {
    ...text.meta,
    marginTop: 8,
  },
  emptyBlock: {
    gap: 8,
    alignItems: 'flex-start',
  },
  emptyAction: {
    alignSelf: 'flex-start',
  },
  emptyText: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 12,
  },
  descriptionSkeleton: {
    gap: 8,
    paddingVertical: 4,
  },
  // Lista ekrana već ima razmak 16 — red ga ne dodaje drugi put (kao Dokumenti).
  row: {
    paddingHorizontal: 4,
    borderRadius: radius.md,
  },
});
