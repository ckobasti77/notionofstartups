"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const MEMBER_ACCENTS = [
  "oklch(0.68 0.16 294)",
  "oklch(0.69 0.14 249)",
  "oklch(0.7 0.14 155)",
  "oklch(0.74 0.15 78)",
  "oklch(0.68 0.17 18)",
  "oklch(0.7 0.12 205)",
] as const;

function memberAccent(profileId: string | undefined) {
  if (!profileId) return MEMBER_ACCENTS[0];
  let hash = 0;
  for (let index = 0; index < profileId.length; index += 1) {
    hash = (hash * 31 + profileId.charCodeAt(index)) >>> 0;
  }
  return MEMBER_ACCENTS[hash % MEMBER_ACCENTS.length];
}

function visibleText(content: string) {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

type InlineContributionTarget =
  | { kind: "idea"; id: Id<"ideaNodes"> }
  | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> };

export function ContributionInlineThread({
  target,
  canAdd,
  compact = false,
  className,
}: {
  target: InlineContributionTarget;
  canAdd: boolean;
  compact?: boolean;
  className?: string;
}) {
  const {
    results,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.collaboration.listContributionsPaginated,
    { target },
    { initialNumItems: compact ? 8 : 20 },
  );
  const addText = useMutation(api.collaboration.addContribution);
  const updateText = useMutation(api.collaboration.updateContribution);
  const deleteOwnText = useMutation(api.collaboration.deleteOwnContribution);
  const restoreOwnText = useMutation(api.collaboration.restoreOwnContribution);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  const moderateText = useMutation(api.collaboration.moderateContribution);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] =
    useState<Id<"contentContributions"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "CanLoadMore") {
      loadMore(compact ? 8 : 20);
    }
  }, [compact, loadMore, status]);

  const submit = async () => {
    if (!draft.trim()) return;
    setPending(true);
    try {
      await addText({
        target,
        content: draft,
      });
      setDraft("");
      setComposerOpen(false);
      toast.success("Tekst je objavljen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tekst nije objavljen.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      className={cn("nodrag nowheel space-y-2", className)}
      aria-label="Izmene članova"
    >
      {status === "LoadingFirstPage" ? (
        <Skeleton className={cn("rounded-xl", compact ? "h-14" : "h-20")} />
      ) : null}

      {results.map((item) => {
        const accent = memberAccent(item.authorProfileId);
        const style = {
          "--member-accent": accent,
          borderColor: `color-mix(in oklab, ${accent} 35%, var(--border))`,
          backgroundColor: `color-mix(in oklab, ${accent} 8%, transparent)`,
        } as CSSProperties;
        return (
          <article
            key={item._id}
            style={style}
            className={cn("rounded-xl border", compact ? "p-2" : "p-3")}
          >
            <div className="flow-root">
              {item.author ? (
                <ProfileAvatar
                  profile={item.author}
                  className={cn(
                    "float-left mb-1 mr-2 shrink-0 ring-2 ring-background",
                    compact ? "size-6" : "size-8",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "float-left mb-1 mr-2 grid shrink-0 place-items-center rounded-full bg-muted font-bold",
                    compact ? "size-6 text-[0.5625rem]" : "size-8 text-xs",
                  )}
                >
                  —
                </span>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("truncate font-bold", compact ? "text-[0.625rem]" : "text-xs")}>
                    {item.author?.displayName ?? "Raniji zajednički sadržaj"}
                  </span>
                  <time
                    className="text-[0.5625rem] font-semibold text-muted-foreground"
                    dateTime={new Date(item.createdAt).toISOString()}
                  >
                    {new Intl.DateTimeFormat("sr-Latn-RS", {
                      day: "2-digit",
                      month: "short",
                    }).format(item.createdAt)}
                  </time>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.5rem] font-extrabold uppercase tracking-[0.08em]",
                      item.moderationStatus === "approved"
                        ? "bg-emerald-500/14 text-emerald-700 dark:text-emerald-300"
                        : item.moderationStatus === "rejected"
                          ? "bg-rose-500/14 text-rose-700 dark:text-rose-300"
                          : "bg-amber-500/14 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {item.moderationStatus === "approved"
                      ? "Odobreno"
                      : item.moderationStatus === "rejected"
                        ? "Odbijeno"
                        : "Na čekanju"}
                  </span>
                </div>

                {editingId === item._id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      className={cn("rounded-xl bg-background", compact ? "min-h-16 text-xs" : "min-h-24")}
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        Otkaži
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!editingText.trim()}
                        onClick={() =>
                          void updateText({
                            contributionId: item._id,
                            content: editingText,
                          })
                            .then(() => {
                              setEditingId(null);
                              toast.success("Tekst je sačuvan.");
                            })
                            .catch((error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Tekst nije sačuvan.",
                              ),
                            )
                        }
                      >
                        Sačuvaj
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={cn(
                      "mt-1.5 whitespace-pre-wrap text-foreground/84",
                      compact ? "text-[0.6875rem] leading-4" : "text-sm leading-6",
                    )}
                  >
                    {visibleText(item.content)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap justify-end gap-1">
              {target.kind === "idea" && item.canModerate ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[0.625rem] text-emerald-700 dark:text-emerald-300"
                    onClick={() =>
                      void moderateText({
                        contributionId: item._id,
                        decision: "approve",
                      }).catch((error) =>
                        toast.error(error instanceof Error ? error.message : "Tekst nije odobren."),
                      )
                    }
                  >
                    <Check className="size-3" /> Odobri
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[0.625rem] text-rose-700 dark:text-rose-300"
                    onClick={() =>
                      void moderateText({
                        contributionId: item._id,
                        decision: "reject",
                      }).catch((error) =>
                        toast.error(error instanceof Error ? error.message : "Tekst nije odbijen."),
                      )
                    }
                  >
                    <X className="size-3" /> Odbij
                  </Button>
                </>
              ) : null}
              {item.canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Uredi moj tekst"
                  onClick={() => {
                    setEditingId(item._id);
                    setEditingText(item.content);
                  }}
                >
                  <Pencil className="size-3" />
                </Button>
              ) : null}
              {item.canDeleteDirectly || item.canRequestDeletion ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-rose-600"
                  aria-label={
                    item.canDeleteDirectly
                      ? "Obriši moj tekst"
                      : "Zatraži brisanje teksta"
                  }
                  onClick={() => {
                    if (item.canRequestDeletion) {
                      void requestDeletion({
                        target: { kind: "contribution", id: item._id },
                      })
                        .then(() => toast.success("Zahtev za brisanje je poslat."))
                        .catch((error) =>
                          toast.error(error instanceof Error ? error.message : "Zahtev nije poslat."),
                        );
                      return;
                    }
                    void deleteOwnText({ contributionId: item._id })
                      .then(() =>
                        toast.success("Tekst je obrisan.", {
                          duration: 8_000,
                          action: {
                            label: "Undo",
                            onClick: () =>
                              void restoreOwnText({
                                contributionId: item._id,
                              }),
                          },
                        }),
                      )
                      .catch((error) =>
                        toast.error(error instanceof Error ? error.message : "Tekst nije obrisan."),
                      );
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}

      {canAdd ? (
        composerOpen ? (
          <div className="space-y-2 rounded-xl border border-border/70 bg-background/70 p-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Napiši…"
              autoFocus
              className={cn("rounded-lg bg-background", compact ? "min-h-16 text-xs" : "min-h-24")}
            />
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setComposerOpen(false);
                  setDraft("");
                }}
              >
                Otkaži
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || !draft.trim()}
                onClick={() => void submit()}
              >
                Objavi
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mx-auto flex h-8 rounded-full px-4 text-xs font-bold"
            onClick={() => setComposerOpen(true)}
          >
            Dodaj
          </Button>
        )
      ) : null}
    </section>
  );
}

export function IdeaInlineThread({
  ideaId,
  canAdd,
  compact = false,
  className,
}: {
  ideaId: Id<"ideaNodes">;
  canAdd: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <ContributionInlineThread
      target={{ kind: "idea", id: ideaId }}
      canAdd={canAdd}
      compact={compact}
      className={className}
    />
  );
}
