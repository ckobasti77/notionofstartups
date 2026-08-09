import { usePaginatedQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { PageCreateSheet } from '@/components/canvas/page-create-sheet';
import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { pageKindColor, pageKindMeta } from '@/lib/page-kinds';
import { useThemeColors } from '@/theme/theme-provider';
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

/**
 * „Podstranice" — kolapsibilna sekcija unutar ekrana stranice (M3.2, KORAK 3).
 * Otkad tap u Prostoru otvara samu stranicu (umesto da roni u podstranice), deca
 * stranice žive OVDE: lista + „Nova podstranica". Skupljena je podrazumevano da
 * editor dobije prostor; broj dece stoji u zaglavlju. Reaktivno (Convex) — nova
 * podstranica se pojavi sama posle `pages.create`.
 *
 * Namerno NE ide u `ScrollView` sa editorom (WebView editor sam skroluje); stoji kao
 * traka iznad sadržaja. `startupId`/`areaId` dolaze iz `pages.get` roditelja.
 */
export function SubpagesSection({
  pageId,
  startupId,
  areaId,
}: {
  pageId: Id<'pages'>;
  startupId: Id<'startups'>;
  areaId: Id<'startupAreas'>;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  // Razvijena lista se ograničava na deo ekrana i skroluje interno — inače bi
  // duga lista gurnula sadržaj (editor/tabela/fajl) van ekrana bez skrola (rn-review).
  const { height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    { startupId, areaId, parentPageId: pageId },
    { initialNumItems: 20 },
  );

  const loading = status === 'LoadingFirstPage';
  const hasMore = status === 'CanLoadMore' || status === 'LoadingMore';
  const countLabel = loading ? '' : hasMore ? `${results.length}+` : String(results.length);

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Podstranice${countLabel ? `, ${countLabel}` : ''}`}
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.muted }]}>
        {expanded ? (
          <ChevronDown size={18} color={colors.mutedForeground} />
        ) : (
          <ChevronRight size={18} color={colors.mutedForeground} />
        )}
        <Text style={[styles.title, { color: colors.foreground }]}>Podstranice</Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <View style={[styles.countPill, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>{countLabel}</Text>
          </View>
        )}
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <ScrollView
            style={{ maxHeight: Math.round(windowHeight * 0.42) }}
            nestedScrollEnabled
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled">
            {results.map((item) => {
              const Icon = pageKindMeta(item.kind).icon;
              const tint = pageKindColor(colors, item.kind);
              return (
                <Row
                  key={item._id}
                  title={item.title}
                  titleNumberOfLines={2}
                  accessibilityLabel={`Otvori ${item.title}`}
                  onPress={() =>
                    router.push(
                      item.kind === 'task'
                        ? { pathname: '/zadatak/[id]', params: { id: item._id } }
                        : { pathname: '/stranica/[id]', params: { id: item._id } },
                    )
                  }
                  style={styles.row}
                  icon={
                    <View style={[styles.iconChip, { backgroundColor: `${tint}22` }]}>
                      <Icon size={16} color={tint} />
                    </View>
                  }
                />
              );
            })}
          </ScrollView>

          {status === 'LoadingMore' ? (
            <View style={styles.more}>
              <ActivityIndicator
                size="small"
                color={colors.mutedForeground}
                accessibilityLabel="Učitavanje"
              />
            </View>
          ) : status === 'CanLoadMore' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Učitaj još podstranica"
              onPress={() => loadMore(20)}
              style={({ pressed }) => [styles.more, pressed && { backgroundColor: colors.muted }]}>
              <Text style={[styles.moreText, { color: colors.primary }]}>Učitaj još</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nova podstranica"
            onPress={() => setCreateOpen(true)}
            style={({ pressed }) => [
              styles.addBtn,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Plus size={16} color={colors.mutedForeground} />
            <Text style={[styles.addText, { color: colors.mutedForeground }]}>Nova podstranica</Text>
          </Pressable>
        </View>
      ) : null}

      <PageCreateSheet
        open={createOpen}
        startupId={startupId}
        areaId={areaId}
        parentPageId={pageId}
        onClose={() => setCreateOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 16,
  },
  title: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 2,
  },
  list: {
    gap: 2,
  },
  row: {
    paddingHorizontal: 2,
    borderRadius: radius.md,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  moreText: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: 4,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  addText: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
  },
});
