"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  ArrowRight,
  FileCheck2,
  Lightbulb,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
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
import type { StartupWithAreas } from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

function titleFromThought(node: Pick<Doc<"thoughtNodes">, "title" | "text">) {
  const explicit = node.title?.trim();
  if (explicit) return explicit;
  const firstLine =
    node.text.split(/\r?\n/).find((line) => line.trim())?.trim() ??
    "Nova misao";
  return firstLine.length > 80
    ? `${firstLine.slice(0, 77).trimEnd()}…`
    : firstLine;
}

export function ThoughtConversionDialog({
  open,
  startup,
  nodes,
  onOpenChange,
  onConverted,
}: {
  open: boolean;
  startup: StartupWithAreas;
  nodes: Array<Doc<"thoughtNodes">>;
  onOpenChange: (open: boolean) => void;
  onConverted: (ideaIds: Id<"ideaNodes">[]) => void;
}) {
  const convertToIdeas = useMutation(api.thoughts.convertToIdeas);
  const [submitting, setSubmitting] = useState(false);
  const orderedNodes = useMemo(
    () =>
      [...nodes].sort(
        (left, right) =>
          left.y - right.y ||
          left.x - right.x ||
          left._id.localeCompare(right._id),
      ),
    [nodes],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (orderedNodes.length === 0) return;

    setSubmitting(true);
    try {
      const result = await convertToIdeas({
        startupId: startup._id,
        nodeIds: orderedNodes.map((node) => node._id),
      });
      onOpenChange(false);
      onConverted(result.ideaIds);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Misli nisu poslate u Ideje.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedLabel =
    orderedNodes.length === 1
      ? "1 izabrana misao"
      : `${orderedNodes.length} izabrane misli`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/10">
                <Sparkles className="size-3.5" />
              </span>
              Korak 1 od 2
            </div>
            <DialogTitle>Pošalji u Ideje</DialogTitle>
            <DialogDescription>
              Misao prvo postaje timska ideja. Tek zatim iz Ideja biraš oblast i
              pretvaraš je u zadatak ili belešku.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div
              className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2"
              aria-label="Tok: Moje misli, Ideje, Zadatak ili beleška"
            >
              <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-3 text-center">
                <LockKeyhole className="mx-auto size-4 text-primary" />
                <p className="mt-1.5 text-xs font-bold">Moje misli</p>
                <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
                  privatno
                </p>
              </div>
              <ArrowRight
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/8 px-3 py-3 text-center">
                <Lightbulb className="mx-auto size-4 text-amber-500" />
                <p className="mt-1.5 text-xs font-bold">Ideje</p>
                <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
                  timski kanvas
                </p>
              </div>
              <ArrowRight
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="rounded-xl border border-border bg-muted/35 px-3 py-3 text-center">
                <FileCheck2 className="mx-auto size-4 text-muted-foreground" />
                <p className="mt-1.5 text-xs font-bold">Rad</p>
                <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
                  task ili note
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/75 bg-muted/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{selectedLabel}</p>
                {orderedNodes.length > 1 ? (
                  <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-muted-foreground">
                    <Link2 className="size-3.5" />
                    Veze se čuvaju
                  </span>
                ) : null}
              </div>
              <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                {orderedNodes.map((node) => (
                  <div
                    key={node._id}
                    className="rounded-lg border border-border/65 bg-background/70 px-3 py-2 text-xs font-medium"
                  >
                    {titleFromThought(node)}
                  </div>
                ))}
              </div>
            </div>

            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
              Original ostaje privatan u „Mojim mislima“. U Idejama se pravi
              timska kopija za glasanje i dalju obradu.
            </p>
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/20 px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Otkaži
            </Button>
            <Button type="submit" disabled={submitting || orderedNodes.length === 0}>
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Lightbulb />
              )}
              {submitting
                ? "Šaljem u Ideje…"
                : orderedNodes.length === 1
                  ? "Pošalji u Ideje"
                  : `Pošalji ${orderedNodes.length} misli`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
