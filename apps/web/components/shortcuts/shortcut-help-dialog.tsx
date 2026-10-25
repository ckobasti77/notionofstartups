"use client";

import { useId } from "react";

import { MotionDialog } from "@/components/motion/motion-dialog";
import { Kbd } from "@/components/ui/kbd";
import { shortcutKeys, type ShortcutDef, type ShortcutGroup } from "@/lib/shortcuts/registry";

export type ShortcutHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Array<{ group: ShortcutGroup; defs: ShortcutDef[] }>;
  isMac?: boolean;
};

/**
 * Dijalog „Prečice" (`?`). Prikazuje prečice koje su trenutno aktivne
 * (registrovane kroz `useShortcuts`), po grupama. Ide kroz `MotionDialog`
 * (plan K07, E8).
 */
export function ShortcutHelpDialog({ open, onOpenChange, groups, isMac = false }: ShortcutHelpDialogProps) {
  const idPrefix = useId();
  return (
    <MotionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Prečice"
      description="Prečice ne rade dok kucaš u polju."
      width="32rem"
    >
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
    </MotionDialog>
  );
}
