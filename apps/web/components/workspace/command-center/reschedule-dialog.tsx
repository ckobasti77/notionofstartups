"use client";

import { useRef, useState, type RefObject } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  COMMAND_BLOCK_TEXT,
  RESCHEDULE_TARGETS,
  rescheduleChange,
  rescheduleOutcome,
  rescheduleSelectionNote,
  selectionForCall,
  undoItemsFrom,
  undoOutcome,
  withNewRevisions,
  type RescheduleCandidate,
  type RescheduleTarget,
  type UndoItem,
} from "@devotion/shared";

import { UNDO_MS } from "@/components/me/my-day/use-completion-queue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import type { TaskStatus } from "@/lib/workspace";

export type RescheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: ReadonlyArray<RescheduleCandidate>;
  busy: boolean;
  /** Primeni cilj na izabrane (najviše 50 po pozivu). */
  onApply: (target: RescheduleTarget, ids: string[]) => void;
  /** Fokus posle zatvaranja ide na dugme „Sredi rokove"… */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** …a kad ono nestane (nema više prekoračenih) na element sa ovim id-jem (blok Trijaža). */
  fallbackFocusId?: string;
};

/**
 * „Sredi rokove" (PROSTOR P10) — prezentacija (izlog `komandni-centar`): lista
 * prekoračenih i zastarelih zadataka sa kvačicama (podrazumevano svi izabrani) i
 * dugmad Danas · Sutra · Sledeće nedelje · Bez roka · Završi. Podaci kroz props.
 */
export function RescheduleDialog({
  open,
  onOpenChange,
  candidates,
  busy,
  onApply,
  returnFocusRef,
  fallbackFocusId,
}: RescheduleDialogProps) {
  // Pamte se isključeni, ne izabrani: zadatak koji stigne dok je dijalog otvoren je izabran.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  // Svako otvaranje kreće sa svim izabranim (izvedeno stanje, bez efekta).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExcluded(new Set());
  }
  const selected = candidates.filter((candidate) => !excluded.has(candidate.id));
  const call = selectionForCall(selected.map((candidate) => candidate.id));
  const none = selected.length === 0;

  const toggle = (id: string, checked: boolean) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        onOpenAutoFocus={(event) => {
          // Fokus na prvu kvačicu, ne na „Poništi izbor".
          const first = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelector<HTMLElement>("input[type=checkbox]") : null;
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          const target =
            returnFocusRef?.current ?? (fallbackFocusId === undefined ? null : document.getElementById(fallbackFocusId));
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Sredi rokove</DialogTitle>
          <DialogDescription className="sr-only">Izaberi zadatke kojima je rok prošao i postavi im novi rok.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {rescheduleSelectionNote(selected.length)}
          </p>
          <div className="flex items-center gap-1">
            {/* aria-disabled, ne disabled: dugme sa fokusom ne sme da ga izgubi kad postane neaktivno. */}
            <Button
              variant="ghost"
              size="sm"
              className={inactiveClass}
              aria-disabled={excluded.size === 0}
              onClick={() => {
                if (excluded.size > 0) setExcluded(new Set());
              }}
            >
              Izaberi sve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={inactiveClass}
              aria-disabled={none}
              onClick={() => {
                if (!none) setExcluded(new Set(candidates.map((candidate) => candidate.id)));
              }}
            >
              Poništi izbor
            </Button>
          </div>
        </div>

        <ul className="max-h-[min(24rem,50vh)] space-y-0.5 overflow-y-auto" aria-label="Zadaci sa prošlim rokom">
          {candidates.map((candidate) => {
            const id = `sredi-${candidate.id}`;
            return (
              <li key={candidate.id}>
                <label
                  htmlFor={id}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60 pointer-coarse:min-h-11"
                >
                  <Checkbox
                    id={id}
                    checked={!excluded.has(candidate.id)}
                    onCheckedChange={(checked) => toggle(candidate.id, checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{candidate.title}</span>
                    {/* Uska širina: kašnjenje ide ispod naslova da naslov ostane čitljiv. */}
                    <span className="block text-xs tabular-nums text-muted-foreground sm:hidden">{lateLabel(candidate)}</span>
                  </span>
                  <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">{lateLabel(candidate)}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="flex-col sm:flex-row sm:flex-wrap sm:justify-start">
          {RESCHEDULE_TARGETS.map((target) => (
            <Button
              key={target.key}
              variant={target.key === "done" ? "outline" : "secondary"}
              className={inactiveClass}
              aria-disabled={none || busy}
              onClick={() => {
                if (!none && !busy) onApply(target.key, call.ids);
              }}
            >
              {target.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Neaktivno dugme ostaje u redosledu fokusa (aria-disabled), samo bez radnje i bleđe. */
const inactiveClass = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

type LiveUndo = { items: UndoItem[] };

function lateLabel(candidate: RescheduleCandidate): string {
  return `${candidate.stale ? "Zastarelo · " : ""}kasni ${candidate.daysLate} d`;
}

/**
 * Mutacije „Sredi rokove": `tasks.bulkReschedule` sa toastom „Sređeno: 12 zadataka →
 * sutra." i „Poništi" (`tasks.bulkRestoreSchedule`, `expectedRevision` iz odgovora).
 * Ulančano „Poništi": kad jedno poništavanje promeni reviziju, starija još živa
 * poništavanja dobijaju novu (inače bi ih server preskočio kao „u međuvremenu menjan").
 */
export function useReschedule({
  startupId,
  now,
  beforeApply,
}: {
  startupId: Id<"startups">;
  now: number;
  /** Snimak za Flip pre promene (kontejner zna granicu broja redova). */
  beforeApply: () => void;
}) {
  const reschedule = useMutation(api.tasks.bulkReschedule);
  const restore = useMutation(api.tasks.bulkRestoreSchedule);
  const [busy, setBusy] = useState(false);
  const live = useRef(new Set<LiveUndo>());

  const undo = async (entry: LiveUndo) => {
    live.current.delete(entry);
    try {
      const result = await restore({
        startupId,
        items: entry.items.map((item) => ({
          taskPageId: item.taskPageId as Id<"pages">,
          dueDate: item.dueDate,
          taskStatus: item.taskStatus as TaskStatus,
          expectedRevision: item.expectedRevision,
        })),
      });
      for (const other of live.current) other.items = withNewRevisions(other.items, result.revisions);
      const message = undoOutcome({ restored: result.restored, unchanged: result.unchanged, skipped: result.skipped });
      if (result.restored > 0) toast.success(message);
      else toast.error(message);
    } catch (error) {
      toast.error(accessErrorMessage(error, COMMAND_BLOCK_TEXT.rescheduleUndoFailed));
    }
  };

  const apply = async (target: RescheduleTarget, ids: string[]): Promise<boolean> => {
    if (busy || ids.length === 0) return false;
    setBusy(true);
    try {
      beforeApply();
      const result = await reschedule({
        startupId,
        taskPageIds: ids as Id<"pages">[],
        ...rescheduleChange(target, now),
      });
      const outcome = rescheduleOutcome(target, {
        updated: result.updated.length,
        unchanged: result.unchanged,
        skipped: result.skipped,
      });
      if (!outcome.changed) {
        toast(outcome.message);
        return false;
      }
      const entry: LiveUndo = { items: undoItemsFrom(result.updated) };
      live.current.add(entry);
      toast.success(outcome.message, {
        duration: UNDO_MS,
        action: { label: "Poništi", onClick: () => void undo(entry) },
        onDismiss: () => live.current.delete(entry),
        onAutoClose: () => live.current.delete(entry),
      });
      return true;
    } catch (error) {
      toast.error(accessErrorMessage(error, COMMAND_BLOCK_TEXT.rescheduleFailed));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, apply };
}
