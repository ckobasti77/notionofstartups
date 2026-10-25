"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Today } from "@/lib/today";

import type { TaskRowData } from "../task-row";
import { buildMyDay } from "./my-day-model";
import { MyDayView } from "./my-day-view";

export type MyDayContainerProps = {
  today: Today;
  firstName: string | null;
  /** Startup zadatak se otvara u svom startupu (panel zadatka stiže u K11). */
  onOpenTask: (startupId: Id<"startups">, pageId: Id<"pages">) => void;
  onOpenTasks: () => void;
};

/**
 * Tanak kontejner Moj dan (v1): jedna pretplata `myDay.overview` sa istim
 * argumentima kao ljuska (deljena pretplata), grupisanje iz shared paketa.
 * Grešku upita hvata `WorkspaceErrorBoundary` oko kontejnera u ljusci.
 */
export function MyDayContainer({ today, firstName, onOpenTask, onOpenTasks }: MyDayContainerProps) {
  const overview = useQuery(api.myDay.overview, {
    dayKey: today.dayKey,
    doneSince: today.doneSince,
  });
  const model = useMemo(
    () => (overview ? buildMyDay(overview, today.now) : null),
    [overview, today.now],
  );

  return (
    <MyDayView
      now={today.now}
      firstName={firstName}
      state={model ? { status: "ready", model } : { status: "loading" }}
      canOpen={(row: TaskRowData) => row.kind === "task" && row.startup !== null}
      onOpen={(row) => {
        // Id-jevi su prošli kroz shared model kao stringovi; potiču iz `overview`.
        if (row.kind === "task" && row.startup) {
          onOpenTask(row.startup._id as Id<"startups">, row.id as Id<"pages">);
        }
      }}
      onOpenTasks={onOpenTasks}
    />
  );
}
