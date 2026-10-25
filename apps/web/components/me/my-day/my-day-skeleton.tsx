import { Skeleton } from "@/components/ui/skeleton";

/** Učitavanje Moj dan: oblik zaglavlja, prstena, tri sekcije i kolone (bez skakanja rasporeda). */
export function MyDaySkeleton({ withSide = true }: { withSide?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Učitavanje dana"
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 lg:px-8 lg:py-8"
    >
      <span className="sr-only">Učitavanje dana…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="size-14 rounded-full" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="mt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6">
        <div className="space-y-5">
          <Skeleton className="h-10 w-full rounded-xl" />
          {[0, 1, 2].map((section) => (
            <div key={section} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-14 w-full rounded-xl md:h-11" />
              ))}
            </div>
          ))}
        </div>
        {withSide ? (
          <div className="hidden space-y-3 xl:block">
            {[0, 1, 2].map((block) => (
              <Skeleton key={block} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
