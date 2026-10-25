import { Skeleton } from "@/components/ui/skeleton";

/** Učitavanje: 6 redova (plan K07 §1.5), oblik reda Inboxa. */
export function InboxSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-1.5">
      <span className="sr-only">Učitavanje obaveštenja</span>
      <Skeleton className="mb-2 ml-1 h-3.5 w-16" />
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={row % 2 === 0 ? "h-4 w-4/5" : "h-4 w-3/5"} />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
