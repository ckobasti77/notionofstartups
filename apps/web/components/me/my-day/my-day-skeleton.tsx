import { Skeleton } from "@/components/ui/skeleton";

/** Učitavanje Moj dan: oblik zaglavlja, prstena i tri sekcije (bez skakanja rasporeda). */
export function MyDaySkeleton() {
  return (
    <div
      role="status"
      aria-label="Učitavanje dana"
      className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="size-[3.25rem] rounded-full" />
      </div>
      <div className="mt-6 space-y-6">
        {[0, 1, 2].map((section) => (
          <div key={section} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-14 w-full rounded-xl md:h-11" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
