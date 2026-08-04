"use client";

import { useQuery } from "convex/react";
import { Activity, FileClock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StartupWithAreas } from "@/components/workspace/types";
import { EmptyState, ProfileAvatar, formatActivityTime } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";

export function ActivityView({ startup }: { startup: StartupWithAreas }) {
  const activity = useQuery(api.activity.listForStartup, { startupId: startup._id, limit: 50 });
  return <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-5 sm:px-7 lg:px-10 lg:pt-8"><header data-workspace-enter className="mb-6"><p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-primary">{startup.name}</p><h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Aktivnost tima</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Kratak trag važnih promena, bez dodatnog izveštavanja.</p></header><div data-workspace-enter>{activity === undefined ? <div className="space-y-3">{[0,1,2,3].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}</div> : activity.length === 0 ? <EmptyState icon={Activity} title="Još nema aktivnosti" description="Kreiranje stranice, zadatka ili poziva pojaviće se ovde." /> : <Card className="threadline overflow-hidden border-border/75 bg-card/80 p-3">{activity.map((item) => <div key={item._id} className="threadline-item flex min-h-16 items-center gap-3 rounded-xl pr-3 hover:bg-accent/30"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/9 text-primary"><FileClock className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail ? `${item.detail} · ` : ""}{formatActivityTime(item.createdAt)}</span></span>{item.actor ? <ProfileAvatar profile={item.actor} className="size-7" /> : null}</div>)}</Card>}</div></div>;
}

