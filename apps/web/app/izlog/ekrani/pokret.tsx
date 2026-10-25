"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown01,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  ChevronDown,
  ListRestart,
  Minus,
  PanelRight,
  Plus,
  Repeat,
  RotateCcw,
} from "lucide-react";
import {
  DURATION,
  REDUCED_FADE_MS,
  SPRING,
  SPRING_NAMES,
  springDurationMs,
  springPhysics,
  STAGGER,
  startupInitials,
  startupTone,
} from "@devotion/shared";

import { AnimatedCheck, Collapse, Drawer, MotionStage, NumberRoll, ProgressRing } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/workspace/workspace-ui";
import {
  reducedFade,
  standardTween,
  useEnter,
  useFlip,
  usePress,
  useRailIndicator,
  useReducedMotion,
  useTweenSlots,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

import {
  DEMO_BLOCKED,
  DEMO_CHECKPOINTS,
  DEMO_ENTER_ROWS,
  DEMO_STARTUPS,
  DEMO_TASKS,
  type DemoTask,
} from "../fixtures/pokret";
import { PrimitiviPokreta } from "./pokret-primitivi";

/** Red prelazi u „Završeno" kad se kvačica smiri (bouncy). */
const MOVE_AFTER_MS = springDurationMs(SPRING.bouncy);

const TONE_TINT = [
  "bg-startup-tone-1/15 text-startup-tone-1",
  "bg-startup-tone-2/15 text-startup-tone-2",
  "bg-startup-tone-3/15 text-startup-tone-3",
  "bg-startup-tone-4/15 text-startup-tone-4",
  "bg-startup-tone-5/15 text-startup-tone-5",
  "bg-startup-tone-6/15 text-startup-tone-6",
  "bg-startup-tone-7/15 text-startup-tone-7",
  "bg-startup-tone-8/15 text-startup-tone-8",
] as const;

const TONE_SOLID = [
  "bg-startup-tone-1 text-background",
  "bg-startup-tone-2 text-background",
  "bg-startup-tone-3 text-background",
  "bg-startup-tone-4 text-background",
  "bg-startup-tone-5 text-background",
  "bg-startup-tone-6 text-background",
  "bg-startup-tone-7 text-background",
  "bg-startup-tone-8 text-background",
] as const;

const numberFormat = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 2 });

/** Srpska množina: 1, 21… → one; 2–4, 22–24… → few; ostalo (i 11–14) → many. */
function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function StartupChip({ name, solid = false, className }: { name: string; solid?: boolean; className?: string }) {
  const tone = startupTone(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[30%] font-bold leading-none tracking-[-0.02em]",
        solid ? TONE_SOLID[tone] : TONE_TINT[tone],
        className,
      )}
    >
      {startupInitials(name)}
    </span>
  );
}

function Primerak({
  naziv,
  kod,
  opis,
  spec,
  className,
  children,
}: {
  naziv: string;
  kod: string;
  opis: string;
  spec?: string;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn("desk-surface flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5", className)}
    >
      <header className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold tracking-[-0.02em]">
            {naziv}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{opis}</p>
        </div>
        <code className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
          {kod}
        </code>
      </header>
      {children}
      {spec ? (
        <p className="mt-auto border-t pt-3 font-mono text-[0.6875rem] leading-5 text-muted-foreground">{spec}</p>
      ) : null}
    </section>
  );
}

// --- Završi zadatak ---------------------------------------------------------

function TaskRow({
  task,
  checked,
  onToggle,
}: {
  task: DemoTask;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  const [initiallyChecked] = useState(checked);
  const strikeRef = useRef<HTMLSpanElement>(null);
  const settled = useRef<boolean | null>(null);
  const play = useTweenSlots();

  // Precrt prolazi sleva nadesno posle kvačice.
  useLayoutEffect(() => {
    if (settled.current === null) {
      settled.current = checked;
      return;
    }
    if (settled.current === checked) return;
    settled.current = checked;
    const strike = strikeRef.current;
    if (!strike) return;
    play("strike", ({ gsap, reduced }) => {
      if (reduced) {
        gsap.set(strike, { scaleX: 1 });
        return gsap.to(strike, { opacity: checked ? 1 : 0, ...reducedFade() });
      }
      gsap.set(strike, { opacity: 1 });
      return gsap.to(strike, { scaleX: checked ? 1 : 0, ...standardTween("base") });
    });
  }, [checked, play]);

  return (
    <li data-flip-id={task.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-muted/60">
      <AnimatedCheck checked={checked} onCheckedChange={onToggle} label={`Završi: ${task.title}`} />
      <span className="min-w-0 flex-1">
        <span className="relative inline-block max-w-full align-middle">
          <span
            title={task.title}
            className={cn("block truncate text-sm transition-colors", checked ? "text-muted-foreground" : "text-foreground")}
          >
            {task.title}
          </span>
          <span
            ref={strikeRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px origin-left bg-muted-foreground"
            style={{ transform: `scaleX(${initiallyChecked ? 1 : 0})` }}
          />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <StartupChip name={task.startup} className="size-5 text-[0.5625rem]" />
        <span className="sr-only @sm:not-sr-only">{task.startup}</span>
      </span>
      <span
        className={cn(
          "w-16 shrink-0 text-right text-xs tabular-nums",
          task.due.startsWith("kasni") && !checked ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {task.due}
      </span>
    </li>
  );
}

function CompleteDemo() {
  const scopeRef = useRef<HTMLDivElement>(null);
  const { capture } = useFlip(scopeRef);
  const [tasks, setTasks] = useState<DemoTask[]>(() => DEMO_TASKS.map((task) => ({ ...task })));
  const [completing, setCompleting] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const timers = useRef(new Map<string, number>());
  // Red se pri prelazu demontira u jednoj listi i montira u drugoj: ako je
  // fokus bio u njemu, vraćamo ga na kvačicu na novom mestu.
  const refocusId = useRef<string | null>(null);

  useEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    refocusId.current = null;
    scopeRef.current
      ?.querySelector<HTMLElement>(`[data-flip-id="${id}"] [role="checkbox"]`)
      ?.focus({ preventScroll: true });
  }, [tasks]);

  const rememberFocus = (id: string) => {
    const row = scopeRef.current?.querySelector(`[data-flip-id="${id}"]`);
    refocusId.current = row?.contains(document.activeElement) ? id : null;
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const withoutId = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };

  const toggle = (task: DemoTask, next: boolean) => {
    if (next) {
      setCompleting((previous) => new Set(previous).add(task.id));
      const timer = window.setTimeout(() => {
        timers.current.delete(task.id);
        rememberFocus(task.id);
        capture();
        setTasks((previous) => previous.map((item) => (item.id === task.id ? { ...item, done: true } : item)));
        setCompleting((previous) => withoutId(previous, task.id));
        setAnnouncement(`Završeno: ${task.title}`);
      }, MOVE_AFTER_MS);
      timers.current.set(task.id, timer);
      return;
    }
    const pending = timers.current.get(task.id);
    if (pending !== undefined) {
      // Predomislio se pre prelaska: red ostaje gde jeste.
      window.clearTimeout(pending);
      timers.current.delete(task.id);
      setCompleting((previous) => withoutId(previous, task.id));
      return;
    }
    rememberFocus(task.id);
    capture();
    setTasks((previous) => previous.map((item) => (item.id === task.id ? { ...item, done: false } : item)));
    setAnnouncement(`Vraćeno u otvoreno: ${task.title}`);
  };

  const reset = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    capture();
    setCompleting(new Set());
    setTasks(DEMO_TASKS.map((task) => ({ ...task })));
  };

  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  return (
    <div ref={scopeRef} className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Otvoreno</h3>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw aria-hidden="true" /> Vrati primer
          </Button>
        </div>
        {open.length > 0 ? (
          <ul className="@container space-y-0.5">
            {open.map((task) => (
              <TaskRow key={task.id} task={task} checked={completing.has(task.id)} onToggle={(next) => toggle(task, next)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">Sve je završeno. Vrati primer za novi krug.</p>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="mb-1.5 flex h-8 items-center px-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Završeno
        </h3>
        {done.length > 0 ? (
          <ul className="@container space-y-0.5">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} checked onToggle={(next) => toggle(task, next)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">Ništa još nije završeno.</p>
        )}
      </div>
    </div>
  );
}

// --- Prelaz prikaza ---------------------------------------------------------

function StageDemo() {
  const [run, setRun] = useState(0);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const replay = (next: -1 | 0 | 1) => {
    setDirection(next);
    setRun((value) => value + 1);
  };
  return (
    <>
      <div role="group" aria-label="Smer ulaza" className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => replay(-1)}>
          <ArrowLeft aria-hidden="true" /> Nazad
        </Button>
        <Button variant="outline" size="sm" onClick={() => replay(0)}>
          <ArrowUp aria-hidden="true" /> Ulaz
        </Button>
        <Button variant="outline" size="sm" onClick={() => replay(1)}>
          Napred <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      <MotionStage as="div" key={run} viewKey={String(run)} direction={direction} className="flex-none rounded-xl border bg-background/70 p-3">
        <div data-workspace-enter className="flex items-center gap-3">
          <StartupChip name="Cluck Rush" solid className="size-8 text-[0.6875rem]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Cluck Rush</p>
            <p className="text-xs text-muted-foreground">Komandni centar</p>
          </div>
        </div>
        <div data-workspace-enter className="mt-3 grid grid-cols-3 gap-2">
          {["Danas 5", "Kasni 2", "Tim 6"].map((label) => (
            <div key={label} className="rounded-lg bg-muted px-2 py-2 text-center text-xs font-medium">
              {label}
            </div>
          ))}
        </div>
        <div data-workspace-enter className="mt-3 h-2 rounded-full bg-muted">
          <div className="h-2 w-3/5 rounded-full bg-primary" />
        </div>
      </MotionStage>
    </>
  );
}

// --- Ulaz liste -------------------------------------------------------------

function EnterDemo() {
  const listRef = useRef<HTMLUListElement>(null);
  const [run, setRun] = useState(0);
  useEnter(listRef, { key: run });
  return (
    <>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setRun((value) => value + 1)}>
        <Repeat aria-hidden="true" /> Ponovi ulaz
      </Button>
      <ul ref={listRef} className="divide-y rounded-xl border bg-background/70">
        {DEMO_ENTER_ROWS.map((row) => (
          <li key={row.id} data-motion-enter className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-medium">{row.title}</span>
            <span className="text-xs text-muted-foreground">{row.meta}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// --- Promena rasporeda ------------------------------------------------------

function ReorderDemo() {
  const listRef = useRef<HTMLUListElement>(null);
  const { capture } = useFlip(listRef);
  const [order, setOrder] = useState<string[]>(() => DEMO_STARTUPS.map((startup) => startup.name));
  const openOf = (name: string) => DEMO_STARTUPS.find((startup) => startup.name === name)?.open ?? 0;
  const apply = (next: string[]) => {
    capture();
    setOrder(next);
  };
  return (
    <>
      <div role="group" aria-label="Redosled" className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => apply([...order].sort((a, b) => a.localeCompare(b, "sr-Latn")))}>
          <ArrowDownAZ aria-hidden="true" /> Po imenu
        </Button>
        <Button variant="outline" size="sm" onClick={() => apply([...order].sort((a, b) => openOf(b) - openOf(a)))}>
          <ArrowDown01 aria-hidden="true" /> Po broju
        </Button>
        <Button variant="outline" size="sm" onClick={() => apply([...order].reverse())}>
          <ListRestart aria-hidden="true" /> Obrni
        </Button>
      </div>
      <ul ref={listRef} className="grid grid-cols-2 gap-2">
        {order.map((name) => (
          <li key={name} data-flip-id={name} className="flex min-w-0 items-center gap-2 rounded-xl border bg-background/70 px-2.5 py-2">
            <StartupChip name={name} className="size-6 text-[0.625rem]" />
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{openOf(name)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// --- Sklopiva sekcija -------------------------------------------------------

function CollapseDemo() {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div className="rounded-xl border bg-background/70">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold hover:bg-muted/60"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 text-muted-foreground transition-transform", open ? "rotate-0" : "-rotate-90")}
          style={{ transitionDuration: `${DURATION.quick}ms` }}
        />
        Blokirano
        <span className="font-normal text-muted-foreground">{DEMO_BLOCKED.length}</span>
      </button>
      <Collapse open={open} id={regionId}>
        <ul className="space-y-1 px-3 pb-3">
          {DEMO_BLOCKED.map((item) => (
            <li key={item.id} className="rounded-lg bg-muted/70 px-3 py-2">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.reason}</p>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}

// --- Brojevi ----------------------------------------------------------------

function NumberDemo() {
  const [value, setValue] = useState(7);
  return (
    <>
      <div className="flex items-center gap-5">
        <NumberRoll
          value={value}
          className="text-4xl font-semibold tracking-[-0.03em]"
          aria-label={`${value} ${plural(value, "nepročitano", "nepročitana", "nepročitanih")}`}
        />
        <span className="relative grid size-10 place-items-center rounded-xl border bg-background/70" aria-hidden="true">
          <Bell className="size-4 text-muted-foreground" />
          {value > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[0.625rem] font-bold leading-4 text-primary-foreground">
              <NumberRoll value={value} cap={99} />
            </span>
          ) : null}
        </span>
      </div>
      <div role="group" aria-label="Promeni broj" className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" aria-label="Umanji za 1" onClick={() => setValue((current) => Math.max(0, current - 1))}>
          <Minus aria-hidden="true" /> 1
        </Button>
        <Button variant="outline" size="sm" aria-label="Uvećaj za 1" onClick={() => setValue((current) => current + 1)}>
          <Plus aria-hidden="true" /> 1
        </Button>
        <Button variant="outline" size="sm" aria-label="Uvećaj za 10" onClick={() => setValue((current) => current + 10)}>
          <Plus aria-hidden="true" /> 10
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setValue(0)}>
          Nula
        </Button>
      </div>
    </>
  );
}

// --- Prsten napretka --------------------------------------------------------

function RingDemo() {
  const total = 5;
  const [doneCount, setDoneCount] = useState(3);
  return (
    <div className="flex items-center gap-5">
      <ProgressRing
        value={doneCount / total}
        size={64}
        strokeWidth={5}
        label="Završeno danas"
        valueText={`${doneCount} od ${total}`}
      >
        <span className="text-sm font-semibold tabular-nums">
          {doneCount}/{total}
        </span>
      </ProgressRing>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Završeno {doneCount} od {total} za danas.
        </p>
        <div role="group" aria-label="Promeni napredak" className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Jedan manje" onClick={() => setDoneCount((value) => Math.max(0, value - 1))}>
            <Minus aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" aria-label="Jedan više" onClick={() => setDoneCount((value) => Math.min(total, value + 1))}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Pritisak ---------------------------------------------------------------

function PressDemo() {
  const press = usePress<HTMLButtonElement>();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button ref={press}>Isplaniraj dan</Button>
      <Button ref={press} variant="outline">
        Prebaci u startup
      </Button>
      <Button ref={press} variant="secondary" size="icon" aria-label="Dodaj zadatak">
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}

// --- Indikator trake + tonovi startupa ---------------------------------------

function RailDemo() {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("ja");
  const indicatorRef = useRailIndicator(railRef, active);
  const selected = DEMO_STARTUPS.find((startup) => startup.name === active);
  const openCount = selected ? selected.open : DEMO_STARTUPS.reduce((sum, startup) => sum + startup.open, 0);
  return (
    <div className="flex items-start gap-4">
      <div ref={railRef} role="group" aria-label="Opseg" className="relative flex flex-col gap-1 rounded-2xl border bg-sidebar p-1">
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 rounded-xl bg-accent ring-1 ring-primary/35"
          style={{ opacity: 0 }}
        />
        <button
          type="button"
          data-rail-key="ja"
          aria-pressed={active === "ja"}
          aria-label="Ja"
          onClick={() => setActive("ja")}
          className="relative grid size-11 place-items-center rounded-xl"
        >
          <span className="grid size-8 place-items-center rounded-[30%] bg-primary text-xs font-bold text-primary-foreground">Ja</span>
        </button>
        {DEMO_STARTUPS.map((startup) => (
          <button
            key={startup.name}
            type="button"
            data-rail-key={startup.name}
            aria-pressed={active === startup.name}
            aria-label={startup.name}
            onClick={() => setActive(startup.name)}
            className="relative grid size-11 place-items-center rounded-xl"
          >
            <StartupChip name={startup.name} solid className="size-8 text-[0.6875rem]" />
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Izabrano</p>
          <p className="truncate text-lg font-semibold tracking-[-0.02em]">{selected ? selected.name : "Ja · Moj dan"}</p>
          <p className="text-sm text-muted-foreground">
            <NumberRoll value={openCount} /> {plural(openCount, "otvoren", "otvorena", "otvorenih")}
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Tonovi startupa">
          {DEMO_STARTUPS.map((startup) => (
            <li key={startup.name} className="flex items-center gap-1.5 rounded-lg border bg-background/70 py-1 pl-1 pr-2 text-xs">
              <StartupChip name={startup.name} className="size-5 text-[0.5625rem]" />
              {startup.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- Panel zadatka ----------------------------------------------------------

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState(() => DEMO_CHECKPOINTS.map((step) => ({ ...step })));
  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border bg-background/70 px-3 py-2">
        <StartupChip name="Cluck Rush" className="size-6 text-[0.625rem]" />
        <span className="min-w-0 flex-1 truncate text-sm">Snimi reel za novi meni</span>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PanelRight aria-hidden="true" /> Otvori
        </Button>
      </div>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Snimi reel za novi meni"
        description="Cluck Rush · Marketing"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Otvori u startupu
            </Button>
            <Button onClick={() => setOpen(false)}>Dodaj u Moj dan</Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status="in_progress" />
          <TaskPriorityBadge priority="high" />
          <span className="text-xs text-muted-foreground">Rok: sutra</span>
        </div>
        <h3 className="mt-6 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Koraci</h3>
        <ul className="mt-2 space-y-0.5">
          {steps.map((step) => (
            <li key={step.id} className="flex min-h-11 items-center gap-3 rounded-xl px-1.5 hover:bg-muted/60">
              <AnimatedCheck
                checked={step.done}
                size="sm"
                label={`Korak: ${step.title}`}
                onCheckedChange={(next) =>
                  setSteps((previous) => previous.map((item) => (item.id === step.id ? { ...item, done: next } : item)))
                }
              />
              <span className={cn("text-sm", step.done && "text-muted-foreground line-through")}>{step.title}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Instrukcije</h3>
        <p className="mt-2 text-sm leading-6">
          Kadar odozgo na sto, prirodno svetlo, bez muzike sa autorskim pravima. Tekst na ekranu kratak: ime jela i cena.
        </p>
      </Drawer>
    </>
  );
}

// --- Rečnik -----------------------------------------------------------------

function VocabularyCard() {
  const reduced = useReducedMotion();
  return (
    <Primerak
      naziv="Rečnik pokreta"
      kod="@devotion/shared"
      opis="Isti brojevi pokreću GSAP na webu i Reanimated na telefonu."
      spec={`stagger ${STAGGER.stepMs} ms · najviše ${STAGGER.maxItems} stavki · smanjen pokret ${REDUCED_FADE_MS} ms`}
    >
      <p
        className={cn(
          "rounded-lg px-3 py-2 text-xs font-medium",
          reduced ? "bg-warning/15 text-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        Smanjen pokret: {reduced ? "uključen — samo neprozirnost" : "isključen"}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">Spring preseti</caption>
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="py-1.5 pr-2 font-medium">Spring</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">odziv</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">
                <span aria-hidden="true">ζ</span>
                <span className="sr-only">prigušenje</span>
              </th>
              <th scope="col" className="py-1.5 pr-2 font-medium">krutost</th>
              <th scope="col" className="py-1.5 font-medium">trajanje</th>
            </tr>
          </thead>
          <tbody>
            {SPRING_NAMES.map((name) => (
              <tr key={name} className="border-b last:border-b-0">
                <th scope="row" className="py-1.5 pr-2 font-mono font-medium">{name}</th>
                <td className="py-1.5 pr-2">{numberFormat.format(SPRING[name].response)} s</td>
                <td className="py-1.5 pr-2">{numberFormat.format(SPRING[name].dampingRatio)}</td>
                <td className="py-1.5 pr-2">{numberFormat.format(springPhysics(SPRING[name]).stiffness)}</td>
                <td className="py-1.5">{springDurationMs(SPRING[name])} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Trajanja: pritisak {DURATION.press} · brzo {DURATION.quick} · osnovno {DURATION.base} · sporo {DURATION.slow} ms
      </p>
    </Primerak>
  );
}

export default function PokretEkran() {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Primitivi web sistema pokreta. Sve je prekidivo i kreće od trenutnog stanja; nijedna animacija ne blokira klik.
        Sa uključenim smanjenim pokretom ostaje samo promena neprozirnosti.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Primerak
          className="md:col-span-2"
          naziv="Završi zadatak"
          kod="AnimatedCheck + useFlip"
          opis="Kvačica se puni i iscrtava, naslov dobija precrt, a kad se kvačica smiri red prelazi u Završeno."
          spec={`puni bouncy ${springDurationMs(SPRING.bouncy)} ms · iscrtavanje ${DURATION.quick} ms · precrt ${DURATION.base} ms · prelaz snappy ${springDurationMs(SPRING.snappy)} ms`}
        >
          <CompleteDemo />
        </Primerak>
        <VocabularyCard />
        <Primerak
          naziv="Prelaz prikaza"
          kod="MotionStage"
          opis="Ulaz glavnog prostora. Sa smerom ulazi bočno, kao pri promeni opsega."
          spec={`gentle ${springDurationMs(SPRING.gentle)} ms · neprozirnost ${DURATION.base} ms`}
        >
          <StageDemo />
        </Primerak>
        <Primerak
          naziv="Ulaz liste"
          kod="useEnter"
          opis="Fade, 8 px nagore i scale 0,98 → 1, sa malim razmakom između stavki."
          spec={`snappy ${springDurationMs(SPRING.snappy)} ms · stagger ${STAGGER.stepMs} ms`}
        >
          <EnterDemo />
        </Primerak>
        <Primerak
          naziv="Promena rasporeda"
          kod="useFlip"
          opis="Stavke doputuju sa starog mesta na novo umesto da skoče."
          spec={`snappy ${springDurationMs(SPRING.snappy)} ms`}
        >
          <ReorderDemo />
        </Primerak>
        <Primerak
          naziv="Sklopiva sekcija"
          kod="Collapse"
          opis="Visina prati sadržaj; zatvoren sadržaj nije dostupan tastaturi."
          spec={`otvaranje smooth ${springDurationMs(SPRING.smooth)} ms · zatvaranje ${DURATION.base} ms`}
        >
          <CollapseDemo />
        </Primerak>
        <Primerak
          naziv="Brojevi"
          kod="NumberRoll"
          opis="Cifra koja se menja se kotrlja u smeru promene; iznad 99 piše 99+."
          spec={`snappy ${springDurationMs(SPRING.snappy)} ms`}
        >
          <NumberDemo />
        </Primerak>
        <Primerak
          naziv="Prsten napretka"
          kod="ProgressRing"
          opis="Puni se mekim springom; čitač ekrana dobija procenat."
          spec={`smooth ${springDurationMs(SPRING.smooth)} ms`}
        >
          <RingDemo />
        </Primerak>
        <Primerak
          naziv="Pritisak"
          kod="usePress"
          opis="Skupi se na pritisak, ne na otpuštanje, i vrati se springom. Radi i sa Space i Enter."
          spec={`${DURATION.press} ms do 0,97 · povratak snappy ${springDurationMs(SPRING.snappy)} ms`}
        >
          <PressDemo />
        </Primerak>
        <Primerak
          naziv="Indikator trake"
          kod="useRailIndicator"
          opis="Indikator klizi do izabranog opsega. Čip startupa nosi ton izveden iz imena."
          spec={`snappy ${springDurationMs(SPRING.snappy)} ms · tonovi --startup-tone-1…8`}
        >
          <RailDemo />
        </Primerak>
        <Primerak
          naziv="Panel zadatka"
          kod="Drawer"
          opis="Ulazi sa desne strane, pozadina se zatamni, fokus ostaje u panelu. Esc zatvara."
          spec={`ulaz smooth ${springDurationMs(SPRING.smooth)} ms · izlaz ${DURATION.base} ms`}
        >
          <DrawerDemo />
        </Primerak>
      </div>
      <PrimitiviPokreta Primerak={Primerak} />
    </div>
  );
}
