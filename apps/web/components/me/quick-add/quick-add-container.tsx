"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  quickAddCall,
  quickAddNoteCall,
  quickAddNoteSuccessMessage,
  quickAddSuccessMessage,
  type QuickAddDraft,
  type QuickAddKind,
  type QuickAddNoteDraft,
} from "@devotion/shared";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/errors";
import { readLastArea, readStoredDestination, rememberDestination } from "@/lib/me/last-area";
import type { Today } from "@/lib/today";

import { QuickAddDialog, type QuickAddStartupOption } from "./quick-add-dialog";

export type QuickAddContainerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: Today;
  profileId: Id<"profiles">;
  startups: ReadonlyArray<{
    _id: Id<"startups">;
    name: string;
    logoUrl: string | null;
    areas: ReadonlyArray<{ _id: Id<"startupAreas">; label: string }>;
  }>;
  preset?: { startupId: Id<"startups">; areaId?: Id<"startupAreas"> | null } | null;
  /** „Otvori" iz toasta za zadatak u startupu (postojeći detalj stranice). */
  onOpenTask: (startupId: Id<"startups">, pageId: Id<"pages">) => void;
  /** Početna vrsta unosa; iz Beleški se otvara kao Beleška. */
  initialKind?: QuickAddKind;
  /** „Otvori" iz toasta za belešku: ekran Beleške. */
  onOpenNotes: () => void;
};

/** Toast „Poništi" traje 8 s (plan K07 E6). */
const UNDO_MS = 8_000;

/**
 * Brzi unos — tanak kontejner (plan K07 E16): lični zadatak kroz
 * `personalTasks.create({ addToMyDay })` („Poništi" = `personalTasks.archive`),
 * zadatak u startupu kroz `pages.create` (task, backlog, ja izvršilac) pa
 * `myDay.plan` ako je čekirano („Poništi" = `areasV2.archivePage`).
 */
export function QuickAddContainer({
  open,
  onOpenChange,
  today,
  profileId,
  startups,
  preset,
  onOpenTask,
  initialKind,
  onOpenNotes,
}: QuickAddContainerProps) {
  const createPersonal = useMutation(api.personalTasks.create);
  const archivePersonal = useMutation(api.personalTasks.archive);
  const createPage = useMutation(api.pages.create);
  const archivePage = useMutation(api.areasV2.archivePage);
  const plan = useMutation(api.myDay.plan);
  const createNote = useMutation(api.thoughts.createNote);
  const archiveNotes = useMutation(api.thoughts.archiveNodes);
  // „Otvori" iz toasta može stići i 8 s kasnije: uvek najnoviji rukovalac ljuske.
  const openTaskRef = useRef(onOpenTask);
  const openNotesRef = useRef(onOpenNotes);
  useLayoutEffect(() => {
    openTaskRef.current = onOpenTask;
    openNotesRef.current = onOpenNotes;
  });

  const options = useMemo<QuickAddStartupOption[]>(
    () =>
      startups.map((startup) => ({
        _id: startup._id,
        name: startup.name,
        logoUrl: startup.logoUrl,
        areas: startup.areas.map((area) => ({ _id: area._id, label: area.label })),
      })),
    [startups],
  );

  const submit = async (draft: QuickAddDraft) => {
    const call = quickAddCall(draft, { profileId, dayKey: today.dayKey });
    if (call.fn === "invalid") throw new Error(call.reason ?? "Unesi naslov zadatka.");
    const message = quickAddSuccessMessage(draft.destination, options);
    try {
      if (call.fn === "personalTasks.create") {
        const personalTaskId = await createPersonal(call.args);
        rememberDestination(draft.destination);
        toast.success(message, {
          duration: UNDO_MS,
          action: {
            label: "Poništi",
            onClick: () => {
              void archivePersonal({ personalTaskId })
                .then(() => toast.info("Unos je poništen."))
                .catch((error: unknown) => toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")));
            },
          },
        });
        return;
      }
      const startupId = call.args.startupId as Id<"startups">;
      // Id-jevi su prošli kroz shared nacrt kao stringovi; potiču iz `startups.listForCurrent`.
      const pageId = await createPage({
        ...call.args,
        startupId,
        areaId: call.args.areaId as Id<"startupAreas">,
        assigneeProfileIds: [profileId],
      });
      rememberDestination(draft.destination);
      if (call.planDayKey !== null) {
        try {
          await plan({ dayKey: call.planDayKey, ref: { kind: "task", taskPageId: pageId } });
        } catch (error) {
          toast.error(accessErrorMessage(error, "Plan nije sačuvan."));
        }
      }
      toast.success(message, {
        duration: UNDO_MS,
        action: {
          label: "Poništi",
          onClick: () => {
            void archivePage({ startupId, pageId })
              .then(() => toast.info("Unos je poništen."))
              .catch((error: unknown) => toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")));
          },
        },
        cancel: { label: "Otvori", onClick: () => openTaskRef.current(startupId, pageId) },
      });
    } catch (error) {
      throw new Error(accessErrorMessage(error, "Zadatak nije dodat. Pokušaj ponovo."));
    }
  };

  /** Beleška (P7, K18): thoughts.createNote; „Poništi" arhivira, „Otvori" vodi u Beleške. */
  const submitNote = async (draft: QuickAddNoteDraft) => {
    const call = quickAddNoteCall(draft);
    if (call.fn === "invalid") throw new Error(call.reason ?? "Unesi tekst beleške.");
    const message = quickAddNoteSuccessMessage(draft.destination, options);
    try {
      const noteId = await createNote({
        startupId: call.args.startupId as Id<"startups"> | null,
        text: call.args.text,
      });
      toast.success(message, {
        duration: UNDO_MS,
        action: {
          label: "Poništi",
          onClick: () => {
            void archiveNotes({ nodeIds: [noteId] })
              .then(() => toast.info("Unos je poništen."))
              .catch((error: unknown) => toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")));
          },
        },
        cancel: { label: "Otvori", onClick: () => openNotesRef.current() },
      });
    } catch (error) {
      throw new Error(accessErrorMessage(error, "Beleška nije sačuvana. Pokušaj ponovo."));
    }
  };

  return (
    <QuickAddDialog
      open={open}
      onOpenChange={onOpenChange}
      now={today.now}
      startups={options}
      preset={preset}
      readStored={readStoredDestination}
      rememberedArea={readLastArea}
      onSubmit={submit}
      onSubmitNote={submitNote}
      initialKind={initialKind}
    />
  );
}
