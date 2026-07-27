"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import {
  Clock3,
  LoaderCircle,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageEntryDisplayText } from "@/components/workspace/page-entry-text";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function AreaSignedContributions({
  areaId,
  areaLabel,
}: {
  areaId: Id<"startupAreas">;
  areaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] =
    useState<Id<"contentContributions"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    results,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.collaboration.listContributionsPaginated,
    { target: { kind: "area", id: areaId } },
    { initialNumItems: 24 },
  );
  const addContribution = useMutation(api.collaboration.addContribution);
  const updateContribution = useMutation(
    api.collaboration.updateContribution,
  );
  const deleteOwnContribution = useMutation(
    api.collaboration.deleteOwnContribution,
  );
  const restoreOwnContribution = useMutation(
    api.collaboration.restoreOwnContribution,
  );
  const requestDeletion = useMutation(api.collaboration.requestDeletion);

  async function add() {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await addContribution({
        target: { kind: "area", id: areaId },
        content,
      });
      setDraft("");
      toast.success("Tvoj potpisani doprinos je dodat u oblast.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Doprinos nije dodat.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId || !editingText.trim() || busy) return;
    setBusy(true);
    try {
      await updateContribution({
        contributionId: editingId,
        content: editingText.trim(),
      });
      setEditingId(null);
      setEditingText("");
      toast.success("Doprinos je sačuvan.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Doprinos nije sačuvan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(
    contributionId: Id<"contentContributions">,
    canDeleteDirectly: boolean,
  ) {
    try {
      if (!canDeleteDirectly) {
        await requestDeletion({
          target: { kind: "contribution", id: contributionId },
        });
        toast.success("Zahtev za uklanjanje je poslat na glasanje.");
        return;
      }
      await deleteOwnContribution({ contributionId });
      toast.success("Doprinos je uklonjen.", {
        duration: 8_000,
        action: {
          label: "Undo",
          onClick: () =>
            void restoreOwnContribution({ contributionId }).catch((error) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Doprinos nije vraćen.",
              ),
            ),
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Doprinos nije uklonjen.",
      );
    }
  }

  return (
    <section
      className="mt-4 overflow-hidden rounded-[1.35rem] border border-border/70 bg-card"
      aria-labelledby="area-contributions-title"
    >
      <header className="flex flex-col gap-2 border-b border-border/65 bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-primary">
            Timski kontekst
          </p>
          <h3
            id="area-contributions-title"
            className="mt-1 text-sm font-bold"
          >
            Potpisani doprinosi za {areaLabel}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Svaki unos zadržava autora i vreme.
        </p>
      </header>

      <div className="space-y-4 px-5 py-5 sm:px-7">
        {status === "LoadingFirstPage" ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : results.length === 0 && status === "Exhausted" ? (
          <div className="rounded-2xl border border-dashed border-border/80 px-5 py-7 text-center text-sm text-muted-foreground">
            Još nema doprinosa članova u ovoj oblasti.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {results.map((entry) => (
              <article
                key={entry._id}
                className="flex min-w-0 items-start gap-3 rounded-2xl border border-border/70 bg-background/75 p-4"
              >
                <ProfileAvatar
                  profile={{
                    displayName: entry.author?.displayName ?? "Član tima",
                    avatarUrl: entry.author?.avatarUrl ?? null,
                  }}
                  className="size-9 shrink-0 ring-2 ring-primary/15"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        {entry.author?.displayName ??
                          (entry.attribution === "legacy_neutral"
                            ? "Raniji zajednički sadržaj"
                            : "Član tima")}
                      </p>
                      <time
                        className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground"
                        dateTime={new Date(entry.createdAt).toISOString()}
                      >
                        <Clock3 className="size-3" aria-hidden="true" />
                        {new Intl.DateTimeFormat("sr-Latn-RS", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(entry.createdAt)}
                      </time>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {entry.canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10"
                          aria-label="Izmeni moj doprinos"
                          onClick={() => {
                            setEditingId(entry._id);
                            setEditingText(entry.content);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 text-muted-foreground hover:text-destructive"
                        aria-label={
                          entry.canDeleteDirectly
                            ? "Ukloni moj doprinos"
                            : "Zatraži uklanjanje doprinosa"
                        }
                        onClick={() =>
                          void remove(entry._id, entry.canDeleteDirectly)
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {editingId === entry._id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={editingText}
                        onChange={(event) =>
                          setEditingText(event.target.value)
                        }
                        className="min-h-28 w-full rounded-xl border border-input bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        maxLength={20_000}
                        aria-label="Izmeni potpisani doprinos"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          <X aria-hidden="true" /> Otkaži
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !editingText.trim()}
                          onClick={() => void saveEdit()}
                        >
                          {busy ? (
                            <LoaderCircle
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : null}
                          Sačuvaj
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85">
                      {pageEntryDisplayText(entry.content)}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(24)}
            >
              {status === "LoadingMore" ? "Učitavanje…" : "Učitaj još"}
            </Button>
          </div>
        ) : null}

        <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-4">
          <label
            htmlFor={`area-contribution-${areaId}`}
            className="flex items-center gap-2 text-xs font-bold"
          >
            <MessageSquarePlus className="size-4 text-primary" aria-hidden="true" />
            Dodaj svoj potpisani kontekst
          </label>
          <textarea
            id={`area-contribution-${areaId}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Dodaj zapažanje, odluku ili kontekst koji treba da vidi ceo tim…"
            className="mt-3 min-h-24 w-full rounded-xl border border-input bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={20_000}
          />
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={busy || !draft.trim()}
              onClick={() => void add()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              Objavi moj doprinos
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
