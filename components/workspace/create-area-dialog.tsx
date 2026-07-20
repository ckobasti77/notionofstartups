"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { FolderPlus, LoaderCircle } from "lucide-react";
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
import type { StartupWithAreas } from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function CreateAreaDialog({
  open,
  onOpenChange,
  startup,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startup: StartupWithAreas;
  onCreated?: (areaId: Id<"startupAreas">) => void;
}) {
  const createArea = useMutation(api.startups.createArea);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (label.trim().length === 0) return;
    setSubmitting(true);
    try {
      const areaId = await createArea({
        startupId: startup._id,
        label: label.trim(),
      });
      toast.success("Nova oblast je kreirana.");
      setLabel("");
      onOpenChange(false);
      if (onCreated) {
        onCreated(areaId);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Greška pri kreiranju oblasti."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
            <DialogTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <FolderPlus className="size-4" />
              </span>
              Nova oblast
            </DialogTitle>
            <DialogDescription>
              Kreiraj novu oblast u timskom prostoru startupa {startup.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="new-area-label">Naziv oblasti</Label>
              <Input
                id="new-area-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="npr. HR, Finansije, Logistika..."
                maxLength={100}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="border-t border-border/70 bg-muted/25 px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Otkaži
            </Button>
            <Button
              type="submit"
              disabled={submitting || label.trim().length === 0}
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FolderPlus />
              )}
              Kreiraj
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
