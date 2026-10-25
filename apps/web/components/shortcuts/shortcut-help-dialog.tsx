"use client";

import { useId } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shortcutKeys, type ShortcutDef, type ShortcutGroup } from "@/lib/shortcuts/registry";

export type ShortcutHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Array<{ group: ShortcutGroup; defs: ShortcutDef[] }>;
  isMac?: boolean;
};

/** Taster u stilu aplikacije (DNK: mono, 11 px, podloga `muted`). */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold leading-4 text-foreground">
      {children}
    </kbd>
  );
}

/**
 * Dijalog „Prečice" (`?`). Prikazuje prečice koje su trenutno aktivne
 * (registrovane kroz `useShortcuts`), po grupama. Do K10 ide kroz `ui/dialog`;
 * K10 ga prebacuje na `MotionDialog` (plan K07, E8).
 */
export function ShortcutHelpDialog({ open, onOpenChange, groups, isMac = false }: ShortcutHelpDialogProps) {
  const idPrefix = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prečice</DialogTitle>
          <DialogDescription>Prečice ne rade dok kucaš u polju.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {groups.map(({ group, defs }, index) => (
            <section key={group} aria-labelledby={`${idPrefix}-grupa-${index}`}>
              <h3
                id={`${idPrefix}-grupa-${index}`}
                className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground"
              >
                {group}
              </h3>
              <dl className="divide-y divide-border/70 rounded-xl border bg-card">
                {defs.map((def) => (
                  <div key={def.id} className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5">
                    <dt className="text-sm">{def.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1" aria-label={shortcutKeys(def, isMac).join(" + ")}>
                      {shortcutKeys(def, isMac).map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
