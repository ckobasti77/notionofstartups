"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Check,
  ExternalLink,
  Flag,
  Lock,
  MoreHorizontal,
  RotateCcw,
  Sun,
  SunDim,
} from "lucide-react";
import {
  DUE_SHORTCUT_LABELS,
  DUE_SHORTCUTS,
  dueShortcutValue,
  formatDateShort,
  matchDueShortcut,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Perm,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { reducedFade, standardTween, usePress, useTweenSlots } from "@/lib/motion";
import type { RowRequest } from "@/lib/shortcuts/task-list";
import { cn } from "@/lib/utils";

import { DueChip } from "./due-chip";
import { PriorityDot } from "./priority-dot";
import { StartupChip } from "./startup-chip";

/** Radnje reda (plan K07 §1.2). Prezentacija samo javlja nameru; kontejner zove mutacije. */
export type TaskRowActions = {
  onToggleDone: (row: TaskRowModel, done: boolean) => void;
  onTogglePlan: (row: TaskRowModel) => void;
  onSetDue: (row: TaskRowModel, due: number | null) => void;
  onSetPriority: (row: TaskRowModel, priority: TaskPriorityKey | null) => void;
  onOpen: (row: TaskRowModel) => void;
  /** Redosled u „Planirano" (`myDay.reorder`). */
  onMove?: (row: TaskRowModel, direction: -1 | 1) => void;
};

export type TaskRowProps = {
  row: TaskRowModel;
  now: number;
  actions?: TaskRowActions;
  /** Ima li stavka prikaz za otvaranje (od K11 panel zadatka za obe vrste). */
  canOpen?: boolean;
  showStartup?: boolean;
  /** Pomeranje u planu: koje strane su moguće (samo u „Planirano"). */
  movable?: { up: boolean; down: boolean };
  /** Izabran red (prečice `j`/`k`). */
  selected?: boolean;
  /** Panel ovog reda je otvoren (red ostaje istaknut, trenutak 3). */
  active?: boolean;
  /** Prečica `d`/`p` za ovaj red: otvori birač roka ili meni prioriteta. */
  request?: RowRequest | null;
  /**
   * Kolone (Moji zadaci, plan K07 §1.3): na `lg` oblast 120 · status 96 ·
   * rok 104 · prioritet 88; uže — isti podaci u drugom redu. `showStatus`
   * gasi kolonu statusa kad je lista grupisana po statusu.
   */
  columns?: boolean;
  showStatus?: boolean;
  className?: string;
};

/** Stavke menija na dodir ≥ 44 px (globalno pravilo pokriva samo dugmad). */
const touchItem = "pointer-coarse:min-h-11";

function MenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuItem>) {
  return <DropdownMenuItem className={cn(touchItem, className)} {...props} />;
}

const PRIORITIES: ReadonlyArray<TaskPriorityKey> = ["urgent", "high", "medium", "low"];

/** Dugme radnje u redu: vidi se na hover/fokus (miš), na dodir samo „…" (plan K07 §1.2). */
const hoverReveal =
  "md:pointer-fine:opacity-0 md:pointer-fine:group-hover/row:opacity-100 md:pointer-fine:group-focus-within/row:opacity-100 data-[state=open]:opacity-100";
const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted-foreground";

/**
 * Red zadatka ličnog nivoa (pun, K10): kvačica (`AnimatedCheck` + precrt),
 * naslov, čip startupa ili „Lično", oblast, rok, tačka prioriteta i radnje
 * (Moj dan, rok, „…"). Na širokom ekranu jedan red od 44 px, na uskom dva
 * reda (≥ 56 px). Zabranjena radnja je onemogućena sa razlogom (E15), nikad
 * sakrivena bez objašnjenja.
 */
export function TaskRow({
  row,
  now,
  actions,
  canOpen = false,
  showStartup = true,
  movable,
  selected = false,
  active = false,
  request = null,
  columns = false,
  showStatus = true,
  className,
}: TaskRowProps) {
  const statusPerm = row.permissions.status;
  const rootRef = useRef<HTMLDivElement>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  // Prečica `d`/`p` stiže kao nov `nonce` (izvedeno stanje, bez efekta).
  const [seenRequest, setSeenRequest] = useState(request?.nonce ?? 0);
  if (request && request.nonce !== seenRequest) {
    setSeenRequest(request.nonce);
    if (request.kind === "due") setDueOpen(true);
    else setPriorityOpen(true);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!actions?.onMove || !movable || !event.altKey) return;
    if (event.key === "ArrowUp" && movable.up) {
      event.preventDefault();
      actions.onMove(row, -1);
    } else if (event.key === "ArrowDown" && movable.down) {
      event.preventDefault();
      actions.onMove(row, 1);
    }
  };

  const meta = columns ? (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground lg:shrink-0 lg:flex-nowrap lg:gap-0">
      {showStartup ? (
        <StartupChip startup={row.startup} size="xs" showName className="max-w-[11rem] lg:w-[9rem] lg:max-w-[9rem] lg:shrink-0 lg:pr-3" nameClassName="text-xs" />
      ) : null}
      <span className={cn("min-w-0 truncate lg:w-[120px] lg:pr-3", !row.areaLabel && "max-lg:hidden")}>
        {showStartup ? <span aria-hidden="true" className="lg:hidden">· </span> : null}
        {row.areaLabel ?? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Bez oblasti</span>
          </>
        )}
      </span>
      {showStatus ? (
        <span className="shrink-0 whitespace-nowrap lg:w-24 lg:pr-3">
          {showStartup || row.areaLabel ? (
            <span aria-hidden="true" className="lg:hidden">
              ·{" "}
            </span>
          ) : null}
          <span className="sr-only">Status: </span>
          {STATUS_LABELS[row.status]}
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0 lg:w-[104px]">
        <DueChip dueDate={row.dueDate} now={now} done={row.done} />
        <PriorityDot priority={row.priority} className="lg:hidden" />
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 lg:flex lg:w-[88px]">
        {row.priority ? (
          <>
            <PriorityDot priority={row.priority} />
            <span className="sr-only">Prioritet: </span>
            {PRIORITY_LABELS[row.priority]}
          </>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Bez prioriteta</span>
          </>
        )}
      </span>
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:max-w-[52%] md:shrink-0">
      {showStartup ? (
        <StartupChip startup={row.startup} size="xs" showName className="max-w-[11rem]" nameClassName="text-xs" />
      ) : null}
      {row.areaLabel ? (
        <span className="min-w-0 truncate">
          {showStartup ? <span aria-hidden="true">· </span> : null}
          {row.areaLabel}
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-1">
        <DueChip dueDate={row.dueDate} now={now} done={row.done} />
        <PriorityDot priority={row.priority} />
      </span>
    </span>
  );

  return (
    <div
      ref={rootRef}
      data-motion-enter
      data-row-key={row.key}
      data-selected={selected ? "true" : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "group/row relative isolate flex min-h-14 w-full items-start gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60 focus-within:bg-muted/60 data-[selected=true]:bg-muted/60 md:min-h-11 md:items-center md:py-1",
        active && "bg-accent hover:bg-accent focus-within:bg-accent data-[selected=true]:bg-accent",
        className,
      )}
    >
      {/* Podloga „nove stavke": kontejner je pali i gasi (trenutak 4). */}
      <span data-arrive aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-accent opacity-0" />
      <span className="grid size-6 shrink-0 place-items-center md:size-8">
        {statusPerm.allowed ? (
          <AnimatedCheck
            checked={row.done}
            onCheckedChange={(next) => actions?.onToggleDone(row, next)}
            disabled={!actions}
            label={`Završi: ${row.title}`}
          />
        ) : (
          <LockedCheck
            title={row.title}
            reason={statusPerm.reason}
            done={row.done}
            onPress={() => actions?.onToggleDone(row, !row.done)}
          />
        )}
      </span>

      <TitleArea row={row} columns={columns} canOpen={canOpen && Boolean(actions)} onOpen={() => actions?.onOpen(row)}>
        {meta}
      </TitleArea>

      {actions ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-pressed={row.planned}
            aria-label={`Moj dan: ${row.title}`}
            title={row.planned ? "Ukloni iz Moj dan" : "Dodaj u Moj dan"}
            onClick={() => actions.onTogglePlan(row)}
            className={cn(
              iconButton,
              "hidden md:pointer-fine:grid",
              hoverReveal,
              row.planned && "text-primary md:pointer-fine:opacity-100",
            )}
          >
            {row.planned ? <Sun className="size-4" aria-hidden="true" /> : <SunDim className="size-4" aria-hidden="true" />}
          </button>
          <DueButton
            row={row}
            now={now}
            open={dueOpen}
            onOpenChange={setDueOpen}
            rootRef={rootRef}
            onSetDue={(due) => actions.onSetDue(row, due)}
          />
          <MoreMenu
            row={row}
            now={now}
            actions={actions}
            canOpen={canOpen}
            movable={movable}
            onPickDate={() => setDueOpen(true)}
          />
          {priorityOpen && row.permissions.priority.allowed ? (
            <PriorityMenu
              row={row}
              rootRef={rootRef}
              onClose={() => setPriorityOpen(false)}
              onSetPriority={(priority) => actions.onSetPriority(row, priority)}
            />
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/** Fokus na naslov reda (posle birača/menija otvorenog prečicom, kad okidač nije vidljiv). */
function focusRowTitle(rootRef: RefObject<HTMLDivElement | null>) {
  const target =
    rootRef.current?.querySelector<HTMLElement>("[data-row-focus]") ??
    rootRef.current?.querySelector<HTMLElement>("button");
  target?.focus({ preventScroll: true });
}

function isShown(element: Element | null | undefined) {
  return element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).opacity !== "0";
}

/** Tačka uz desnu ivicu reda: birač i meni otvoreni prečicom se postavljaju uz nju. */
const rowAnchorClass = "pointer-events-none absolute bottom-1 right-2 size-px";

/** Naslov + metapodaci; klik otvara stavku kad postoji prikaz. Precrt prolazi sleva nadesno. */
function TitleArea({
  row,
  columns = false,
  canOpen,
  onOpen,
  children,
}: {
  row: TaskRowModel;
  /** Kolone: naslov i podaci u istom redu tek od `lg` (na `md` podaci idu ispod). */
  columns?: boolean;
  canOpen: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const [initiallyDone] = useState(row.done);
  const strikeRef = useRef<HTMLSpanElement>(null);
  const settled = useRef<boolean | null>(null);
  const play = useTweenSlots();

  useLayoutEffect(() => {
    if (settled.current === null) {
      settled.current = row.done;
      return;
    }
    if (settled.current === row.done) return;
    settled.current = row.done;
    const strike = strikeRef.current;
    if (!strike) return;
    play("strike", ({ gsap, reduced }) => {
      if (reduced) {
        gsap.set(strike, { scaleX: 1 });
        return gsap.to(strike, { opacity: row.done ? 1 : 0, ...reducedFade() });
      }
      gsap.set(strike, { opacity: 1 });
      return gsap.to(strike, { scaleX: row.done ? 1 : 0, ...standardTween("base") });
    });
  }, [row.done, play]);

  const body = (
    <>
      <span className={cn("relative min-w-0 max-w-full", columns ? "lg:flex-1" : "md:flex-1")}>
        <span
          title={row.title}
          data-row-title
          className={cn(
            "block truncate text-sm transition-colors",
            row.done ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {row.title}
          {row.done ? <span className="sr-only"> (završeno)</span> : null}
        </span>
        <span
          ref={strikeRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 h-px w-full max-w-full origin-left bg-muted-foreground"
          style={{ transform: `scaleX(${initiallyDone ? 1 : 0})`, opacity: initiallyDone ? 1 : 0 }}
        />
      </span>
      {children}
    </>
  );

  const layout = columns
    ? "flex min-w-0 flex-1 flex-col gap-0.5 py-0.5 text-left lg:flex-row lg:items-center lg:gap-3"
    : "flex min-w-0 flex-1 flex-col gap-0.5 py-0.5 text-left md:flex-row md:items-center md:gap-3";
  if (!canOpen) return <span className={layout}>{body}</span>;
  return (
    <OpenButton className={layout} onOpen={onOpen}>
      {body}
    </OpenButton>
  );
}

/**
 * Naslov koji otvara panel: na pointer-down se „podigne" (`usePress`, 0,97 →
 * snappy, trenutak 3). `data-row-focus` je cilj fokusa za prečice `j`/`k`,
 * a `data-row-title` izvor „leteće kopije" naslova u zaglavlje panela.
 */
function OpenButton({ className, onOpen, children }: { className: string; onOpen: () => void; children: ReactNode }) {
  const pressRef = usePress<HTMLButtonElement>();
  return (
    <button ref={pressRef} type="button" data-row-focus onClick={onOpen} className={cn(className, "rounded-md")}>
      {children}
    </button>
  );
}

/** Kvačica bez dozvole (E15): `aria-disabled`, katanac, razlog u tooltipu i `aria-describedby`. */
function LockedCheck({
  title,
  reason,
  done,
  onPress,
}: {
  title: string;
  reason: string | null;
  done: boolean;
  /** Klik/dodir: kontejner pokaže razlog (tooltip se na dodir ne otvara). */
  onPress: () => void;
}) {
  const reasonId = useId();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-disabled="true"
          aria-label={`Završi: ${title}`}
          aria-describedby={reasonId}
          onClick={(event) => {
            event.preventDefault();
            onPress();
          }}
          className="grid size-6 cursor-not-allowed place-items-center rounded-full"
        >
          <span className="grid size-5 place-items-center rounded-full border-[1.5px] border-dashed border-muted-foreground/70 text-muted-foreground">
            <Lock className="size-2.5" aria-hidden="true" />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  );
}

/**
 * Rok kroz birač datuma (P9, K11): čipovi + kalendar. Okidač se vidi na
 * hover/fokus (miš); prečica `d` i „Datum…" iz menija ga otvaraju i kad
 * okidač nije vidljiv — popover se tada postavlja uz desnu ivicu reda.
 */
function DueButton({
  row,
  now,
  open,
  onOpenChange,
  rootRef,
  onSetDue,
}: {
  row: TaskRowModel;
  now: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  onSetDue: (due: number | null) => void;
}) {
  const perm = row.permissions.due;
  const label = `Rok za ${row.title}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const classes = cn(iconButton, "hidden md:pointer-fine:grid", hoverReveal);
  if (!perm.allowed) return <DisabledAction label={label} reason={perm.reason} className={classes} icon={CalendarClock} />;
  return (
    <DatePicker
      value={row.dueDate}
      now={now}
      onChange={onSetDue}
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      anchor={<span aria-hidden="true" className={rowAnchorClass} />}
      onCloseAutoFocus={(event) => {
        if (isShown(triggerRef.current)) return;
        event.preventDefault();
        focusRowTitle(rootRef);
      }}
    >
      <button ref={triggerRef} type="button" aria-label={label} title="Rok" className={classes}>
        <CalendarClock className="size-4" aria-hidden="true" />
      </button>
    </DatePicker>
  );
}

/** Meni prioriteta otvoren prečicom `p` — postavlja se uz desnu ivicu reda. */
function PriorityMenu({
  row,
  rootRef,
  onClose,
  onSetPriority,
}: {
  row: TaskRowModel;
  rootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSetPriority: (priority: TaskPriorityKey | null) => void;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      modal={false}
    >
      <DropdownMenuTrigger tabIndex={-1} aria-hidden="true" className={cn(rowAnchorClass, "opacity-0")} />
      <DropdownMenuContent
        align="end"
        className="w-48"
        aria-label={`Prioritet: ${row.title}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusRowTitle(rootRef);
        }}
      >
        <DropdownMenuLabel>Prioritet</DropdownMenuLabel>
        <PriorityItems row={row} onSetPriority={onSetPriority} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueItems({
  row,
  now,
  onSetDue,
  onPickDate,
}: {
  row: TaskRowModel;
  now: number;
  onSetDue: (due: number | null) => void;
  /** „Datum…" otvara birač datuma (kalendar). */
  onPickDate?: () => void;
}) {
  // Petkom/subotom/nedeljom dve prečice mogu biti isti dan: kvačica samo na prvoj.
  const selected = matchDueShortcut(row.dueDate, now);
  return (
    <>
      {DUE_SHORTCUTS.map((shortcut) => {
        const value = dueShortcutValue(shortcut, now);
        return (
          <MenuItem key={shortcut} onSelect={() => onSetDue(value)}>
            <span className="flex-1">{DUE_SHORTCUT_LABELS[shortcut]}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{formatDateShort(value)}</span>
            {selected === shortcut ? <Check className="size-3.5" aria-label="izabrano" /> : null}
          </MenuItem>
        );
      })}
      {onPickDate ? (
        <MenuItem onSelect={onPickDate}>
          <CalendarDays aria-hidden="true" />
          Datum…
        </MenuItem>
      ) : null}
      {row.dueDate !== null ? (
        <>
          <DropdownMenuSeparator />
          <MenuItem onSelect={() => onSetDue(null)}>
            <CalendarX2 aria-hidden="true" />
            Bez roka
          </MenuItem>
        </>
      ) : null}
    </>
  );
}

function PriorityItems({ row, onSetPriority }: { row: TaskRowModel; onSetPriority: (priority: TaskPriorityKey | null) => void }) {
  return (
    <>
      {PRIORITIES.map((priority) => (
        <MenuItem key={priority} onSelect={() => onSetPriority(priority)}>
          <span className="flex-1">{PRIORITY_LABELS[priority]}</span>
          {row.priority === priority ? <Check className="size-3.5" aria-label="izabrano" /> : null}
        </MenuItem>
      ))}
      {row.kind === "personal" ? (
        <MenuItem onSelect={() => onSetPriority(null)}>
          <span className="flex-1">Bez prioriteta</span>
          {row.priority === null ? <Check className="size-3.5" aria-label="izabrano" /> : null}
        </MenuItem>
      ) : null}
    </>
  );
}

/**
 * Zabranjena stavka menija (E15): `aria-disabled` (ne `disabled`), pa dobija
 * fokus i čitač ekrana pročita razlog ispod nje; izbor ne radi ništa.
 */
function DeniedItem({ icon: Icon, label, perm }: { icon: typeof Flag; label: string; perm: Perm }) {
  return (
    <MenuItem
      aria-disabled="true"
      onSelect={(event) => event.preventDefault()}
      className="cursor-not-allowed flex-col items-start gap-0.5 focus:bg-muted"
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
        <Lock className="size-3" aria-hidden="true" />
      </span>
      <span className="pl-6 text-xs leading-4 text-muted-foreground">{perm.reason}</span>
    </MenuItem>
  );
}

function MoreMenu({
  row,
  now,
  actions,
  canOpen,
  movable,
  onPickDate,
}: {
  row: TaskRowModel;
  now: number;
  actions: TaskRowActions;
  canOpen: boolean;
  movable?: { up: boolean; down: boolean };
  onPickDate: () => void;
}) {
  const { status, due, priority } = row.permissions;
  // „Datum…": birač se otvara tek kad se meni zatvori, inače bi ga povratak
  // fokusa na „…" odmah zatvorio.
  const pickDate = useRef(false);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={`Radnje: ${row.title}`} title="Radnje" className={cn(iconButton, hoverReveal)}>
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60"
        onCloseAutoFocus={(event) => {
          if (!pickDate.current) return;
          pickDate.current = false;
          event.preventDefault();
          onPickDate();
        }}
      >
        {canOpen ? (
          <MenuItem onSelect={() => actions.onOpen(row)}>
            <ExternalLink aria-hidden="true" />
            Otvori
          </MenuItem>
        ) : null}
        {status.allowed ? (
          <MenuItem onSelect={() => actions.onToggleDone(row, !row.done)}>
            {row.done ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
            {row.done ? "Vrati u otvoreno" : "Završi"}
          </MenuItem>
        ) : (
          <DeniedItem icon={Check} label="Završi" perm={status} />
        )}
        <MenuItem onSelect={() => actions.onTogglePlan(row)}>
          {row.planned ? <SunDim aria-hidden="true" /> : <Sun aria-hidden="true" />}
          {row.planned ? "Ukloni iz Moj dan" : "Dodaj u Moj dan"}
        </MenuItem>
        <DropdownMenuSeparator />
        {due.allowed ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={touchItem}>
              <CalendarClock aria-hidden="true" />
              Rok
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DueItems
                row={row}
                now={now}
                onSetDue={(value) => actions.onSetDue(row, value)}
                onPickDate={() => {
                  pickDate.current = true;
                }}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DeniedItem icon={CalendarClock} label="Rok" perm={due} />
        )}
        {priority.allowed ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={touchItem}>
              <Flag aria-hidden="true" />
              Prioritet
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <PriorityItems row={row} onSetPriority={(value) => actions.onSetPriority(row, value)} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DeniedItem icon={Flag} label="Prioritet" perm={priority} />
        )}
        {movable && actions.onMove ? (
          <>
            <DropdownMenuSeparator />
            <MenuItem disabled={!movable.up} onSelect={() => actions.onMove?.(row, -1)}>
              <ArrowUp aria-hidden="true" />
              Pomeri gore
              <span className="ml-auto text-xs text-muted-foreground">Alt+↑</span>
            </MenuItem>
            <MenuItem disabled={!movable.down} onSelect={() => actions.onMove?.(row, 1)}>
              <ArrowDown aria-hidden="true" />
              Pomeri dole
              <span className="ml-auto text-xs text-muted-foreground">Alt+↓</span>
            </MenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DisabledAction({
  label,
  reason,
  className,
  icon: Icon,
}: {
  label: string;
  reason: string | null;
  className?: string;
  icon: typeof Flag;
}) {
  const reasonId = useId();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          aria-label={label}
          aria-describedby={reasonId}
          onClick={(event) => event.preventDefault()}
          className={cn(className, "cursor-not-allowed")}
        >
          <span className="relative" aria-hidden="true">
            <Icon className="size-4" />
            <Lock className="absolute -bottom-1 -right-1 size-2.5 rounded-sm bg-card" />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  );
}
