"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckSquare2, FileSpreadsheet, FileText, LoaderCircle, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  defaultTaskDraft,
  findStartupRow,
  locateStartupRow,
  rowFromStartupTask,
  taskPermissions,
  type StartupTaskLike,
  type StartupTaskSection,
  type StartupTaskStatus,
  type TaskCreateDraft,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@devotion/shared";

import { useCompletionQueue } from "@/components/me/my-day/use-completion-queue";
import type { TaskRowActions } from "@/components/me/task-row";
import { ShortcutProvider } from "@/components/shortcuts/shortcut-provider";
import { Button } from "@/components/ui/button";
import { CommandCenterBody } from "@/components/workspace/command-center-view";
import {
  buildZones,
  COMMAND_CENTER_LIST,
  filterByMember,
  workloadCounts,
  zoneRowCount,
  type CommandCenterAssignee,
  type CommandCenterTask,
  type CommandCenterZone,
} from "@/components/workspace/startup-tasks/command-center-model";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/workspace/startup-tasks/constants";
import { TaskMetaChips } from "@/components/workspace/startup-tasks/task-meta-chips";
import { TaskQuickCreate } from "@/components/workspace/startup-tasks/task-quick-create";
import { useMoveFocus } from "@/components/workspace/startup-tasks/use-move-focus";
import { buildTaskSections, TasksBody, tasksListName, useBoardAllowed, type TasksMode } from "@/components/workspace/tasks-view";
import type { WorkloadEntry, WorkloadFilter } from "@/components/workspace/workload-strip";
import { useFlip } from "@/lib/motion";
import { useTaskListShortcuts } from "@/lib/shortcuts/use-task-list-shortcuts";
import { cn } from "@/lib/utils";

import type { IzlogEkranProps } from "../registry";
import { fakeId } from "../fixtures/ids";
import { IZLOG_PROFILE } from "../fixtures/me";
import { IZLOG_NOW } from "../fixtures/now";
import {
  IZLOG_ST_ASSIGNEES,
  IZLOG_ST_DETAIL,
  IZLOG_ST_MEMBERS,
  IZLOG_ST_MY_TASKS,
  IZLOG_ST_PLANNED,
  IZLOG_ST_STARTUP,
  IZLOG_ST_TASKS,
} from "../fixtures/startup-tasks";
import { IzlogPanel } from "./panel-zadatka";

const noop = () => {};
const ME = IZLOG_PROFILE._id as string;
const STARTUP_MINI = { _id: IZLOG_ST_STARTUP._id, name: IZLOG_ST_STARTUP.name, logoUrl: null };
const AREA_LABELS = new Map(IZLOG_ST_STARTUP.areas.map((area) => [area._id as string, area.label] as const));

type PanelState = { title: string; key: string; creator: boolean; origin: HTMLElement | null; openedAt: number };

/** Radnje reda nad lokalnim podacima (izlog ne zove mutacije). */
function useLocalActions<T extends StartupTaskLike>({
  setTasks,
  setPlanned,
  flip,
  completion,
  onOpen,
  onJoin,
  moved,
}: {
  setTasks: (update: (current: T[]) => T[]) => void;
  setPlanned: (update: (current: Map<string, string>) => Map<string, string>) => void;
  flip: () => void;
  completion: ReturnType<typeof useCompletionQueue>;
  onOpen: (row: TaskRowModel) => void;
  onJoin?: (row: TaskRowModel) => void;
  moved: (row: TaskRowModel, text: string) => void;
}): TaskRowActions {
  const counter = useRef(0);
  const patch = (id: string, change: Partial<StartupTaskLike>) =>
    setTasks((current) => current.map((item) => (item._id === id ? { ...item, ...change } : item)));
  return {
    onToggleDone: completion.toggleDone,
    onTogglePlan: (row) => {
      setPlanned((current) => {
        const next = new Map(current);
        if (next.has(row.key)) next.delete(row.key);
        else next.set(row.key, fakeId("myDayEntries", 900 + (counter.current += 1)));
        return next;
      });
      if (row.planned) toast("Uklonjeno iz Moj dan.", { duration: 8_000, action: { label: "Poništi", onClick: noop } });
      else toast.success("Dodato u Moj dan.");
    },
    onSetDue: (row, due) => {
      if (!row.permissions.due.allowed) return void toast.error(row.permissions.due.reason ?? "");
      flip();
      moved(row, "Rok je promenjen");
      patch(row.id, { dueDate: due });
      toast.success("Rok je promenjen.");
    },
    onSetPriority: (row, priority) => {
      if (!row.permissions.priority.allowed || priority === null) return void toast.error(row.permissions.priority.reason ?? "");
      flip();
      moved(row, "Prioritet je promenjen");
      patch(row.id, { taskPriority: priority });
    },
    onSetStatus: (row, status) => {
      if (status === "done") return completion.toggleDone(row, true);
      if (!row.permissions.status.allowed) return void toast.error(row.permissions.status.reason ?? "");
      flip();
      moved(row, "Status je promenjen");
      patch(row.id, { taskStatus: status });
    },
    onJoin,
    onOpen,
  };
}

/** Komandni centar u izlogu: zone, opterećenje, radnje u redu, panel, prečice. */
function IzlogKomandniCentar({ initial = IZLOG_ST_TASKS, loading = false }: { initial?: CommandCenterTask[]; loading?: boolean }) {
  const [tasks, setTasks] = useState<CommandCenterTask[]>(initial);
  const [assignees, setAssignees] = useState(IZLOG_ST_ASSIGNEES);
  const [planned, setPlanned] = useState(IZLOG_ST_PLANNED);
  const [memberFilter, setMemberFilter] = useState<WorkloadFilter>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const zonesRef = useRef<CommandCenterZone[]>([]);
  const { capture } = useFlip(listRef);
  const flip = () => {
    if (zoneRowCount(zonesRef.current) <= STARTUP_FLIP_MAX_ROWS) capture();
  };
  const completion = useCompletionQueue({
    listRef,
    locate: (key) => locateStartupRow(COMMAND_CENTER_LIST, zonesRef.current, key),
    flipCapture: flip,
    commit: async (row, done, previous) =>
      setTasks((current) =>
        current.map((item) =>
          item._id === row.id
            ? { ...item, taskStatus: done ? "done" : previous && previous !== "open" && previous !== "done" ? previous : "next" }
            : item,
        ),
      ),
  });
  const move = useMoveFocus(listRef, completion.announcement);
  const actions = useLocalActions<CommandCenterTask>({
    setTasks,
    setPlanned,
    flip,
    completion,
    moved: move.moved,
    onOpen: (row) => {
      const origin = listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
      setPanel({ title: row.title, key: row.key, creator: row.permissions.priority.allowed, origin, openedAt: performance.now() });
      setPanelOpen(true);
    },
    onJoin: (row) => {
      setAssignees((current) => {
        const next = new Map(current);
        const people: CommandCenterAssignee[] = next.get(row.id) ?? [];
        next.set(row.id, [...people, { profileId: ME, displayName: IZLOG_PROFILE.displayName, avatarUrl: null }]);
        return next;
      });
      toast.success("Sad si na zadatku.");
    },
  });

  const visible = useMemo(() => filterByMember(tasks, memberFilter, assignees), [tasks, memberFilter, assignees]);
  const zones = useMemo(
    () =>
      buildZones(visible, {
        now: IZLOG_NOW,
        profileId: ME,
        startup: STARTUP_MINI,
        areaLabels: AREA_LABELS,
        assigneesByTaskId: assignees,
        plannedKeys: planned,
        holds: completion.holds,
        pending: completion.pending,
      }),
    [visible, assignees, planned, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    zonesRef.current = zones;
  });
  const open = tasks.filter((item) => item.taskStatus !== "done");
  const workload: WorkloadEntry[] = workloadCounts(
    open,
    IZLOG_ST_MEMBERS.map((member) => member._id),
    assignees,
    IZLOG_NOW,
  ).map((count) => {
    const member = IZLOG_ST_MEMBERS.find((item) => item._id === count.key);
    return { ...count, name: member?.displayName ?? "Nedodeljeno", avatar: member ?? null };
  });
  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => findStartupRow(zonesRef.current, key),
    actions,
    enabled: !panelOpen,
  });

  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <CommandCenterBody
        startupName={IZLOG_ST_STARTUP.name}
        now={IZLOG_NOW}
        loading={loading}
        totalOpen={open.length}
        filteredTotal={filterByMember(open, memberFilter, assignees).length}
        hasMore={false}
        workload={workload}
        memberFilter={memberFilter}
        onMemberFilter={setMemberFilter}
        zones={zones}
        assigneesByTaskId={assignees}
        laterOpen={laterOpen}
        onLaterOpenChange={setLaterOpen}
        actions={actions}
        listRef={listRef}
        selectedKey={shortcuts.selectedKey}
        activeKey={panelOpen ? (panel?.key ?? null) : null}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        announcement={move.announcement}
        onCreateTask={noop}
      />
      {panel ? (
        <IzlogPanel
          key={`${panel.key}:${panel.openedAt}`}
          kind={panel.creator ? "kreator" : "clan"}
          title={panel.title}
          origin={panel.origin}
          openedAt={panel.openedAt}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          openLabel="full"
        />
      ) : null}
    </div>
  );
}

/** Moji zadaci u startupu — tabla (kartice sa radnjama, prelaz između kolona Flip-om). */
function IzlogTabla() {
  const [tasks, setTasks] = useState<StartupTaskLike[]>(IZLOG_ST_MY_TASKS);
  const [planned, setPlanned] = useState(IZLOG_ST_PLANNED);
  const [chosenMode, setMode] = useState<TasksMode>("board");
  // Kao kontejner: ispod `md` Zadaci su lista (K07 §5.3).
  const mode: TasksMode = useBoardAllowed() ? chosenMode : "list";
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<StartupTaskSection[]>([]);
  const modeRef = useRef(mode);
  const { capture } = useFlip(scopeRef);
  const flip = () => {
    if (sectionsRef.current.reduce((sum, section) => sum + section.rows.length, 0) <= STARTUP_FLIP_MAX_ROWS) capture();
  };
  const completion = useCompletionQueue({
    listRef: scopeRef,
    locate: (key) => locateStartupRow(tasksListName(modeRef.current), sectionsRef.current, key),
    flipCapture: flip,
    commit: async (row, done, previous) =>
      setTasks((current) =>
        current.map((item) =>
          item._id === row.id
            ? { ...item, taskStatus: done ? "done" : previous && previous !== "open" && previous !== "done" ? previous : "next" }
            : item,
        ),
      ),
  });
  const move = useMoveFocus(scopeRef, completion.announcement);
  const actions = useLocalActions<StartupTaskLike>({
    setTasks,
    setPlanned,
    flip,
    completion,
    moved: move.moved,
    onOpen: (row) => {
      const origin = scopeRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
      setPanel({ title: row.title, key: row.key, creator: row.permissions.priority.allowed, origin, openedAt: performance.now() });
      setPanelOpen(true);
    },
  });
  const rows = useMemo(
    () =>
      tasks.map((item) =>
        rowFromStartupTask(item, {
          profileId: ME,
          startup: STARTUP_MINI,
          areaLabels: AREA_LABELS,
          assigneeIds: null,
          assumeAssignee: true,
          plannedKeys: planned,
        }),
      ),
    [tasks, planned],
  );
  const sections = useMemo(
    () => buildTaskSections(rows, mode, completion.holds, completion.pending),
    [rows, mode, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    sectionsRef.current = sections;
    modeRef.current = mode;
  });
  const shortcuts = useTaskListShortcuts({
    listRef: scopeRef,
    getRow: (key) => findStartupRow(sectionsRef.current, key),
    actions,
    enabled: !panelOpen,
  });

  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <TasksBody
        filter={{ value: "moji", members: [], onChange: noop }}
        now={IZLOG_NOW}
        loading={false}
        count={rows.length}
        mode={mode}
        onModeChange={setMode}
        sections={sections}
        actions={actions}
        scopeRef={scopeRef}
        selectedKey={shortcuts.selectedKey}
        activeKey={panelOpen ? (panel?.key ?? null) : null}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        announcement={move.announcement}
        onCreateTask={noop}
        loadMore={null}
      />
      {panel ? (
        <IzlogPanel
          key={`${panel.key}:${panel.openedAt}`}
          kind={panel.creator ? "kreator" : "clan"}
          title={panel.title}
          origin={panel.origin}
          openedAt={panel.openedAt}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          openLabel="full"
        />
      ) : null}
    </div>
  );
}

const KINDS = [
  { value: "note", label: "Beleška", icon: FileText },
  { value: "task", label: "Zadatak", icon: CheckSquare2 },
  { value: "file", label: "Fajl", icon: Paperclip },
  { value: "table", label: "Tabela", icon: FileSpreadsheet },
] as const;

/**
 * „Nova stranica → Zadatak" u izlogu: isti sadržaj kao u dijalogu (vrsta,
 * naslov, čipovi, „Više opcija"); Enter „pravi" zadatak i vraća čipove na
 * podrazumevane vrednosti.
 */
function IzlogBrzoPravljenje() {
  const initial = () =>
    defaultTaskDraft({ profileId: ME, areas: IZLOG_ST_STARTUP.areas, rememberedAreaId: IZLOG_ST_STARTUP.areas[1]._id });
  const [draft, setDraft] = useState<TaskCreateDraft>(initial);
  const [title, setTitle] = useState("Objava za otvaranje u Novom Sadu");
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto w-full max-w-2xl">
      <form
        className="desk-surface overflow-hidden rounded-2xl border bg-background"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim() || busy) return;
          setBusy(true);
          window.setTimeout(() => {
            setBusy(false);
            toast.success("Zadatak je kreiran/a.", {
              duration: 8_000,
              action: { label: "Poništi", onClick: noop },
              cancel: { label: "Otvori", onClick: noop },
            });
            setTitle("");
            setDraft(initial());
            setMoreOpen(false);
          }, 300);
        }}
      >
        <header className="border-b border-border/70 px-5 py-5 sm:px-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" aria-hidden="true" />
            </span>
            Nova stranica
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Dodaješ sadržaj u {IZLOG_ST_STARTUP.name}.</p>
        </header>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <fieldset className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-1 sm:grid-cols-4">
            <legend className="sr-only">Vrsta stranice</legend>
            {KINDS.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
                  value === "task" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input type="radio" name="izlog-kind" value={value} checked={value === "task"} readOnly className="sr-only" />
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </label>
            ))}
          </fieldset>
          <TaskQuickCreate
            now={IZLOG_NOW}
            profileId={ME}
            title={title}
            onTitleChange={setTitle}
            draft={draft}
            onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            areas={IZLOG_ST_STARTUP.areas}
            areaLocked={false}
            members={IZLOG_ST_MEMBERS}
            moreOpen={moreOpen}
            onMoreOpenChange={setMoreOpen}
            disabled={busy}
            autoFocus={false}
          />
        </div>
        <footer className="flex justify-end gap-2 border-t border-border/70 bg-background/95 px-5 py-4 sm:px-6">
          <Button type="button" variant="ghost" disabled={busy}>
            Otkaži
          </Button>
          <Button type="submit" disabled={busy || title.trim().length === 0}>
            {busy ? <LoaderCircle className="animate-spin" /> : <CheckSquare2 className="size-4" />} Kreiraj
          </Button>
        </footer>
      </form>
    </div>
  );
}

/** Detalj zadatka: čipovi umesto `Select`-ova; ne-kreator vidi zaključane čipove sa razlogom. */
function IzlogDetaljKartica({ creator }: { creator: boolean }) {
  const [meta, setMeta] = useState({
    status: IZLOG_ST_DETAIL.status as StartupTaskStatus,
    priority: IZLOG_ST_DETAIL.priority as TaskPriorityKey,
    dueDate: IZLOG_ST_DETAIL.dueDate as number | null,
    assignees: IZLOG_ST_DETAIL.assignees,
  });
  const isSelf = meta.assignees.some((person) => person._id === ME);
  const permissions = taskPermissions({ kind: "task", isCreator: creator, isAssignee: isSelf });
  return (
    <article className="desk-surface rounded-2xl border bg-card">
      <header className="border-b border-border/65 px-5 pb-5 pt-5">
        <p className="text-xs font-medium text-muted-foreground">{creator ? "Ti si kreator" : "Ti si izvršilac"}</p>
        <h2 className="mt-1 text-xl font-bold tracking-[-0.03em]">{IZLOG_ST_DETAIL.title}</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {IZLOG_ST_DETAIL.areaLabel} · kreirao/la {creator ? IZLOG_PROFILE.displayName : IZLOG_ST_DETAIL.creatorName}
        </p>
        <div className="mt-5 rounded-xl border border-border/65 bg-muted/25 p-3">
          <TaskMetaChips
            now={IZLOG_NOW}
            status={meta.status}
            priority={meta.priority}
            dueDate={meta.dueDate}
            assignees={meta.assignees}
            members={IZLOG_ST_MEMBERS}
            permissions={permissions}
            isSelfAssigned={isSelf}
            onChange={(change) => {
              setMeta((current) => ({
                ...current,
                ...(change.status === undefined ? {} : { status: change.status }),
                ...(change.priority === undefined ? {} : { priority: change.priority }),
                ...(change.dueDate === undefined ? {} : { dueDate: change.dueDate }),
                ...(change.assigneeProfileIds === undefined
                  ? {}
                  : { assignees: IZLOG_ST_MEMBERS.filter((person) => change.assigneeProfileIds?.includes(person._id)) }),
              }));
              toast.success("Zadatak je ažuriran.");
            }}
            onJoin={() => setMeta((current) => ({ ...current, assignees: [...current.assignees, IZLOG_ST_MEMBERS[0]] }))}
            onLeave={() => setMeta((current) => ({ ...current, assignees: current.assignees.filter((person) => person._id !== ME) }))}
            onDenied={(reason) => toast.error(reason)}
          />
        </div>
      </header>
      <div className="space-y-4 px-5 py-5">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Instrukcije</h3>
          <p className="mt-2 text-sm leading-6 text-foreground/85">
            Proći kupovinu sa karticom i gotovinom na dva Android telefona; zapisati svaki korak koji traje duže od 2 s.
          </p>
        </div>
      </div>
    </article>
  );
}

function IzlogDetalj() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <IzlogDetaljKartica creator={false} />
      <IzlogDetaljKartica creator />
    </div>
  );
}

/** Zadaci u startupu (K17): Komandni centar sa radnjama (i prazan / učitavanje), tabla, brzo pravljenje, detalj sa čipovima. */
export default function ZadaciStartupEkran({ varijanta }: IzlogEkranProps) {
  if (varijanta === "brzo-pravljenje") return <IzlogBrzoPravljenje />;
  if (varijanta === "detalj") return <IzlogDetalj />;
  return (
    <ShortcutProvider>
      {varijanta === "tabla" ? (
        <IzlogTabla />
      ) : (
        <IzlogKomandniCentar
          key={varijanta}
          initial={varijanta === "prazan" ? [] : IZLOG_ST_TASKS}
          loading={varijanta === "ucitavanje"}
        />
      )}
    </ShortcutProvider>
  );
}
