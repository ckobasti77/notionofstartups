import type { FunctionReturnType } from 'convex/server';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Folder,
  Lightbulb,
  Minus,
  PauseCircle,
  Plus,
  ThumbsUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssigneeStack } from '@/components/danas/assignee-stack';
import { DeadlineBadge } from '@/components/danas/deadline-badge';
import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useListRefresh } from '@/hooks/use-list-refresh';
import { haptics } from '@/lib/haptics';
import {
  addWeeks,
  formatDaysStanding,
  formatWeekLabel,
  isCurrentWeek,
  localWeekStart,
  normalizeToLocalWeekStart,
  trendDelta,
  trendDirection,
  type Trend,
} from '@/lib/puls';
import { areaColor, statusColor, TASK_STATUS_META, type TaskStatus } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, text, type ColorTokens } from '@/theme/tokens';

type PulsData = FunctionReturnType<typeof api.puls.getWeekly>;
type StuckTask = PulsData['stuckTasks'][number];
type MemberSummary = PulsData['members'][number];
type AreaSummary = PulsData['areas'][number];

type Tone = 'success' | 'danger' | 'warn' | 'default';

/**
 * Ekran „Puls" — sedmični pregled na telefonu (docs/mobile/02-EKRANI.md #8,
 * docs/mobile/00-PLAN.md Faza 2). Deli SAV backend sa webom (`puls.getWeekly`);
 * granice nedelje računa klijent po lokalnoj zoni i šalje ih serveru, isto kao
 * `apps/web/components/workspace/puls-view.tsx`. Raspored je sabijen za uski
 * ekran: 2×2 sažetak, sekcije kao vertikalne liste, članovi kao kartice umesto
 * široke tabele. Samo za čitanje.
 */
export default function PulsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId } = useActiveStartup();

  // Deep link iz obaveštenja `puls_ready` nosi početak nedelje na koju se izveštaj
  // odnosi. Bez ovoga bi tap na obaveštenje uvek otvarao TEKUĆU nedelju, pa bi
  // korisnik gledao pogrešan izveštaj (pandan `initialWeekStart` na webu).
  const { weekStart: weekStartParam } = useLocalSearchParams<{ weekStart?: string }>();
  const [weekStart, setWeekStart] = useState(() => {
    const requested = Number(weekStartParam);
    return Number.isFinite(requested) && requested > 0
      ? normalizeToLocalWeekStart(requested)
      : localWeekStart();
  });
  const [now, setNow] = useState(() => Date.now());

  // „Sada" se osvežava kroz navigaciju (kao web) — bez efekta, pa pragovi
  // „zapelog" ostaju sveži kad korisnik menja nedelju.
  function goToWeek(next: number) {
    setNow(Date.now());
    setWeekStart(next);
  }

  /** Red oblasti vodi u Prostor otvoren na toj oblasti — pandan web `puls-view`,
   *  gde je red dugme koje menja `WorkspaceRoute` na tu oblast. */
  function openArea(area: AreaSummary) {
    haptics.tap();
    router.navigate({
      pathname: '/prostor',
      params: { areaId: area.areaId, areaLabel: area.label },
    });
  }

  const weekEnd = addWeeks(weekStart, 1);
  const prevWeekStart = addWeeks(weekStart, -1);

  const data = useQuery(
    api.puls.getWeekly,
    activeStartupId
      ? { startupId: activeStartupId, prevWeekStart, weekStart, weekEnd, now }
      : 'skip',
  );

  const currentWeek = isCurrentWeek(weekStart, now);
  const isFirstWeek = data !== undefined && weekStart <= data.startupCreatedAt;
  const canGoBack = data === undefined || weekEnd > data.startupCreatedAt;
  const loading = activeStartupId === null || data === undefined;
  const refreshControl = useListRefresh();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Puls"
        eyebrow={formatWeekLabel(weekStart, weekEnd)}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}>
        <WeekNav
          colors={colors}
          currentWeek={currentWeek}
          canGoBack={canGoBack}
          isFirstWeek={isFirstWeek}
          onPrev={() => goToWeek(addWeeks(weekStart, -1))}
          onNext={() => goToWeek(addWeeks(weekStart, 1))}
          onToday={() => goToWeek(localWeekStart())}
        />

        {/* `fill={false}`: zamena stoji USRED skrola (ispod navigacije nedelje), pa
            mora da bude visoka koliko sam sadržaj, ne koliko ekran. */}
        <LoadingSwap loading={loading} fill={false} skeleton={<PulsSkeleton />}>
          {data === undefined ? null : (
            <View style={styles.sections}>
              <SummaryGrid data={data} colors={colors} hideTrend={isFirstWeek} />
              <StuckSection tasks={data.stuckTasks} now={now} colors={colors} />
              <AreasSection areas={data.areas} colors={colors} onOpenArea={openArea} />
              <MembersSection
                members={data.members}
                unassigned={data.unassigned}
                colors={colors}
              />
              <IdeasSection ideas={data.ideas} colors={colors} hideTrend={isFirstWeek} />
              {data.truncated ? (
                <Text style={[styles.truncated, { color: colors.mutedForeground }]}>
                  Prikaz je približan — nedelja ima izuzetno mnogo podataka.
                </Text>
              ) : null}
            </View>
          )}
        </LoadingSwap>
      </ScrollView>
    </View>
  );
}

/**
 * Navigacija kroz nedelje. Sam datum nedelje NIJE ovde — nosi ga `eyebrow`
 * zaglavlja, pa red ostaje jedna linija: strelice sa strane, stanje u sredini.
 */
function WeekNav({
  colors,
  currentWeek,
  canGoBack,
  isFirstWeek,
  onPrev,
  onNext,
  onToday,
}: {
  colors: ColorTokens;
  currentWeek: boolean;
  canGoBack: boolean;
  isFirstWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <View style={styles.weekNavRow}>
      <NavButton colors={colors} label="Prethodna nedelja" disabled={!canGoBack} onPress={onPrev}>
        <ChevronLeft size={20} color={canGoBack ? colors.foreground : colors.mutedForeground} />
      </NavButton>
      <View style={styles.weekBadges}>
        {currentWeek ? (
          <Badge label="Tekuća nedelja" variant="secondary" />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skoči na tekuću nedelju"
            onPress={onToday}
            // Vizuelno kompaktna pilula (32pt), ali dodirna meta ≥ 44pt kroz hitSlop.
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.todayBtn,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Text style={[styles.todayText, { color: colors.foreground }]}>Tekuća nedelja</Text>
          </Pressable>
        )}
        {isFirstWeek ? <Badge label="Prva nedelja" variant="outline" /> : null}
      </View>
      <NavButton colors={colors} label="Sledeća nedelja" disabled={currentWeek} onPress={onNext}>
        <ChevronRight size={20} color={currentWeek ? colors.mutedForeground : colors.foreground} />
      </NavButton>
    </View>
  );
}

function NavButton({
  colors,
  label,
  disabled,
  onPress,
  children,
}: {
  colors: ColorTokens;
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.navButton,
        { borderColor: colors.border },
        disabled && styles.navButtonDisabled,
        pressed && !disabled && { backgroundColor: colors.muted },
      ]}>
      {children}
    </Pressable>
  );
}

// --- Sažetak (2×2) ------------------------------------------------------------

function SummaryGrid({
  data,
  colors,
  hideTrend,
}: {
  data: PulsData;
  colors: ColorTokens;
  hideTrend: boolean;
}) {
  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        <StatCard
          colors={colors}
          label="Završeno ove nedelje"
          value={data.summary.completed.current}
          trend={data.summary.completed}
          upIsGood
          hideTrend={hideTrend}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          colors={colors}
          label="Novo kreirano"
          value={data.summary.created.current}
          trend={data.summary.created}
          upIsGood
          hideTrend={hideTrend}
          icon={Plus}
          tone="default"
        />
      </View>
      <View style={styles.gridRow}>
        <StatCard
          colors={colors}
          label="Trenutno kasni"
          value={data.summary.overdueOpen.current}
          trend={data.summary.overdueOpen}
          upIsGood={false}
          hideTrend={hideTrend}
          icon={Flame}
          tone="danger"
        />
        <StatCard
          colors={colors}
          label="Zapelo"
          value={data.summary.stuck.current}
          icon={PauseCircle}
          tone="warn"
          detail="trenutno stanje"
        />
      </View>
    </View>
  );
}

function toneColor(colors: ColorTokens, tone: Tone): string {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'danger':
      return colors.destructive;
    case 'warn':
      return colors.warning;
    default:
      return colors.primary;
  }
}

function StatCard({
  colors,
  label,
  value,
  trend,
  upIsGood,
  hideTrend,
  icon: Icon,
  tone,
  detail,
}: {
  colors: ColorTokens;
  label: string;
  value: number;
  trend?: Trend;
  upIsGood?: boolean;
  hideTrend?: boolean;
  icon: LucideIcon;
  tone: Tone;
  detail?: string;
}) {
  const tint = toneColor(colors, tone);
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.statTop}>
        <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <View style={[styles.statIcon, { backgroundColor: `${tint}22` }]}>
          <Icon size={15} color={tint} />
        </View>
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <View style={styles.statFoot}>
        {detail !== undefined ? (
          <Text style={[styles.statDetail, { color: colors.mutedForeground }]}>{detail}</Text>
        ) : trend === undefined || hideTrend ? (
          <Text style={[styles.statDetail, { color: colors.mutedForeground }]}>
            {hideTrend ? 'Prva nedelja' : ''}
          </Text>
        ) : (
          <TrendLine colors={colors} trend={trend} upIsGood={upIsGood ?? true} />
        )}
      </View>
    </View>
  );
}

/** Strelica gore nije uvek dobra vest — smer se tumači po značenju metrike. */
function TrendLine({
  colors,
  trend,
  upIsGood,
}: {
  colors: ColorTokens;
  trend: Trend;
  upIsGood: boolean;
}) {
  const direction = trendDirection(trend);
  const delta = Math.abs(trendDelta(trend));

  if (direction === 'flat') {
    return (
      <View style={styles.trendRow}>
        <Minus size={13} color={colors.mutedForeground} />
        <Text style={[styles.trendMuted, { color: colors.mutedForeground }]}>isto kao prošle</Text>
      </View>
    );
  }

  const good = direction === 'up' ? upIsGood : !upIsGood;
  const color = good ? colors.success : colors.destructive;
  const Arrow = direction === 'up' ? ArrowUp : ArrowDown;

  return (
    <View style={styles.trendRow}>
      <Arrow size={13} color={color} />
      <Text style={[styles.trendValue, { color }]}>{delta}</Text>
      <Text style={[styles.trendMuted, { color: colors.mutedForeground }]}>vs prošle</Text>
    </View>
  );
}

// --- Zapelo -------------------------------------------------------------------

function StuckSection({
  tasks,
  now,
  colors,
}: {
  tasks: StuckTask[];
  now: number;
  colors: ColorTokens;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>
          Zapelo
        </Text>
        <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
          U toku duže od 4 radna dana ili blokirano duže od 2 dana.
        </Text>
      </View>
      {tasks.length === 0 ? (
        <EmptyCard colors={colors} text="Ništa nije zapelo. Sve teče." />
      ) : (
        <View style={styles.cards}>
          {tasks.map((task) => (
            <StuckCard key={task.pageId} task={task} now={now} colors={colors} />
          ))}
        </View>
      )}
    </View>
  );
}

function StuckCard({
  task,
  now,
  colors,
}: {
  task: StuckTask;
  now: number;
  colors: ColorTokens;
}) {
  const router = useRouter();
  const status = (task.taskStatus ?? 'in_progress') as TaskStatus;
  return (
    <Pressable
      accessibilityRole="button"
      // Ključne info (status + koliko stoji) idu u labelu kartice: ugnježdeni
      // `accessible` čvorovi (DeadlineBadge/AssigneeStack) unutar touchable-a se
      // čitaču ekrana često ne izgovore, pa se ne oslanjamo samo na njih.
      accessibilityLabel={`Otvori zadatak: ${task.title}. ${TASK_STATUS_META[status].label}, stoji ${formatDaysStanding(now - task.lastTouchedAt)}.`}
      onPress={() => router.push({ pathname: '/zadatak/[id]', params: { id: task.pageId } })}
      style={({ pressed }) => [
        styles.stuckCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}>
      <View style={styles.stuckTop}>
        <Text style={[styles.stuckTitle, { color: colors.foreground }]} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={[styles.stuckStanding, { color: colors.warning }]}>
          stoji {formatDaysStanding(now - task.lastTouchedAt)}
        </Text>
      </View>
      <View style={styles.stuckMeta}>
        <View style={styles.statusTag}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(colors, status) }]} />
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            {TASK_STATUS_META[status].label}
          </Text>
        </View>
        <Text style={[styles.stuckArea, { color: colors.mutedForeground }]} numberOfLines={1}>
          {task.areaLabel}
        </Text>
        <DeadlineBadge dueDate={task.dueDate} taskStatus={status} now={now} />
        <AssigneeStack assignees={task.assignees} max={3} />
      </View>
    </Pressable>
  );
}

// --- Po oblastima -------------------------------------------------------------

function AreasSection({
  areas,
  colors,
  onOpenArea,
}: {
  areas: AreaSummary[];
  colors: ColorTokens;
  onOpenArea: (area: AreaSummary) => void;
}) {
  if (areas.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>
        Po oblastima
      </Text>
      <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {areas.map((area, index) => {
          const total = area.openCount + area.doneCount;
          const percent = total === 0 ? 0 : Math.round((area.doneCount / total) * 100);
          const tint = areaColor(colors, area.key);
          return (
            <Pressable
              key={area.areaId}
              accessibilityRole="button"
              accessibilityLabel={`${area.label}, ${percent} procenata gotovo`}
              accessibilityHint="Otvara oblast u Prostoru"
              onPress={() => onOpenArea(area)}
              style={({ pressed }) => [
                styles.areaRow,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                pressed && { backgroundColor: colors.muted },
              ]}>
              <View style={[styles.areaIcon, { backgroundColor: `${tint}22` }]}>
                <Folder size={16} color={tint} />
              </View>
              <View style={styles.areaBody}>
                <View style={styles.areaTitleRow}>
                  <Text style={[styles.areaLabel, { color: colors.foreground }]} numberOfLines={1}>
                    {area.label}
                  </Text>
                  <Text style={[styles.areaPercent, { color: colors.mutedForeground }]}>{percent}%</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                  <View
                    style={[styles.progressFill, { width: `${percent}%`, backgroundColor: colors.primary }]}
                  />
                </View>
                <Text style={[styles.areaCounts, { color: colors.mutedForeground }]}>
                  {area.openCount} otvoreno · {area.doneCount} gotovo
                  {area.completedThisWeek > 0 ? (
                    <Text style={{ color: colors.success, fontWeight: fontWeight.semibold }}>
                      {'  '}+{area.completedThisWeek} ove nedelje
                    </Text>
                  ) : null}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.subtle} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// --- Po članovima -------------------------------------------------------------

function MembersSection({
  members,
  unassigned,
  colors,
}: {
  members: MemberSummary[];
  unassigned: PulsData['unassigned'];
  colors: ColorTokens;
}) {
  const showUnassigned =
    unassigned.openCount > 0 || unassigned.completedThisWeek > 0 || unassigned.overdueCount > 0;

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>
        Po članovima
      </Text>
      {members.length === 0 && !showUnassigned ? (
        <EmptyState
          icon={<Users size={36} color={colors.mutedForeground} />}
          title="Nema zabeleženog rada"
          description="U ovoj nedelji nijedan član nije imao aktivnost na zadacima."
        />
      ) : (
        <View style={styles.cards}>
          {members.map((member) => (
            <View
              key={member.profileId}
              style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.memberHead}>
                <Avatar name={member.displayName} uri={member.avatarUrl} size={34} />
                <View style={styles.memberName}>
                  <Text style={[styles.memberNameText, { color: colors.foreground }]} numberOfLines={1}>
                    {member.displayName}
                  </Text>
                  {member.isArchived ? (
                    <Text style={[styles.memberSub, { color: colors.mutedForeground }]}>bivši član</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.chipsRow}>
                <StatChip colors={colors} label="Završeno" value={member.completedThisWeek} />
                <StatChip colors={colors} label="Aktivnosti" value={member.activityCount} />
                <StatChip colors={colors} label="Otvoreno" value={member.openCount} />
                <StatChip
                  colors={colors}
                  label="Kasni"
                  value={member.overdueCount}
                  danger={member.overdueCount > 0}
                />
              </View>
            </View>
          ))}

          {showUnassigned ? (
            <View style={[styles.memberCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={styles.memberHead}>
                <Avatar empty size={34} accessibilityLabel="Bez zaduženog" />
                <Text style={[styles.memberNameText, { color: colors.foreground }]}>Bez zaduženog</Text>
              </View>
              <View style={styles.chipsRow}>
                <StatChip colors={colors} label="Završeno" value={unassigned.completedThisWeek} />
                <StatChip colors={colors} label="Otvoreno" value={unassigned.openCount} />
                <StatChip
                  colors={colors}
                  label="Kasni"
                  value={unassigned.overdueCount}
                  danger={unassigned.overdueCount > 0}
                />
              </View>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function StatChip({
  colors,
  label,
  value,
  danger,
}: {
  colors: ColorTokens;
  label: string;
  value: number;
  danger?: boolean;
}) {
  const valueColor = danger ? colors.destructive : value === 0 ? colors.mutedForeground : colors.foreground;
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statChipValue, { color: valueColor }]}>{value}</Text>
      <Text style={[styles.statChipLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// --- Ideje --------------------------------------------------------------------

function IdeasSection({
  ideas,
  colors,
  hideTrend,
}: {
  ideas: PulsData['ideas'];
  colors: ColorTokens;
  hideTrend: boolean;
}) {
  const total = ideas.created.current + ideas.votes.current + ideas.converted.current;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>
        Ideje
      </Text>
      {total === 0 ? (
        <EmptyCard colors={colors} text="Ove nedelje nije bilo rada na idejama." />
      ) : (
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <IdeaRow
            colors={colors}
            icon={Lightbulb}
            tint={colors.primary}
            label="Nove ideje"
            trend={ideas.created}
            hideTrend={hideTrend}
            first
          />
          <IdeaRow
            colors={colors}
            icon={ThumbsUp}
            tint={colors.info}
            label="Glasova"
            trend={ideas.votes}
            hideTrend={hideTrend}
          />
          <IdeaRow
            colors={colors}
            icon={Plus}
            tint={colors.success}
            label="Pretvoreno u zadatke"
            trend={ideas.converted}
            hideTrend={hideTrend}
          />
        </View>
      )}
    </View>
  );
}

function IdeaRow({
  colors,
  icon: Icon,
  tint,
  label,
  trend,
  hideTrend,
  first,
}: {
  colors: ColorTokens;
  icon: LucideIcon;
  tint: string;
  label: string;
  trend: Trend;
  hideTrend: boolean;
  first?: boolean;
}) {
  return (
    <Row
      title={label}
      accessibilityLabel={`${label}: ${trend.current}`}
      showChevron={false}
      style={[
        styles.ideaRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}
      icon={
        <View style={[styles.areaIcon, { backgroundColor: `${tint}22` }]}>
          <Icon size={16} color={tint} />
        </View>
      }
      value={
        <View style={styles.ideaRight}>
          <Text style={[styles.ideaValue, { color: colors.foreground }]}>{trend.current}</Text>
          {!hideTrend ? <TrendLine colors={colors} trend={trend} upIsGood /> : null}
        </View>
      }
    />
  );
}

// --- Zajedničko ---------------------------------------------------------------

function EmptyCard({ colors, text }: { colors: ColorTokens; text: string }) {
  return (
    <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}

/** Oblik Pulsa: 2×2 mreža brojača, pa naslov sekcije i dve kartice. */
function PulsSkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje Pulsa">
      <View style={styles.gridRow}>
        <Skeleton height={88} borderRadius={radius.xl} style={styles.flex} />
        <Skeleton height={88} borderRadius={radius.xl} style={styles.flex} />
      </View>
      <View style={styles.gridRow}>
        <Skeleton height={88} borderRadius={radius.xl} style={styles.flex} />
        <Skeleton height={88} borderRadius={radius.xl} style={styles.flex} />
      </View>
      <Skeleton width="40%" height={18} />
      <Skeleton height={72} borderRadius={radius.xl} />
      <Skeleton height={72} borderRadius={radius.xl} />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PulsErrorState message={error.message} onRetry={retry} />;
}

function PulsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Puls" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Puls se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju Pulsa.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: space[4],
    paddingTop: space[2],
    gap: space[5],
  },
  // Sekcije Pulsa nose isti razmak koji je ranije davao `content.gap`, pošto ih
  // sada `LoadingSwap` obuhvata kao jedno dete.
  sections: {
    gap: space[5],
  },
  // Week navigacija
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  navButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  weekBadges: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  todayBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayText: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  // Sažetak
  grid: {
    gap: space[3],
  },
  gridRow: {
    flexDirection: 'row',
    gap: space[3],
  },
  statCard: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
    gap: 4,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  statLabel: {
    flex: 1,
    ...text.meta,
    fontWeight: fontWeight.semibold,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...text.display,
    fontVariant: ['tabular-nums'],
  },
  statFoot: {
    minHeight: 18,
  },
  statDetail: {
    ...text.meta,
    fontWeight: fontWeight.regular,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trendValue: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  trendMuted: {
    ...text.meta,
    fontWeight: fontWeight.regular,
  },
  // Sekcije
  section: {
    gap: space[3],
  },
  sectionHead: {
    gap: 2,
  },
  sectionTitle: {
    ...text.title,
  },
  sectionSub: {
    ...text.meta,
    fontWeight: fontWeight.regular,
  },
  cards: {
    gap: space[2],
  },
  // Zapelo
  stuckCard: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
    gap: space[2],
  },
  stuckTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  stuckTitle: {
    flex: 1,
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  stuckStanding: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  stuckMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space[2],
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...text.meta,
  },
  stuckArea: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    maxWidth: 120,
  },
  // Oblasti
  groupCard: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
  },
  areaIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaBody: {
    flex: 1,
    gap: 6,
  },
  areaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  areaLabel: {
    flex: 1,
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  areaPercent: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  areaCounts: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    fontVariant: ['tabular-nums'],
  },
  // Članovi
  memberCard: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
    gap: space[3],
  },
  memberHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  memberName: {
    flex: 1,
  },
  memberNameText: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  memberSub: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    marginTop: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  statChip: {
    flexGrow: 1,
    minWidth: 68,
    alignItems: 'center',
    paddingVertical: space[2],
    borderRadius: radius.md,
  },
  statChipValue: {
    ...text.title,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  statChipLabel: {
    ...text.meta,
    fontWeight: fontWeight.regular,
    marginTop: 1,
  },
  // Ideje — red kao `Row` override (raspored i naslov dolaze iz Row.base).
  ideaRow: {
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  ideaRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  ideaValue: {
    ...text.title,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  // Prazno / skeleton
  emptyCard: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    padding: space[4],
  },
  emptyText: {
    ...text.body,
    textAlign: 'center',
  },
  skeleton: {
    gap: space[3],
  },
  truncated: {
    ...text.meta,
    fontWeight: fontWeight.regular,
  },
});
