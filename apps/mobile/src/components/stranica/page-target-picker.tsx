import { usePaginatedQuery } from 'convex/react';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { haptics } from '@/lib/haptics';
import { pageKindColor, pageKindLabel, pageKindMeta, type PageKind } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Uvlačenje po nivou — isto kao stablo u tabu Prostor. */
const INDENT_STEP = 18;
/** Dublje od ovoga naslov na telefonu ostaje bez prostora (kao `prostor.tsx`). */
const MAX_PICKER_DEPTH = 8;
/** Koliko redova po nivou stiže odjednom. */
const PAGE_SIZE = 30;

/**
 * Izbor CILJNE stranice u stablu jedne oblasti — deljen između „Ugnjezdi pod…"
 * (C9) i drugog koraka „Premesti u oblast" (C10). Dve kopije stabla u istom
 * sheet-u bi se razišle, pa je izbor jedna komponenta.
 *
 * Oblik je „stablo koje se širi u mestu", ne roniranje: tap na red BIRA cilj, a
 * zasebna 44pt strelica levo razvija podstranice (isti raspored kao
 * `prostor.tsx` `PageRow`). Svaki nivo je sopstveni `usePaginatedQuery` koji se
 * montira TEK kad je red razvijen — zatvoreno stablo ne plaća nijedan upit.
 *
 * `excludePageId` (stranica koja se seli) se filtrira na SVAKOM nivou. To usput
 * sakriva i celu njegovu granu — potomci su dostupni samo kroz njegov red — pa
 * server nikad ne dobije „ugnjezdi pod sopstvenog potomka".
 */
export function PageTargetPicker({
  startupId,
  areaId,
  excludePageId,
  currentParentPageId,
  busyId,
  rootEmpty,
  onPick,
}: {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  /** Stranica koja se seli — njen red se ne prikazuje. */
  excludePageId: Id<'pages'>;
  /** Trenutni roditelj: red je vidljiv, ali onemogućen (izbor ne bi ništa promenio). */
  currentParentPageId: Id<'pages'> | null;
  /** Brava celog sheet-a; kad nije `null` nijedan cilj se ne može tapnuti. */
  busyId: string | null;
  /** Poruka kad je ceo koren prazan — dublji nivoi imaju svoju, kraću. */
  rootEmpty: string;
  onPick: (pageId: Id<'pages'>, title: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((pageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  return (
    <PickerLevel
      startupId={startupId}
      areaId={areaId}
      parentPageId={null}
      depth={0}
      excludePageId={excludePageId}
      currentParentPageId={currentParentPageId}
      busyId={busyId}
      rootEmpty={rootEmpty}
      expandedIds={expandedIds}
      onToggle={toggle}
      onPick={onPick}
    />
  );
}

type LevelProps = {
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
  parentPageId: Id<'pages'> | null;
  depth: number;
  excludePageId: Id<'pages'>;
  currentParentPageId: Id<'pages'> | null;
  busyId: string | null;
  rootEmpty: string;
  expandedIds: ReadonlySet<string>;
  onToggle: (pageId: string) => void;
  onPick: (pageId: Id<'pages'>, title: string) => void;
};

function PickerLevel({
  startupId,
  areaId,
  parentPageId,
  depth,
  excludePageId,
  currentParentPageId,
  busyId,
  rootEmpty,
  expandedIds,
  onToggle,
  onPick,
}: LevelProps) {
  const colors = useThemeColors();
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId, areaId, parentPageId },
    { initialNumItems: PAGE_SIZE },
  );
  const indent = { paddingLeft: 8 + depth * INDENT_STEP };

  if (status === 'LoadingFirstPage') {
    return (
      <View style={[styles.state, indent]}>
        <ActivityIndicator
          size="small"
          color={colors.mutedForeground}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel="Učitavanje stranica"
        />
      </View>
    );
  }

  const visible = results.filter((candidate) => candidate._id !== excludePageId);

  if (visible.length === 0) {
    return (
      <Text style={[styles.empty, indent, { color: colors.mutedForeground }]}>
        {depth === 0 ? rootEmpty : 'Nema stranica na ovom nivou.'}
      </Text>
    );
  }

  return (
    <View>
      {visible.map((candidate) => {
        const kind = candidate.kind as PageKind;
        const title = candidate.title || 'Bez naslova';
        const isCurrentParent = candidate._id === currentParentPageId;
        const expanded = expandedIds.has(candidate._id);
        const Icon = pageKindMeta(kind).icon;
        const tint = pageKindColor(colors, kind);
        // Strelica stoji do granice dubine bez pitanja „ima li dece" — isto radi
        // web piker; jedan upit manje po nivou.
        const canExpand = depth + 1 < MAX_PICKER_DEPTH;
        return (
          <View key={candidate._id}>
            <Row
              title={title}
              titleNumberOfLines={2}
              subtitle={isCurrentParent ? 'Trenutni roditelj' : pageKindLabel(kind)}
              onPress={isCurrentParent ? undefined : () => onPick(candidate._id, title)}
              disabled={isCurrentParent || busyId !== null}
              showChevron={busyId === null && !isCurrentParent}
              accessibilityLabel={
                isCurrentParent
                  ? `${title}, trenutni roditelj`
                  : `Izaberi ${title}, ${pageKindLabel(kind)}`
              }
              style={[styles.row, indent]}
              leading={
                canExpand ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={
                      expanded ? `Sakrij podstranice: ${title}` : `Prikaži podstranice: ${title}`
                    }
                    onPress={() => {
                      haptics.select();
                      onToggle(candidate._id);
                    }}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.twisty,
                      pressed && { backgroundColor: colors.muted },
                    ]}>
                    {expanded ? (
                      <ChevronDown size={18} color={colors.mutedForeground} />
                    ) : (
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    )}
                  </Pressable>
                ) : (
                  <View style={styles.twisty} />
                )
              }
              icon={
                <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
                  <Icon size={16} color={tint} />
                </View>
              }
              value={
                busyId === candidate._id ? <ActivityIndicator color={colors.primary} /> : undefined
              }
            />
            {expanded ? (
              <PickerLevel
                startupId={startupId}
                areaId={areaId}
                parentPageId={candidate._id}
                depth={depth + 1}
                excludePageId={excludePageId}
                currentParentPageId={currentParentPageId}
                busyId={busyId}
                rootEmpty={rootEmpty}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onPick={onPick}
              />
            ) : null}
          </View>
        );
      })}
      {status === 'LoadingMore' ? (
        <View style={[styles.state, indent]}>
          <ActivityIndicator
            size="small"
            color={colors.mutedForeground}
            accessibilityLabel="Učitavanje"
          />
        </View>
      ) : status === 'CanLoadMore' ? (
        <Row
          title="Učitaj još"
          onPress={() => loadMore(PAGE_SIZE)}
          disabled={busyId !== null}
          showChevron={false}
          style={[styles.row, indent]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingRight: 8,
    borderRadius: radius.md,
    minHeight: 52,
  },
  twisty: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: {
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  empty: {
    ...text.body,
    paddingVertical: 12,
  },
});
