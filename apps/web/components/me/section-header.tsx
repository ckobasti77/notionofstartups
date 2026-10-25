"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Collapse } from "@/components/motion/collapse";
import { NumberRoll } from "@/components/motion/number-roll";
import { cn } from "@/lib/utils";

export type TaskSectionProps = {
  title: string;
  count: number;
  /** Sklopiva sekcija (Blokirano, Završeno danas). */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Prekoračeno nosi ton greške u naslovu. */
  tone?: "default" | "danger";
  /** Ikonica ili čip ispred naslova (npr. čip startupa u prikazu „po startupu"). */
  leading?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * Sekcija liste zadataka (plan K07 §5): overline naslov + broj koji se
 * kotrlja (`NumberRoll`). Sklopiva sekcija ide kroz `Collapse` i nosi
 * `aria-expanded`. Naslov je h2 (overline je stil, ne element).
 */
export function TaskSection({
  title,
  count,
  collapsible = false,
  defaultCollapsed = false,
  tone = "default",
  leading,
  className,
  children,
}: TaskSectionProps) {
  const headingId = useId();
  const listId = useId();
  const [open, setOpen] = useState(!(collapsible && defaultCollapsed));
  const label = cn(
    "text-[0.6875rem] font-bold uppercase tracking-[0.12em]",
    tone === "danger" ? "text-destructive" : "text-muted-foreground",
  );

  return (
    <section aria-labelledby={headingId} className={className}>
      {collapsible ? (
        <h2 id={headingId} className="mb-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 transition-colors hover:text-foreground",
              label,
            )}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")}
            />
            {leading}
            {title}
            <NumberRoll value={count} className="font-mono" />
          </button>
        </h2>
      ) : (
        <h2 id={headingId} className={cn("mb-1 flex min-h-8 items-center gap-2 px-2", label)}>
          {leading}
          <span className="min-w-0 truncate">{title}</span>
          <NumberRoll value={count} className="font-mono" />
        </h2>
      )}
      {collapsible ? (
        <Collapse open={open} id={listId}>
          {children}
        </Collapse>
      ) : (
        children
      )}
    </section>
  );
}
