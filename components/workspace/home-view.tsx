"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowRight,
  Blocks,
  CheckSquare2,
  Clock3,
  Plus,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProfileWithAvatar, StartupWithAreas } from "@/components/workspace/types";
import {
  AREA_ICONS,
  AREA_TINTS,
  ProfileAvatar,
  TaskStatusBadge,
} from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { AREA_META, formatShortDate, type AreaKey, type TaskStatus } from "@/lib/workspace";

export function HomeView({
  startup,
  profile,
  onOpenArea,
  onOpenPage,
  onCreate,
}: {
  startup: StartupWithAreas;
  profile: ProfileWithAvatar;
  onOpenArea: (areaId: Id<"startupAreas">) => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreate: (kind: "note" | "task") => void;
}) {
  const { results: tasks, status: tasksStatus } = usePaginatedQuery(
    api.tasks.listForStartup,
    { startupId: startup._id },
    { initialNumItems: 100 },
  );
  const members = useQuery(api.startups.listMembers, { startupId: startup._id, limit: 50 });
  const openTasks = tasks.filter((task) => task.taskStatus !== "done");
  const doneTasks = tasks.filter((task) => task.taskStatus === "done").length;
  const completion = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;
  const taskCountIsPartial = tasksStatus === "CanLoadMore" || tasksStatus === "LoadingMore";
  const firstName = profile.displayName.split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-[88rem] px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header data-workspace-enter className="relative overflow-hidden rounded-[1.35rem] border border-border/75 bg-card px-5 py-6 shadow-[0_28px_64px_-50px_rgba(15,23,42,0.55)] sm:px-7 sm:py-8">
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary/50 to-transparent" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">{startup.name}</p>
            <h1 className="text-2xl font-bold tracking-[-0.04em] sm:text-[2rem]">Zdravo, {firstName}.</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Misli, odluke i obaveze tima sada imaju jedno mesto. Izaberi oblast ili nastavi sledeći zadatak.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onCreate("note")}><Plus /> Nova beleška</Button>
            <Button onClick={() => onCreate("task")}><CheckSquare2 /> Novi zadatak</Button>
          </div>
        </div>
      </header>

      <section data-workspace-enter className="mt-5 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Otvoreno" value={tasksStatus === "LoadingFirstPage" ? null : `${openTasks.length}${taskCountIsPartial ? "+" : ""}`} icon={CheckSquare2} detail={taskCountIsPartial ? "zadataka u prvih 100 rezultata" : "zadataka traži pažnju"} />
        <SummaryCard label="Napredak" value={tasksStatus === "LoadingFirstPage" ? null : `${completion}%${taskCountIsPartial ? "*" : ""}`} icon={Clock3} detail={taskCountIsPartial ? "procena iz prvih 100 zadataka" : "završeno u ovom startupu"}>
          <Progress value={completion} className="mt-3" />
        </SummaryCard>
        <SummaryCard label="Tim" value={members === undefined ? null : members.length} icon={UsersRound} detail="ljudi ima pristup" />
      </section>

      <section data-workspace-enter className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Radni prostori</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.025em]">Oblasti startupa</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {startup.areas.map((area) => {
            const key = area.key as AreaKey;
            const Icon = AREA_ICONS[key];
            return (
              <button key={area._id} type="button" className="group rounded-2xl border border-border/75 bg-card p-4 text-left shadow-[0_16px_32px_-30px_rgba(15,23,42,0.55)] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_22px_42px_-30px_rgba(79,70,229,0.35)]" onClick={() => onOpenArea(area._id)}>
                <span className={cn("grid size-9 place-items-center rounded-xl", AREA_TINTS[key])}><Icon className="size-4.5" /></span>
                <span className="mt-5 flex items-center justify-between gap-2">
                  <span className="font-semibold">{area.label}</span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{AREA_META[key].description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section data-workspace-enter className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.7fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-[-0.025em]">Sledeći zadaci</h2>
            <span className="text-xs text-muted-foreground">Po roku</span>
          </div>
          {tasksStatus === "LoadingFirstPage" ? (
            <div className="space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}</div>
          ) : openTasks.length ? (
            <Card className="overflow-hidden border-border/75 bg-card/80">
              {openTasks.slice(0, 6).map((task) => (
                <button key={task._id} type="button" className="flex min-h-16 w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-accent/35" onClick={() => onOpenPage(task._id)}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary"><CheckSquare2 className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">Rok: {formatShortDate(task.dueDate)}</span></span>
                  <TaskStatusBadge status={(task.taskStatus ?? "backlog") as TaskStatus} />
                </button>
              ))}
            </Card>
          ) : (
            <Card className="flex min-h-44 flex-col items-center justify-center border-dashed bg-card/45 p-6 text-center">
              <Blocks className="size-5 text-primary" /><p className="mt-3 text-sm font-semibold">Sve je čisto</p><p className="mt-1 text-xs text-muted-foreground">Nema otvorenih zadataka u ovom startupu.</p>
            </Card>
          )}
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold tracking-[-0.025em]">Tim</h2><span className="text-xs text-muted-foreground">{members?.length ?? "—"}</span></div>
          <Card className="p-4">
            {members === undefined ? <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-9" />)}</div> : members.map(({ profile: member }) => (
              <div key={member._id} className="flex min-h-11 items-center gap-3 border-b border-border/55 py-2 last:border-0">
                <ProfileAvatar profile={member} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{member.displayName}</span><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span>
                {member.role === "admin" ? <span className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-primary">Admin</span> : null}
              </div>
            ))}
          </Card>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, detail, children }: { label: string; value: number | string | null; icon: React.ComponentType<{ className?: string }>; detail: string; children?: React.ReactNode }) {
  return (
    <Card className="p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-3"><span><span className="block text-xs font-semibold text-muted-foreground">{label}</span>{value === null ? <Skeleton className="mt-2 h-8 w-14" /> : <span className="mt-1 block text-2xl font-bold tracking-[-0.04em]">{value}</span>}</span><span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" /></span></div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>{children}
    </Card>
  );
}
