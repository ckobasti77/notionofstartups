"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckSquare2, FileText, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TASK_PRIORITY_META, TASK_STATUS_META, fromDateInputValue, type TaskPriority, type TaskStatus } from "@/lib/workspace";

export function CreatePageDialog({ open, onOpenChange, startup, target, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; startup: StartupWithAreas; target?: CreatePageTarget; onCreated: (pageId: Id<"pages">) => void }) {
  const createPage = useMutation(api.pages.create);
  const members = useQuery(api.startups.listMembers, open ? { startupId: startup._id, limit: 50 } : "skip");
  const fallbackAreaId = startup.areas[0]?._id;
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"note" | "task">(target?.initialKind ?? "note");
  const [areaId, setAreaId] = useState<Id<"startupAreas"> | undefined>(target?.areaId ?? fallbackAreaId);
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedArea = useMemo(() => startup.areas.find((area) => area._id === areaId), [areaId, startup.areas]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!areaId || title.trim().length === 0) return;
    setSubmitting(true);
    try {
      const pageId = await createPage({
        startupId: startup._id,
        areaId,
        parentPageId: target?.parentPageId ?? null,
        kind,
        title: title.trim(),
        ...(kind === "task" ? {
          taskStatus: status,
          taskPriority: priority,
          ...(assigneeId === "none" ? {} : { assigneeProfileId: assigneeId as Id<"profiles"> }),
          ...(dueDate ? { dueDate: fromDateInputValue(dueDate) } : {}),
        } : {}),
      });
      toast.success(kind === "task" ? "Zadatak je kreiran." : "Beleška je kreirana.");
      onOpenChange(false);
      onCreated(pageId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stranica nije kreirana.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl gap-0 overflow-y-auto p-0">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
            <DialogTitle className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Plus className="size-4" /></span> Nova stranica</DialogTitle>
            <DialogDescription>{target?.parentPageId ? "Biće ugnježdena unutar izabrane stranice." : `Dodaješ sadržaj u ${selectedArea?.label ?? "oblast"}.`}</DialogDescription>
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
            <div className="space-y-2"><Label htmlFor="new-page-title">Naslov</Label><Input id="new-page-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "task" ? "Šta treba uraditi?" : "O čemu želite da pišete?"} maxLength={200} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="new-page-area">Oblast</Label><Select value={areaId} onValueChange={(value) => setAreaId(value as Id<"startupAreas">)} disabled={Boolean(target?.areaId)}><SelectTrigger id="new-page-area"><SelectValue /></SelectTrigger><SelectContent>{startup.areas.map((area) => <SelectItem key={area._id} value={area._id}>{area.label}</SelectItem>)}</SelectContent></Select></div>
            {kind === "task" ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-task-status">Status</Label><Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}><SelectTrigger id="new-task-status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_STATUS_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="new-task-priority">Prioritet</Label><Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}><SelectTrigger id="new-task-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_PRIORITY_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="new-task-assignee">Dodeli</Label><Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger id="new-task-assignee"><SelectValue placeholder="Nije dodeljen" /></SelectTrigger><SelectContent><SelectItem value="none">Nije dodeljen</SelectItem>{members?.map(({ profile }) => <SelectItem key={profile._id} value={profile._id}>{profile.displayName}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="new-task-due">Rok</Label><Input id="new-task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div> : null}
          </div>
          <DialogFooter className="border-t border-border/70 bg-muted/25 px-5 py-4 sm:px-6"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Otkaži</Button><Button type="submit" disabled={submitting || !areaId || title.trim().length === 0}>{submitting ? <LoaderCircle className="animate-spin" /> : kind === "task" ? <CheckSquare2 /> : <FileText />} Kreiraj</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
