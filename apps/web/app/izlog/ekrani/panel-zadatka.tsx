"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { EMPTY_TASK_FILTERS } from "@devotion/shared";

import { Drawer } from "@/components/motion/drawer";
import { AnimatedCheck } from "@/components/motion/animated-check";
import { CommentList } from "@/components/collab/comment-list";
import { compactComments } from "@/components/collab/collab-model";
import { CommentComposer } from "@/components/collab/comment-composer";
import { CommentsPanel, ShowAllCommentsButton } from "@/components/collab/comments-section";
import { MyTasksView } from "@/components/me/tasks/my-tasks-view";
import { buildMyTasks, buildTaskRows } from "@/components/me/tasks/my-tasks-model";
import {
  PersonalTaskPanelHeader,
  PersonalTaskPanelView,
} from "@/components/me/task-panel/personal-task-panel-view";
import {
  PanelInstructions,
  StartupTaskPanelHeader,
  type StartupTaskPanelChange,
} from "@/components/me/task-panel/startup-task-panel-view";
import { TaskDetailLayout } from "@/components/me/task-panel/task-detail-layout";
import { useTitleFlight } from "@/components/me/task-panel/use-title-flight";

import type { IzlogEkranProps } from "../registry";
import { IZLOG_NOW } from "../fixtures/now";
import { IZLOG_COMMENTS, IZLOG_DOC_MEMBERS, IZLOG_DOC_SELF } from "../fixtures/page-document";
import {
  IZLOG_PANEL_CHECKPOINTS,
  IZLOG_PANEL_PERSONAL,
  IZLOG_PANEL_TASK,
  IZLOG_PEOPLE,
  IZLOG_PERMS_CREATOR,
  IZLOG_PERMS_MEMBER,
  IZLOG_TASK_STARTUPS,
  IZLOG_TASKS_SOURCE,
} from "../fixtures/tasks";

export type IzlogPanelKind = "kreator" | "clan" | "licni" | "prebaci";

const noop = () => {};

/** Kratak pregled koraka (u aplikaciji je to `TaskCheckpointList`, koji traži prijavu). */
export function IzlogCheckpoints({ editable }: { editable: boolean }) {
  const [items, setItems] = useState(IZLOG_PANEL_CHECKPOINTS);
  const done = items.filter((item) => item.completed).length;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {done}/{items.length} završeno
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id} className="flex min-h-10 items-center gap-2 rounded-lg px-1 hover:bg-muted/60">
            <span className="grid size-8 place-items-center">
              <AnimatedCheck
                checked={item.completed}
                onCheckedChange={(checked) =>
                  setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, completed: checked } : entry)))
                }
                label={`Korak: ${item.text}`}
              />
            </span>
            <span className={item.completed ? "text-sm text-muted-foreground line-through" : "text-sm"}>{item.text}</span>
          </li>
        ))}
      </ul>
      {editable ? <p className="pl-1 text-xs text-muted-foreground">Novi korak dodaješ ispod liste.</p> : null}
    </div>
  );
}

const asyncNoop = async () => {};

/** Kompaktni Komentari panela (poslednja tri + „Svi komentari"), isti prezentacioni delovi kao u aplikaciji. */
function IzlogCompactComments() {
  const { shown, hidden } = compactComments(IZLOG_COMMENTS);
  return (
    <div>
      <CommentsPanel
        headingAs="h3"
        count={String(IZLOG_COMMENTS.length)}
        composer={<CommentComposer members={IZLOG_DOC_MEMBERS} selfProfileId={IZLOG_DOC_SELF} onSubmit={asyncNoop} />}
      >
        <CommentList
          state={{ status: "ready", items: shown, loadMore: null }}
          now={IZLOG_NOW}
          members={IZLOG_DOC_MEMBERS}
          selfProfileId={IZLOG_DOC_SELF}
          editingId={null}
          onStartEdit={noop}
          onCancelEdit={noop}
          onSaveEdit={asyncNoop}
          onRemove={noop}
          animateArrivals={false}
        />
        {hidden > 0 ? <ShowAllCommentsButton count={IZLOG_COMMENTS.length} onClick={noop} /> : null}
      </CommentsPanel>
    </div>
  );
}

/**
 * Panel zadatka iz izloga: isti prezentacioni prikazi kao u aplikaciji, sa
 * lokalnim stanjem umesto mutacija. Koristi ga i izlog Mojih zadataka (klik
 * na red otvara panel sa „letećim" naslovom, trenutak 3).
 */
export function IzlogPanel({
  kind,
  open,
  onClose,
  title,
  origin = null,
  openedAt = null,
  openLabel = "startup",
}: {
  kind: IzlogPanelKind;
  open: boolean;
  onClose: () => void;
  /** Panel iz liste u startupu (K17): „Puni prikaz" umesto „Otvori u startupu". */
  openLabel?: "startup" | "full";
  /** Naslov reda (kad se otvara iz liste). */
  title?: string;
  origin?: HTMLElement | null;
  openedAt?: number | null;
}) {
  const [task, setTask] = useState({ ...IZLOG_PANEL_TASK, title: title ?? IZLOG_PANEL_TASK.title });
  const [personal, setPersonal] = useState({ ...IZLOG_PANEL_PERSONAL, title: title ?? IZLOG_PANEL_PERSONAL.title });
  const [assignees, setAssignees] = useState(IZLOG_PEOPLE.slice(0, 2));
  const [planned, setPlanned] = useState(kind === "licni");
  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  useTitleFlight({ origin, target: titleEl, flightKey: open && openedAt !== null ? `${kind}:${openedAt}` : null, startedAt: openedAt });

  const isPersonal = kind === "licni" || kind === "prebaci";
  const permissions = kind === "clan" ? IZLOG_PERMS_MEMBER : IZLOG_PERMS_CREATOR;
  const changeTask = (change: StartupTaskPanelChange) =>
    setTask((current) => ({
      ...current,
      ...(change.status === undefined ? {} : { status: change.status }),
      ...(change.priority === undefined ? {} : { priority: change.priority }),
      ...(change.dueDate === undefined ? {} : { dueDate: change.dueDate }),
      ...(change.instructions === undefined ? {} : { instructions: change.instructions }),
    }));

  const header = isPersonal ? (
    <PersonalTaskPanelHeader
      task={personal}
      onChange={(change) => setPersonal((current) => ({ ...current, ...change }))}
      onToggleDone={(done) => setPersonal((current) => ({ ...current, status: done ? "done" : "open" }))}
      titleRef={setTitleEl}
    />
  ) : (
    <StartupTaskPanelHeader
      task={task}
      canEditTitle={kind !== "clan"}
      onRename={(next) => setTask((current) => ({ ...current, title: next }))}
      titleRef={setTitleEl}
    />
  );

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={isPersonal ? personal.title : task.title}
      header={header}
      width="28rem"
      initialFocus="panel"
    >
      {isPersonal ? (
        <PersonalTaskPanelView
          now={IZLOG_NOW}
          task={personal}
          planned={planned}
          startups={IZLOG_TASK_STARTUPS}
          initialMove={kind === "prebaci" ? { startupId: IZLOG_TASK_STARTUPS[0]._id, areaId: IZLOG_TASK_STARTUPS[0].areas[2]._id } : null}
          onChange={(change) => setPersonal((current) => ({ ...current, ...change }))}
          onToggleDone={(done) => setPersonal((current) => ({ ...current, status: done ? "done" : "open" }))}
          onTogglePlan={() => setPlanned((value) => !value)}
          onArchive={() => {
            onClose();
            toast("Zadatak je obrisan.", { duration: 8_000, action: { label: "Poništi", onClick: noop } });
          }}
          onMove={async (startupId) => {
            await new Promise((resolve) => window.setTimeout(resolve, 400));
            onClose();
            const name = IZLOG_TASK_STARTUPS.find((startup) => startup._id === startupId)?.name ?? "startup";
            toast.success(`Prebačeno u ${name}.`, { duration: 8_000, action: { label: "Otvori", onClick: noop } });
          }}
        />
      ) : (
        <TaskDetailLayout
          variant="panel"
          now={IZLOG_NOW}
          task={task}
          assignees={assignees}
          members={IZLOG_PEOPLE}
          permissions={permissions}
          isSelfAssigned={assignees.some((person) => person._id === IZLOG_PEOPLE[0]._id)}
          planned={planned}
          onChange={(change) => {
            if (change.assigneeProfileIds) {
              setAssignees(IZLOG_PEOPLE.filter((person) => change.assigneeProfileIds?.includes(person._id)));
            }
            changeTask(change);
          }}
          onJoin={() => setAssignees((current) => [...current, IZLOG_PEOPLE[0]])}
          onLeave={() => setAssignees((current) => current.filter((person) => person._id !== IZLOG_PEOPLE[0]._id))}
          onTogglePlan={() => setPlanned((value) => !value)}
          onDenied={(reason) => toast.error(reason)}
          openAction={{ kind: openLabel, onSelect: onClose }}
          checkpoints={<IzlogCheckpoints editable={permissions.checkpoints.allowed} />}
          instructions={
            <PanelInstructions
              value={task.instructions}
              editable={permissions.instructions.allowed}
              lockedReason={permissions.instructions.allowed ? null : permissions.instructions.reason}
              onDenied={(reason) => toast.error(reason)}
              onSave={(instructions) => changeTask({ instructions })}
            />
          }
          comments={<IzlogCompactComments />}
        />
      )}
    </Drawer>
  );
}

/** Panel zadatka u izlogu (K11): otvoren preko Mojih zadataka; varijante kreator / član / lični / prebaci. */
export default function PanelZadatkaEkran({ varijanta }: IzlogEkranProps) {
  const [open, setOpen] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const kind = (["kreator", "clan", "licni", "prebaci"] as const).find((value) => value === varijanta) ?? "kreator";
  const model = buildMyTasks(buildTaskRows(IZLOG_TASKS_SOURCE), EMPTY_TASK_FILTERS, "startup", IZLOG_NOW, {
    startupOrder: IZLOG_TASK_STARTUPS.map((startup) => startup._id),
  });
  return (
    <div className="desk-surface overflow-hidden rounded-2xl border bg-background">
      <MyTasksView
        now={IZLOG_NOW}
        state={{ status: "ready", model }}
        startups={IZLOG_TASK_STARTUPS}
        filters={EMPTY_TASK_FILTERS}
        onFiltersChange={noop}
        groupBy="startup"
        onGroupByChange={noop}
        onQuickAdd={() => setOpen(true)}
        searchRef={searchRef}
      />
      <IzlogPanel key={kind} kind={kind} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
