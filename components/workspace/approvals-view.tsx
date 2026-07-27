"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  Clock3,
  FolderHeart,
  GitPullRequestArrow,
  History,
  Inbox,
  LoaderCircle,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { StartupWithAreas } from "@/components/workspace/types";
import { ProfileAvatar } from "@/components/workspace/workspace-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

function formatDate(value: number) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function Surface({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card/85 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h2 className="font-bold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}

function EmptyState({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      <Icon className="mx-auto mb-3 size-5 opacity-70" />
      {children}
    </div>
  );
}

export function ApprovalsView({ startup }: { startup: StartupWithAreas }) {
  const data = useQuery(api.collaboration.overview, {
    startupId: startup._id,
  });
  const pageNestingInbox = useQuery(api.areasV2.listNestingInbox, {
    startupId: startup._id,
  });
  const vote = useMutation(api.collaboration.voteOnDeletion);
  const withdraw = useMutation(api.collaboration.withdrawDeletion);
  const resolveNesting = useMutation(api.collaboration.resolveNesting);
  const requestDeletion = useMutation(api.collaboration.requestDeletion);
  const approvePageNesting = useMutation(api.areasV2.approveNesting);
  const rejectPageNesting = useMutation(api.areasV2.rejectNesting);
  const withdrawPageNesting = useMutation(api.areasV2.withdrawNesting);
  const [activePageNestingAction, setActivePageNestingAction] = useState<{
    requestId: Id<"pageNestingRequests">;
    action: "approve" | "reject" | "withdraw";
  } | null>(null);

  if (data === undefined || pageNestingInbox === undefined) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-5 sm:p-8">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );
  }

  async function handlePageNestingAction(
    requestId: Id<"pageNestingRequests">,
    action: "approve" | "reject" | "withdraw",
  ) {
    if (activePageNestingAction !== null) return;
    setActivePageNestingAction({ requestId, action });
    try {
      const result =
        action === "approve"
          ? await approvePageNesting({ startupId: startup._id, requestId })
          : action === "reject"
            ? await rejectPageNesting({ startupId: startup._id, requestId })
            : await withdrawPageNesting({ startupId: startup._id, requestId });
      const expectedStatus =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "withdrawn";

      if (result.status !== expectedStatus) {
        toast.info(
          result.status === "cancelled"
            ? "Zahtev više nije važeći."
            : "Zahtev je već obrađen.",
        );
        return;
      }

      toast.success(
        action === "approve"
          ? "Ugnježđavanje stranice je odobreno."
          : action === "reject"
            ? "Zahtev za ugnježđavanje je odbijen."
            : "Zahtev za ugnježđavanje je povučen.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Odluka o ugnježđavanju nije sačuvana.",
      );
    } finally {
      setActivePageNestingAction(null);
    }
  }

  const pendingCount = data.pendingCount + pageNestingInbox.incoming.length;
  const nestingForMeCount =
    data.nestingForMe.length + pageNestingInbox.incoming.length;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-7 lg:p-9">
      <header
        data-workspace-enter
        className="rounded-[2rem] border border-border/70 bg-card/75 p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-primary">
              Timske odluke
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] sm:text-3xl">
              Odobrenja
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Ovde nema administratorskog prečaca. Tuđ sadržaj se uklanja tek
              kada svi članovi iz početnog biračkog tela glasaju ZA.
            </p>
          </div>
          <Badge
            variant={pendingCount > 0 ? "default" : "secondary"}
            className="rounded-full px-3 py-1.5"
          >
            {pendingCount > 0
              ? `${pendingCount} za tvoju reakciju`
              : "Sve je rešeno"}
          </Badge>
        </div>
      </header>

      <Tabs defaultValue="vote" className="mt-6" data-workspace-enter>
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted/55 p-1">
          <TabsTrigger value="vote" className="rounded-xl">
            Za moj glas
            {data.requestsForVote.length ? (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[0.625rem] text-primary-foreground">
                {data.requestsForVote.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="nesting" className="rounded-xl">
            Ugnježđavanje
            {nestingForMeCount ? (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[0.625rem] text-primary-foreground">
                {nestingForMeCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="mine" className="rounded-xl">
            Moji zahtevi
          </TabsTrigger>
          <TabsTrigger value="recovered" className="rounded-xl">
            Oporavljeno
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl">
            Istorija
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vote" className="mt-5">
          <Surface
            icon={Inbox}
            title="Čeka tvoj glas"
            description="Jedan glas PROTIV odmah zatvara zahtev. Glas ne može biti promenjen nakon odluke."
          >
            {data.requestsForVote.length === 0 ? (
              <EmptyState icon={Check}>Nema otvorenih odluka za tebe.</EmptyState>
            ) : (
              data.requestsForVote.map((request) => (
                <article
                  key={request._id}
                  className="rounded-2xl border border-border/70 bg-background/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-muted-foreground">
                        Glasanje o brisanju
                      </p>
                      <h3 className="mt-1 font-semibold">{request.targetTitle}</h3>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {request.approveCount}/{request.eligibleCount} glasova ZA ·
                        pokrenuto {formatDate(request.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl text-rose-600"
                        onClick={() =>
                          void vote({
                            requestId: request._id,
                            vote: "reject",
                          }).catch((error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Glas nije sačuvan.",
                            ),
                          )
                        }
                      >
                        <ThumbsDown /> Protiv
                      </Button>
                      <Button
                        className="rounded-xl"
                        onClick={() =>
                          void vote({
                            requestId: request._id,
                            vote: "approve",
                          }).catch((error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Glas nije sačuvan.",
                            ),
                          )
                        }
                      >
                        <ThumbsUp /> Za
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="nesting" className="mt-5 space-y-5">
          <Surface
            icon={GitPullRequestArrow}
            title="Stranice koje čekaju tvoju odluku"
            description="Odobri da stranica uđe u roditeljski kanvas ili odbij zahtev bez pomeranja sadržaja."
          >
            {pageNestingInbox.incoming.length === 0 ? (
              <EmptyState icon={Check}>
                Nema zahteva za ugnježđavanje stranica.
              </EmptyState>
            ) : (
              pageNestingInbox.incoming.map((request) => {
                const isBusy =
                  activePageNestingAction?.requestId === request.requestId;
                return (
                  <article
                    key={request.requestId}
                    className="rounded-2xl border border-border/70 bg-background/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        {request.requester ? (
                          <ProfileAvatar
                            profile={request.requester}
                            className="size-9"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="rounded-full text-[0.625rem]"
                            >
                              {request.child.kind === "task"
                                ? "Zadatak"
                                : "Beleška"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(request.createdAt)}
                            </span>
                          </div>
                          <div className="mt-2 flex min-w-0 items-center gap-2 text-sm">
                            <span className="truncate font-semibold">
                              {request.child.title || "Bez naslova"}
                            </span>
                            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate text-muted-foreground">
                              {request.targetParent.title || "Bez naslova"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {request.requester?.displayName ?? "Član tima"} traži
                            novo roditeljsko mesto.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {request.canReject ? (
                          <Button
                            variant="outline"
                            className="rounded-xl"
                            disabled={activePageNestingAction !== null}
                            onClick={() =>
                              void handlePageNestingAction(
                                request.requestId,
                                "reject",
                              )
                            }
                          >
                            {isBusy &&
                            activePageNestingAction?.action === "reject" ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <X />
                            )}
                            Odbij
                          </Button>
                        ) : null}
                        {request.canApprove ? (
                          <Button
                            className="rounded-xl"
                            disabled={activePageNestingAction !== null}
                            onClick={() =>
                              void handlePageNestingAction(
                                request.requestId,
                                "approve",
                              )
                            }
                          >
                            {isBusy &&
                            activePageNestingAction?.action === "approve" ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <Check />
                            )}
                            Odobri
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
            {pageNestingInbox.truncated ? (
              <p className="px-1 text-xs text-muted-foreground">
                Prikazano je najnovijih 100 zahteva.
              </p>
            ) : null}
          </Surface>

          <Surface
            icon={GitPullRequestArrow}
            title="Zahtevi za tvoj čvor ideje"
            description="Odobrenjem kartica fizički ulazi u tvoju karticu i od tada se pomera zajedno sa njom."
          >
            {data.nestingForMe.length === 0 ? (
              <EmptyState icon={Check}>Nema zahteva za ugnježđavanje.</EmptyState>
            ) : (
              data.nestingForMe.map((request) => (
                <article
                  key={request._id}
                  className="rounded-2xl border border-border/70 bg-background/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {request.requester ? (
                        <ProfileAvatar
                          profile={request.requester}
                          className="size-9"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {request.child?.title ??
                            request.child?.text.slice(0, 70) ??
                            "Kartica više nije dostupna"}
                        </h3>
                        <p className="truncate text-xs text-muted-foreground">
                          u „
                          {request.parent?.title ??
                            request.parent?.text.slice(0, 50) ??
                            "Parent"}
                          “
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() =>
                          void resolveNesting({
                            requestId: request._id,
                            approve: false,
                          })
                        }
                      >
                        <X /> Odbij
                      </Button>
                      <Button
                        className="rounded-xl"
                        onClick={() =>
                          void resolveNesting({
                            requestId: request._id,
                            approve: true,
                          })
                        }
                      >
                        <Check /> Odobri
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="mine" className="mt-5">
          <Surface
            icon={Clock3}
            title="Moji otvoreni zahtevi"
            description="Zahtev nema rok i možeš ga povući sve dok je otvoren."
          >
            {data.myRequests.deletion.length === 0 &&
            data.myRequests.nesting.length === 0 &&
            pageNestingInbox.outgoing.length === 0 ? (
              <EmptyState icon={Check}>Nemaš otvorenih zahteva.</EmptyState>
            ) : (
              <>
                {data.myRequests.deletion.map((request) => (
                  <article
                    key={request._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 p-4"
                  >
                    <div>
                      <h3 className="font-semibold">{request.targetTitle}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {request.approveCount}/{request.eligibleCount} ZA
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="rounded-xl"
                      onClick={() =>
                        void withdraw({ requestId: request._id }).catch(
                          (error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Zahtev nije povučen.",
                            ),
                        )
                      }
                    >
                      <Undo2 /> Povuci
                    </Button>
                  </article>
                ))}
                {pageNestingInbox.outgoing.map((request) => {
                  const isWithdrawing =
                    activePageNestingAction?.requestId ===
                      request.requestId &&
                    activePageNestingAction.action === "withdraw";
                  return (
                    <article
                      key={request.requestId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-full text-[0.625rem]"
                          >
                            Ugnježđavanje stranice
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(request.createdAt)}
                          </span>
                        </div>
                        <div className="mt-2 flex min-w-0 items-center gap-2 text-sm">
                          <span className="truncate font-semibold">
                            {request.child.title || "Bez naslova"}
                          </span>
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-muted-foreground">
                            {request.targetParent.title || "Bez naslova"}
                          </span>
                        </div>
                      </div>
                      {request.canWithdraw ? (
                        <Button
                          variant="ghost"
                          className="rounded-xl"
                          disabled={activePageNestingAction !== null}
                          onClick={() =>
                            void handlePageNestingAction(
                              request.requestId,
                              "withdraw",
                            )
                          }
                        >
                          {isWithdrawing ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Undo2 />
                          )}
                          Povuci
                        </Button>
                      ) : null}
                    </article>
                  );
                })}
                {data.myRequests.nesting.map((request) => (
                  <article
                    key={request._id}
                    className="rounded-2xl border border-border/70 bg-background/70 p-4"
                  >
                    <h3 className="font-semibold">Zahtev za ugnježđavanje</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Poslat {formatDate(request.createdAt)}
                    </p>
                  </article>
                ))}
              </>
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="recovered" className="mt-5">
          <Surface
            icon={FolderHeart}
            title="Oporavljene izmene članova"
            description="Tuđe izmene izdvojene iz obrisanog kontejnera ostaju zajedničke i dostupne autorima."
          >
            {data.recovered.length === 0 ? (
              <EmptyState icon={FolderHeart}>
                Nema oporavljenog sadržaja.
              </EmptyState>
            ) : (
              data.recovered.map((item) => (
                <article
                  key={item._id}
                  className="rounded-2xl border border-border/70 bg-background/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.contributions.length} sačuvanih izmena
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() =>
                        void requestDeletion({
                          target: { kind: "recovered", id: item._id },
                        })
                          .then(() =>
                            toast.success("Glasanje o brisanju je pokrenuto."),
                          )
                          .catch((error) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Zahtev nije poslat.",
                            ),
                          )
                      }
                    >
                      Zatraži brisanje
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {item.contributions.map((contribution) => (
                      <div
                        key={contribution._id}
                        className="rounded-xl bg-muted/45 p-3"
                      >
                        <div className="flex items-center gap-2">
                          {contribution.author ? (
                            <ProfileAvatar
                              profile={contribution.author}
                              className="size-6"
                            />
                          ) : null}
                          <span className="text-xs font-semibold">
                            {contribution.author?.displayName ??
                              "Raniji zajednički sadržaj"}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6">
                          {contribution.content.replace(/<[^>]+>/g, " ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="history" className="mt-5">
          <Surface
            icon={History}
            title="Istorija odluka"
            description="Zabeležene završene, odbijene, povučene i otkazane odluke."
          >
            {data.history.length === 0 ? (
              <EmptyState icon={History}>Istorija je još prazna.</EmptyState>
            ) : (
              data.history.map((request) => (
                <article
                  key={request._id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/70 p-4"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {request.targetTitle}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(request.updatedAt)}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full",
                      request.status === "approved" &&
                        "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
                      request.status === "rejected" &&
                        "bg-rose-500/12 text-rose-700 dark:text-rose-300",
                    )}
                  >
                    {request.status === "approved"
                      ? "Odobreno"
                      : request.status === "rejected"
                        ? "Odbijeno"
                        : request.status === "withdrawn"
                          ? "Povučeno"
                          : "Otkazano"}
                  </Badge>
                </article>
              ))
            )}
          </Surface>
        </TabsContent>
      </Tabs>
    </div>
  );
}
