"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  LoaderCircle, Plus, ListChecks } from "lucide-react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssigneePicker } from "@/components/workspace/assignee-picker";
import {
  PAGE_KIND_KEYS,
  PAGE_KIND_META,
  type PageKind,
} from "@/lib/page-kinds";
import { workspaceItemDialogContentClass } from "@/components/workspace/workspace-item-dialog";
import {
  TaskCheckpointDraftList,
  type TaskCheckpointDraft,
} from "@/components/workspace/task-checkpoint-list";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TASK_PRIORITY_META, TASK_STATUS_META, fromDateInputValue, type TaskPriority, type TaskStatus } from "@/lib/workspace";

const TITLE_PLACEHOLDER: Record<PageKind, string> = {
  note: "Naslov beleške…",
  task: "Šta treba uraditi?",
  file: "Naziv fajl oblačića…",
  table: "Naziv tabele…",
};

export function CreatePageDialog({ open, onOpenChange, startup, target, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; startup: StartupWithAreas; target?: CreatePageTarget; onCreated: (pageId: Id<"pages">) => void }) {
  const createPage = useMutation(api.areasV2.createPage);
  const members = useQuery(api.startups.listMembers, open ? { startupId: startup._id, limit: 50 } : "skip");
  const targetParent = useQuery(
    api.pages.get,
    open && target?.parentPageId
      ? { pageId: target.parentPageId }
      : "skip",
  );
  const fallbackAreaId = startup.areas[0]?._id;
  const [title, setTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [kind, setKind] = useState<PageKind>(target?.initialKind ?? "note");
  const [areaId, setAreaId] = useState<Id<"startupAreas"> | undefined>(target?.areaId ?? fallbackAreaId);
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeIds, setAssigneeIds] = useState<Array<Id<"profiles">>>([]);
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [checkpoints, setCheckpoints] = useState<TaskCheckpointDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedArea = useMemo(() => startup.areas.find((area) => area._id === areaId), [areaId, startup.areas]);
  const CreateKindIcon = PAGE_KIND_META[kind].icon;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!areaId || title.trim().length === 0) return;
    setSubmitting(true);
    try {
      const result = await createPage({
        startupId: startup._id,
        areaId,
        rootPageId: target?.parentPageId ?? null,
        kind,
        title: title.trim(),
        content: kind === "note" ? noteContent : "",
        ...(kind === "task" ? {
          taskStatus: status,
          taskPriority: priority,
          ...(assigneeIds.length === 0 ? {} : { assigneeProfileIds: assigneeIds }),
          ...(dueDate ? { dueDate: fromDateInputValue(dueDate) } : {}),
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
          ...(checkpoints.length > 0 ? { checkpoints } : {}),
        } : {}),
      });
      toast.success(
        result.nestingStatus === "pending"
          ? `${PAGE_KIND_META[kind].label} je kreiran/a u oblasti i čeka odobrenje autora ciljne stranice.`
          : `${PAGE_KIND_META[kind].label} je kreiran/a.`,
      );
      onOpenChange(false);
      onCreated(result.pageId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stranica nije kreirana.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${workspaceItemDialogContentClass} sm:!max-w-2xl`}
      >
        <form
          className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]"
          onSubmit={submit}
        >
          <DialogHeader className="border-b border-border/70 px-5 py-5 pr-14 sm:px-6 sm:pr-16">
            <DialogTitle className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Plus className="size-4" /></span> Nova stranica</DialogTitle>
            <DialogDescription>
              {target?.parentPageId
                ? targetParent && !targetParent.permissions.canEdit
                  ? "Stavka će biti kreirana u korenu oblasti, a autor ciljne stranice dobija zahtev za ugnježđavanje."
                  : "Biće ugnježdena unutar izabrane stranice."
                : `Dodaješ sadržaj u ${selectedArea?.label ?? "oblast"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="scrollbar-thin min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <fieldset className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-1 sm:grid-cols-4">
              <legend className="sr-only">Vrsta stranice</legend>
              {PAGE_KIND_KEYS.map((value) => {
                const Icon = PAGE_KIND_META[value].icon;
                return (
                  <label
                    key={value}
                    className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring ${kind === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <input
                      type="radio"
                      name="page-kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                      className="sr-only"
                    />
                    <Icon className="size-4" />
                    {PAGE_KIND_META[value].label}
                  </label>
                );
              })}
            </fieldset>
            <div className="space-y-2"><Label htmlFor="new-page-title">Naslov</Label><Input id="new-page-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={TITLE_PLACEHOLDER[kind]} maxLength={200} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="new-page-area">Oblast</Label><Select value={areaId} onValueChange={(value) => setAreaId(value as Id<"startupAreas">)} disabled={Boolean(target?.areaId)}><SelectTrigger id="new-page-area"><SelectValue /></SelectTrigger><SelectContent>{startup.areas.map((area) => <SelectItem key={area._id} value={area._id}>{area.label}</SelectItem>)}</SelectContent></Select></div>

            {kind === "file" || kind === "table" ? (
              <p className="rounded-xl border border-dashed border-border/70 bg-muted/25 px-4 py-5 text-sm text-muted-foreground">
                {kind === "file"
                  ? "Oblačić se pravi prazan — fajlove dodaješ odmah posle kreiranja, iz njegovih detalja."
                  : "Tabela se pravi sa jednom kolonom i jednim redom. Kolone, redove i uvoz iz Excel-a dodaješ u njenom prikazu."}
              </p>
            ) : kind === "note" ? (
              <div className="space-y-2">
                <Label>Sadržaj beleške (Rich Text Editor)</Label>
                <div className="min-h-[16rem] rounded-xl border border-border/70 bg-card p-3">
                  <RichTextEditor
                    content={noteContent}
                    documentKey="new-note-dialog"
                    placeholder="Zapiši detalje beleške ovde…"
                    onChange={({ html }) => setNoteContent(html)}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="new-task-status">Status</Label><Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}><SelectTrigger id="new-task-status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_STATUS_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="new-task-priority">Prioritet</Label><Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}><SelectTrigger id="new-task-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_PRIORITY_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="new-task-assignee">Izvršioci</Label><AssigneePicker id="new-task-assignee" members={members} value={assigneeIds} onChange={setAssigneeIds} /></div>
                  <div className="space-y-2"><Label htmlFor="new-task-due">Rok</Label><Input id="new-task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-task-instructions">Instrukcije (opciono)</Label>
                  <textarea
                    id="new-task-instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Napiši šta treba uraditi i koji rezultat se očekuje…"
                    className="flex min-h-20 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    rows={3}
                    maxLength={20_000}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><ListChecks className="size-4 text-primary" /> Podzadaci / Checkpointi</Label>
                  <TaskCheckpointDraftList
                    items={checkpoints}
                    onChange={setCheckpoints}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="relative z-20 shrink-0 border-t border-border/70 bg-background/95 px-5 py-4 shadow-[0_-12px_28px_-22px_rgba(0,0,0,0.55)] backdrop-blur sm:px-6"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Otkaži</Button><Button type="submit" disabled={submitting || !areaId || title.trim().length === 0}>{submitting ? <LoaderCircle className="animate-spin" /> : <CreateKindIcon className="size-4" />} Kreiraj</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
