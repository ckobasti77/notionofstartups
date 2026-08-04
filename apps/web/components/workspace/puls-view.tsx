"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { Card } from "@/components/ui/card";
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
  TaskStatusBadge,
  getAreaTint,
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
  const prefersReducedMotion = useReducedMotion();
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
    <div className="mx-auto w-full max-w-[96rem] px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header data-workspace-enter className="mb-6">
        <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">
          {startup.name}
        </p>
        <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
          Puls nedelje
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Šta je nedelja donela: završeno, zapelo i gde tim gubi vreme.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
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
          <span className="min-w-52 text-center text-sm font-semibold tabular-nums">
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
              pulseTone={null}
            />
          )}
        </div>
      </header>

      {data === undefined ? (
        <PulsSkeleton />
      ) : (
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={weekStart}
            initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <section data-workspace-enter className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function PulsSkeleton() {
  return (
    <div className="space-y-8" aria-label="Učitavanje Pulsa">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 rounded-2xl" />
        ))}
      </div>
      {[0, 1].map((item) => (
        <div key={item} className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 rounded-2xl" />
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
}: {
  label: string;
  value: number;
  trend?: Trend;
  upIsGood?: boolean;
  hideTrend?: boolean;
  icon: typeof CheckCircle2;
  tone?: "success" | "danger" | "warn";
  detail?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums tracking-[-0.04em]">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            tone === "success"
              ? "bg-success/12 text-success"
              : tone === "danger"
                ? "bg-destructive/12 text-destructive"
                : tone === "warn"
                  ? "bg-warning/18 text-warning-foreground dark:text-warning"
                  : "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
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
    </Card>
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
        "inline-flex items-center gap-1 text-xs font-semibold",
        good ? "text-success" : "text-destructive",
      )}
      title={`Prošle nedelje: ${trend.previous}`}
    >
      <Arrow className="size-3" aria-hidden="true" />
      <span className="font-mono tabular-nums">{delta}</span>
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
      <header className="mb-3">
        <h2 className="text-lg font-bold tracking-[-0.025em]">Zapelo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          U toku duže od 4 radna dana ili blokirano duže od 2 dana.
        </p>
      </header>
      {tasks.length === 0 ? (
        <Card className="flex min-h-24 items-center justify-center border-dashed bg-card/45 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Ništa nije zapelo. Sve teče.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {tasks.map((task) => (
            <button
              key={task.pageId}
              type="button"
              onClick={() => onOpenPage(task.pageId)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/55 px-4 py-3 text-left last:border-b-0 hover:bg-accent/30"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
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
              <span className="font-mono text-xs font-semibold tabular-nums text-warning-foreground dark:text-warning">
                stoji {formatDaysStanding(now - task.lastTouchedAt)}
              </span>
            </button>
          ))}
        </Card>
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
      <h2 className="mb-3 text-lg font-bold tracking-[-0.025em]">Po oblastima</h2>
      <Card className="overflow-hidden">
        {areas.map((area) => {
          const total = area.openCount + area.doneCount;
          const percent = total === 0 ? 0 : Math.round((area.doneCount / total) * 100);
          const Icon = AREA_ICONS[area.key as AreaKey] || Blocks;
          return (
            <button
              key={area.areaId}
              type="button"
              onClick={() => onOpenArea(area.areaId)}
              className="flex w-full items-center gap-3 border-b border-border/55 px-4 py-3 text-left last:border-b-0 hover:bg-accent/30"
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg",
                  getAreaTint(area.key),
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold">{area.label}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                </span>
                <Progress value={percent} className="mt-2" />
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{area.openCount}</span>{" "}
                  otvoreno ·{" "}
                  <span className="font-mono tabular-nums">{area.doneCount}</span>{" "}
                  gotovo
                  {area.completedThisWeek > 0 ? (
                    <>
                      {" "}
                      <span className="font-semibold text-success">
                        (+{area.completedThisWeek} ove nedelje)
                      </span>
                    </>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </Card>
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
        <h2 className="mb-3 text-lg font-bold tracking-[-0.025em]">Po članovima</h2>
        <EmptyState
          icon={UserRound}
          title="Nema zabeleženog rada"
          description="U ovoj nedelji nijedan član nije imao aktivnost na zadacima."
          className="min-h-32"
        />
      </section>
    );
  }

  return (
    <section data-workspace-enter>
      <h2 className="mb-3 text-lg font-bold tracking-[-0.025em]">Po članovima</h2>
      <Card className="overflow-hidden">
        {members.map((member) => (
          <div
            key={member.profileId}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/55 px-4 py-3 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <ProfileAvatar profile={member} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-muted/25 px-4 py-3">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <span className="truncate text-sm font-semibold">Bez zaduženog</span>
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
      </Card>
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
          "block font-mono text-lg font-bold tabular-nums",
          tone === "danger" ? "text-destructive" : undefined,
          value === 0 && tone === undefined && "text-muted-foreground",
        )}
      >
        {value}
      </span>
      <span className="block text-[0.6875rem] text-muted-foreground">{label}</span>
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
      <h2 className="mb-3 text-lg font-bold tracking-[-0.025em]">Ideje</h2>
      {total === 0 ? (
        <Card className="flex min-h-24 items-center justify-center border-dashed bg-card/45 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Ove nedelje nije bilo rada na idejama.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Nove ideje"
            value={ideas.created.current}
            trend={ideas.created}
            upIsGood
            hideTrend={hideTrend}
            icon={Lightbulb}
          />
          <StatCard
            label="Glasova"
            value={ideas.votes.current}
            trend={ideas.votes}
            upIsGood
            hideTrend={hideTrend}
            icon={CheckCircle2}
          />
          <StatCard
            label="Pretvoreno u zadatke"
            value={ideas.converted.current}
            trend={ideas.converted}
            upIsGood
            hideTrend={hideTrend}
            icon={Plus}
            tone="success"
          />
        </div>
      )}
    </section>
  );
}
