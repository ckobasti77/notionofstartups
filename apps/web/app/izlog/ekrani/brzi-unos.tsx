"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { dueShortcutValue, type QuickAddDraft } from "@devotion/shared";

import { QuickAddDialog } from "@/components/me/quick-add/quick-add-dialog";
import { Button } from "@/components/ui/button";

import type { IzlogEkranProps } from "../registry";
import { izlogStartupId } from "../fixtures/me";
import { IZLOG_NOW, QUICK_ADD_STARTUPS } from "../fixtures/moj-dan";

const CLUCK_RUSH = izlogStartupId(0);
const MARKETING = QUICK_ADD_STARTUPS[0].areas.find((area) => area.label === "Marketing")!._id;

const VARIJANTE: Record<string, { draft?: Partial<QuickAddDraft>; error?: string }> = {
  licno: {},
  startup: {
    draft: {
      title: "Snimi priču za Instagram o novom meniju",
      destination: { kind: "startup", startupId: CLUCK_RUSH, areaId: MARKETING },
      dueDate: dueShortcutValue("tomorrow", IZLOG_NOW),
    },
  },
  greska: {
    draft: { title: "Platiti račun za internet", destination: { kind: "personal" }, dueDate: null },
    error: "Možeš imati najviše 500 otvorenih ličnih zadataka.",
  },
};

/** Brzi unos u izlogu (K10): dijalog je otvoren; „Dodaj" samo glumi server. */
export default function BrziUnosEkran({ varijanta }: IzlogEkranProps) {
  const [open, setOpen] = useState(true);
  const fixture = VARIJANTE[varijanta] ?? VARIJANTE.licno;
  return (
    <div className="flex min-h-[28rem] items-start">
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Brzi unos
      </Button>
      <QuickAddDialog
        key={varijanta}
        open={open}
        onOpenChange={setOpen}
        now={IZLOG_NOW}
        startups={QUICK_ADD_STARTUPS}
        initialDraft={fixture.draft}
        initialError={fixture.error ?? null}
        onSubmit={() => new Promise((resolve) => window.setTimeout(resolve, 300))}
      />
    </div>
  );
}
