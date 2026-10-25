import { v, type Infer } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireProfile, requireStartupMember } from "./lib/auth";
import {
  listMyActiveStartups,
  startupMiniOf,
  type StartupMini,
} from "./lib/my_scope";
import {
  INBOX_FEED_PAGE_DEFAULT,
  INBOX_FEED_PAGE_MAX,
  INBOX_MARK_ALL_BATCH,
  INBOX_PENDING_BALLOT_SCAN_CAP,
  INBOX_PENDING_CAP,
  INBOX_UNREAD_SCAN_CAP,
  boundedLimit,
  startupMiniValidator,
} from "./lib/validators";
import { notificationItemValidator, withActors } from "./notifications";
import schema from "./schema";

/**
 * Globalni Inbox: obaveštenja iz SVIH startupa na jednom mestu i „Čeka tebe".
 * Per-startup prikazi i dalje koriste `notifications.ts` (netaknut).
 *
 * Opseg: stavka iz startupa u kome profil nije AKTIVAN član (napustio ga, uklonjen
 * ili je startup arhiviran) se ne vraća i ne broji. `startup: null` nose lična
 * obaveštenja (poruke iz ličnih razgovora, `startupId: null`) — vide se uvek, jer
 * je primalac bio član razgovora kad je obaveštenje nastalo.
 */

/** Stavka feed-a: obaveštenje + mini podaci startupa (`null` za lične poruke). */
const inboxItemValidator = notificationItemValidator.extend({
  startup: v.union(startupMiniValidator, v.null()),
});

/** Filter opsega: `undefined` = sve, Id = jedan startup, `null` = samo lično. */
const scopeArgValidator = v.optional(v.union(v.id("startups"), v.null()));

const counterValidator = v.object({ count: v.number(), capped: v.boolean() });

/** Gde se „Označi sve" primenjuje. */
const markTargetValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("startup"), startupId: v.id("startups") }),
  v.object({ kind: v.literal("personal") }),
);
type MarkTarget = Infer<typeof markTargetValidator>;

/**
 * Stavka „Čeka tebe". `targetType`/`targetId` su isti rečnik kao kod obaveštenja
 * (`notificationDestination`): odobrenja startupa čiji je `startup._id` u stavci.
 */
const pendingBase = {
  startup: startupMiniValidator,
  requesterName: v.union(v.string(), v.null()),
  createdAt: v.number(),
  targetType: v.literal("approvals"),
  targetId: v.string(),
};

const pendingItemValidator = v.union(
  v.object({
    kind: v.literal("deletion_vote"),
    ballotId: v.id("deletionBallots"),
    requestId: v.id("deletionRequests"),
    title: v.string(),
    targetKind: schema.tables.deletionRequests.validator.fields.targetKind,
    ...pendingBase,
  }),
  v.object({
    kind: v.literal("page_nesting"),
    requestId: v.id("pageNestingRequests"),
    childTitle: v.string(),
    parentTitle: v.string(),
    ...pendingBase,
  }),
  v.object({
    kind: v.literal("idea_nesting"),
    requestId: v.id("nestingRequests"),
    childTitle: v.string(),
    parentTitle: v.string(),
    ...pendingBase,
  }),
);

type PendingItem = Infer<typeof pendingItemValidator>;

/** Najduži naslov ideje u stavci (ideja može imati samo tekst). */
const IDEA_TITLE_MAX = 120;

function visibleInScope(
  startupId: Id<"startups"> | null,
  scope: Map<Id<"startups">, StartupMini>,
) {
  return startupId === null || scope.has(startupId);
}

function startupOfRow(
  startupId: Id<"startups"> | null,
  scope: Map<Id<"startups">, StartupMini>,
) {
  return startupId === null ? null : (scope.get(startupId) ?? null);
}

function paginateFeed(
  ctx: QueryCtx,
  options: {
    profileId: Id<"profiles">;
    /** `undefined` = svi opsezi; `null` = samo lična obaveštenja. */
    startupId: Id<"startups"> | null | undefined;
    unreadOnly: boolean;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<Doc<"notifications">>> {
  const { profileId, startupId, unreadOnly, paginationOpts } = options;
  if (startupId !== undefined) {
    return unreadOnly
      ? ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_startup_and_readAt", (q) =>
            q
              .eq("recipientProfileId", profileId)
              .eq("startupId", startupId)
              .eq("readAt", null),
          )
          .order("desc")
          .paginate(paginationOpts)
      : ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_startup_and_createdAt", (q) =>
            q.eq("recipientProfileId", profileId).eq("startupId", startupId),
          )
          .order("desc")
          .paginate(paginationOpts);
  }
  return unreadOnly
    ? ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_readAt", (q) =>
          q.eq("recipientProfileId", profileId).eq("readAt", null),
        )
        .order("desc")
        .paginate(paginationOpts)
    : ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_createdAt", (q) =>
          q.eq("recipientProfileId", profileId),
        )
        .order("desc")
        .paginate(paginationOpts);
}

/**
 * Feed obaveštenja iz svih mojih aktivnih startupa i ličnih razgovora, najnovije
 * prvo. Stavke iz startupa van opsega se izbacuju POSLE čitanja, pa stranica može
 * biti kraća od `numItems` — klijent koristi „Učitaj još" dok `isDone` nije true.
 * `startupId: null` vraća samo lična obaveštenja (`startup: null`).
 */
export const feed = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startupId: scopeArgValidator,
    unreadOnly: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(inboxItemValidator),
  handler: async (ctx, args) => {
    boundedLimit(
      args.paginationOpts.numItems,
      INBOX_FEED_PAGE_DEFAULT,
      INBOX_FEED_PAGE_MAX,
    );

    let profile: Doc<"profiles">;
    let scope: Map<Id<"startups">, StartupMini>;
    if (args.startupId === undefined) {
      profile = await requireProfile(ctx);
      scope = await listMyActiveStartups(ctx, profile._id);
    } else if (args.startupId === null) {
      // Samo lično: startup stavke se ni ne čitaju (indeks `startupId = null`).
      profile = await requireProfile(ctx);
      scope = new Map();
    } else {
      const member = await requireStartupMember(ctx, args.startupId);
      profile = member.profile;
      scope = new Map([[args.startupId, await startupMiniOf(ctx, member.startup)]]);
    }

    const page = await paginateFeed(ctx, {
      profileId: profile._id,
      startupId: args.startupId,
      unreadOnly: args.unreadOnly === true,
      paginationOpts: args.paginationOpts,
    });

    const rows = page.page.filter((row) => visibleInScope(row.startupId, scope));
    const withActor = await withActors(ctx, rows);
    return {
      ...page,
      page: withActor.map((item) => ({
        ...item,
        startup: startupOfRow(item.startupId, scope),
      })),
    };
  },
});

/**
 * Nepročitano po opsezima. Skenira najviše `INBOX_UNREAD_SCAN_CAP` najnovijih
 * nepročitanih; kad dostigne granicu, SVI brojači su `capped` (prikaz „N+").
 * `byStartup` sadrži samo aktivne startupe sa bar jednim nepročitanim.
 */
export const unreadCounts = query({
  args: {},
  returns: v.object({
    total: counterValidator,
    byStartup: v.array(
      v.object({
        startupId: v.id("startups"),
        count: v.number(),
        capped: v.boolean(),
      }),
    ),
    personal: counterValidator,
  }),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const [scope, unread] = await Promise.all([
      listMyActiveStartups(ctx, profile._id),
      ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_readAt", (q) =>
          q.eq("recipientProfileId", profile._id).eq("readAt", null),
        )
        .order("desc")
        .take(INBOX_UNREAD_SCAN_CAP),
    ]);
    const capped = unread.length === INBOX_UNREAD_SCAN_CAP;

    const perStartup = new Map<Id<"startups">, number>();
    let personal = 0;
    for (const row of unread) {
      const startupId: Id<"startups"> | null = row.startupId;
      if (startupId === null) {
        personal += 1;
      } else if (scope.has(startupId)) {
        perStartup.set(startupId, (perStartup.get(startupId) ?? 0) + 1);
      }
    }

    // Redosled prati `listMyActiveStartups`, pa je stabilan između poziva.
    const byStartup = [...scope.keys()]
      .map((startupId) => ({
        startupId,
        count: perStartup.get(startupId) ?? 0,
        capped,
      }))
      .filter((entry) => entry.count > 0);
    const total = byStartup.reduce((sum, entry) => sum + entry.count, personal);

    return {
      total: { count: total, capped },
      byStartup,
      personal: { count: personal, capped },
    };
  },
});

/** Jedna serija „Označi sve": prvih `INBOX_MARK_ALL_BATCH` nepročitanih u opsegu. */
async function markBatch(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  target: MarkTarget,
) {
  const rows =
    target.kind === "all"
      ? await ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_readAt", (q) =>
            q.eq("recipientProfileId", profileId).eq("readAt", null),
          )
          .take(INBOX_MARK_ALL_BATCH)
      : await ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_startup_and_readAt", (q) =>
            q
              .eq("recipientProfileId", profileId)
              .eq(
                "startupId",
                target.kind === "personal" ? null : target.startupId,
              )
              .eq("readAt", null),
          )
          .take(INBOX_MARK_ALL_BATCH);

  const now = Date.now();
  for (const row of rows) {
    await ctx.db.patch("notifications", row._id, { readAt: now });
  }
  return rows.length;
}

/**
 * „Označi sve kao pročitano": bez `startupId` svi opsezi (i lični), sa Id-jem samo
 * taj startup, sa `null` samo lična obaveštenja. Prva serija ide odmah, ostalo
 * kroz scheduler (obrazac `notifications.markAllReadBatch`). Bez `startupId` se
 * pročita i ono iz startupa koji više nisu u opsegu — to su moja obaveštenja i
 * brojač ne sme da ostane zaglavljen na nečemu što se ne vidi.
 */
export const markAllRead = mutation({
  args: { startupId: scopeArgValidator },
  returns: v.object({ marked: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const startupId = args.startupId;
    const profile =
      startupId === undefined || startupId === null
        ? await requireProfile(ctx)
        : (await requireStartupMember(ctx, startupId)).profile;
    const target: MarkTarget =
      startupId === undefined
        ? { kind: "all" }
        : startupId === null
          ? { kind: "personal" }
          : { kind: "startup", startupId };

    const marked = await markBatch(ctx, profile._id, target);
    const hasMore = marked === INBOX_MARK_ALL_BATCH;
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.inbox.markAllReadBatch, {
        profileId: profile._id,
        target,
      });
    }
    return { marked, hasMore };
  },
});

/** Nastavak `markAllRead` u novoj transakciji kad ih je previše za jednu. */
export const markAllReadBatch = internalMutation({
  args: { profileId: v.id("profiles"), target: markTargetValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const marked = await markBatch(ctx, args.profileId, args.target);
    if (marked === INBOX_MARK_ALL_BATCH) {
      await ctx.scheduler.runAfter(0, internal.inbox.markAllReadBatch, args);
    }
    return null;
  },
});

function ideaTitle(node: Doc<"ideaNodes">) {
  const title = node.title?.trim();
  const text = node.text.trim();
  const label = title !== undefined && title.length > 0 ? title : text;
  return label.length === 0 ? "Ideja bez naslova" : label.slice(0, IDEA_TITLE_MAX);
}

/**
 * „Čeka tebe": glasanja i zahtevi za ugnežđavanje koji čekaju MOJ odgovor, iz
 * svih mojih aktivnih startupa. Samo `pending`; najnovije prvo.
 */
export const pending = query({
  args: {},
  returns: v.object({
    items: v.array(pendingItemValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const scope = await listMyActiveStartups(ctx, profile._id);

    const names = new Map<Id<"profiles">, string | null>();
    const nameOf = async (profileId: Id<"profiles">) => {
      if (!names.has(profileId)) {
        const person = await ctx.db.get("profiles", profileId);
        names.set(profileId, person === null ? null : person.displayName);
      }
      return names.get(profileId) ?? null;
    };

    let truncated = false;
    const items: PendingItem[] = [];

    // 1) Glasanja o brisanju: moj listić je `pending`, a zahtev još otvoren.
    const ballots = await ctx.db
      .query("deletionBallots")
      .withIndex("by_profileId_and_vote_and_createdAt", (q) =>
        q.eq("profileId", profile._id).eq("vote", "pending"),
      )
      .order("desc")
      .take(INBOX_PENDING_BALLOT_SCAN_CAP);
    if (ballots.length === INBOX_PENDING_BALLOT_SCAN_CAP) truncated = true;
    let votes = 0;
    for (const ballot of ballots) {
      const startup = scope.get(ballot.startupId);
      if (startup === undefined) continue;
      const request = await ctx.db.get("deletionRequests", ballot.requestId);
      if (
        request === null ||
        request.status !== "pending" ||
        request.startupId !== ballot.startupId
      ) {
        continue;
      }
      if (votes === INBOX_PENDING_CAP) {
        truncated = true;
        break;
      }
      votes += 1;
      items.push({
        kind: "deletion_vote",
        ballotId: ballot._id,
        requestId: request._id,
        title: request.targetTitle,
        targetKind: request.targetKind,
        startup,
        requesterName: await nameOf(request.requesterProfileId),
        createdAt: request.createdAt,
        targetType: "approvals",
        targetId: request._id,
      });
    }

    // 2) Zahtevi za ugnežđavanje stranica gde sam autor roditelja.
    const pageRequests = await ctx.db
      .query("pageNestingRequests")
      .withIndex("by_parentAuthorProfileId_and_status_and_createdAt", (q) =>
        q.eq("parentAuthorProfileId", profile._id).eq("status", "pending"),
      )
      .order("desc")
      .take(INBOX_PENDING_CAP + 1);
    if (pageRequests.length > INBOX_PENDING_CAP) truncated = true;
    for (const request of pageRequests.slice(0, INBOX_PENDING_CAP)) {
      const startup = scope.get(request.startupId);
      if (startup === undefined) continue;
      const [child, parent] = await Promise.all([
        ctx.db.get("pages", request.childPageId),
        ctx.db.get("pages", request.targetParentPageId),
      ]);
      // Isti uslovi važenosti kao `areasV2.listNestingInbox`.
      if (
        child === null ||
        child.archivedAt !== null ||
        parent === null ||
        parent.archivedAt !== null ||
        child.startupId !== request.startupId ||
        parent.startupId !== request.startupId ||
        child.areaId !== request.areaId ||
        parent.areaId !== request.areaId
      ) {
        continue;
      }
      items.push({
        kind: "page_nesting",
        requestId: request._id,
        childTitle: child.title,
        parentTitle: parent.title,
        startup,
        requesterName: await nameOf(request.requesterProfileId),
        createdAt: request.createdAt,
        targetType: "approvals",
        targetId: request._id,
      });
    }

    // 3) Zahtevi za ugnežđavanje ideja gde sam autor roditelja.
    const ideaRequests = await ctx.db
      .query("nestingRequests")
      .withIndex("by_parentAuthorProfileId_and_status_and_createdAt", (q) =>
        q.eq("parentAuthorProfileId", profile._id).eq("status", "pending"),
      )
      .order("desc")
      .take(INBOX_PENDING_CAP + 1);
    if (ideaRequests.length > INBOX_PENDING_CAP) truncated = true;
    for (const request of ideaRequests.slice(0, INBOX_PENDING_CAP)) {
      const startup = scope.get(request.startupId);
      if (startup === undefined) continue;
      const [child, parent] = await Promise.all([
        ctx.db.get("ideaNodes", request.childIdeaId),
        ctx.db.get("ideaNodes", request.parentIdeaId),
      ]);
      if (
        child === null ||
        child.archivedAt !== null ||
        parent === null ||
        parent.archivedAt !== null ||
        child.startupId !== request.startupId ||
        parent.startupId !== request.startupId
      ) {
        continue;
      }
      items.push({
        kind: "idea_nesting",
        requestId: request._id,
        childTitle: ideaTitle(child),
        parentTitle: ideaTitle(parent),
        startup,
        requesterName: await nameOf(request.requesterProfileId),
        createdAt: request.createdAt,
        targetType: "approvals",
        targetId: request._id,
      });
    }

    items.sort((a, b) => b.createdAt - a.createdAt);
    return { items, truncated };
  },
});
