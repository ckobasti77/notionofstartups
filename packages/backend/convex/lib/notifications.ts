import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { WorkspacePageKind } from "./page_kinds";

/** Akuzativ vrste stranice — „pretvorena u belešku”. */
const PAGE_KIND_ACCUSATIVE: Record<WorkspacePageKind, string> = {
  note: "belešku",
  task: "zadatak",
  file: "fajl",
  table: "tabelu",
};

export type NotificationType =
  | "task_assigned"
  | "task_status_changed"
  | "task_due_soon"
  | "task_due_today"
  | "task_overdue"
  | "idea_voted"
  | "idea_converted"
  | "vote_requested"
  | "request_resolved"
  | "puls_ready";

export type NotificationTargetType = "page" | "ideas" | "approvals" | "puls";

/** Srpske oznake statusa; Convex kod ne uvozi iz app `lib/`. */
export const TASK_STATUS_LABELS = {
  backlog: "Backlog",
  next: "Sledeće",
  in_progress: "U toku",
  blocked: "Čeka",
  done: "Gotovo",
} as const;

export type TaskStatusKey = keyof typeof TASK_STATUS_LABELS;

export function formatNotificationDate(timestamp: number) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Belgrade",
  }).format(new Date(timestamp));
}

/** Beogradski kalendarski dan kao `YYYY-MM-DD` — osnova dedupe ključeva. */
export function belgradeDayKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Belgrade",
  }).format(new Date(timestamp));
}

// Copy živi na jednom mestu da bi ton bio isti u aplikaciji i u push obaveštenju.
export const notificationCopy = {
  taskAssigned: (taskTitle: string, actorName: string) => ({
    title: `Dodeljen ti je zadatak: „${taskTitle}”`,
    body: `Dodelio/la: ${actorName}`,
  }),
  taskJoined: (taskTitle: string, memberName: string) => ({
    title: `${memberName} se priključio/la zadatku „${taskTitle}”`,
    body: "Sada radite zajedno na ovom zadatku.",
  }),
  taskStatusChanged: (
    taskTitle: string,
    status: TaskStatusKey,
    actorName: string,
  ) =>
    status === "blocked"
      ? {
          title: `Zadatak „${taskTitle}” čeka — blokiran je`,
          body: `${actorName} je označio/la blokadu. Proveri šta koči.`,
        }
      : {
          title: `Zadatak „${taskTitle}” je sada: ${TASK_STATUS_LABELS[status]}`,
          body: `${actorName} je promenio/la status.`,
        },
  taskDueSoon: (taskTitle: string, dueDate: number) => ({
    title: `Zadatak „${taskTitle}” ističe sutra`,
    body: `Rok: ${formatNotificationDate(dueDate)}`,
  }),
  taskDueToday: (taskTitle: string, dueDate: number) => ({
    title: `Zadatak „${taskTitle}” ističe danas`,
    body: `Rok: ${formatNotificationDate(dueDate)}`,
  }),
  taskOverdue: (taskTitle: string, dueDate: number) => ({
    title: `Zadatak „${taskTitle}” je probio rok`,
    body: `Rok je bio ${formatNotificationDate(dueDate)}.`,
  }),
  ideaVoted: (ideaTitle: string, actorName: string, voteType: "up" | "down") =>
    voteType === "up"
      ? { title: `${actorName} je podržao/la tvoju ideju „${ideaTitle}”` }
      : { title: `${actorName} je glasao/la protiv ideje „${ideaTitle}”` },
  ideaConverted: (
    ideaTitle: string,
    kind: WorkspacePageKind,
    actorName: string,
  ) => ({
    title: `Tvoja ideja „${ideaTitle}” je pretvorena u ${PAGE_KIND_ACCUSATIVE[kind]}`,
    body: `Pretvorio/la: ${actorName}`,
  }),
  deletionVoteRequested: (targetTitle: string, actorName: string) => ({
    title: `Potreban je tvoj glas: brisanje „${targetTitle}”`,
    body: `Zahtev podneo/la: ${actorName}`,
  }),
  nestingVoteRequested: (
    childTitle: string,
    parentTitle: string,
    actorName: string,
  ) => ({
    title: "Zahtev za ugnježđavanje čeka tvoju odluku",
    body: `„${childTitle}” → „${parentTitle}” (${actorName})`,
  }),
  requestResolved: (
    targetTitle: string,
    approved: boolean,
    actorName: string,
  ) => ({
    title: `Tvoj zahtev je ${approved ? "odobren" : "odbijen"}: „${targetTitle}”`,
    body: `Odlučio/la: ${actorName}`,
  }),
  pulsReady: (startupName: string) => ({
    title: "Stigao je Puls za prošlu nedelju",
    body: `Pregled protekle nedelje za ${startupName}.`,
  }),
};

export type CreateNotificationInput = {
  recipientProfileId: Id<"profiles">;
  startupId: Id<"startups">;
  type: NotificationType;
  title: string;
  body?: string;
  targetType: NotificationTargetType;
  targetId: string | null;
  actorProfileId?: Id<"profiles"> | null;
  dedupeKey?: string;
};

/**
 * Jedini put kojim obaveštenje ulazi u sistem. Svi guard-ovi su ovde da bi
 * pozivi na mestima događaja ostali jednolinijski, i da nijedno pravilo ne
 * može da se zaobiđe zaboravljanjem provere.
 */
export async function createNotification(
  ctx: MutationCtx,
  value: CreateNotificationInput,
): Promise<Id<"notifications"> | null> {
  const actorProfileId = value.actorProfileId ?? null;

  // Nikad ne obaveštavamo nekoga o njegovoj sopstvenoj radnji.
  if (actorProfileId !== null && actorProfileId === value.recipientProfileId) {
    return null;
  }

  const recipient = await ctx.db.get("profiles", value.recipientProfileId);
  if (recipient === null || recipient.archivedAt !== null) return null;

  // Uklonjen član ne dobija nova obaveštenja za taj startup.
  const membership = await ctx.db
    .query("startupMembers")
    .withIndex("by_startupId_and_profileId", (q) =>
      q
        .eq("startupId", value.startupId)
        .eq("profileId", value.recipientProfileId),
    )
    .unique();
  if (membership === null || membership.archivedAt !== null) return null;

  if (value.dedupeKey !== undefined) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", value.dedupeKey!))
      .first();
    if (existing !== null) return null;
  }

  const notificationId = await ctx.db.insert("notifications", {
    recipientProfileId: value.recipientProfileId,
    startupId: value.startupId,
    type: value.type,
    title: value.title,
    ...(value.body === undefined ? {} : { body: value.body }),
    targetType: value.targetType,
    targetId: value.targetId,
    actorProfileId,
    dedupeKey: value.dedupeKey ?? null,
    readAt: null,
    createdAt: Date.now(),
  });

  // Push ide van transakcije: mreža ne sme da blokira ni da obori upis.
  await ctx.scheduler.runAfter(0, internal.push.deliver, { notificationId });

  return notificationId;
}

async function actorName(ctx: MutationCtx, actorProfileId: Id<"profiles">) {
  const actor = await ctx.db.get("profiles", actorProfileId);
  return actor?.displayName ?? "Član tima";
}

/**
 * Obaveštava zainteresovane o promeni na zadatku. Deljeno između
 * `tasks.updateMetadata` i `areasV2.updatePage` da bi pravila bila identična
 * bez obzira kojim putem je promena došla.
 */
export async function notifyTaskStakeholders(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    /** Ko je upravo dodat na zadatak; prazno kad se spisak nije menjao. */
    addedAssigneeProfileIds?: Array<Id<"profiles">>;
    /** Ceo spisak posle izmene — primaoci obaveštenja o statusu. */
    assigneeProfileIdsAfterChange: Array<Id<"profiles">>;
    nextTaskStatus: TaskStatusKey | null;
    actorProfileId: Id<"profiles">;
  },
) {
  const { page, actorProfileId } = args;
  if (page.kind !== "task") return;

  const name = await actorName(ctx, actorProfileId);
  const statusChanged = args.nextTaskStatus !== page.taskStatus;

  for (const recipientProfileId of args.addedAssigneeProfileIds ?? []) {
    const copy = notificationCopy.taskAssigned(page.title, name);
    await createNotification(ctx, {
      recipientProfileId,
      startupId: page.startupId,
      type: "task_assigned",
      title: copy.title,
      body: copy.body,
      targetType: "page",
      targetId: page._id,
      actorProfileId,
    });
  }

  if (statusChanged && args.nextTaskStatus !== null) {
    const copy = notificationCopy.taskStatusChanged(
      page.title,
      args.nextTaskStatus,
      name,
    );
    // Zadatak prate svi kojima je dodeljen i onaj koji ga je otvorio.
    const recipients = new Set<Id<"profiles">>(
      args.assigneeProfileIdsAfterChange,
    );
    recipients.add(page.createdByProfileId);

    for (const recipientProfileId of recipients) {
      await createNotification(ctx, {
        recipientProfileId,
        startupId: page.startupId,
        type: "task_status_changed",
        title: copy.title,
        body: copy.body,
        targetType: "page",
        targetId: page._id,
        actorProfileId,
      });
    }
  }
}
