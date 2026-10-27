"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  Blocks,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Lightbulb,
  Minus,
  PauseCircle,
  Plus,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AssigneeStack } from "@/components/workspace/assignee-stack";
import { DeadlineBadge } from "@/components/workspace/deadline-badge";
import { PulseBar, type PulseSegment } from "@/components/workspace/pulse-bar";
import type { StartupWithAreas } from "@/components/workspace/types";
import {
  AREA_ICONS,
  EmptyState,
  ProfileAvatar,
  ScreenHeader,
  SectionHeading,
  TaskStatusBadge,
} from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
} from "@/lib/puls";
import { cn } from "@/lib/utils";
import type { AreaKey, TaskStatus } from "@/lib/workspace";

export function PulsView({
  startup,
  initialWeekStart,
  onOpenPage,
  onOpenArea,
}: {
  startup: StartupWithAreas;
  initialWeekStart: number | null;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
}) {
  const [weekStart, setWeekStart] = useState(() =>
    initialWeekStart === null
      ? localWeekStart()
      : normalizeToLocalWeekStart(initialWeekStart),
  );
  const [now, setNow] = useState(() => Date.now());

  // „Sada” se osvežava kroz samu navigaciju, a ne efektom — tako nema kaskadnih
  // rendera, a pragovi zapelog ostaju sveži kad korisnik menja nedelju.
  function goToWeek(next: number) {
    setNow(Date.now());
    setWeekStart(next);
  }

  const weekEnd = addWeeks(weekStart, 1);
  const prevWeekStart = addWeeks(weekStart, -1);

  const data = useQuery(api.puls.getWeekly, {
    startupId: startup._id,
    prevWeekStart,
    weekStart,
    weekEnd,
    now,
  });

  const currentWeek = isCurrentWeek(weekStart, now);
  const isFirstWeek =
    data !== undefined && weekStart <= data.startupCreatedAt;
  const canGoBack = data === undefined || weekEnd > data.startupCreatedAt;

  const pulseSegments: Array<PulseSegment> =
    data === undefined
      ? []
      : [
          {
            key: "kasni",
            label: "Kasni",
            count: data.summary.overdueOpen.current,
            tone: "danger",
          },
          {
            key: "zapelo",
            label: "Zapelo",
            count: data.summary.stuck.current,
            tone: "warn",
          },
          {
            key: "zavrseno",
            label: "Završeno",
            count: data.summary.completed.current,
            tone: "success",
          },
        ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <ScreenHeader
        title="Puls nedelje"
        below={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Prethodna nedelja"
                disabled={!canGoBack}
                onClick={() => goToWeek(addWeeks(weekStart, -1))}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-52 text-center text-sm font-medium tabular-nums">
                {formatWeekLabel(weekStart, weekEnd)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Sledeća nedelja"
                disabled={currentWeek}
                onClick={() => goToWeek(addWeeks(weekStart, 1))}
              >
                <ChevronRight />
              </Button>
              {currentWeek ? (
                <Badge variant="secondary">Tekuća nedelja</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => goToWeek(localWeekStart())}
                >
                  Tekuća nedelja
                </Button>
              )}
              {isFirstWeek ? <Badge variant="outline">Prva nedelja</Badge> : null}
            </div>
            <div className="mt-4">
              {data === undefined ? (
                <Skeleton className="h-2.5 w-full rounded-sm" />
              ) : (
                <PulseBar
                  segments={pulseSegments}
                  label="Sastav nedelje"
                  emptyLabel="Nedelja bez zabeleženog posla"
                />
              )}
            </div>
          </>
        }
      />

      {data === undefined ? (
        <PulsSkeleton />
      ) : (
        // Promena nedelje menja sadržaj odmah, bez animacije (K07 §8, PROSTOR K21).
        <div className="space-y-6">
          {/* Jedini istaknut blok ekrana (DIZAJN-SMIRENJE §5.4): jedna površina sa četiri broja. */}
          <section
            data-workspace-enter
            aria-label="Sažetak nedelje"
            className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatCard
              label="Završeno ove nedelje"
              value={data.summary.completed.current}
              trend={data.summary.completed}
              upIsGood
              hideTrend={isFirstWeek}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Novo kreirano"
              value={data.summary.created.current}
              trend={data.summary.created}
              upIsGood
              hideTrend={isFirstWeek}
              icon={Plus}
            />
            <StatCard
              label="Trenutno kasni"
              value={data.summary.overdueOpen.current}
              trend={data.summary.overdueOpen}
              upIsGood={false}
              hideTrend={isFirstWeek}
              icon={Flame}
              tone="danger"
            />
            <StatCard
              label="Zapelo"
              value={data.summary.stuck.current}
              icon={PauseCircle}
              tone="warn"
              detail="trenutno stanje"
            />
          </section>

          <StuckSection
            tasks={data.stuckTasks}
            now={now}
            onOpenPage={onOpenPage}
          />

          <AreasSection areas={data.areas} onOpenArea={onOpenArea} />

          <MembersSection members={data.members} unassigned={data.unassigned} />

          <IdeasSection ideas={data.ideas} hideTrend={isFirstWeek} />

          {data.truncated ? (
            <p className="text-xs text-muted-foreground">
              Prikaz je približan — nedelja ima izuzetno mnogo podataka.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PulsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Učitavanje Pulsa">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 rounded-lg" />
        ))}
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  upIsGood,
  hideTrend,
  icon: Icon,
  tone,
  detail,
  plain = false,
}: {
  label: string;
  value: number;
  trend?: Trend;
  upIsGood?: boolean;
  hideTrend?: boolean;
  icon: typeof CheckCircle2;
  tone?: "success" | "danger" | "warn";
  detail?: string;
  /** Van istaknutog bloka: bez sopstvene površine (nikad kartica u kartici). */
  plain?: boolean;
}) {
  return (
    <div className={cn("bg-card p-4", plain && "rounded-lg bg-transparent px-2 py-2")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.02em]">
            {value}
          </p>
        </div>
        {/* Boja ikonice nosi samo status (DIZAJN-SMIRENJE §1), bez pločice. */}
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            tone === "success"
              ? "text-success"
              : tone === "danger"
                ? "text-destructive"
                : tone === "warn"
                  ? "text-warning-foreground dark:text-warning"
                  : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 min-h-5">
        {detail !== undefined ? (
          <p className="text-xs text-muted-foreground">{detail}</p>
        ) : trend === undefined || hideTrend ? (
          <p className="text-xs text-muted-foreground">
            {hideTrend ? "Prva nedelja — nema poređenja" : ""}
          </p>
        ) : (
          <TrendBadge trend={trend} upIsGood={upIsGood ?? true} />
        )}
      </div>
    </div>
  );
}

/** Strelica gore nije uvek dobra vest — smer se tumači po značenju metrike. */
function TrendBadge({ trend, upIsGood }: { trend: Trend; upIsGood: boolean }) {
  const direction = trendDirection(trend);
  const delta = Math.abs(trendDelta(trend));

  if (direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        isto kao prošle nedelje
      </span>
    );
  }

  const good = direction === "up" ? upIsGood : !upIsGood;
  const Arrow = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        good ? "text-success" : "text-destructive",
      )}
      title={`Prošle nedelje: ${trend.previous}`}
    >
      <Arrow className="size-3" aria-hidden="true" />
      <span className="tabular-nums">{delta}</span>
      <span className="font-normal text-muted-foreground">
        u odnosu na prošlu nedelju
      </span>
    </span>
  );
}

type StuckTask = {
  pageId: Id<"pages">;
  title: string;
  taskStatus: TaskStatus;
  taskPriority: string | null;
  areaLabel: string;
  assignee: { displayName: string; avatarUrl: string | null } | null;
  assignees: Array<{ displayName: string; avatarUrl: string | null }>;
  dueDate: number | null;
  lastTouchedAt: number;
};

function StuckSection({
  tasks,
  now,
  onOpenPage,
}: {
  tasks: Array<StuckTask>;
  now: number;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  return (
    <section data-workspace-enter>
      <SectionHeading
        title="Zapelo"
        count={tasks.length > 0 ? tasks.length : undefined}
        action={
          <span className="text-xs text-muted-foreground">
            U toku &gt; 4 radna dana · blokirano &gt; 2 dana
          </span>
        }
      />
      {tasks.length === 0 ? (
        <EmptyState size="section" title="Ništa nije zapelo." />
      ) : (
        <div className="space-y-0.5">
          {tasks.map((task) => (
            <button
              key={task.pageId}
              type="button"
              onClick={() => onOpenPage(task.pageId)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {task.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{task.areaLabel}</span>
                  <span aria-hidden="true">·</span>
                  <AssigneeStack
                    assignees={task.assignees}
                    showLabel
                    max={3}
                  />
                </span>
              </span>
              <TaskStatusBadge status={task.taskStatus} />
              <DeadlineBadge
                dueDate={task.dueDate}
                taskStatus={task.taskStatus}
                now={now}
                size="sm"
              />
              <span className="text-xs font-medium tabular-nums text-warning-foreground dark:text-warning">
                stoji {formatDaysStanding(now - task.lastTouchedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function AreasSection({
  areas,
  onOpenArea,
}: {
  areas: Array<{
    areaId: Id<"startupAreas">;
    key: string;
    label: string;
    openCount: number;
    doneCount: number;
    completedThisWeek: number;
  }>;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
}) {
  if (areas.length === 0) return null;

  return (
    <section data-workspace-enter>
      <SectionHeading title="Po oblastima" />
      <div className="space-y-0.5">
        {areas.map((area) => {
          const total = area.openCount + area.doneCount;
          const percent = total === 0 ? 0 : Math.round((area.doneCount / total) * 100);
          const Icon = AREA_ICONS[area.key as AreaKey] || Blocks;
          return (
            <button
              key={area.areaId}
              type="button"
              onClick={() => onOpenArea(area.areaId)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{area.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                </span>
                <Progress value={percent} className="mt-2 [&>[data-slot=progress-indicator]]:bg-success" />
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  <span className="tabular-nums">{area.openCount}</span>{" "}
                  otvoreno ·{" "}
                  <span className="tabular-nums">{area.doneCount}</span>{" "}
                  gotovo
                  {area.completedThisWeek > 0 ? (
                    <>
                      {" "}
                      <span className="font-medium text-success">
                        (+{area.completedThisWeek} ove nedelje)
                      </span>
                    </>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MembersSection({
  members,
  unassigned,
}: {
  members: Array<{
    profileId: Id<"profiles">;
    displayName: string;
    avatarUrl: string | null;
    isArchived: boolean;
    completedThisWeek: number;
    activityCount: number;
    openCount: number;
    overdueCount: number;
  }>;
  unassigned: {
    completedThisWeek: number;
    openCount: number;
    overdueCount: number;
  };
}) {
  const showUnassigned =
    unassigned.openCount > 0 ||
    unassigned.completedThisWeek > 0 ||
    unassigned.overdueCount > 0;

  if (members.length === 0 && !showUnassigned) {
    return (
      <section data-workspace-enter>
        <SectionHeading title="Po članovima" />
        <EmptyState size="section" title="Ove nedelje niko nije radio na zadacima." />
      </section>
    );
  }

  return (
    <section data-workspace-enter>
      <SectionHeading title="Po članovima" />
      <div className="space-y-0.5">
        {members.map((member) => (
          <div
            key={member.profileId}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <ProfileAvatar profile={member} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {member.displayName}
                </span>
                {member.isArchived ? (
                  <span className="block text-xs text-muted-foreground">
                    bivši član
                  </span>
                ) : null}
              </span>
            </span>
            <MemberStat label="Završeno" value={member.completedThisWeek} />
            <MemberStat label="Aktivnosti" value={member.activityCount} />
            <MemberStat label="Otvoreno" value={member.openCount} />
            <MemberStat
              label="Kasni"
              value={member.overdueCount}
              tone={member.overdueCount > 0 ? "danger" : undefined}
            />
          </div>
        ))}
        {showUnassigned ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <span className="truncate text-sm font-medium">Bez zaduženog</span>
            </span>
            <MemberStat label="Završeno" value={unassigned.completedThisWeek} />
            <MemberStat label="Aktivnosti" value={0} />
            <MemberStat label="Otvoreno" value={unassigned.openCount} />
            <MemberStat
              label="Kasni"
              value={unassigned.overdueCount}
              tone={unassigned.overdueCount > 0 ? "danger" : undefined}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MemberStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <span className="w-20 shrink-0">
      <span
        className={cn(
          "block text-sm font-semibold tabular-nums",
          tone === "danger" ? "text-destructive" : undefined,
          value === 0 && tone === undefined && "text-muted-foreground",
        )}
      >
        {value}
      </span>
      <span className="block text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function IdeasSection({
  ideas,
  hideTrend,
}: {
  ideas: { created: Trend; votes: Trend; converted: Trend };
  hideTrend: boolean;
}) {
  const total =
    ideas.created.current + ideas.votes.current + ideas.converted.current;

  return (
    <section data-workspace-enter>
      <SectionHeading title="Ideje" />
      {total === 0 ? (
        <EmptyState size="section" title="Ove nedelje nije bilo rada na idejama." />
      ) : (
        <div className="grid gap-1 sm:grid-cols-3">
          <StatCard
            label="Nove ideje"
            value={ideas.created.current}
            trend={ideas.created}
            upIsGood
            hideTrend={hideTrend}
            icon={Lightbulb}
            plain
          />
          <StatCard
            label="Glasova"
            value={ideas.votes.current}
            trend={ideas.votes}
            upIsGood
            hideTrend={hideTrend}
            icon={CheckCircle2}
            plain
          />
          <StatCard
            label="Pretvoreno u zadatke"
            value={ideas.converted.current}
            trend={ideas.converted}
            upIsGood
            hideTrend={hideTrend}
            icon={Plus}
            tone="success"
            plain
          />
        </div>
      )}
    </section>
  );
}
