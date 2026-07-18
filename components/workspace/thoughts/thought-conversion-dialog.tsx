"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CheckSquare2,
  Eye,
  FileText,
  Layers3,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StartupWithAreas } from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  fromDateInputValue,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";

import type { ThoughtDestination } from "./types";

type ThoughtPageKind = "note" | "task";
type ThoughtLayoutMode = "combined" | "separate";

function titleFromThought(node: Pick<Doc<"thoughtNodes">, "title" | "text">) {
  const explicit = node.title?.trim();
  if (explicit) return explicit;
  const firstLine = node.text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Nova misao";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77).trimEnd()}…` : firstLine;
}

export function ThoughtConversionDialog({
  open,
  startup,
  nodes,
  destination,
  onOpenChange,
  onConverted,
}: {
  open: boolean;
  startup: StartupWithAreas;
  nodes: Array<Doc<"thoughtNodes">>;
  destination: ThoughtDestination | null;
  onOpenChange: (open: boolean) => void;
  onConverted: (pageIds: Id<"pages">[]) => void;
}) {
  const convertToPages = useMutation(api.thoughts.convertToPages);
  const members = useQuery(
    api.startups.listMembers,
    open ? { startupId: startup._id, limit: 50 } : "skip",
  );
  const orderedNodes = useMemo(
    () => [...nodes].sort((left, right) => left.y - right.y || left.x - right.x),
    [nodes],
  );
  const [pageKind, setPageKind] = useState<ThoughtPageKind>("note");
  const [layoutMode, setLayoutMode] = useState<ThoughtLayoutMode>(
    orderedNodes.length === 1 ? "separate" : "combined",
  );
  const [combinedTitle, setCombinedTitle] = useState(
    orderedNodes.length === 0
      ? ""
      : orderedNodes.length === 1
        ? titleFromThought(orderedNodes[0])
        : `${titleFromThought(orderedNodes[0])} i još ${orderedNodes.length - 1}`,
  );
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(
    Object.fromEntries(orderedNodes.map((node) => [node._id, titleFromThought(node)])),
  );
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("backlog");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [assigneeProfileId, setAssigneeProfileId] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!destination || orderedNodes.length === 0) return;
    if (layoutMode === "combined" && !combinedTitle.trim()) return;
    if (
      layoutMode === "separate" &&
      orderedNodes.some((node) => !titleOverrides[node._id]?.trim())
    ) return;

    setSubmitting(true);
    try {
      const result = await convertToPages({
        startupId: startup._id,
        nodeIds: orderedNodes.map((node) => node._id),
        targetAreaId: destination.areaId,
        targetParentPageId: destination.parentPageId,
        layoutMode,
        pageKind,
        ...(layoutMode === "combined"
          ? { combinedTitle: combinedTitle.trim() }
          : {
              titleOverrides: orderedNodes.map((node) => ({
                nodeId: node._id,
                title: titleOverrides[node._id].trim(),
              })),
            }),
        ...(pageKind === "task"
          ? {
              taskStatus,
              taskPriority,
              assigneeProfileId:
                assigneeProfileId === "none"
                  ? null
                  : (assigneeProfileId as Id<"profiles">),
              dueDate: dueDate ? fromDateInputValue(dueDate) ?? null : null,
            }
          : {}),
      });

      onOpenChange(false);
      onConverted(result.pageIds);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Misli nisu poslate u radni prostor.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isCombined = layoutMode === "combined";
  const destinationLabel = destination?.label ?? "izabrano mesto";

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] max-w-2xl gap-0 overflow-y-auto p-0">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
            <DialogTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                <Layers3 className="size-4" />
              </span>
              Pošalji u radni prostor
            </DialogTitle>
            <DialogDescription>
              Odredi kako će {orderedNodes.length === 1 ? "ova misao" : `${orderedNodes.length} misli`} izgledati u „{destinationLabel}”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm">
              <Eye className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="font-semibold text-foreground">Kopija postaje vidljiva timu.</p>
                <p className="mt-0.5 leading-5 text-muted-foreground">
                  Original ostaje u „Mojim mislima” i kasnije izmene se neće sinhronizovati.
                </p>
              </div>
              <LockKeyhole className="mt-0.5 ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Vrsta stranice</legend>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-1">
                {(["note", "task"] as const).map((kind) => {
                  const Icon = kind === "note" ? FileText : CheckSquare2;
                  return (
                    <label
                      key={kind}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
                        pageKind === kind
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="thought-page-kind"
                        checked={pageKind === kind}
                        onChange={() => setPageKind(kind)}
                      />
                      <Icon className="size-4" />
                      {kind === "note" ? "Beleška" : "Zadatak"}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {orderedNodes.length > 1 ? (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Raspored</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["combined", "separate"] as const).map((mode) => (
                    <label
                      key={mode}
                      className={cn(
                        "cursor-pointer rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring",
                        layoutMode === mode
                          ? "border-primary bg-primary/7"
                          : "border-border bg-card hover:bg-accent/30",
                      )}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="thought-layout-mode"
                        checked={layoutMode === mode}
                        onChange={() => setLayoutMode(mode)}
                      />
                      <span className="block text-sm font-semibold">
                        {mode === "combined" ? "Spoji u jednu" : "Svaka zasebno"}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {mode === "combined"
                          ? pageKind === "task"
                            ? "Jedan zadatak sa checklist stavkama."
                            : "Jedna beleška sa odeljkom za svaku misao."
                          : `Kreira ${orderedNodes.length} zasebnih stranica istog tipa.`}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {isCombined ? (
              <div className="space-y-2">
                <Label htmlFor="thought-combined-title">Naslov</Label>
                <Input
                  id="thought-combined-title"
                  value={combinedTitle}
                  onChange={(event) => setCombinedTitle(event.target.value)}
                  maxLength={200}
                  required
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Naslovi {orderedNodes.length > 1 ? "stranica" : "stranice"}</Label>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-border/75 bg-muted/20 p-2 scrollbar-thin">
                  {orderedNodes.map((node, index) => (
                    <div key={node._id} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-center text-[0.6875rem] tabular-nums text-muted-foreground">{index + 1}</span>
                      <Input
                        value={titleOverrides[node._id] ?? ""}
                        onChange={(event) =>
                          setTitleOverrides((current) => ({
                            ...current,
                            [node._id]: event.target.value,
                          }))
                        }
                        maxLength={200}
                        aria-label={`Naslov stranice ${index + 1}`}
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pageKind === "task" ? (
              <div className="grid gap-4 rounded-xl border border-border/75 bg-muted/20 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="thought-task-status">Status</Label>
                  <Select value={taskStatus} onValueChange={(value) => setTaskStatus(value as TaskStatus)}>
                    <SelectTrigger id="thought-task-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_STATUS_META).map(([value, meta]) => (
                        <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thought-task-priority">Prioritet</Label>
                  <Select value={taskPriority} onValueChange={(value) => setTaskPriority(value as TaskPriority)}>
                    <SelectTrigger id="thought-task-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_PRIORITY_META).map(([value, meta]) => (
                        <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thought-task-assignee">Dodeli</Label>
                  <Select value={assigneeProfileId} onValueChange={setAssigneeProfileId}>
                    <SelectTrigger id="thought-task-assignee"><SelectValue placeholder="Nije dodeljen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nije dodeljen</SelectItem>
                      {members?.map(({ profile }) => (
                        <SelectItem key={profile._id} value={profile._id}>{profile.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thought-task-due">Rok</Label>
                  <Input id="thought-task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/25 px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Otkaži</Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                !destination ||
                orderedNodes.length === 0 ||
                (isCombined
                  ? !combinedTitle.trim()
                  : orderedNodes.some((node) => !titleOverrides[node._id]?.trim()))
              }
            >
              {submitting ? <LoaderCircle className="animate-spin" /> : pageKind === "task" ? <CheckSquare2 /> : <FileText />}
              {submitting ? "Kreiram kopiju…" : `Kreiraj ${isCombined ? "stranicu" : orderedNodes.length === 1 ? "stranicu" : `${orderedNodes.length} stranice`}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
