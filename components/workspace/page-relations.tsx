"use client";

import { useId, useMemo, useState } from "react";
import {
  ArrowRight,
  GitPullRequestArrow,
  Link2,
  LoaderCircle,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_KIND_META, type PageKind } from "@/lib/page-kinds";
import { cn } from "@/lib/utils";

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
  canDelete: boolean;
  canRequestDeletion: boolean;
};

export type PageRelationCandidate<PageId extends string = string> = {
  pageId: PageId;
  title: string;
  kind: PageRelationKind;
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

type PendingAction<RelationId extends string> =
  | { kind: "create" }
  | { kind: "delete"; relationId: RelationId }
  | { kind: "requestDeletion"; relationId: RelationId }
  | null;

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
  noneAvailable: "U ovoj oblasti trenutno nema dostupnih stavki.",
  allLinked: "Sve dostupne stavke su već povezane.",
} as const;

function RelationKindIcon({ kind }: { kind: PageRelationKind }) {
  const meta = PAGE_KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-muted/70",
        meta.textClass,
      )}
      aria-hidden="true"
    >
      <Icon className="size-3.5" />
    </span>
  );
}

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

export function PageRelationsPanel<
  PageId extends string = string,
  RelationId extends string = string,
>({
  loading,
  currentKind,
  relations,
  candidates,
  candidatesTruncated = false,
  selectedCandidate,
  onSelectedCandidate,
  busy,
  onCreate,
  onDelete,
  onRequestDeletion,
  onOpenPage,
}: PageRelationsPanelProps<PageId, RelationId>) {
  const headingId = useId();
  const descriptionId = useId();
  const [pendingAction, setPendingAction] =
    useState<PendingAction<RelationId>>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const relatedPageIds = useMemo(
    () => new Set(relations.map((relation) => relation.pageId)),
    [relations],
  );
  // Vezuje se sve sa svim: jedini uslov je da kandidat već nije povezan.
  const allAvailableCandidates = useMemo(
    () =>
      candidates.filter((candidate) => !relatedPageIds.has(candidate.pageId)),
    [candidates, relatedPageIds],
  );
  const visibleCandidates = allAvailableCandidates.slice(
    0,
    MAX_RELATION_CANDIDATES,
  );
  const selectedCandidateIsAvailable = visibleCandidates.some(
    (candidate) => candidate.pageId === selectedCandidate,
  );
  const isBusy = busy || pendingAction !== null;
  const currentLabel = kindLabel(currentKind);
  const oppositeCopy = RELATION_COPY;

  async function createRelation() {
    if (!selectedCandidateIsAvailable || isBusy) return;
    setPendingAction({ kind: "create" });
    setActionError(null);
    try {
      await onCreate();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Veza nije napravljena. Pokušaj ponovo.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteRelation(relationId: RelationId) {
    if (isBusy) return;
    setPendingAction({ kind: "delete", relationId });
    setActionError(null);
    try {
      await onDelete(relationId);
    } catch (error) {
      setActionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Veza nije uklonjena. Pokušaj ponovo.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function requestRelationDeletion(relationId: RelationId) {
    if (isBusy) return;
    setPendingAction({ kind: "requestDeletion", relationId });
    setActionError(null);
    try {
      await onRequestDeletion(relationId);
    } catch (error) {
      setActionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Zahtev za uklanjanje veze nije poslat. Pokušaj ponovo.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section
      className="rounded-2xl border border-border/70 bg-muted/15 p-4 sm:p-5"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      aria-busy={isBusy}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            <RelationKindIcon kind={currentKind} />
            <span className="relative h-px w-5 bg-border">
              <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card" />
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Link2 className="size-3.5" />
            </span>
          </span>
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-sm font-bold tracking-[-0.015em] text-foreground"
            >
              Povezane stavke
            </h2>
            <p
              id={descriptionId}
              className="mt-1 text-xs leading-5 text-muted-foreground"
            >
              {currentLabel} se povezuje samo sa {oppositeCopy.instrumental} iz
              iste oblasti.
            </p>
          </div>
        </div>
        {!loading && relations.length > 0 ? (
          <span
            className="rounded-full border border-border/65 bg-background/75 px-2.5 py-1 text-[0.6875rem] font-semibold tabular-nums text-muted-foreground"
            aria-label={`Broj povezanih stavki: ${relations.length}`}
          >
            {relations.length}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {loading ? (
          <div
            className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/55 px-3 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Učitavam povezane stavke…
          </div>
        ) : relations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/75 bg-background/45 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              Još nema povezanih stavki.
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Izaberi {oppositeCopy.accusative} ispod da bi kontekst i izvršenje
              ostali povezani.
            </p>
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Postojeće povezane stavke">
            {relations.map((relation, index) => {
              const label = occurrenceLabel(relation.title, index, relations);
              const deleting =
                pendingAction?.kind === "delete" &&
                pendingAction.relationId === relation.id;
              const requestingDeletion =
                pendingAction?.kind === "requestDeletion" &&
                pendingAction.relationId === relation.id;
              return (
                <li
                  key={relation.id}
                  className="flex min-h-11 items-stretch gap-1 rounded-xl border border-border/65 bg-background/70 p-1"
                >
                  <button
                    type="button"
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onOpenPage(relation.pageId)}
                    aria-label={`Otvori ${kindLabel(relation.kind).toLocaleLowerCase("sr-Latn-RS")}: ${label}`}
                  >
                    <RelationKindIcon kind={relation.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
                        {kindLabel(relation.kind)}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                  {relation.canDelete || relation.canRequestDeletion ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "size-11 self-center rounded-lg text-muted-foreground",
                        relation.canDelete
                          ? "hover:bg-destructive/10 hover:text-destructive"
                          : "hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300",
                      )}
                      disabled={isBusy}
                      onClick={() =>
                        void (relation.canDelete
                          ? deleteRelation(relation.id)
                          : requestRelationDeletion(relation.id))
                      }
                      aria-label={
                        relation.canDelete
                          ? `Ukloni vezu sa stavkom: ${label}`
                          : `Zatraži uklanjanje veze sa stavkom: ${label}`
                      }
                    >
                      {deleting || requestingDeletion ? (
                        <LoaderCircle
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      ) : relation.canDelete ? (
                        <Trash2 aria-hidden="true" />
                      ) : (
                        <GitPullRequestArrow aria-hidden="true" />
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading ? (
        <div className="mt-4 border-t border-border/60 pt-4">
          {visibleCandidates.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={
                  selectedCandidateIsAvailable ? selectedCandidate : undefined
                }
                onValueChange={(value) => {
                  setActionError(null);
                  onSelectedCandidate(value as PageId);
                }}
                disabled={isBusy}
              >
                <SelectTrigger
                  className="h-11 min-w-0 flex-1 rounded-xl bg-background"
                  aria-label={`Izaberi ${oppositeCopy.accusative} za povezivanje`}
                >
                  <SelectValue
                    placeholder={`Izaberi ${oppositeCopy.accusative}…`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {visibleCandidates.map((candidate, index) => {
                    const label = occurrenceLabel(
                      candidate.title,
                      index,
                      visibleCandidates,
                    );
                    return (
                      <SelectItem
                        key={candidate.pageId}
                        value={candidate.pageId}
                        className="min-h-11"
                      >
                        {kindLabel(candidate.kind)} — {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button
                type="button"
                className="h-11 rounded-xl px-4"
                disabled={!selectedCandidateIsAvailable || isBusy}
                onClick={() => void createRelation()}
              >
                {pendingAction?.kind === "create" ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 aria-hidden="true" />
                )}
                Poveži
              </Button>
            </div>
          ) : (
            <p className="rounded-xl bg-background/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              {relations.length > 0
                ? oppositeCopy.allLinked
                : oppositeCopy.noneAvailable}
            </p>
          )}
          {candidatesTruncated ||
          allAvailableCandidates.length > MAX_RELATION_CANDIDATES ? (
            <p className="mt-2 text-[0.6875rem] text-muted-foreground">
              Prikazano je najviše {MAX_RELATION_CANDIDATES} najskorije
              ažuriranih stavki.
            </p>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <p
          className="mt-3 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-xs leading-5 text-destructive"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
