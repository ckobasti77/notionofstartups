"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MessageSquareText, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type IdeaSummary = {
  _id: Id<"ideaNodes">;
  title: string | null;
  text: string;
};

export function IdeaDiscussionDialog({
  idea,
  open,
  onOpenChange,
}: {
  idea: IdeaSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const contributions = useQuery(
    api.collaboration.listContributions,
    idea ? { target: { kind: "idea", id: idea._id } } : "skip",
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
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] =
    useState<Id<"contentContributions"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [pending, setPending] = useState(false);

  if (!idea) return null;

  async function submitContribution() {
    if (!draft.trim()) return;
    setPending(true);
    try {
      await addContribution({
        target: { kind: "idea", id: idea!._id },
        content: draft,
      });
      setDraft("");
      toast.success("Doprinos je dodat.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Doprinos nije dodat.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setEditingId(null);
          setEditingText("");
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <div className="flex items-center gap-2 text-primary">
            <MessageSquareText className="size-4" />
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em]">
              Potpisani doprinosi
            </span>
          </div>
          <DialogTitle className="mt-2">
            {idea.title ?? idea.text.slice(0, 80)}
          </DialogTitle>
          <DialogDescription>
            Svako dodaje svoj zapis. Tuđ tekst nije moguće prepisati.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {contributions === undefined ? (
            <>
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </>
          ) : contributions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Još nema doprinosa.
            </div>
          ) : (
            contributions.map((contribution) => (
              <article
                key={contribution._id}
                className="rounded-2xl border border-border/70 bg-muted/25 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {contribution.author ? (
                      <ProfileAvatar
                        profile={contribution.author}
                        className="size-8"
                      />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-bold">
                        —
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {contribution.author?.displayName ??
                          "Raniji zajednički sadržaj"}
                      </p>
                      <time className="text-[0.6875rem] text-muted-foreground">
                        {new Intl.DateTimeFormat("sr-Latn-RS", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(contribution.createdAt)}
                      </time>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {contribution.canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Uredi moj doprinos"
                        onClick={() => {
                          setEditingId(contribution._id);
                          setEditingText(contribution.content);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-rose-600"
                      aria-label={
                        contribution.canDeleteDirectly
                          ? "Obriši moj doprinos"
                          : "Zatraži brisanje doprinosa"
                      }
                      onClick={() => {
                        if (!contribution.canDeleteDirectly) {
                          void requestDeletion({
                            target: {
                              kind: "contribution",
                              id: contribution._id,
                            },
                          })
                            .then(() =>
                              toast.success(
                                "Glasanje o brisanju je pokrenuto.",
                              ),
                            )
                            .catch((error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Zahtev nije poslat.",
                              ),
                            );
                          return;
                        }
                        void deleteOwnContribution({
                          contributionId: contribution._id,
                        })
                          .then(() =>
                            toast.success("Doprinos je obrisan.", {
                              duration: 8_000,
                              action: {
                                label: "Undo",
                                onClick: () =>
                                  void restoreOwnContribution({
                                    contributionId: contribution._id,
                                  }),
                              },
                            }),
                          )
                          .catch((error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Doprinos nije obrisan.",
                            ),
                          );
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {editingId === contribution._id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      className="min-h-28 rounded-xl bg-background"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        <X /> Otkaži
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          void updateContribution({
                            contributionId: contribution._id,
                            content: editingText,
                          })
                            .then(() => {
                              setEditingId(null);
                              toast.success("Doprinos je sačuvan.");
                            })
                            .catch((error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Doprinos nije sačuvan.",
                              ),
                            )
                        }
                      >
                        Sačuvaj
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                    {contribution.content.replace(/<[^>]+>/g, " ")}
                  </p>
                )}
              </article>
            ))
          )}
        </div>

        <div className="border-t border-border/70 bg-background px-6 py-5">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Dodaj svoj doprinos…"
            className="min-h-24 rounded-2xl"
          />
          <div className="mt-3 flex justify-end">
            <Button
              disabled={pending || !draft.trim()}
              className="rounded-xl"
              onClick={() => void submitContribution()}
            >
              <Plus /> Dodaj doprinos
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

