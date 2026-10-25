import {
  formatDayHeading,
  SPRING,
  springDurationMs,
  type MyDaySectionId,
  type TaskStatusKey,
} from '@devotion/shared';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { CalendarCheck2, Sun } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { EmptyState } from '@/components/empty-state';
import { listLayout, exitFade, NumberRoll, ProgressRing, useListEntering } from '@/components/motion';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonTaskCard } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useToday } from '@/hooks/use-today';
import { haptics } from '@/lib/haptics';
import { openStartupEntity } from '@/lib/navigation/open-startup-entity';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, space, text } from '@/theme/tokens';

import { MeHeader } from '../me-header';
import { TaskRow } from '../task-row';
import {
  applyCompletionOverrides,
  buildMyDay,
  daySummary,
  firstNameOf,
  progressValueText,
  reopenStatus,
  type CompletionHold,
  type MyDayModel,
  type MyDayRowData,
} from './my-day-model';

/** Red ostaje na svom mestu dok se spring kvačice ne smiri (plan K07 E7, ≈ 741 ms). */
const HOLD_MS = springDurationMs(SPRING.bouncy);

/** Iznad ovoliko redova layout animacija se gasi (plan K07 E12). */
const LAYOUT_ANIMATION_MAX_ROWS = 60;

const INITIAL_COLLAPSED: Record<MyDaySectionId, boolean> = {
  overdue: false,
  today: false,
  planned: false,
  inProgress: false,
  soon: false,
  blocked: true,
  doneToday: true,
};

/**
 * Tab „Danas" = Moj dan (v1, K09; O1): šta danas radim u SVIM startupima i
 * lično — jedna pretplata (`myDay.overview`), grupisanje iz shared paketa
 * (isto kao web), redovi sa kvačicom. Pune radnje (swipe, rok, plan, brzi
 * unos) dodaje K12. Startup zadatak se otvara u svom startupu
 * (`openStartupEntity`); lični nema ekran do panela (K13).
 */
export function MyDayScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const today = useToday();
  const profile = useQuery(api.profiles.getCurrent, {});
  const overview = useQuery(api.myDay.overview, {
    dayKey: today.dayKey,
    doneSince: today.doneSince,
  });
  const setPersonalStatus = useMutation(api.personalTasks.setStatus);
  const updateMetadata = useMutation(api.tasks.updateMetadata);

  const [holds, setHolds] = useState<ReadonlyMap<string, CompletionHold>>(() => new Map());
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [collapsed, setCollapsed] = useState(INITIAL_COLLAPSED);
  const previousStatus = useRef(new Map<string, TaskStatusKey>());
  const versions = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  const base = useMemo(
    () => (overview ? buildMyDay(overview, today.now) : null),
    [overview, today.now],
  );
  const model = useMemo(
    () => (base ? applyCompletionOverrides(base, holds, pending) : null),
    [base, holds, pending],
  );

  const release = useCallback((key: string) => {
    timers.current.delete(key);
    setHolds((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  const toggle = (row: MyDayRowData, done: boolean) => {
    if (!row.canComplete || model === null) return;
    const section = model.sections.find((entry) => entry.rows.some((r) => r.key === row.key));
    const index = section?.rows.findIndex((r) => r.key === row.key) ?? 0;
    if (section) {
      setHolds((current) =>
        new Map(current).set(row.key, { section: section.id, index, row, done }),
      );
      const previousTimer = timers.current.get(row.key);
      if (previousTimer !== undefined) clearTimeout(previousTimer);
      timers.current.set(row.key, setTimeout(() => release(row.key), HOLD_MS));
    }
    if (row.kind === 'task' && done && !row.done) previousStatus.current.set(row.key, row.status);

    const version = (versions.current.get(row.key) ?? 0) + 1;
    versions.current.set(row.key, version);
    setPending((current) => new Map(current).set(row.key, done));

    // Mutacija kreće ODMAH (E7) — animacija ništa ne čeka.
    const call =
      row.kind === 'personal'
        ? setPersonalStatus({
            personalTaskId: row.id as Id<'personalTasks'>,
            status: done ? 'done' : 'open',
          })
        : updateMetadata({
            pageId: row.id as Id<'pages'>,
            status: done ? 'done' : reopenStatus(previousStatus.current.get(row.key)),
          });

    void call
      .then(() => {
        AccessibilityInfo.announceForAccessibility(
          done ? `Završeno: ${row.title}` : `Vraćeno u otvoreno: ${row.title}`,
        );
      })
      .catch((error: unknown) => {
        if (versions.current.get(row.key) !== version) return;
        haptics.error();
        release(row.key);
        Alert.alert(
          done ? 'Zadatak nije završen' : 'Zadatak nije vraćen',
          error instanceof Error && error.message ? error.message : 'Pokušaj ponovo.',
        );
      })
      .finally(() => {
        if (versions.current.get(row.key) !== version) return;
        setPending((current) => {
          if (!current.has(row.key)) return current;
          const next = new Map(current);
          next.delete(row.key);
          return next;
        });
      });
  };

  const openRow = (row: MyDayRowData) => {
    if (row.kind !== 'task' || row.startup === null) return;
    openStartupEntity(router, setActiveStartupId, {
      startupId: row.startup._id as Id<'startups'>,
      href: { pathname: '/zadatak/[id]', params: { id: row.id } },
      currentStartupId: activeStartupId,
    });
  };

  const openCommandCenter = () => {
    haptics.tap();
    router.navigate({ pathname: '/prostor', params: { segment: 'komandni-centar' } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MeHeader title="Danas" subtitle={formatDayHeading(today.now)} />
      {model === null ? (
        <MyDaySkeleton />
      ) : (
        <MyDayList
          model={model}
          now={today.now}
          firstName={firstNameOf(profile?.displayName)}
          collapsed={collapsed}
          reduced={reduced}
          onToggleSection={(id) => {
            haptics.select();
            setCollapsed((current) => ({ ...current, [id]: !current[id] }));
          }}
          onToggleDone={toggle}
          onOpen={openRow}
          onOpenCommandCenter={openCommandCenter}
        />
      )}
    </View>
  );
}

function MyDayList({
  model,
  now,
  firstName,
  collapsed,
  reduced,
  onToggleSection,
  onToggleDone,
  onOpen,
  onOpenCommandCenter,
}: {
  model: MyDayModel;
  now: number;
  firstName: string | null;
  collapsed: Record<MyDaySectionId, boolean>;
  reduced: boolean;
  onToggleSection: (id: MyDaySectionId) => void;
  onToggleDone: (row: MyDayRowData, done: boolean) => void;
  onOpen: (row: MyDayRowData) => void;
  onOpenCommandCenter: () => void;
}) {
  const colors = useThemeColors();
  const refreshControl = useListRefresh();
  const entering = useListEntering(reduced);

  const visible = model.sections.filter((section) => section.rows.length > 0);
  const openSections = visible.filter((section) => section.id !== 'doneToday');
  const doneCount = model.counts.doneToday;
  const rowCount = visible.reduce((sum, section) => sum + section.rows.length, 0);
  // Jedna instanca preseta za sve redove (ne nova po redu i renderu).
  const layoutPreset = useMemo(() => listLayout(reduced), [reduced]);
  const layout = rowCount <= LAYOUT_ANIMATION_MAX_ROWS ? layoutPreset : undefined;
  let rowIndex = 0;

  return (
    <ScrollView
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}>
      <SummaryCard model={model} firstName={firstName} />

      {openSections.length === 0 ? (
        <View style={styles.inlineEmpty}>
          {doneCount > 0 ? (
            <EmptyState
              icon={<CalendarCheck2 size={40} color={colors.mutedForeground} />}
              title="Sve za danas je završeno"
              description={`Završeno danas: ${doneCount}. Pogledaj šta je sledeće.`}
              actionLabel="Komandni centar"
              onAction={onOpenCommandCenter}
            />
          ) : (
            <EmptyState
              icon={<Sun size={40} color={colors.mutedForeground} />}
              title="Danas je mirno"
              description="Nema rokova ni planova za danas."
              actionLabel="Komandni centar"
              onAction={onOpenCommandCenter}
            />
          )}
        </View>
      ) : null}

      {visible.map((section) => {
        const isCollapsible = section.collapsedByDefault;
        const isCollapsed = isCollapsible && collapsed[section.id];
        return (
          <Animated.View key={section.id} layout={layout} style={styles.section}>
            <SectionHeader
              title={section.title}
              count={section.rows.length}
              tone={section.id === 'overdue' ? 'danger' : 'default'}
              collapsible={isCollapsible}
              collapsed={isCollapsed}
              onToggle={isCollapsible ? () => onToggleSection(section.id) : undefined}
            />
            {isCollapsed
              ? null
              : section.rows.map((row) => {
                  const index = rowIndex;
                  rowIndex += 1;
                  return (
                    <Animated.View
                      key={row.key}
                      layout={layout}
                      entering={entering(index)}
                      exiting={exitFade(reduced)}>
                      <TaskRow
                        row={row}
                        now={now}
                        onToggleDone={onToggleDone}
                        onOpen={row.kind === 'task' ? onOpen : undefined}
                      />
                    </Animated.View>
                  );
                })}
          </Animated.View>
        );
      })}

      {model.capped ? (
        <Text style={[styles.capped, { color: colors.mutedForeground }]}>
          Prikazan je deo zadataka. Sve nađi u Mojim zadacima.
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Pozdrav, sažetak i prsten napretka (obaveze dana: planirano ∪ rok danas). */
function SummaryCard({ model, firstName }: { model: MyDayModel; firstName: string | null }) {
  const colors = useThemeColors();
  const { done, total } = model.progress;
  return (
    <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {total > 0 ? (
        <ProgressRing
          progress={done / total}
          accessibilityLabel="Napredak dana"
          valueText={progressValueText(model.progress)}>
          <NumberRoll value={done} style={[styles.ringNumber, { color: colors.foreground }]} />
        </ProgressRing>
      ) : null}
      <View style={styles.summaryText}>
        <Text style={[styles.greeting, { color: colors.foreground }]}>
          {firstName ? `Zdravo, ${firstName}.` : 'Zdravo.'}
        </Text>
        <Text style={[styles.summaryLine, { color: colors.mutedForeground }]}>
          {daySummary(model.counts)}
        </Text>
      </View>
    </View>
  );
}

/** Oblik onoga što stiže: kartica sažetka, naslov sekcije, tri reda. */
function MyDaySkeleton() {
  return (
    <View
      style={styles.listContent}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje dana">
      <Skeleton width="100%" height={72} borderRadius={radius.card} />
      <Skeleton width="30%" height={13} />
      <SkeletonList count={3} gap={10} item={(index) => <SkeletonTaskCard index={index} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[8],
    gap: space[4],
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  summaryLine: {
    ...text.meta,
  },
  ringNumber: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  inlineEmpty: {
    minHeight: 240,
  },
  section: {
    gap: 2,
  },
  capped: {
    ...text.body,
    paddingHorizontal: space[1],
  },
});
