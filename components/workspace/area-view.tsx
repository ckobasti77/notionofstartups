"use client";

import { usePaginatedQuery } from "convex/react";
import { CheckSquare2, FilePlus2, FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { AREA_ICONS, AREA_TINTS, EmptyState, TaskStatusBadge } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { AREA_META, formatShortDate, type AreaKey, type TaskStatus } from "@/lib/workspace";

export function AreaView({ startup, areaId, onOpenPage, onCreate }: { startup: StartupWithAreas; areaId: Id<"startupAreas">; onOpenPage: (pageId: Id<"pages">) => void; onCreate: (target: CreatePageTarget) => void }) {
  const area = startup.areas.find((item) => item._id === areaId) ?? startup.areas[0];
  const { results: pages, status, loadMore } = usePaginatedQuery(
    api.pages.listChildren,
    area ? { startupId: startup._id, areaId: area._id, parentPageId: null } : "skip",
    { initialNumItems: 50 },
  );
  if (!area) return <EmptyState title="Oblast nije pronađena" description="Izaberi drugu oblast iz navigacije." />;
  const key = area.key as AreaKey;
  const Icon = AREA_ICONS[key];
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8">
      <header data-workspace-enter className="flex flex-wrap items-end justify-between gap-5 border-b border-border/70 pb-6">
        <div className="flex items-start gap-4"><span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", AREA_TINTS[key])}><Icon className="size-5" /></span><div><p className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{startup.name}</p><h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">{area.label}</h1><p className="mt-2 text-sm text-muted-foreground">{AREA_META[key].description}</p></div></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => onCreate({ areaId: area._id, parentPageId: null, initialKind: "note" })}><FilePlus2 /> Beleška</Button><Button onClick={() => onCreate({ areaId: area._id, parentPageId: null, initialKind: "task" })}><Plus /> Zadatak</Button></div>
      </header>
      <div data-workspace-enter className="mt-6">
        {status === "LoadingFirstPage" ? <div className="space-y-3">{[0,1,2].map((item)=><Skeleton key={item} className="h-20 rounded-xl" />)}</div> : pages.length === 0 ? <EmptyState icon={FilePlus2} title={`Još nema stranica u ${area.label}`} description="Napravi prvu belešku ili zadatak. Kasnije možeš da ih ugnjezdiš koliko god je potrebno." action={<Button onClick={() => onCreate({ areaId: area._id, parentPageId: null })}><Plus /> Prva stranica</Button>} /> : <Card className="threadline overflow-hidden border-border/75 bg-card/80 p-2">{pages.map((page)=><button key={page._id} type="button" className="threadline-item flex min-h-16 w-full items-center gap-3 rounded-xl pr-3 text-left hover:bg-accent/35" onClick={()=>onOpenPage(page._id)}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">{page.kind === "task" ? <CheckSquare2 className="size-4"/> : <FileText className="size-4"/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{page.title}</span><span className="mt-1 block text-xs text-muted-foreground">Izmenjeno {formatShortDate(page.updatedAt)}</span></span>{page.kind === "task" ? <TaskStatusBadge status={(page.taskStatus ?? "backlog") as TaskStatus} /> : null}</button>)}{status === "CanLoadMore" || status === "LoadingMore" ? <Button type="button" variant="ghost" className="mt-1 w-full" disabled={status === "LoadingMore"} onClick={() => loadMore(50)}>{status === "LoadingMore" ? "Učitavam…" : "Učitaj još"}</Button> : null}</Card>}
      </div>
    </div>
  );
}
