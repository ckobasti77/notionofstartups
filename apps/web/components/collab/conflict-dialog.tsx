"use client";

import { useRef } from "react";
import { Copy, LoaderCircle } from "lucide-react";

import { MotionDialog } from "@/components/motion";
import { Button } from "@/components/ui/button";

import { conflictCopy, type ConflictSubject } from "./collab-model";

export type ConflictDialogProps = {
  open: boolean;
  /** Esc / klik van: zatvori bez radnje (stanje konflikta ostaje). */
  onOpenChange: (open: boolean) => void;
  subject?: ConflictSubject;
  updaterName: string | null;
  updatedAt: number | null;
  now: number;
  /** „Kopiraj moju verziju" (pre „Učitaj najnoviju"); bez nje dugme se ne prikazuje. */
  onCopy?: () => void;
  onLoadLatest: () => void;
  onOverwrite: () => void;
  busy?: boolean;
};

/**
 * Konflikt revizije (PROSTOR P23, K07 §6.5): neko je sačuvao posle tebe.
 * „Učitaj najnoviju" odbacuje tvoj nacrt (fokus je na njoj — bezbedniji izbor),
 * „Prepiši" ponavlja isti upis preko tuđe verzije, koja ostaje u Istoriji izmena.
 */
export function ConflictDialog({
  open,
  onOpenChange,
  subject = "page",
  updaterName,
  updatedAt,
  now,
  onCopy,
  onLoadLatest,
  onOverwrite,
  busy = false,
}: ConflictDialogProps) {
  const loadRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const copy = conflictCopy({ subject, updaterName, updatedAt, now });
  return (
    <MotionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.body}
      bodyClassName="pt-0"
      width="30rem"
      // Dijalog se otvara sam usred kucanja: fokus na bezopasnu radnju (kopija),
      // da Space/Enter ne odbaci nacrt. Bez kopije — „Učitaj najnoviju".
      initialFocus={() => copyRef.current ?? loadRef.current}
      footer={
        <>
          {onCopy ? (
            <Button ref={copyRef} type="button" variant="ghost" className="mr-auto" onClick={onCopy}>
              <Copy aria-hidden="true" />
              Kopiraj moju verziju
            </Button>
          ) : null}
          <Button ref={loadRef} type="button" variant="outline" disabled={busy} onClick={onLoadLatest}>
            Učitaj najnoviju
          </Button>
          <Button type="button" disabled={busy} onClick={onOverwrite}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Prepiši
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-muted-foreground">
        Ako prepišeš, verzija tima ostaje u Istoriji izmena.
      </p>
    </MotionDialog>
  );
}
