"use client";

import { useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { withEntry, withoutHistory } from "@/components/me/my-day/my-day-model";
import { PlanDayDialog } from "@/components/me/plan-day/plan-day-dialog";
import { buildPlanDay } from "@/components/me/plan-day/plan-day-model";
import { Button } from "@/components/ui/button";

import type { IzlogEkranProps } from "../registry";
import { fakeId } from "../fixtures/ids";
import { IZLOG_DAY_BEZ_PREDLOGA, IZLOG_DAY_OBICAN, IZLOG_NOW } from "../fixtures/moj-dan";

/** Isplaniraj dan u izlogu (K10): lokalni podaci, dodavanje i vraćanje rade (Flip i brojač). */
export default function IsplanirajEkran({ varijanta }: IzlogEkranProps) {
  const [open, setOpen] = useState(true);
  const [overview, setOverview] = useState(varijanta === "prazan" ? IZLOG_DAY_BEZ_PREDLOGA : IZLOG_DAY_OBICAN);
  const counter = useRef(0);
  const entry = (refKey: string) => ({
    _id: fakeId("myDayEntries", 700 + (counter.current += 1)),
    dayKey: "2026-10-24",
    refKey,
    position: 0,
  });
  return (
    <div className="flex min-h-[28rem] items-start">
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus aria-hidden="true" />
        Isplaniraj dan
      </Button>
      <PlanDayDialog
        open={open}
        onOpenChange={setOpen}
        now={IZLOG_NOW}
        state={{ status: "ready", model: buildPlanDay(overview, IZLOG_NOW) }}
        onAdd={(row) => setOverview((current) => withEntry(current, entry(row.key)))}
        onCarryOver={(refKeys) =>
          setOverview((current) =>
            refKeys.reduce((next, refKey) => withEntry(next, entry(refKey)), withoutHistory(current, new Set(refKeys))),
          )
        }
        onDismiss={(refKeys) => setOverview((current) => withoutHistory(current, new Set(refKeys)))}
      />
    </div>
  );
}
