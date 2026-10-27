"use client";

import { useMemo, useRef, useState } from "react";
import { MoreHorizontal, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { rowFromStartupTask, type StartupMini } from "@devotion/shared";

import { CommentComposer } from "@/components/collab/comment-composer";
import { CommentList, type CommentListState } from "@/components/collab/comment-list";
import { CommentsPanel } from "@/components/collab/comments-section";
import { ConflictDialog } from "@/components/collab/conflict-dialog";
import { RevisionList } from "@/components/collab/revision-history";
import type { TaskRowActions } from "@/components/me/task-row";
import { Drawer } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AreaDocumentsBody, type DocumentRowPage } from "@/components/workspace/area/area-documents";
import { AreaHeader } from "@/components/workspace/area/area-header";
import {
  areaBodyStateText,
  areaHeaderMeta,
  countText,
  flattenDocumentTree,
  type AreaBodyStatus,
  type AreaCount,
} from "@/components/workspace/area/area-model";
import {
  AreaDescription,
  AreaOverviewLayout,
  RecentChanges,
  type AreaDescriptionState,
  type RecentChangesState,
} from "@/components/workspace/area/area-overview";
import { AreaTasksBody, type AreaTaskStatusFilter } from "@/components/workspace/area/area-tasks";
import { buildTaskSections, useBoardAllowed, type TasksMode } from "@/components/workspace/tasks-view";
import type { AreaTab } from "@/components/workspace/types";
import { isAreaTab } from "@/components/workspace/workspace-route";
import type { PageKind } from "@/lib/page-kinds";

import type { IzlogEkranProps } from "../registry";
import {
  IZLOG_AREA,
  IZLOG_AREA_BODY,
  IZLOG_AREA_COMMENTS,
  IZLOG_AREA_DOC_CHILD_COUNTS,
  IZLOG_AREA_DOC_EXPANDED,
  IZLOG_AREA_DOC_LEVELS,
  IZLOG_AREA_LABELS,
  IZLOG_AREA_LAST_EDIT,
  IZLOG_AREA_RECENT,
  IZLOG_AREA_REVISIONS,
  IZLOG_AREA_STARTUP,
  IZLOG_AREA_TASKS,
} from "../fixtures/area";
import { IZLOG_NOW } from "../fixtures/now";
import { IZLOG_DOC_MEMBERS, IZLOG_DOC_PEOPLE, IZLOG_DOC_SELF } from "../fixtures/page-document";

const noop = () => {};
const asyncNoop = async () => {};

const TAB_OF_VARIANT: Record<string, AreaTab> = {
  pregled: "pregled",
  istorija: "pregled",
  "opis-konflikt": "pregled",
  prazna: "pregled",
  ucitavanje: "pregled",
  greska: "pregled",
  zadaci: "zadaci",
  "zadaci-tabla": "zadaci",
  dokumenti: "dokumenti",
};

const FULL_COUNTS: { pages: AreaCount; tasks: AreaCount } = {
  pages: { count: 7, capped: false },
  tasks: { count: IZLOG_AREA_TASKS.length, capped: false },
};

/**
 * Oblast (K13, K07 §5.5): zaglavlje sa karticama Pregled · Zadaci · Dokumenti ·
 * Mapa i sadržaj kartica sa fixture podacima. Iste prezentacione komponente kao
 * u aplikaciji; Mapa je postojeći kanvas (redizajn K15) i ovde se ne prikazuje.
 */
export default function OblastEkran({ varijanta }: IzlogEkranProps) {
  const [tab, setTab] = useState<AreaTab>(TAB_OF_VARIANT[varijanta] ?? "pregled");
  const empty = varijanta === "prazna";
  const loading = varijanta === "ucitavanje";
  const counts = loading ? null : empty ? { pages: { count: 0, capped: false }, tasks: { count: 0, capped: false } } : FULL_COUNTS;

  return (
    <div className="app-canvas desk-surface overflow-hidden rounded-2xl border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <Tabs value={tab} onValueChange={(value) => isAreaTab(value) && setTab(value)}>
          <AreaHeader
            label={IZLOG_AREA.label}
            meta={counts ? areaHeaderMeta(counts.pages, counts.tasks) : null}
            tabCounts={{ zadaci: countText(counts?.tasks ?? null), dokumenti: countText(counts?.pages ?? null) }}
            onRename={async () => true}
            onCreate={noop}
          />
          <TabsContent value="pregled" className="mt-0">
            <IzlogPregled varijanta={varijanta} />
          </TabsContent>
          <TabsContent value="zadaci" className="mt-0">
            <IzlogZadaci board={varijanta === "zadaci-tabla"} empty={empty} />
          </TabsContent>
          <TabsContent value="dokumenti" className="mt-0">
            <IzlogDokumenti empty={empty} />
          </TabsContent>
          <TabsContent value="mapa" className="mt-0">
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Mapa oblasti je postojeći kanvas (čita Convex) — izgled menja K15.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function IzlogPregled({ varijanta }: { varijanta: string }) {
  const empty = varijanta === "prazna";
  const loading = varijanta === "ucitavanje";
  const failed = varijanta === "greska";
  const conflict = varijanta === "opis-konflikt";
  const [value, setValue] = useState(empty ? "" : conflict ? `${IZLOG_AREA_BODY}\nWebhook potvrde testiramo u ponedeljak.` : IZLOG_AREA_BODY);
  const [historyOpen, setHistoryOpen] = useState(varijanta === "istorija");
  const [conflictOpen, setConflictOpen] = useState(conflict);
  const status: AreaBodyStatus = conflict ? "conflict" : "saved";

  const description: AreaDescriptionState = failed
    ? { status: "error", onRetry: noop }
    : loading
    ? { status: "loading" }
    : {
        status: "ready",
        value,
        editable: true,
        saveStatus: status,
        stateText: areaBodyStateText({
          status,
          exhausted: false,
          editorName: empty ? null : IZLOG_AREA_LAST_EDIT.editorName,
          updatedAt: empty ? null : IZLOG_AREA_LAST_EDIT.updatedAt,
          now: IZLOG_NOW,
        }),
        onRetry: null,
        onResolveConflict: conflict && !conflictOpen ? () => setConflictOpen(true) : null,
        onChange: setValue,
        onBlur: noop,
      };
  const recent: RecentChangesState = failed
    ? { status: "error", onRetry: noop }
    : loading
    ? { status: "loading" }
    : { status: "ready", items: empty ? [] : IZLOG_AREA_RECENT };
  const comments: CommentListState = failed
    ? { status: "error", onRetry: noop }
    : loading
    ? { status: "loading" }
    : { status: "ready", items: empty ? [] : IZLOG_AREA_COMMENTS, loadMore: null };
  const commentCount = comments.status === "ready" && comments.items.length > 0 ? String(comments.items.length) : null;

  return (
    <>
      <AreaOverviewLayout
        description={
          <AreaDescription headingId="izlog-oblast-opis" state={description} onOpenHistory={() => setHistoryOpen(true)} />
        }
        recent={<RecentChanges headingId="izlog-oblast-nedavno" state={recent} onOpen={noop} />}
        comments={
          <CommentsPanel
            headingId="izlog-oblast-komentari"
            count={commentCount}
            composer={<CommentComposer members={IZLOG_DOC_MEMBERS} selfProfileId={IZLOG_DOC_SELF} onSubmit={asyncNoop} />}
          >
            <CommentList
              state={comments}
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
          </CommentsPanel>
        }
      />
      <Drawer open={historyOpen} onOpenChange={setHistoryOpen} title="Istorija izmena" width="28rem">
        <RevisionList state={{ status: "ready", items: IZLOG_AREA_REVISIONS, loadMore: null }} now={IZLOG_NOW} onSelect={noop} />
      </Drawer>
      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        subject="area"
        updaterName={IZLOG_DOC_PEOPLE.marko.displayName}
        updatedAt={IZLOG_NOW - 2 * 60_000}
        now={IZLOG_NOW}
        onCopy={noop}
        onLoadLatest={() => setConflictOpen(false)}
        onOverwrite={() => setConflictOpen(false)}
      />
    </>
  );
}

const STARTUP_MINI: StartupMini = {
  _id: IZLOG_AREA_STARTUP._id,
  name: IZLOG_AREA_STARTUP.name,
  logoUrl: IZLOG_AREA_STARTUP.logoUrl,
};

const STATIC_ACTIONS: TaskRowActions = {
  onToggleDone: noop,
  onTogglePlan: noop,
  onSetDue: noop,
  onSetPriority: noop,
  onOpen: noop,
  onSetStatus: noop,
  onJoin: noop,
};

function IzlogZadaci({ board, empty }: { board: boolean; empty: boolean }) {
  const [chosenMode, setMode] = useState<TasksMode>(board ? "board" : "list");
  const mode: TasksMode = useBoardAllowed() ? chosenMode : "list";
  const [statusFilter, setStatusFilter] = useState<AreaTaskStatusFilter>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () =>
      (empty ? [] : IZLOG_AREA_TASKS)
        .filter((task) => mode === "board" || statusFilter === null || task.taskStatus === statusFilter)
        .map((task) =>
          rowFromStartupTask(task, {
            profileId: IZLOG_DOC_SELF,
            startup: STARTUP_MINI,
            areaLabels: IZLOG_AREA_LABELS,
            assigneeIds: [IZLOG_DOC_SELF],
            plannedKeys: new Map(),
          }),
        ),
    [empty, mode, statusFilter],
  );
  const sections = useMemo(() => buildTaskSections(rows, mode, new Map(), new Map()), [rows, mode]);
  return (
    <AreaTasksBody
      now={IZLOG_NOW}
      statusFilter={mode === "board" ? null : statusFilter}
      onStatusFilterChange={setStatusFilter}
      loading={false}
      count={rows.length}
      mode={mode}
      onModeChange={setMode}
      sections={sections}
      actions={STATIC_ACTIONS}
      scopeRef={scopeRef}
      selectedKey={null}
      activeKey={null}
      request={null}
      onListFocus={noop}
      announcement=""
      onCreateTask={noop}
      loadMore={null}
    />
  );
}

function IzlogDokumenti({ empty }: { empty: boolean }) {
  const [kindFilter, setKindFilter] = useState<PageKind | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(IZLOG_AREA_DOC_EXPANDED);
  const rows = useMemo(() => {
    if (empty) return [];
    const levels = new Map(IZLOG_AREA_DOC_LEVELS);
    const root = levels.get("root");
    if (root?.status === "ready" && kindFilter !== null) {
      levels.set("root", { ...root, pages: root.pages.filter((page) => page.kind === kindFilter) });
    }
    return flattenDocumentTree<DocumentRowPage>({ levels, expanded, childCounts: IZLOG_AREA_DOC_CHILD_COUNTS });
  }, [empty, expanded, kindFilter]);

  return (
    <AreaDocumentsBody
      now={IZLOG_NOW}
      kindFilter={kindFilter}
      onKindFilterChange={setKindFilter}
      state={{ status: "ready", rows }}
      onOpen={noop}
      onToggle={(pageId, open) =>
        setExpanded((current) => {
          const next = new Set(current);
          if (open) next.add(pageId);
          else next.delete(pageId);
          return next;
        })
      }
      onLoadMore={noop}
      onRetryLevel={noop}
      onCreate={noop}
      renderActions={(page) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Radnje: „${page.title}”`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={noop}>
              <SquareArrowOutUpRight aria-hidden="true" />
              Otvori
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={noop}>
              <Trash2 aria-hidden="true" />
              Obriši
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      drag={null}
    />
  );
}
