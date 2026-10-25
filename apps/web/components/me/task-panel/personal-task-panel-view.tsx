"use client";

import { useId, useLayoutEffect, useRef, useState, type Ref } from "react";
import { ArrowRightLeft, LoaderCircle, Trash2 } from "lucide-react";
import type { TaskPriorityKey } from "@devotion/shared";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { StartupChip } from "../startup-chip";
import { DueMetaChip, PanelSection, PanelTitle, PlanToggle, PriorityChip } from "./panel-parts";

/** Najviše znakova beleške (server `PERSONAL_TASK_NOTES_MAX`). */
export const PANEL_NOTES_MAX = 5_000;
/** Brojač se pojavljuje blizu granice (plan K07 §1.4: od 4 500). */
const NOTES_COUNTER_FROM = 4_500;

const ALLOWED = { allowed: true, reason: null } as const;

export type MoveTargetStartup = {
  _id: string;
  name: string;
  logoUrl: string | null;
  areas: ReadonlyArray<{ _id: string; label: string }>;
};

export type PersonalTaskPanelChange = {
  title?: string;
  notes?: string | null;
  priority?: TaskPriorityKey | null;
  dueDate?: number | null;
};

export type PersonalTaskPanelViewProps = {
  now: number;
  task: {
    title: string;
    notes: string | null;
    status: "open" | "done";
    priority: TaskPriorityKey | null;
    dueDate: number | null;
  };
  planned: boolean;
  startups: ReadonlyArray<MoveTargetStartup>;
  onChange: (change: PersonalTaskPanelChange) => void;
  onToggleDone: (done: boolean) => void;
  onTogglePlan: () => void;
  /** „Prebaci u startup" (`personalTasks.moveToStartup`); greška ostaje u koraku. */
  onMove: (startupId: string, areaId: string) => Promise<void>;
  onArchive: () => void;
  /** Izlog: korak prebacivanja već otvoren, sa izabranim startupom. */
  initialMove?: { startupId: string; areaId: string | null } | null;
  titleRef?: Ref<HTMLElement>;
};

/** Zaglavlje ličnog zadatka: „Lično", kvačica i naslov (uvek uređiv). */
export function PersonalTaskPanelHeader({
  task,
  onChange,
  onToggleDone,
  titleRef,
}: Pick<PersonalTaskPanelViewProps, "task" | "onChange" | "onToggleDone" | "titleRef">) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <StartupChip startup={null} size="xs" />
        Lično
      </p>
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center">
          <AnimatedCheck checked={task.status === "done"} onCheckedChange={onToggleDone} label={`Završi: ${task.title}`} />
        </span>
        <div className="min-w-0 flex-1">
          <PanelTitle value={task.title} editable onCommit={(title) => onChange({ title })} titleRef={titleRef} />
        </div>
      </div>
    </div>
  );
}

/**
 * Panel ličnog zadatka (plan K07 §1.4): rok i prioritet, „Dodaj u Moj dan",
 * beleška (čuva na blur), „Prebaci u startup" (korak u mestu) i „Obriši"
 * (arhiva sa „Poništi").
 */
export function PersonalTaskPanelView({
  now,
  task,
  planned,
  startups,
  onChange,
  onTogglePlan,
  onMove,
  onArchive,
  initialMove = null,
}: PersonalTaskPanelViewProps) {
  const [moving, setMoving] = useState(initialMove !== null);
  // Posle „Otkaži" fokus se vraća na „Prebaci u startup" (dugme je bilo sklonjeno).
  const moveButtonRef = useRef<HTMLButtonElement>(null);
  const refocusMove = useRef(false);
  useLayoutEffect(() => {
    if (!refocusMove.current || moving) return;
    refocusMove.current = false;
    moveButtonRef.current?.focus({ preventScroll: true });
  }, [moving]);
  const moveBlocked =
    task.status === "done"
      ? "Završen zadatak se ne prebacuje u startup."
      : startups.length === 0
        ? "Još nisi ni u jednom startupu."
        : null;
  const moveReasonId = useId();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <DueMetaChip value={task.dueDate} now={now} perm={ALLOWED} onChange={(dueDate) => onChange({ dueDate })} />
        <PriorityChip value={task.priority} perm={ALLOWED} allowNone onChange={(priority) => onChange({ priority })} />
        <PlanToggle planned={planned} onToggle={onTogglePlan} />
      </div>

      <NotesSection value={task.notes} onSave={(notes) => onChange({ notes })} />

      {moving ? (
        <MoveToStartupStep
          title={task.title}
          startups={startups}
          initial={initialMove}
          onCancel={() => {
            refocusMove.current = true;
            setMoving(false);
          }}
          onMove={onMove}
        />
      ) : (
        <div className="space-y-2 border-t pt-4">
          <div className="flex flex-wrap gap-2">
            {/* E15: onemogućeno je `aria-disabled` sa vidljivim razlogom, ne `disabled`. */}
            <Button
              ref={moveButtonRef}
              type="button"
              variant="outline"
              className="rounded-full aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground pointer-coarse:h-11"
              aria-disabled={moveBlocked ? true : undefined}
              aria-describedby={moveBlocked ? moveReasonId : undefined}
              onClick={() => {
                if (!moveBlocked) setMoving(true);
              }}
            >
              <ArrowRightLeft aria-hidden="true" />
              Prebaci u startup
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-destructive hover:text-destructive pointer-coarse:h-11"
              onClick={onArchive}
            >
              <Trash2 aria-hidden="true" />
              Obriši
            </Button>
          </div>
          {moveBlocked ? (
            <p id={moveReasonId} className="text-xs text-muted-foreground">
              {moveBlocked}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NotesSection({ value, onSave }: { value: string | null; onSave: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused) setDraft(value ?? "");
  }
  return (
    <PanelSection
      title="Beleška"
      aside={
        draft.length >= NOTES_COUNTER_FROM ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {draft.length}/{PANEL_NOTES_MAX}
          </span>
        ) : null
      }
    >
      <Textarea
        value={draft}
        maxLength={PANEL_NOTES_MAX}
        aria-label="Beleška"
        placeholder="Dodaj belešku…"
        onFocus={() => setFocused(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setFocused(false);
          const next = draft.trim() ? draft : null;
          if ((next ?? null) !== (value ?? null)) onSave(next);
        }}
        className="min-h-28 rounded-xl bg-card text-sm leading-6"
      />
    </PanelSection>
  );
}

/**
 * „Prebaci u startup" (D12): startup → oblast → potvrda. Bez „Poništi":
 * zadatak postaje stranica u startupu i dodeljuje se tebi.
 */
export function MoveToStartupStep({
  title,
  startups,
  initial,
  onCancel,
  onMove,
}: {
  title: string;
  startups: ReadonlyArray<MoveTargetStartup>;
  initial: { startupId: string; areaId: string | null } | null;
  onCancel: () => void;
  onMove: (startupId: string, areaId: string) => Promise<void>;
}) {
  const [startupId, setStartupId] = useState<string | null>(initial?.startupId ?? null);
  const startup = startups.find((item) => item._id === startupId) ?? null;
  const [areaId, setAreaId] = useState<string | null>(initial?.areaId ?? startup?.areas[0]?._id ?? null);
  const area = startup?.areas.find((item) => item._id === areaId) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  const startupLabelId = useId();
  const areaLabelId = useId();
  // Dugme koje je otvorilo korak nestaje: fokus ide na prvi izbor.
  const firstFieldRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    firstFieldRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = async () => {
    if (!startup || !area || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMove(startup._id, area._id);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Zadatak nije prebačen. Pokušaj ponovo.");
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-2xl border bg-card p-4">
      <h3 id={headingId} className="text-sm font-semibold">
        Prebaci u startup
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span id={startupLabelId} className="text-xs font-medium text-muted-foreground">
            Startup
          </span>
          <Select
            value={startupId ?? ""}
            onValueChange={(next) => {
              setStartupId(next);
              setAreaId(startups.find((item) => item._id === next)?.areas[0]?._id ?? null);
              setError(null);
            }}
          >
            <SelectTrigger ref={firstFieldRef} aria-labelledby={startupLabelId} className="h-10 rounded-xl bg-background pointer-coarse:h-11">
              <SelectValue placeholder="Izaberi startup" />
            </SelectTrigger>
            <SelectContent>
              {startups.map((item) => (
                <SelectItem key={item._id} value={item._id}>
                  <span className="flex items-center gap-2">
                    <StartupChip startup={item} size="xs" />
                    {item.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span id={areaLabelId} className="text-xs font-medium text-muted-foreground">
            Oblast
          </span>
          <Select value={areaId ?? ""} onValueChange={setAreaId} disabled={!startup || startup.areas.length === 0}>
            <SelectTrigger aria-labelledby={areaLabelId} className="h-10 rounded-xl bg-background pointer-coarse:h-11">
              <SelectValue placeholder="Izaberi oblast" />
            </SelectTrigger>
            <SelectContent>
              {startup?.areas.map((item) => (
                <SelectItem key={item._id} value={item._id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {startup && startup.areas.length === 0 ? (
        <p role="status" className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          Ovaj startup još nema oblasti — dodaj ih u startupu.
        </p>
      ) : null}
      {startup && area ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Zadatak „{title}“ prelazi u {startup.name} · {area.label} i dodeljuje se tebi. Ovo ne može da se poništi.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Otkaži
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={!startup || !area || busy}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRightLeft aria-hidden="true" />}
          Prebaci
        </Button>
      </div>
    </section>
  );
}
