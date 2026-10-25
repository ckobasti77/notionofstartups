import { PRIORITY_LABELS, type TaskPriorityKey } from "@devotion/shared";

import { cn } from "@/lib/utils";

/**
 * Tačka prioriteta u redu (plan K07 §5). Samo za „Visok" i „Hitno" — srednji
 * je podrazumevan skoro svuda, pa bi tačka na svakom redu bila šum (isto kao
 * telefon, K09). Boja je token statusa, nikad ton startupa; tamni obod drži
 * granicu tačke ≥ 3:1 i u svetloj temi (`--warning` sam je ~2,9:1 na kartici).
 */
export function PriorityDot({ priority, className }: { priority: TaskPriorityKey | null; className?: string }) {
  if (priority !== "urgent" && priority !== "high") return null;
  return (
    <span
      role="img"
      aria-label={`Prioritet: ${PRIORITY_LABELS[priority]}`}
      title={`Prioritet: ${PRIORITY_LABELS[priority]}`}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full ring-1 ring-inset ring-foreground/35",
        priority === "urgent" ? "bg-destructive" : "bg-warning",
        className,
      )}
    />
  );
}
