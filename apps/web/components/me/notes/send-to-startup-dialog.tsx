"use client";

import { useId, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import {
  defaultSendTarget,
  NOTE_SEND_HINT,
  NOTE_SEND_NO_STARTUP,
  NOTE_SEND_TITLE,
  noteDisplayTitle,
} from "@devotion/shared";

import { MotionDialog } from "@/components/motion/motion-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StartupChip } from "../startup-chip";
import type { NoteStartup } from "./note-row";

export type SendToStartupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Beleška koja se šalje; `null` dok je dijalog zatvoren. */
  note: { title: string | null; text: string; startupId: string | null } | null;
  /** Startupi u kojima sam aktivan član. */
  startups: ReadonlyArray<NoteStartup>;
  /** Pravi ideju u izabranom startupu; greška (poruka) se prikazuje u dijalogu. */
  onSend: (startupId: string) => Promise<void>;
  /** Izlog: početna greška. */
  initialError?: string | null;
};

/**
 * „Pošalji u startup" (P7, K07 §5.10): izbor startupa (samo aktivna članstva)
 * pa „Pošalji kao ideju". Server pravi ideju u fazi Predlog; beleška ostaje
 * privatna. Sadržaj je zaseban (`key` po belešci) da svako otvaranje počne od
 * podrazumevanog cilja.
 */
export function SendToStartupDialog({ open, onOpenChange, note, ...props }: SendToStartupDialogProps) {
  return (
    <MotionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={NOTE_SEND_TITLE}
      description={NOTE_SEND_HINT}
      width="28rem"
      bodyClassName="px-5 py-4"
    >
      {note ? <SendForm {...props} note={note} onClose={() => onOpenChange(false)} /> : null}
    </MotionDialog>
  );
}

function SendForm({
  note,
  startups,
  onSend,
  onClose,
  initialError = null,
}: Omit<SendToStartupDialogProps, "open" | "onOpenChange" | "note"> & {
  note: NonNullable<SendToStartupDialogProps["note"]>;
  onClose: () => void;
}) {
  const startupIds = startups.map((startup) => startup._id);
  const [target, setTarget] = useState<string | null>(() => defaultSendTarget(note, startupIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const labelId = useId();
  const errorId = useId();

  const submit = async () => {
    if (target === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(target);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Beleška nije poslata. Pokušaj ponovo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="truncate rounded-lg bg-muted px-3 py-2 text-sm font-medium" title={noteDisplayTitle(note)}>
        {noteDisplayTitle(note)}
      </p>
      {startups.length === 0 ? (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {NOTE_SEND_NO_STARTUP}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p id={labelId} className="text-sm font-medium">
            Startup
          </p>
          <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
            {startups.map((startup) => {
              const selected = target === startup._id;
              return (
                <button
                  key={startup._id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setTarget(startup._id);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    const index = startups.findIndex((item) => item._id === target);
                    const step =
                      event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? 1
                        : event.key === "ArrowLeft" || event.key === "ArrowUp"
                          ? -1
                          : 0;
                    if (step === 0) return;
                    event.preventDefault();
                    const next = startups[(index + step + startups.length) % startups.length];
                    setTarget(next._id);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                      [startups.indexOf(next)]?.focus();
                  }}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors pointer-coarse:min-h-11",
                    selected
                      ? "border-primary/60 bg-accent text-accent-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <StartupChip startup={startup} size="xs" />
                  <span className="max-w-[10rem] truncate">{startup.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Otkaži
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={target === null || busy}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Pošalji kao ideju
        </Button>
      </div>
    </div>
  );
}
