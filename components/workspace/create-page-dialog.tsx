"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckSquare2, FileText, LoaderCircle, Plus, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TASK_PRIORITY_META, TASK_STATUS_META, fromDateInputValue, type TaskPriority, type TaskStatus } from "@/lib/workspace";

type CheckpointItem = {
  id: string;
  text: string;
  completed: boolean;
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
  const [kind, setKind] = useState<"note" | "task">(target?.initialKind ?? "note");
  const [areaId, setAreaId] = useState<Id<"startupAreas"> | undefined>(target?.areaId ?? fallbackAreaId);
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [checkpoints, setCheckpoints] = useState<Array<CheckpointItem>>([]);
  const [newCheckpointText, setNewCheckpointText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedArea = useMemo(() => startup.areas.find((area) => area._id === areaId), [areaId, startup.areas]);

  function addCheckpoint() {
    const text = newCheckpointText.trim();
    if (!text || checkpoints.length >= 100) return;
    setCheckpoints((prev) => [
      ...prev,
      { id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, text, completed: false },
    ]);
    setNewCheckpointText("");
  }

  function removeCheckpoint(id: string) {
    setCheckpoints((prev) => prev.filter((cp) => cp.id !== id));
  }

  function toggleCheckpoint(id: string) {
    setCheckpoints((prev) =>
      prev.map((cp) => (cp.id === id ? { ...cp, completed: !cp.completed } : cp)),
    );
  }

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
          ...(assigneeId === "none" ? {} : { assigneeProfileId: assigneeId as Id<"profiles"> }),
          ...(dueDate ? { dueDate: fromDateInputValue(dueDate) } : {}),
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
          ...(checkpoints.length > 0 ? { checkpoints } : {}),
        } : {}),
      });
      toast.success(
        result.nestingStatus === "pending"
          ? `${kind === "task" ? "Zadatak" : "Beleška"} je kreiran/a u oblasti i čeka odobrenje autora ciljne stranice.`
          : kind === "task"
            ? "Zadatak je kreiran."
            : "Beleška je kreirana.",
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
      <DialogContent className="max-h-[90dvh] max-w-2xl gap-0 overflow-y-auto p-0">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
            <DialogTitle className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Plus className="size-4" /></span> Nova stranica</DialogTitle>
            <DialogDescription>
              {target?.parentPageId
                ? targetParent && !targetParent.permissions.canEdit
                  ? "Stavka će biti kreirana u korenu oblasti, a autor ciljne stranice dobija zahtev za ugnježđavanje."
                  : "Biće ugnježdena unutar izabrane stranice."
                : `Dodaješ sadržaj u ${selectedArea?.label ?? "oblast"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-5 py-5 sm:px-6">
            <fieldset className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-1">
              <legend className="sr-only">Vrsta stranice</legend>
              {(["note", "task"] as const).map((value) => {
                const Icon = value === "note" ? FileText : CheckSquare2;
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
                    {value === "note" ? "Beleška" : "Zadatak"}
                  </label>
                );
              })}
            </fieldset>
            <div className="space-y-2"><Label htmlFor="new-page-title">Naslov</Label><Input id="new-page-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "task" ? "Šta treba uraditi?" : "Naslov beleške…"} maxLength={200} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="new-page-area">Oblast</Label><Select value={areaId} onValueChange={(value) => setAreaId(value as Id<"startupAreas">)} disabled={Boolean(target?.areaId)}><SelectTrigger id="new-page-area"><SelectValue /></SelectTrigger><SelectContent>{startup.areas.map((area) => <SelectItem key={area._id} value={area._id}>{area.label}</SelectItem>)}</SelectContent></Select></div>

            {kind === "note" ? (
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
                  <div className="space-y-2"><Label htmlFor="new-task-assignee">Dodeli</Label><Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger id="new-task-assignee"><SelectValue placeholder="Nije dodeljen" /></SelectTrigger><SelectContent><SelectItem value="none">Nije dodeljen</SelectItem>{members?.map(({ profile }) => <SelectItem key={profile._id} value={profile._id}>{profile.displayName}</SelectItem>)}</SelectContent></Select></div>
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
                  <div className="flex gap-2">
                    <Input
                      value={newCheckpointText}
                      onChange={(e) => setNewCheckpointText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheckpoint(); } }}
                      placeholder="Dodaj podzadatak / checkpoint..."
                      maxLength={500}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={addCheckpoint}
                      disabled={checkpoints.length >= 100}
                    >
                      <Plus className="size-4" /> Dodaj
                    </Button>
                  </div>
                  {checkpoints.length > 0 ? (
                    <div className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      {checkpoints.map((cp) => (
                        <div key={cp.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-1.5 text-sm border border-border/40">
                          <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={cp.completed}
                              onChange={() => toggleCheckpoint(cp.id)}
                              className="size-4 rounded border-primary text-primary accent-primary"
                            />
                            <span className={cp.completed ? "line-through text-muted-foreground truncate" : "truncate font-medium"}>
                              {cp.text}
                            </span>
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeCheckpoint(cp.id)}
                            aria-label={`Ukloni checkpoint: ${cp.text}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
          <DialogFooter className="border-t border-border/70 bg-muted/25 px-5 py-4 sm:px-6"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Otkaži</Button><Button type="submit" disabled={submitting || !areaId || title.trim().length === 0}>{submitting ? <LoaderCircle className="animate-spin" /> : kind === "task" ? <CheckSquare2 /> : <FileText />} Kreiraj</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
