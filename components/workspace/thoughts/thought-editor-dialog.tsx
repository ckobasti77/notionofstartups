"use client";

import { useState } from "react";
import { Link2, LoaderCircle, Sparkles } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  ItemSizePicker,
  workspaceItemDialogContentClass,
  type ItemSizePreset,
} from "@/components/workspace/workspace-item-dialog";
import { cn } from "@/lib/utils";

import type { ThoughtEditorValue, ThoughtNodeColor } from "./types";

const COLOR_OPTIONS: Array<{
  value: ThoughtNodeColor;
  label: string;
  className: string;
}> = [
  { value: "neutral", label: "Neutralna", className: "bg-slate-400" },
  { value: "violet", label: "Ljubičasta", className: "bg-violet-500" },
  { value: "blue", label: "Plava", className: "bg-blue-500" },
  { value: "green", label: "Zelena", className: "bg-emerald-500" },
  { value: "amber", label: "Ćilibar", className: "bg-amber-500" },
  { value: "rose", label: "Roze", className: "bg-rose-500" },
];

export function ThoughtEditorDialog({
  open,
  mode,
  initialValue,
  connected = false,
  pending,
  sizePreset,
  onSizePresetChange,
  onSizeReset,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialValue?: ThoughtEditorValue;
  connected?: boolean;
  pending: boolean;
  sizePreset?: ItemSizePreset;
  onSizePresetChange?: (preset: ItemSizePreset) => void;
  onSizeReset?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: ThoughtEditorValue) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initialValue?.title ?? "");
  const [text, setText] = useState(initialValue?.text ?? "");
  const [color, setColor] = useState<ThoughtNodeColor>(initialValue?.color ?? "violet");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    await onSubmit({ title: title.trim(), text: text.trim(), color });
  }

  const dirty =
    title !== (initialValue?.title ?? "") ||
    text !== (initialValue?.text ?? "") ||
    color !== (initialValue?.color ?? "violet");

  function requestClose() {
    if (pending) return;
    if (dirty && !window.confirm("Odbaciti nesačuvane izmene?")) return;
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose();
      }}
    >
      <DialogContent
        className={`${workspaceItemDialogContentClass} sm:h-auto sm:max-w-xl`}
      >
        <form className="flex h-full min-h-0 flex-col" onSubmit={submit}>
          <DialogHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
            <DialogTitle className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                {connected ? <Link2 className="size-4" /> : <Sparkles className="size-4" />}
              </span>
              {mode === "edit" ? "Uredi misao" : connected ? "Nova povezana misao" : "Nova misao"}
            </DialogTitle>
            <DialogDescription>
              {connected
                ? "Nova misao će odmah biti povezana sa izabranom."
                : "Naslov i tekst ostaju privatni samo tebi."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="thought-title">Naslov</Label>
              <Input
                id="thought-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Kratko ime za ovu misao"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="thought-text">Misao</Label>
              <Textarea
                id="thought-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Zapiši ono što ne želiš da izgubiš…"
                className="min-h-36 resize-y leading-6"
                maxLength={12_000}
                required
              />
              <p className="text-right text-[0.6875rem] tabular-nums text-muted-foreground">{text.length}/12.000</p>
            </div>
            {mode === "edit" && onSizePresetChange ? (
              <ItemSizePicker
                value={sizePreset}
                onChange={onSizePresetChange}
                onReset={onSizeReset}
              />
            ) : null}
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Boja oblačića</legend>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring",
                      color === option.value ? "border-primary bg-primary/8 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="thought-color"
                      value={option.value}
                      checked={color === option.value}
                      onChange={() => setColor(option.value)}
                    />
                    <span className={cn("size-2.5 rounded-full", option.className)} aria-hidden="true" />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/25 px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" onClick={requestClose} disabled={pending}>
              Otkaži
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                title.trim().length === 0 ||
                text.trim().length === 0
              }
            >
              {pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {mode === "edit" ? "Sačuvaj" : "Dodaj misao"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EdgeEditorDialog({
  open,
  initialLabel,
  description = "Opciono objasni kako su dve misli povezane.",
  inputId = "thought-edge-label",
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initialLabel: string;
  description?: string;
  inputId?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (label: string) => void | Promise<void>;
}) {
  const [label, setLabel] = useState(initialLabel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Naziv veze</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(label.trim());
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={inputId}>Naziv</Label>
            <Input
              id={inputId}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="npr. vodi ka, zavisi od…"
              maxLength={100}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Otkaži</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Link2 />}
              Sačuvaj vezu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
