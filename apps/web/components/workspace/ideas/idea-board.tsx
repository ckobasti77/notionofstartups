"use client";

import { useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { IdeaStage, IdeaStoredStage } from "@devotion/shared";

import { Collapse, FLIP_MAX_ITEMS, FlipGroup } from "@/components/motion";
import { useBoardAllowed } from "@/components/workspace/tasks-view";
import { SectionHeading } from "@/components/workspace/workspace-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { IdeaCard } from "./idea-card";
import type { IdeaActions } from "./idea-parts";
import { boardFocusMove, buildIdeaBoard, canDropIdeaOn, ideaDropTargets, type IdeaBoardColumn, type IdeaModel } from "./ideas-model";

type DragState = { idea: IdeaModel };

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/**
 * Tabla ideja po fazama (PROSTOR P16, K07 §5.9): Predlog · Razmatra se ·
 * Odobreno · Postalo zadatak, a Odbijeno je skupljena kolona desno. Kartica
 * se prevlači samo kome je dozvoljeno menjanje faze, i samo u kolone iz
 * `stageTargets` — ostale kolone nisu cilj (nema isticanja). Promena faze
 * (i kad je promenio drugi član) putuje kroz Flip. Strelice idu kroz kartice
 * (levo/desno po kolonama), Enter otvara detalj. Ispod `md` tabla je lista
 * grupisana po fazi (bez prevlačenja; faza ide kroz meni „…").
 */
export function IdeaBoard({
  ideas,
  now,
  actions,
  activeIdeaId,
  resetKey,
}: {
  ideas: ReadonlyArray<IdeaModel>;
  now: number;
  actions: IdeaActions;
  activeIdeaId: Id<"ideaNodes"> | null;
  /** Promena pretrage je nov skup, ne pomeranje (bez Flip-a). */
  resetKey: string;
}) {
  const boardAllowed = useBoardAllowed();
  const scopeRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<IdeaStage | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const board = buildIdeaBoard(ideas);
  const layoutKey = [...board.columns, board.rejected]
    .map((column) => `${column.stage}:${column.ideas.map((idea) => idea._id).join(",")}`)
    .join("|");

  function endDrag() {
    setDrag(null);
    setOver(null);
  }

  /** Strelice po tabli: kolone i kartice čitaju se iz DOM-a (redom prikaza). */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ARROWS.has(event.key)) return;
    const target = event.target as HTMLElement;
    if (!target.matches("[data-idea-open]")) return;
    const columns = Array.from(scopeRef.current?.querySelectorAll<HTMLElement>("[data-idea-column]") ?? []).map((column) =>
      Array.from(column.querySelectorAll<HTMLElement>("[data-idea-open]")),
    );
    const column = columns.findIndex((buttons) => buttons.includes(target));
    if (column === -1) return;
    const next = boardFocusMove(
      columns.map((buttons) => buttons.length),
      { column, index: columns[column]!.indexOf(target) },
      event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
    );
    if (next === null) return;
    event.preventDefault();
    columns[next.column]?.[next.index]?.focus();
  }

  function cardDrag(idea: IdeaModel) {
    return {
      draggable: ideaDropTargets(idea).length > 0,
      dragging: drag?.idea._id === idea._id,
      onDragStart: (dragged: IdeaModel) => setDrag({ idea: dragged }),
      onDragEnd: endDrag,
    };
  }

  function dropHandlers(stage: IdeaStage) {
    if (drag === null || !canDropIdeaOn(drag.idea, stage)) return {};
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (over !== stage) setOver(stage);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        // Prelaz na dete kolone nije izlazak.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (over === stage) setOver(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        const dragged = drag.idea;
        endDrag();
        actions.onSetStage(dragged, stage as IdeaStoredStage);
      },
    };
  }

  function dropClass(stage: IdeaStage) {
    if (drag === null || !canDropIdeaOn(drag.idea, stage)) return null;
    return over === stage
      ? "bg-primary/5 outline-dashed outline-1 outline-primary"
      : "outline-dashed outline-1 outline-border";
  }

  if (!boardAllowed) {
    return <IdeaStageSections board={board} now={now} actions={actions} activeIdeaId={activeIdeaId} />;
  }

  return (
    <div
      ref={scopeRef}
      onKeyDown={onKeyDown}
      // Visina = najviša kolona (ili ceo prostor): pozadina kolone uvek prati kartice,
      // a vertikalno skroluje kartica prikaza (TabsContent).
      className="flex flex-[1_0_auto] items-stretch gap-3 overflow-x-auto pb-4"
      aria-label="Tabla ideja po fazama"
      role="region"
    >
      <FlipGroup scope={scopeRef} layoutKey={layoutKey} resetKey={resetKey} disabled={ideas.length > FLIP_MAX_ITEMS}>
        {board.columns.map((column) => (
          <BoardColumn
            key={column.stage}
            column={column}
            className={dropClass(column.stage)}
            dropHandlers={dropHandlers(column.stage)}
          >
            {column.ideas.map((idea) => (
              <li key={idea._id}>
                <IdeaCard idea={idea} now={now} actions={actions} active={idea._id === activeIdeaId} drag={cardDrag(idea)} />
              </li>
            ))}
          </BoardColumn>
        ))}
        <RejectedColumn
          column={board.rejected}
          open={rejectedOpen}
          onOpenChange={setRejectedOpen}
          className={dropClass("odbijeno")}
          dropHandlers={dropHandlers("odbijeno")}
        >
          {board.rejected.ideas.map((idea) => (
            <li key={idea._id}>
              <IdeaCard idea={idea} now={now} actions={actions} active={idea._id === activeIdeaId} drag={cardDrag(idea)} />
            </li>
          ))}
        </RejectedColumn>
      </FlipGroup>
    </div>
  );
}

type DropHandlers = Partial<{
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}>;

function BoardColumn({
  column,
  className,
  dropHandlers,
  children,
}: {
  column: IdeaBoardColumn<IdeaModel>;
  className: string | null;
  dropHandlers: DropHandlers;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-idea-column={column.stage}
      data-motion-enter
      {...dropHandlers}
      className={cn("flex min-w-56 max-w-80 flex-1 basis-0 flex-col rounded-lg bg-muted/30 p-2", className)}
    >
      <SectionHeading id={headingId} title={column.label} count={column.ideas.length} className="px-1" />
      {column.ideas.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">Nema ideja u ovoj fazi.</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

/** Odbijeno: skupljena uska kolona (uspravna oznaka); klik je otvara. Cilj prevlačenja i skupljena. */
function RejectedColumn({
  column,
  open,
  onOpenChange,
  className,
  dropHandlers,
  children,
}: {
  column: IdeaBoardColumn<IdeaModel>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string | null;
  dropHandlers: DropHandlers;
  children: ReactNode;
}) {
  const headingId = useId();
  const contentId = useId();
  if (!open) {
    return (
      <section aria-labelledby={headingId} data-motion-enter {...dropHandlers} className={cn("flex w-12 shrink-0 rounded-lg bg-muted/30", className)}>
        <h2 id={headingId} className="sr-only">{`${column.label} ${column.ideas.length}`}</h2>
        <button
          type="button"
          aria-expanded={false}
          aria-label={`Prikaži kolonu ${column.label} (${column.ideas.length})`}
          onClick={() => onOpenChange(true)}
          className="flex w-full flex-col items-center gap-2 rounded-lg py-3 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="[writing-mode:vertical-rl]">
            {column.label} <span className="font-normal tabular-nums">{column.ideas.length}</span>
          </span>
        </button>
      </section>
    );
  }
  return (
    <section
      id={contentId}
      aria-labelledby={headingId}
      data-idea-column={column.stage}
      {...dropHandlers}
      className={cn("flex min-w-56 max-w-80 flex-1 basis-0 flex-col rounded-lg bg-muted/30 p-2", className)}
    >
      <SectionHeading
        id={headingId}
        title={column.label}
        count={column.ideas.length}
        className="px-1"
        action={
          <button
            type="button"
            aria-expanded
            aria-label={`Skupi kolonu ${column.label}`}
            onClick={() => onOpenChange(false)}
            className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        }
      />
      {column.ideas.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">Nema ideja u ovoj fazi.</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

/** Ispod `md`: lista grupisana po fazi (Odbijeno skupljeno). */
function IdeaStageSections({
  board,
  now,
  actions,
  activeIdeaId,
}: {
  board: ReturnType<typeof buildIdeaBoard<IdeaModel>>;
  now: number;
  actions: IdeaActions;
  activeIdeaId: Id<"ideaNodes"> | null;
}) {
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const rejectedId = useId();
  return (
    <div className="space-y-6 pb-4">
      {board.columns.map((column) => (
        <section key={column.stage} aria-label={column.label} data-motion-enter>
          <SectionHeading title={column.label} count={column.ideas.length} />
          {column.ideas.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Nema ideja u ovoj fazi.</p>
          ) : (
            <ul className="space-y-2">
              {column.ideas.map((idea) => (
                <li key={idea._id}>
                  <IdeaCard idea={idea} now={now} actions={actions} active={idea._id === activeIdeaId} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section aria-label={board.rejected.label}>
        <button
          type="button"
          aria-expanded={rejectedOpen}
          aria-controls={rejectedId}
          onClick={() => setRejectedOpen((value) => !value)}
          className="mb-2 flex min-h-10 w-full items-center gap-2 rounded-md px-1 text-sm font-semibold outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", rejectedOpen && "rotate-90")} aria-hidden="true" />
          {board.rejected.label}
          <span className="font-normal tabular-nums text-muted-foreground">{board.rejected.ideas.length}</span>
        </button>
        <Collapse open={rejectedOpen} id={rejectedId} unmountWhenClosed>
          {board.rejected.ideas.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Nema ideja u ovoj fazi.</p>
          ) : (
            <ul className="space-y-2">
              {board.rejected.ideas.map((idea) => (
                <li key={idea._id}>
                  <IdeaCard idea={idea} now={now} actions={actions} active={idea._id === activeIdeaId} />
                </li>
              ))}
            </ul>
          )}
        </Collapse>
      </section>
    </div>
  );
}
