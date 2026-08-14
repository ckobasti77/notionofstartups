import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  archivePageWithV2Sidecars,
  movePageAcrossAreasWithSidecars,
  moveWithinArea,
} from "./areasV2";
import { recordActivity } from "./lib/activity";
import { requireStartupMember } from "./lib/auth";
import { insertContribution } from "./lib/collaboration";
import {
  cleanPageContent,
  insertWorkspacePage,
  prepareWorkspacePage,
  requirePageArea,
  requirePageParent,
  validateWorkspacePageTarget,
  workspaceCanvasPreview,
} from "./lib/page_creation";
import {
  pageSearchText,
  pageTaskSortAt,
  requireVisiblePage,
  summarizePage,
} from "./lib/pages";
import {
  getProfileSummary,
  profileSummaryValidator as profileSummaryDisplayValidator,
} from "./lib/profile_summary";
import { resolveTaskAssignees } from "./lib/task_assignees";
import {
  boundedLimit,
  checkpointItemValidator,
  cleanRequiredText,
  pageDocumentValidator,
  pageKindValidator,
  pageSummaryValidator,
  roleValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";

type PageReadCtx = QueryCtx | MutationCtx;

const profileDocumentValidator = v.object({
  _id: v.id("profiles"),
  _creationTime: v.number(),
  userId: v.id("users"),
  displayName: v.string(),
  email: v.string(),
  role: roleValidator,
  avatarStorageId: v.optional(v.id("_storage")),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const pageDetailsValidator = pageDocumentValidator.extend({
  content: v.string(),
  creator: v.union(
    profileDocumentValidator.extend({
      avatarUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  updater: v.union(profileDocumentValidator, v.null()),
  /** Prvi izvršilac; ceo spisak je u `assignees`. */
  assignee: v.union(profileDocumentValidator, v.null()),
  assignees: v.array(profileSummaryDisplayValidator),
  permissions: v.object({
    canEdit: v.boolean(),
    canEditBody: v.boolean(),
    canMove: v.boolean(),
    canResize: v.boolean(),
    canDetach: v.boolean(),
    canDeleteDirectly: v.boolean(),
    canRequestDeletion: v.boolean(),
  }),
});

async function getPageBodyContributions(
  ctx: PageReadCtx,
  pageId: Id<"pages">,
  bodyId: Id<"pageBodies"> | null,
) {
  const sourceIds = bodyId === null ? [pageId] : [pageId, bodyId];
  const batches = await Promise.all(
    sourceIds.map((sourceId) =>
      ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_body").eq("sourceId", sourceId),
        )
        .take(2),
    ),
  );
  const byId = new Map(
    batches
      .flat()
      .filter(
        (contribution) =>
          contribution.targetKind === "page" &&
          contribution.targetId === pageId &&
          contribution.archivedAt === null,
      )
      .map((contribution) => [contribution._id, contribution]),
  );
  return Array.from(byId.values());
}

export const listChildren = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: v.optional(pageKindValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);
    await requirePageParent(ctx, args.startupId, args.areaId, args.parentPageId);
    const kind = args.kind;
    const result =
      kind === undefined
        ? await ctx.db
            .query("pages")
            .withIndex(
              "by_areaId_and_parentPageId_and_archivedAt_and_position",
              (q) =>
                q
                  .eq("areaId", args.areaId)
                  .eq("parentPageId", args.parentPageId)
                  .eq("archivedAt", null),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("pages")
            .withIndex(
              "by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position",
              (q) =>
                q
                  .eq("areaId", args.areaId)
                  .eq("kind", kind)
                  .eq("parentPageId", args.parentPageId)
                  .eq("archivedAt", null),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(summarizePage) };
  },
});

export const get = query({
  args: { pageId: v.id("pages") },
  returns: pageDetailsValidator,
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const [body, creator, updater, assignee, parent] = await Promise.all([
      ctx.db
        .query("pageBodies")
        .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
        .unique(),
      ctx.db.get("profiles", page.createdByProfileId),
      ctx.db.get("profiles", page.updatedByProfileId),
      page.assigneeProfileId === null
        ? Promise.resolve(null)
        : ctx.db.get("profiles", page.assigneeProfileId),
      page.parentPageId === null
        ? Promise.resolve(null)
        : ctx.db.get("pages", page.parentPageId),
    ]);
    const assigneeEntries = await resolveTaskAssignees(ctx, page);
    const assignees = (
      await Promise.all(
        assigneeEntries.map((entry) => getProfileSummary(ctx, entry.profileId)),
      )
    ).filter((summary) => summary !== null);
    const pageBodyContributions = await getPageBodyContributions(
      ctx,
      page._id,
      body?._id ?? null,
    );

    let creatorAvatarUrl = null;
    if (creator?.avatarStorageId) {
      creatorAvatarUrl = await ctx.storage.getUrl(creator.avatarStorageId);
    }
    const creatorWithAvatar = creator ? { ...creator, avatarUrl: creatorAvatarUrl } : null;

    return {
      ...page,
      content: body?.content ?? "",
      creator: creatorWithAvatar,
      updater,
      assignee,
      assignees,
      permissions: {
        canEdit: page.createdByProfileId === profile._id,
        canEditBody:
          page.createdByProfileId === profile._id &&
          ((pageBodyContributions.length === 0 &&
            !(body?.content ?? "").trim()) ||
            pageBodyContributions.some(
              (contribution) =>
                contribution.attribution === "author" &&
                contribution.authorProfileId === profile._id,
            )),
        canMove: page.createdByProfileId === profile._id,
        canResize: page.createdByProfileId === profile._id,
        canDetach:
          page.parentPageId !== null &&
          (page.createdByProfileId === profile._id ||
            (parent !== null &&
              parent.archivedAt === null &&
              parent.startupId === page.startupId &&
              parent.areaId === page.areaId &&
              parent.createdByProfileId === profile._id)),
        canDeleteDirectly: page.createdByProfileId === profile._id,
        canRequestDeletion: page.createdByProfileId !== profile._id,
      },
    };
  },
});

export const getBreadcrumbs = query({
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    await requireStartupMember(ctx, page.startupId);
    const breadcrumbs = [{ _id: page._id, title: page.title, kind: page.kind }];
    let parentPageId = page.parentPageId;
    for (let depth = 0; parentPageId !== null && depth < 64; depth += 1) {
      const parent = await ctx.db.get("pages", parentPageId);
      if (
        parent === null ||
        parent.archivedAt !== null ||
        parent.startupId !== page.startupId ||
        parent.areaId !== page.areaId
      ) {
        throw new Error("Stranica nije pronađena.");
      }
      breadcrumbs.push({ _id: parent._id, title: parent.title, kind: parent.kind });
      parentPageId = parent.parentPageId;
      if (depth === 63 && parentPageId !== null) {
        throw new Error("Hijerarhija stranica je preduboka.");
      }
    }
    return breadcrumbs.reverse();
  },
});

/**
 * Broj stranica na vrhu svake oblasti (`parentPageId === null`) za startup.
 * Napaja brojač u mobilnom „Prostor" tabu (Nivo 1). Čitanje je ograničeno na
 * `CAP + 1` po oblasti — brojanje kroz `.take()` ostaje ograničeno (guidelines
 * zabranjuju `.collect().length`); preko granice klijent prikaže „99+".
 */
export const areaTopLevelCounts = query({
  args: { startupId: v.id("startups") },
  returns: v.array(
    v.object({
      areaId: v.id("startupAreas"),
      count: v.number(),
      capped: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    const areas = await ctx.db
      .query("startupAreas")
      .withIndex("by_startupId_and_position", (q) =>
        q.eq("startupId", args.startupId),
      )
      .take(50);
    const CAP = 99;
    return await Promise.all(
      areas.map(async (area) => {
        const rows = await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", area._id)
                .eq("parentPageId", null)
                .eq("archivedAt", null),
          )
          .take(CAP + 1);
        return {
          areaId: area._id,
          count: Math.min(rows.length, CAP),
          capped: rows.length > CAP,
        };
      }),
    );
  },
});

/**
 * Broj podstranica za zadate roditeljske stranice unutar jedne oblasti. Napaja
 * meta podatak u redu mobilnog „Prostor" stabla — da se pre razvijanja vidi ima
 * li šta unutra. Web ekvivalent nije potreban: `page-tree.tsx` decu ionako drži
 * učitanu u stablu, pa broj vidi bez dodatnog upita.
 *
 * Ograničeno dvostruko: najviše `MAX_CHILD_COUNT_PARENTS` roditelja po pozivu i
 * `CAP + 1` pročitanih redova po roditelju (guidelines zabranjuju
 * `.collect().length`); preko granice klijent prikaže „9+".
 */
const MAX_CHILD_COUNT_PARENTS = 50;

export const childCounts = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageIds: v.array(v.id("pages")),
  },
  returns: v.array(
    v.object({
      pageId: v.id("pages"),
      count: v.number(),
      capped: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    // Oblast se proverava; roditelji se ne moraju — upit ide po `areaId`, pa tuđi
    // `parentPageId` jednostavno nema redova u ovoj oblasti (nema curenja).
    await requirePageArea(ctx, args.startupId, args.areaId);
    const CAP = 9;
    const ids = args.parentPageIds.slice(0, MAX_CHILD_COUNT_PARENTS);
    return await Promise.all(
      ids.map(async (pageId) => {
        const rows = await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", args.areaId)
                .eq("parentPageId", pageId)
                .eq("archivedAt", null),
          )
          .take(CAP + 1);
        return {
          pageId,
          count: Math.min(rows.length, CAP),
          capped: rows.length > CAP,
        };
      }),
    );
  },
});

/**
 * Poslednje izmenjene (ne-arhivirane) stranice startupa — sekcija „Nedavno" u
 * mobilnom „Prostor" tabu. Sortirano po `updatedAt` opadajuće preko indeksa.
 */
export const recentForStartup = query({
  args: { startupId: v.id("startups"), limit: v.optional(v.number()) },
  returns: v.array(pageSummaryValidator),
  handler: async (ctx, args) => {
    await requireStartupMember(ctx, args.startupId);
    const limit = boundedLimit(args.limit, 10, 25);
    const rows = await ctx.db
      .query("pages")
      .withIndex("by_startupId_and_archivedAt_and_updatedAt", (q) =>
        q.eq("startupId", args.startupId).eq("archivedAt", null),
      )
      .order("desc")
      .take(limit);
    return rows.map(summarizePage);
  },
});

export const create = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: pageKindValidator,
    title: v.string(),
    content: v.optional(v.string()),
    position: v.optional(v.number()),
    taskStatus: v.optional(taskStatusValidator),
    taskPriority: v.optional(taskPriorityValidator),
    assigneeProfileId: v.optional(v.id("profiles")),
    assigneeProfileIds: v.optional(v.array(v.id("profiles"))),
    dueDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
    checkpoints: v.optional(v.array(checkpointItemValidator)),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const now = Date.now();
    const target = await validateWorkspacePageTarget(ctx, {
      startupId: args.startupId,
      areaId: args.areaId,
      parentPageId: args.parentPageId,
      kind: args.kind,
      taskStatus: args.taskStatus,
      taskPriority: args.taskPriority,
      assigneeProfileId: args.assigneeProfileId,
      assigneeProfileIds: args.assigneeProfileIds,
      dueDate: args.dueDate,
      instructions: args.instructions,
      checkpoints: args.checkpoints,
    });
    const parent = await requirePageParent(
      ctx,
      args.startupId,
      args.areaId,
      args.parentPageId,
    );
    if (parent !== null && parent.createdByProfileId !== profile._id) {
      throw new Error(
        "Za ugnježđavanje u tuđu stranicu potrebno je odobrenje njenog autora.",
      );
    }
    const page = prepareWorkspacePage(target, {
      title: args.title,
      content: args.content ?? "",
      position: args.position,
      now,
    });
    return await insertWorkspacePage(ctx, {
      target,
      page,
      actorProfileId: profile._id,
      now,
    });
  },
});

export const update = mutation({
  args: {
    pageId: v.id("pages"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (page.createdByProfileId !== profile._id) {
      throw new Error(
        "Naslov i osnovni sadržaj menja samo kreator. Dodajte svoj tekst.",
      );
    }
    if (page.revision !== args.expectedRevision) {
      throw new Error("KONFLIKT_IZMENA: Neko iz tima je u međuvremenu izmenio ovu stranicu.");
    }
    const body = await ctx.db
      .query("pageBodies")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique();
    const title = args.title === undefined
      ? page.title
      : cleanRequiredText(args.title, "Naslov", 200);
    const currentContent = body?.content ?? "";
    const content = args.content === undefined ? currentContent : cleanPageContent(args.content);
    const bodyContributions = await getPageBodyContributions(
      ctx,
      page._id,
      body?._id ?? null,
    );
    const authoredBodyContribution = bodyContributions.find(
      (contribution) =>
        contribution.attribution === "author" &&
        contribution.authorProfileId === profile._id,
    );
    const shouldClaimMissingBody =
      content !== currentContent &&
      authoredBodyContribution === undefined &&
      bodyContributions.length === 0 &&
      !currentContent.trim();
    if (
      content !== currentContent &&
      authoredBodyContribution === undefined &&
      !shouldClaimMissingBody
    ) {
      throw new Error(
        "Raniji zajednički sadržaj je zaključan. Dodajte svoj potpisani tekst.",
      );
    }
    if (title === page.title && content === currentContent) {
      return { pageId: page._id, revision: page.revision, updatedAt: page.updatedAt };
    }
    const now = Date.now();
    const revision = page.revision + 1;
    await ctx.db.patch("pages", page._id, {
      title,
      searchText: pageSearchText(title, content),
      canvasPreview: workspaceCanvasPreview(
        title,
        content,
        page.instructions,
      ),
      revision,
      taskSortAt: pageTaskSortAt(page.dueDate, now),
      updatedByProfileId: profile._id,
      updatedAt: now,
    });
    if (body === null) {
      await ctx.db.insert("pageBodies", { pageId: page._id, content, updatedAt: now });
    } else if (content !== currentContent) {
      await ctx.db.patch("pageBodies", body._id, { content, updatedAt: now });
    }
    if (
      content !== currentContent &&
      authoredBodyContribution !== undefined
    ) {
      await ctx.db.patch(
        "contentContributions",
        authoredBodyContribution._id,
        { content, updatedAt: now },
      );
    } else if (shouldClaimMissingBody) {
      await insertContribution(ctx, {
        startupId: page.startupId,
        targetKind: "page",
        targetId: page._id,
        authorProfileId: profile._id,
        content,
        sourceKind: "page_body",
        sourceId: page._id,
        createdAt: now,
      });
    }
    if (title !== page.title || now - page.updatedAt >= 5 * 60 * 1_000) {
      await recordActivity(ctx, {
        startupId: page.startupId,
        actorProfileId: profile._id,
        action: "page_updated",
        targetType: "page",
        targetId: page._id,
        title: `„${title}” je izmenjen/a`,
      });
    }
    return { pageId: page._id, revision, updatedAt: now };
  },
});

export const move = mutation({
  args: {
    pageId: v.id("pages"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    position: v.optional(v.number()),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (page.createdByProfileId !== profile._id) {
      throw new Error("Možete pomerati samo svoju stranicu.");
    }
    await requirePageArea(ctx, page.startupId, args.areaId);
    if (args.parentPageId === page._id) throw new Error("Stranica ne može biti sopstveni roditelj.");
    const parent = await requirePageParent(ctx, page.startupId, args.areaId, args.parentPageId);
    if (
      parent !== null &&
      parent.createdByProfileId !== profile._id
    ) {
      throw new Error(
        "Za ugnježđavanje u tuđu stranicu potrebno je odobrenje njenog autora.",
      );
    }
    let cursor = parent;
    for (let depth = 0; cursor !== null && depth < 64; depth += 1) {
      if (cursor._id === page._id) throw new Error("Premeštanje bi napravilo kružnu hijerarhiju.");
      cursor = cursor.parentPageId === null
        ? null
        : await requireVisiblePage(ctx, cursor.parentPageId);
    }
    const now = Date.now();
    if (page.areaId !== args.areaId) {
      if (parent !== null) {
        throw new Error(
          "Premeštanje u drugu oblast je dozvoljeno samo u koren oblasti.",
        );
      }
      await movePageAcrossAreasWithSidecars(ctx, {
        page,
        targetAreaId: args.areaId,
        actorProfileId: profile._id,
        position: args.position,
        now,
      });
      return page._id;
    }
    await moveWithinArea(ctx, {
      child: page,
      targetParent: parent,
      actorProfileId: profile._id,
      position: args.position,
      now,
    });
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: profile._id,
      action: "page_moved",
      targetType: "page",
      targetId: page._id,
      title: `„${page.title}” je premešten/a`,
    });
    return page._id;
  },
});

export const archive = mutation({
  args: { pageId: v.id("pages") },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    if (page.createdByProfileId !== profile._id) {
      throw new Error("Tuđa stranica se briše samo jednoglasnim glasanjem.");
    }
    await archivePageWithV2Sidecars(ctx, page, profile._id);
    return page._id;
  },
});

export const addEntry = mutation({
  args: {
    pageId: v.id("pages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const cleaned = cleanPageContent(args.content);
    if (!cleaned.trim()) throw new Error("Sadržaj unosa ne može biti prazan.");

    const lastEntry = await ctx.db
      .query("pageEntries")
      .withIndex("by_pageId_and_position", (q) => q.eq("pageId", page._id))
      .order("desc")
      .first();
    const maxPosition = lastEntry?.position ?? 0;
    const now = Date.now();

    const entryId = await ctx.db.insert("pageEntries", {
      pageId: page._id,
      authorProfileId: profile._id,
      content: cleaned,
      position: maxPosition + 1,
      createdAt: now,
      updatedAt: now,
    });

    await insertContribution(ctx, {
      startupId: page.startupId,
      targetKind: "page",
      targetId: page._id,
      authorProfileId: profile._id,
      content: cleaned,
      sourceKind: "page_entry",
      sourceId: entryId,
      createdAt: now,
    });

    await ctx.db.patch("pages", page._id, {
      updatedByProfileId: profile._id,
      updatedAt: now,
    });

    return entryId;
  },
});

export const updateEntry = mutation({
  args: {
    pageId: v.id("pages"),
    entryId: v.id("pageEntries"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const entry = await ctx.db.get("pageEntries", args.entryId);
    if (entry === null || entry.pageId !== page._id) {
      throw new Error("Tekst nije pronađen.");
    }
    if (entry.authorProfileId !== profile._id) {
      throw new Error("Možete urediti samo svoj tekst.");
    }
    const content = cleanPageContent(args.content);
    if (!content.trim()) throw new Error("Tekst ne može biti prazan.");
    const now = Date.now();
    await ctx.db.patch("pageEntries", entry._id, { content, updatedAt: now });
    const contribution = await ctx.db
      .query("contentContributions")
      .withIndex("by_sourceKind_and_sourceId", (q) =>
        q.eq("sourceKind", "page_entry").eq("sourceId", entry._id),
      )
      .unique();
    if (contribution !== null) {
      await ctx.db.patch("contentContributions", contribution._id, {
        content,
        updatedAt: now,
      });
    }
    return entry._id;
  },
});

export const deleteEntry = mutation({
  args: {
    pageId: v.id("pages"),
    entryId: v.id("pageEntries"),
  },
  handler: async (ctx, args) => {
    const page = await requireVisiblePage(ctx, args.pageId);
    const { profile } = await requireStartupMember(ctx, page.startupId);
    const entry = await ctx.db.get("pageEntries", args.entryId);
    if (entry && entry.pageId === page._id) {
      if (entry.authorProfileId !== profile._id) {
        throw new Error(
          "Tuđa izmena se uklanja samo jednoglasnim glasanjem.",
        );
      }
      await ctx.db.delete("pageEntries", args.entryId);
      const contribution = await ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_entry").eq("sourceId", entry._id),
        )
        .unique();
      if (contribution !== null) {
        await ctx.db.patch("contentContributions", contribution._id, {
          archivedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const listAreaCanvasPages = query({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    kind: v.optional(pageKindValidator),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);
    const kind = args.kind;
    const filteredPages = kind
      ? await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", args.areaId)
                .eq("kind", kind)
                .eq("parentPageId", null)
                .eq("archivedAt", null),
          )
          .take(250)
      : await ctx.db
          .query("pages")
          .withIndex(
            "by_areaId_and_parentPageId_and_archivedAt_and_position",
            (q) =>
              q
                .eq("areaId", args.areaId)
                .eq("parentPageId", null)
                .eq("archivedAt", null),
          )
          .take(250);

    const edges = await ctx.db
      .query("pageEdges")
      .withIndex("by_areaId", (q) => q.eq("areaId", args.areaId))
      .take(500);

    // Map creator details for each page
    const pagesWithDetails = await Promise.all(
      filteredPages.map(async (p) => {
        const creator = await ctx.db.get("profiles", p.createdByProfileId);
        let creatorAvatarUrl = null;
        if (creator?.avatarStorageId) {
          creatorAvatarUrl = await ctx.storage.getUrl(creator.avatarStorageId);
        }
        return {
          ...p,
          creator: creator ? { displayName: creator.displayName, avatarUrl: creatorAvatarUrl } : null,
          canEdit: p.createdByProfileId === profile._id,
          canMove: p.createdByProfileId === profile._id,
          canResize: p.createdByProfileId === profile._id,
          canDeleteDirectly: p.createdByProfileId === profile._id,
          canRequestDeletion: p.createdByProfileId !== profile._id,
        };
      })
    );
    const visiblePageIds = new Set(filteredPages.map((page) => page._id));

    return {
      pages: pagesWithDetails,
      edges: edges
        .filter(
          (edge) =>
            edge.startupId === args.startupId &&
            visiblePageIds.has(edge.nodeAId) &&
            visiblePageIds.has(edge.nodeBId) &&
            (edge.archivedAt === undefined || edge.archivedAt === null),
        )
        .map((edge) => ({
          ...edge,
          canEdit: edge.authorProfileId === profile._id,
          canDeleteDirectly: edge.authorProfileId === profile._id,
          canRequestDeletion: edge.authorProfileId !== profile._id,
        })),
    };
  },
});

export const connectCanvasPages = mutation({
  args: {
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    nodeAId: v.id("pages"),
    nodeBId: v.id("pages"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    await requirePageArea(ctx, args.startupId, args.areaId);
    if (args.nodeAId === args.nodeBId) throw new Error("Ne možete povezati istu stavku.");
    const [nodeA, nodeB] = await Promise.all([
      ctx.db.get("pages", args.nodeAId),
      ctx.db.get("pages", args.nodeBId),
    ]);
    if (
      nodeA === null ||
      nodeB === null ||
      nodeA.startupId !== args.startupId ||
      nodeB.startupId !== args.startupId ||
      nodeA.areaId !== args.areaId ||
      nodeB.areaId !== args.areaId ||
      nodeA.archivedAt !== null ||
      nodeB.archivedAt !== null ||
      nodeA.parentPageId !== null ||
      nodeB.parentPageId !== null ||
      (nodeA.createdByProfileId !== profile._id &&
        nodeB.createdByProfileId !== profile._id)
    ) {
      throw new Error(
        "Vezu možete napraviti samo ako posedujete bar jednu karticu.",
      );
    }
    if (nodeA.kind !== nodeB.kind) {
      throw new Error("Na podeljenom kanvasu povežite kartice istog tipa.");
    }

    const pairKey = [args.nodeAId, args.nodeBId].sort().join(":");
    const existing = await ctx.db
      .query("pageEdges")
      .withIndex("by_areaId_and_pairKey", (q) =>
        q.eq("areaId", args.areaId).eq("pairKey", pairKey)
      )
      .unique();

    const now = Date.now();
    if (existing) {
      if (existing.startupId !== args.startupId) {
        throw new Error("Postojeća veza ne pripada ovom startupu.");
      }
      if (existing.archivedAt !== undefined && existing.archivedAt !== null) {
        await ctx.db.patch("pageEdges", existing._id, {
          label: args.label ? args.label.trim() : existing.label,
          authorProfileId: profile._id,
          archivedAt: null,
          updatedAt: now,
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("pageEdges", {
      startupId: args.startupId,
      areaId: args.areaId,
      nodeAId: args.nodeAId,
      nodeBId: args.nodeBId,
      pairKey,
      label: args.label ? args.label.trim() : null,
      authorProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const disconnectCanvasPages = mutation({
  args: {
    startupId: v.id("startups"),
    edgeId: v.id("pageEdges"),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireStartupMember(ctx, args.startupId);
    const edge = await ctx.db.get("pageEdges", args.edgeId);
    if (edge === null || edge.startupId !== args.startupId) {
      throw new Error("Veza nije pronađena.");
    }
    const [nodeA, nodeB] = await Promise.all([
      ctx.db.get("pages", edge.nodeAId),
      ctx.db.get("pages", edge.nodeBId),
    ]);
    const ownsLegacyEndpoint =
      edge.authorProfileId === undefined &&
      (nodeA?.createdByProfileId === profile._id ||
        nodeB?.createdByProfileId === profile._id);
    if (edge.authorProfileId !== profile._id && !ownsLegacyEndpoint) {
      throw new Error("Možete ukloniti samo vezu koju ste napravili.");
    }
    if (edge.archivedAt === undefined || edge.archivedAt === null) {
      await ctx.db.delete("pageEdges", args.edgeId);
    }
  },
});
