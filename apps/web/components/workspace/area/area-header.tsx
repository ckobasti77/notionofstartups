"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, LoaderCircle, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PAGE_KIND_KEYS, PAGE_KIND_META, type PageKind } from "@/lib/page-kinds";

import type { AreaTab } from "../types";
import { AREA_TABS } from "../workspace-route";
import { AREA_LABEL_MAX, AREA_TAB_LABELS, validateAreaLabel } from "./area-model";

export type AreaHeaderProps = {
  label: string;
  /** „12 stranica · 8 zadataka"; `null` dok brojevi stižu. */
  meta: string | null;
  /** Brojevi uz kartice („8", „99+"); `null` = bez broja. */
  tabCounts: Partial<Record<AreaTab, string | null>>;
  /** Isti brojevi rečima za čitač ekrana („8 zadataka"). */
  tabCountLabels?: Partial<Record<AreaTab, string | null>>;
  /** Preimenovanje (svaki član, `startups.updateArea`); `true` = sačuvano. */
  onRename: ((label: string) => Promise<boolean>) | null;
  onCreate: (kind: PageKind) => void;
};

/**
 * Zaglavlje oblasti (K07 §5.5): naziv sa „Preimenuj oblast", broj stranica i
 * zadataka, „Nova stranica" sa izborom vrste i red kartica ispod. Mora biti
 * unutar `Tabs` (red kartica je `TabsList`).
 */
export function AreaHeader({ label, meta, tabCounts, tabCountLabels, onRename, onCreate }: AreaHeaderProps) {
  return (
    <header data-workspace-enter className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <AreaTitle label={label} meta={meta} onRename={onRename} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus aria-hidden="true" />
              Nova stranica
              <ChevronDown className="-mr-1 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {PAGE_KIND_KEYS.map((kind) => {
              const Icon = PAGE_KIND_META[kind].icon;
              return (
                <DropdownMenuItem key={kind} onSelect={() => onCreate(kind)}>
                  <Icon className="text-muted-foreground" aria-hidden="true" />
                  {PAGE_KIND_META[kind].label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TabsList variant="line" aria-label="Prikaz oblasti" className="mt-4 w-full">
        {AREA_TABS.map((tab) => {
          const count = tabCounts[tab];
          const spoken = tabCountLabels?.[tab];
          return (
            <TabsTrigger key={tab} value={tab}>
              {AREA_TAB_LABELS[tab]}
              {count ? (
                <>
                  <span aria-hidden={spoken ? true : undefined} className="font-normal tabular-nums text-muted-foreground">
                    {count}
                  </span>
                  {spoken ? <span className="sr-only">, {spoken}</span> : null}
                </>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </header>
  );
}

/** Naziv oblasti; olovka otvara polje u mestu (Enter čuva, Esc odustaje). */
function AreaTitle({
  label,
  meta,
  onRename,
}: {
  label: string;
  meta: string | null;
  onRename: AreaHeaderProps["onRename"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Dva brza Enter-a ne smeju da pošalju dva preimenovanja (stanje stiže tek posle rendera).
  const busyRef = useRef(false);
  const pencilRef = useRef<HTMLButtonElement>(null);
  // Polje je zatvoreno (Esc, sačuvano): kasni blur pri uklanjanju ne sme da čuva.
  const closedRef = useRef(false);
  const errorId = useId();

  function start() {
    closedRef.current = false;
    setDraft(label);
    setError(null);
    setEditing(true);
  }

  function stop(returnFocus: boolean) {
    closedRef.current = true;
    setEditing(false);
    setError(null);
    // Sa tastature fokus se vraća na olovku (polje nestaje); klik negde drugde ga ne krade.
    if (returnFocus) window.requestAnimationFrame(() => pencilRef.current?.focus());
  }

  async function commit(fromBlur: boolean) {
    if (busyRef.current || !onRename || closedRef.current) return;
    const checked = validateAreaLabel(draft);
    if (!checked.ok) {
      // Napuštanje praznog polja vraća stari naziv; Enter kaže zašto ne može.
      if (fromBlur) stop(false);
      else setError(checked.message);
      return;
    }
    if (checked.label === label) {
      stop(!fromBlur);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const saved = await onRename(checked.label);
    busyRef.current = false;
    setBusy(false);
    if (saved) stop(!fromBlur);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop(true);
    }
  }

  if (editing && onRename) {
    return (
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => void commit(true)}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            maxLength={AREA_LABEL_MAX}
            aria-label="Naziv oblasti"
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            data-escape-local
            className="h-10 max-w-md text-xl font-semibold tracking-[-0.02em] md:text-xl lg:text-2xl"
          />
          {busy ? (
            <span role="status" className="inline-flex">
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Čuvam naziv</span>
            </span>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      <h1 className="min-w-0 truncate text-xl font-semibold tracking-[-0.02em] lg:text-2xl">{label}</h1>
      {onRename ? (
        <Button
          ref={pencilRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label="Preimenuj oblast"
          onClick={start}
        >
          <Pencil aria-hidden="true" />
        </Button>
      ) : null}
      {meta ? <span className="ml-1 shrink-0 text-sm tabular-nums text-muted-foreground">{meta}</span> : null}
    </div>
  );
}
