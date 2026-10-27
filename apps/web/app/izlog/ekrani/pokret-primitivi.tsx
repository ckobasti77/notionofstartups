"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, FileText, MoreHorizontal, PanelBottom, PanelRight, Plus, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { DURATION, REDUCED_FADE_MS, SPRING, springDurationMs } from "@devotion/shared";

import { Collapse } from "@/components/motion/collapse";
import { FlipGroup } from "@/components/motion/flip-group";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { DEMO_AREAS, DEMO_IDEA_ARRIVAL, DEMO_IDEAS } from "../fixtures/pokret";

/**
 * Izlog K19 — postojeći primitivi aplikacije na istom rečniku pokreta:
 * dijalog, sheet, meniji, toastovi, stablo oblasti i liste koje menja server.
 * `Primerak` dolazi iz ekrana `pokret` (isti okvir kartice).
 */
export type PrimerakComponent = (props: {
  naziv: string;
  kod: string;
  opis: string;
  spec?: string;
  className?: string;
  children: React.ReactNode;
}) => React.ReactNode;

function DialogDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button>Nova oblast</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova oblast</DialogTitle>
            <DialogDescription>Oblast grupiše stranice i zadatke jednog dela startupa.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dijalog ulazi iz 0,96 i nestaje samo neprozirnošću. Klik iza ili Esc ga zatvara odmah, bez čekanja.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Otkaži</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button>Napravi</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SheetDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">
            <PanelRight aria-hidden="true" /> Obaveštenja
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="gap-2">
          <SheetHeader>
            <SheetTitle>Obaveštenja</SheetTitle>
            <SheetDescription>Sheet ulazi sa svoje ivice i izlazi istim putem.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">
            <PanelBottom aria-hidden="true" /> Filteri
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="gap-2 rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filteri</SheetTitle>
            <SheetDescription>Na uskom ekranu filteri dolaze odozdo.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MenuDemo() {
  const [status, setStatus] = useState("in_progress");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Radnje zadatka">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Dodaj u Moj dan</DropdownMenuItem>
          <DropdownMenuItem>Promeni rok</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Arhiviraj</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-40" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="backlog">Neplanirano</SelectItem>
          <SelectItem value="next">Sledeće</SelectItem>
          <SelectItem value="in_progress">U toku</SelectItem>
          <SelectItem value="done">Gotovo</SelectItem>
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Nova stranica">
            <Plus aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Nova stranica</TooltipContent>
      </Tooltip>
    </div>
  );
}

function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Zadatak je završen", {
            description: "Snimi reel za novi meni",
            action: { label: "Poništi", onClick: () => toast("Vraćeno") },
          })
        }
      >
        Uspeh sa „Poništi“
      </Button>
      <Button variant="outline" onClick={() => toast.error("Rok nije sačuvan", { description: "Pokušaj ponovo." })}>
        Greška
      </Button>
      <Button variant="outline" onClick={() => toast("Oblast je preimenovana")}>
        Obično
      </Button>
    </div>
  );
}

function TreeDemo() {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(["o1"]));
  const prefix = useId();
  return (
    <div className="rounded-xl border bg-sidebar p-2">
      {DEMO_AREAS.map((area) => {
        const open = openIds.has(area.id);
        const treeId = `${prefix}-${area.id}`;
        return (
          <div key={area.id}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={treeId}
              onClick={() =>
                setOpenIds((previous) => {
                  const next = new Set(previous);
                  if (next.has(area.id)) next.delete(area.id);
                  else next.add(area.id);
                  return next;
                })
              }
              className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-sm font-medium hover:bg-sidebar-accent/45"
            >
              <ChevronDown aria-hidden="true" className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
              {area.label}
            </button>
            <Collapse open={open} id={treeId} unmountWhenClosed>
              <ul className="space-y-0.5 pb-1 pl-6">
                {area.pages.map((page) => (
                  <li key={page} className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground">
                    <FileText aria-hidden="true" className="size-3.5" />
                    <span className="truncate">{page}</span>
                  </li>
                ))}
              </ul>
            </Collapse>
          </div>
        );
      })}
    </div>
  );
}

function ServerListDemo() {
  const listRef = useRef<HTMLUListElement>(null);
  const [ideas, setIdeas] = useState(() => [...DEMO_IDEAS]);
  const [round, setRound] = useState(0);
  useEnter(listRef, { key: round });
  const sorted = [...ideas].sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title, "sr-Latn"));
  const arrived = ideas.some((idea) => idea.id === DEMO_IDEA_ARRIVAL.id);
  return (
    <>
      <div role="group" aria-label="Promene sa servera" className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={arrived}
          onClick={() => setIdeas((previous) => [...previous, { ...DEMO_IDEA_ARRIVAL }])}
        >
          <Plus aria-hidden="true" /> Stigla ideja
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIdeas([...DEMO_IDEAS]);
            setRound((value) => value + 1);
          }}
        >
          Ponovo učitaj
        </Button>
      </div>
      <ul ref={listRef} className="space-y-1.5">
        <FlipGroup scope={listRef} layoutKey={sorted.map((idea) => idea.id).join("|")} resetKey={String(round)}>
          {sorted.map((idea) => (
            <li
              key={idea.id}
              data-flip-id={idea.id}
              data-motion-enter
              className="flex min-w-0 items-center gap-2 rounded-xl border bg-background/70 px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{idea.title}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 tabular-nums"
                aria-label={`Glasaj za: ${idea.title}. Trenutno ${idea.votes}`}
                onClick={() =>
                  setIdeas((previous) =>
                    previous.map((item) => (item.id === idea.id ? { ...item, votes: item.votes + 2 } : item)),
                  )
                }
              >
                <ThumbsUp aria-hidden="true" /> {idea.votes}
              </Button>
            </li>
          ))}
        </FlipGroup>
      </ul>
    </>
  );
}

export function PrimitiviPokreta({ Primerak }: { Primerak: PrimerakComponent }) {
  return (
    <>
      <h2 className="pt-2 text-sm font-semibold tracking-[-0.01em]">Postojeće površine na istom rečniku (K19)</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Primerak
          naziv="Dijalog"
          kod="ui/dialog"
          opis="Svi dijalozi aplikacije: ulaz iz 0,96, izlaz samo neprozirnošću."
          spec={`ulaz snappy ${springDurationMs(SPRING.snappy)} ms + neprozirnost ${DURATION.quick} ms · izlaz ${DURATION.quick} ms`}
        >
          <DialogDemo />
        </Primerak>
        <Primerak
          naziv="Sheet"
          kod="ui/sheet"
          opis="Mobilni meni, obaveštenja, filteri: ulaz sa svoje ivice, izlaz istim putem."
          spec={`ulaz smooth ${springDurationMs(SPRING.smooth)} ms · izlaz ${DURATION.base} ms · zatamnjenje ${DURATION.base} ms`}
        >
          <SheetDemo />
        </Primerak>
        <Primerak
          naziv="Meni, izbor, tooltip"
          kod="dropdown-menu · select · tooltip"
          opis="Kratko pretapanje i scale 0,98 → 1 iz tačke okidača; zatvaranje je odmah."
          spec={`neprozirnost i scale ${DURATION.quick} ms · izlaz 0 ms`}
        >
          <MenuDemo />
        </Primerak>
        <Primerak
          naziv="Toastovi"
          kod="ui/sonner"
          opis="Izgled iz tokena, ulaz istim springom kao liste. Toast animira samo sonner."
          spec={`put snappy ${springDurationMs(SPRING.snappy)} ms (CSS linear()) · neprozirnost ${DURATION.quick} ms · smanjen ${REDUCED_FADE_MS} ms`}
        >
          <ToastDemo />
        </Primerak>
        <Primerak
          naziv="Stablo oblasti"
          kod="Collapse unmountWhenClosed"
          opis="Oblast se otvara i zatvara visinom; zatvorena ne montira stranice (bez upita)."
          spec={`otvaranje smooth ${springDurationMs(SPRING.smooth)} ms · zatvaranje ${DURATION.base} ms`}
        >
          <TreeDemo />
        </Primerak>
        <Primerak
          naziv="Lista koju menja server"
          kod="FlipGroup"
          opis="Glas ili nova stavka od drugog člana: Flip bez capture() u rukovaocu (ideje, odobrenja)."
          spec={`Flip snappy ${springDurationMs(SPRING.snappy)} ms · nova stavka ${DURATION.quick} ms`}
        >
          <ServerListDemo />
        </Primerak>
      </div>
    </>
  );
}
