"use client";

import { useId, useMemo, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accessErrorMessage } from "@/lib/errors";
import { PAGE_KIND_META, type PageKind } from "@/lib/page-kinds";

const MAX_RELATION_CANDIDATES = 100;

export type PageRelationKind = PageKind;

export type PageRelationItem<
  PageId extends string = string,
  RelationId extends string = string,
> = {
  id: RelationId;
  pageId: PageId;
  title: string;
  kind: PageRelationKind;
  /** Naziv oblasti druge strane; `null` kad je u istoj oblasti kao stranica. */
  areaLabel: string | null;
  canDelete: boolean;
  canRequestDeletion: boolean;
};

export type PageRelationCandidate<PageId extends string = string> = {
  pageId: PageId;
  title: string;
  kind: PageRelationKind;
  /** Naziv oblasti kandidata; `null` kad je u istoj oblasti kao stranica. */
  areaLabel: string | null;
};

export type PageRelationsPanelProps<
  PageId extends string = string,
  RelationId extends string = string,
> = {
  loading: boolean;
  currentKind: PageRelationKind;
  relations: Array<PageRelationItem<PageId, RelationId>>;
  candidates: Array<PageRelationCandidate<PageId>>;
  candidatesTruncated?: boolean;
  selectedCandidate: PageId | "";
  onSelectedCandidate: (pageId: PageId | "") => void;
  busy: boolean;
  onCreate: () => void | Promise<void>;
  onDelete: (relationId: RelationId) => void | Promise<void>;
  onRequestDeletion: (relationId: RelationId) => void | Promise<void>;
  onOpenPage: (pageId: PageId) => void;
};

function kindLabel(kind: PageRelationKind) {
  return PAGE_KIND_META[kind].label;
}

/**
 * Relacija sada spaja bilo koje dve vrste, pa se druga strana više ne imenuje
 * jednom vrstom. Copy govori o „stavci”, a spisak kandidata sam pokazuje koje
 * su vrste dostupne.
 */
const RELATION_COPY = {
  accusative: "stavku",
  instrumental: "stavkom",
  noneAvailable: "Trenutno nema dostupnih stavki za povezivanje.",
  allLinked: "Sve dostupne stavke su već povezane.",
} as const;

function pageTitle(title: string) {
  return title.trim() || "Bez naslova";
}

function occurrenceLabel(
  title: string,
  index: number,
  items: Array<{ title: string }>,
) {
  const normalizedTitle = pageTitle(title);
  const matchingItems = items.filter(
    (item) => pageTitle(item.title) === normalizedTitle,
  );
  if (matchingItems.length < 2) return normalizedTitle;
  const occurrence =
    items
      .slice(0, index + 1)
      .filter((item) => pageTitle(item.title) === normalizedTitle).length;
  return `${normalizedTitle} · ${occurrence}`;
}

/**
 * „Povezano" u bočnoj koloni dokumenta (PROSTOR K10, K07 §5.6): spisak veza kao
 * mirni redovi (otvori · ukloni) i „Poveži" koje otvara izbor stavke. Props su
 * `PageRelationsPanelProps` (stari panel je obrisan u K23 — ništa ga nije
 * uvozilo); vezu menja svaki član (D20), pa nema zahteva.
 */
export function PageRelationsCompact<
  PageId extends string = string,
  RelationId extends string = string,
>({
  loading,
  relations,
  candidates,
  candidatesTruncated = false,
  selectedCandidate,
  onSelectedCandidate,
  busy,
  onCreate,
  onDelete,
  onOpenPage,
  headingId,
  failed = null,
}: Omit<PageRelationsPanelProps<PageId, RelationId>, "currentKind" | "onRequestDeletion"> & {
  headingId?: string;
  /** Spisak nije učitan: poruka i „Pokušaj ponovo" umesto večitog učitavanja. */
  failed?: { onRetry: () => void } | null;
}) {
  const fallbackHeadingId = useId();
  const titleId = headingId ?? fallbackHeadingId;
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<"create" | RelationId | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const relatedPageIds = useMemo(
    () => new Set(relations.map((relation) => relation.pageId)),
    [relations],
  );
  const available = useMemo(
    () =>
      candidates
        .filter((candidate) => !relatedPageIds.has(candidate.pageId))
        .slice(0, MAX_RELATION_CANDIDATES),
    [candidates, relatedPageIds],
  );
  const selectedIsAvailable = available.some(
    (candidate) => candidate.pageId === selectedCandidate,
  );
  const isBusy = busy || pending !== null;

  async function run(
    kind: "create" | RelationId,
    action: () => void | Promise<void>,
    fallback: string,
  ) {
    if (isBusy) return;
    setPending(kind);
    setActionError(null);
    try {
      await action();
      if (kind === "create") setPicking(false);
    } catch (error) {
      setActionError(accessErrorMessage(error, fallback));
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-labelledby={titleId} aria-busy={isBusy}>
      <h2 id={titleId} className="mb-1 flex min-h-8 items-center gap-2 text-sm font-semibold">
        Povezano
        {!loading && relations.length > 0 ? (
          <span className="font-normal tabular-nums text-muted-foreground">
            {relations.length}
          </span>
        ) : null}
      </h2>
      {failed ? (
        <div role="alert" className="space-y-1 text-sm">
          <p className="text-muted-foreground">Povezane stavke nisu učitane.</p>
          <Button type="button" variant="outline" size="sm" onClick={failed.onRetry}>
            Pokušaj ponovo
          </Button>
        </div>
      ) : loading ? (
        <div role="status" aria-label="Učitavanje povezanih stavki" className="space-y-1">
          <div className="h-8 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          <div className="h-8 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        </div>
      ) : (
        <>
          {relations.length > 0 ? (
            <ul className="space-y-0.5" aria-label="Povezane stavke">
              {relations.map((relation, index) => {
                const label = occurrenceLabel(relation.title, index, relations);
                const Icon = PAGE_KIND_META[relation.kind].icon;
                return (
                  <li
                    key={relation.id}
                    className="group flex min-h-8 items-center gap-1 rounded-md hover:bg-muted/60"
                  >
                    <button
                      type="button"
                      className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onOpenPage(relation.pageId)}
                      aria-label={`Otvori ${kindLabel(relation.kind).toLocaleLowerCase("sr-Latn-RS")}: ${label}`}
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 truncate">{label}</span>
                      {relation.areaLabel !== null ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {relation.areaLabel}
                        </span>
                      ) : null}
                    </button>
                    {relation.canDelete ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"
                        disabled={isBusy}
                        aria-label={`Ukloni vezu sa stavkom: ${label}`}
                        onClick={() =>
                          void run(
                            relation.id,
                            () => onDelete(relation.id),
                            "Veza nije uklonjena. Pokušaj ponovo.",
                          )
                        }
                      >
                        {pending === relation.id ? (
                          <LoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : (
                          <X aria-hidden="true" />
                        )}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {picking ? (
            <div className="mt-2 space-y-2">
              {available.length > 0 ? (
                <>
                  <Select
                    value={selectedIsAvailable ? selectedCandidate : undefined}
                    onValueChange={(value) => {
                      setActionError(null);
                      onSelectedCandidate(value as PageId);
                    }}
                    disabled={isBusy}
                  >
                    <SelectTrigger className="h-9 w-full" aria-label="Izaberi stavku za povezivanje">
                      <SelectValue placeholder="Izaberi stavku…" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((candidate, index) => (
                        <SelectItem key={candidate.pageId} value={candidate.pageId}>
                          {occurrenceLabel(candidate.title, index, available)}
                          {candidate.areaLabel !== null ? ` · ${candidate.areaLabel}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!selectedIsAvailable || isBusy}
                      onClick={() =>
                        void run("create", onCreate, "Veza nije napravljena. Pokušaj ponovo.")
                      }
                    >
                      {pending === "create" ? (
                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                      ) : null}
                      Poveži
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPicking(false)}>
                      Otkaži
                    </Button>
                  </div>
                  {candidatesTruncated || candidates.length > MAX_RELATION_CANDIDATES ? (
                    <p className="text-xs text-muted-foreground">
                      Prikazano je najviše {MAX_RELATION_CANDIDATES} najskorije izmenjenih stavki.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  {relations.length > 0 ? RELATION_COPY.allLinked : RELATION_COPY.noneAvailable}
                </p>
              )}
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-1.5 mt-1 text-muted-foreground"
              onClick={() => setPicking(true)}
            >
              <Plus aria-hidden="true" />
              Poveži
            </Button>
          )}
        </>
      )}
      {actionError ? (
        <p className="mt-2 text-xs leading-5 text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
