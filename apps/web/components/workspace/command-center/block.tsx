"use client";

import { Component, createContext, useContext, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";

/** Stanje jednog bloka Komandnog centra (K19): svaki blok se učitava i pada za sebe. */
export type BlockStatus = "loading" | "error" | "ready";

/** Skeleton redova iste visine kao pravi redovi (DIZAJN-SMIRENJE §5.2: 5 redova). */
export function BlockSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-1">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Greška bloka: „<Šta> nije učitano." + „Pokušaj ponovo" (ponovo montira blok). */
export function BlockError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-sm">
      <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="text-muted-foreground">{text}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Pokušaj ponovo
      </Button>
    </div>
  );
}

/**
 * Blok Komandnog centra: `section` sa naslovom sekcije (DIZAJN-SMIRENJE §2), pa
 * ili skeleton, ili greška, ili sadržaj. Nije kartica — sekcija je naslov + sadržaj.
 */
export function Block({
  id,
  title,
  count,
  action,
  status,
  errorText,
  onRetry,
  skeletonRows,
  children,
  className,
}: {
  id: string;
  title: string;
  /** Broj uz naslov (meta); crta se samo kad je blok učitan. */
  count?: number | string;
  /** Radnja desno od naslova; crta se samo kad je blok učitan. */
  action?: ReactNode;
  status: BlockStatus;
  errorText: string;
  onRetry: () => void;
  skeletonRows?: number;
  children: ReactNode;
  className?: string;
}) {
  const ready = status === "ready";
  return (
    <section
      id={id}
      aria-labelledby={`${id}-naslov`}
      aria-busy={status === "loading" ? true : undefined}
      // Programski fokus (-1): posle akcije koja ukloni fokusirani element fokus ide na blok.
      tabIndex={-1}
      className={cn("min-w-0 outline-none", className)}
    >
      <SectionHeading
        id={`${id}-naslov`}
        title={title}
        count={ready ? count : undefined}
        action={ready ? action : undefined}
      />
      {status === "loading" ? (
        <BlockSkeleton rows={skeletonRows} label={`Učitavanje: ${title}`} />
      ) : status === "error" ? (
        <BlockError text={errorText} onRetry={onRetry} />
      ) : (
        children
      )}
    </section>
  );
}

/** „Pokušaj ponovo" iz bloka: ponovo montira ga (nova pretplata). */
const BlockRetryContext = createContext<() => void>(() => undefined);

export function useBlockRetry(): () => void {
  return useContext(BlockRetryContext);
}

/**
 * Granica jednog bloka: ako blok (npr. `useQuery`) baci grešku tokom rendera,
 * pada samo on — ostali blokovi i zaglavlje rade dalje. Isti „Pokušaj ponovo"
 * koristi i blok koji grešku vrati kao vrednost (`useBlockRetry`).
 */
export class BlockBoundary extends Component<
  {
    id: string;
    title: string;
    errorText: string;
    children: ReactNode;
    className?: string;
    /** Poziva se pri „Pokušaj ponovo" (npr. da roditelj ponovo montira blokove koji dele pretplatu). */
    onRetry?: () => void;
  },
  { error: Error | null; attempt: number }
> {
  state: { error: Error | null; attempt: number } = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private retry = () => {
    this.props.onRetry?.();
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  render() {
    if (this.state.error !== null) {
      return (
        <Block
          id={this.props.id}
          title={this.props.title}
          status="error"
          errorText={this.props.errorText}
          onRetry={this.retry}
          className={this.props.className}
        >
          {null}
        </Block>
      );
    }
    return (
      <BlockRetryContext.Provider key={this.state.attempt} value={this.retry}>
        {this.props.children}
      </BlockRetryContext.Provider>
    );
  }
}
