"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { describeDue, formatDateNumeric } from "@devotion/shared";

import { MetaChipButton } from "@/components/me/meta-chip";
import { DatePicker } from "@/components/ui/date-picker";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW, oktobar } from "../fixtures/now";

/**
 * Birač datuma u izlogu (K11): čip „Rok" otvara popover sa čipovima brzog
 * izbora i kalendarom (ponedeljak prvi, srpski nazivi). Varijante: `otvoren`
 * (bez roka) i `izabran` (sre 28. okt). Izbor zatvara popover; čip ga ponovo
 * otvara.
 */
export default function BiracDatumaEkran({ varijanta }: IzlogEkranProps) {
  const [value, setValue] = useState<number | null>(varijanta === "izabran" ? oktobar(28) : null);
  const [open, setOpen] = useState(true);
  const due = describeDue(value, IZLOG_NOW);
  return (
    <div className="desk-surface min-h-[34rem] rounded-2xl border bg-background p-5 sm:p-8">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Panel zadatka · rok</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DatePicker value={value} now={IZLOG_NOW} onChange={setValue} open={open} onOpenChange={setOpen}>
          <MetaChipButton label="Rok" value={due.label} icon={CalendarClock} ariaLabel={due.ariaLabel} />
        </DatePicker>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {value === null ? "Bez roka" : `Čuva se kao lokalno podne: ${formatDateNumeric(value)}`}
        </p>
      </div>
    </div>
  );
}
