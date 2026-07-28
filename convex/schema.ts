import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  checkpointItemValidator,
  pageKindValidator,
  taskPriorityValidator,
  taskStatusValidator,
} from "./lib/validators";

const role = v.union(v.literal("admin"), v.literal("member"));
const areaKey = v.string();
const thoughtColor = v.union(
  v.literal("neutral"),
  v.literal("violet"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("amber"),
  v.literal("rose"),
);

export default defineSchema({
  ...authTables,

  appState: defineTable({
    key: v.literal("singleton"),
    bootstrappedAt: v.number(),
    bootstrappedByUserId: v.id("users"),
    bootstrappedByProfileId: v.id("profiles"),
  }).index("by_key", ["key"]),

  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    email: v.string(),
    role,
    avatarStorageId: v.optional(v.id("_storage")),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_avatarStorageId", ["avatarStorageId"])
    .index("by_role_and_archivedAt", ["role", "archivedAt"]),

  avatarUploads: defineTable({
    profileId: v.id("profiles"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_profileId_and_createdAt", ["profileId", "createdAt"]),

  startups: defineTable({
    name: v.string(),
    description: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    createdByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_archivedAt_and_updatedAt", ["archivedAt", "updatedAt"])
    .index("by_createdByProfileId_and_archivedAt", [
      "createdByProfileId",
      "archivedAt",
    ]),

  startupMembers: defineTable({
    startupId: v.id("startups"),
    profileId: v.id("profiles"),
    addedByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
  })
    .index("by_startupId_and_profileId", ["startupId", "profileId"])
    .index("by_startupId_and_archivedAt_and_profileId", [
      "startupId",
      "archivedAt",
      "profileId",
    ])
    .index("by_profileId_and_startupId", ["profileId", "startupId"])
    .index("by_profileId_and_createdAt", ["profileId", "createdAt"]),

  startupAreas: defineTable({
    startupId: v.id("startups"),
    key: areaKey,
    label: v.string(),
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_startupId_and_key", ["startupId", "key"])
    .index("by_startupId_and_position", ["startupId", "position"]),

  invites: defineTable({
    email: v.string(),
    startupId: v.id("startups"),
    codeHash: v.string(),
    createdByProfileId: v.id("profiles"),
    createdAt: v.number(),
    expiresAt: v.number(),
    claimedAt: v.union(v.number(), v.null()),
    claimedByProfileId: v.union(v.id("profiles"), v.null()),
    revokedAt: v.union(v.number(), v.null()),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_startupId_and_createdAt", ["startupId", "createdAt"])
    .index("by_email_and_startupId", ["email", "startupId"]),

  thoughtCanvases: defineTable({
    startupId: v.id("startups"),
    ownerProfileId: v.id("profiles"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerProfileId_and_startupId", [
    "ownerProfileId",
    "startupId",
  ]),

  thoughtNodes: defineTable({
    startupId: v.id("startups"),
    ownerProfileId: v.id("profiles"),
    title: v.union(v.string(), v.null()),
    text: v.string(),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    parentThoughtId: v.optional(v.id("thoughtNodes")),
    color: thoughtColor,
    isParent: v.optional(v.boolean()),
    conversionCount: v.number(),
    lastConvertedIdeaId: v.optional(v.id("ideaNodes")),
    lastConvertedPageId: v.union(v.id("pages"), v.null()),
    lastConvertedAt: v.union(v.number(), v.null()),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index(
      "by_ownerProfileId_and_startupId_and_archivedAt_and_updatedAt",
      ["ownerProfileId", "startupId", "archivedAt", "updatedAt"],
    )
    .index("by_parentThoughtId_and_archivedAt", [
      "parentThoughtId",
      "archivedAt",
    ]),

  thoughtEdges: defineTable({
    startupId: v.id("startups"),
    ownerProfileId: v.id("profiles"),
    nodeAId: v.id("thoughtNodes"),
    nodeBId: v.id("thoughtNodes"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    archivedAt: v.union(v.number(), v.null()),
    // Only edges hidden as a consequence of archiving nodes carry these
    // markers. A manually archived edge keeps them empty and stays archived
    // when either endpoint is restored later.
    archivedByNode: v.optional(v.boolean()),
    archivedForNodeIds: v.optional(v.array(v.id("thoughtNodes"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerProfileId_and_startupId_and_pairKey", [
      "ownerProfileId",
      "startupId",
      "pairKey",
    ])
    .index(
      "by_ownerProfileId_and_startupId_and_archivedAt_and_updatedAt",
      ["ownerProfileId", "startupId", "archivedAt", "updatedAt"],
    )
    .index(
      "by_ownerProfileId_and_startupId_and_nodeAId_and_archivedAt",
      ["ownerProfileId", "startupId", "nodeAId", "archivedAt"],
    )
    .index(
      "by_ownerProfileId_and_startupId_and_nodeBId_and_archivedAt",
      ["ownerProfileId", "startupId", "nodeBId", "archivedAt"],
    )
    .index(
      "by_ownerProfileId_and_startupId_and_nodeAId_and_archivedByNode",
      ["ownerProfileId", "startupId", "nodeAId", "archivedByNode"],
    )
    .index(
      "by_ownerProfileId_and_startupId_and_nodeBId_and_archivedByNode",
      ["ownerProfileId", "startupId", "nodeBId", "archivedByNode"],
    ),

  pageBodies: defineTable({
    pageId: v.id("pages"),
    content: v.string(),
    updatedAt: v.number(),
  }).index("by_pageId", ["pageId"]),

  pages: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: pageKindValidator,
    title: v.string(),
    searchText: v.string(),
    revision: v.number(),
    treeRevision: v.optional(v.number()),
    canvasPreview: v.optional(v.string()),
    position: v.number(),
    taskStatus: v.union(taskStatusValidator, v.null()),
    taskPriority: v.union(taskPriorityValidator, v.null()),
    assigneeProfileId: v.union(v.id("profiles"), v.null()),
    dueDate: v.union(v.number(), v.null()),
    instructions: v.optional(v.string()),
    // Deprecated rollback projection. taskCheckpoints is the canonical source.
    checkpoints: v.optional(v.array(checkpointItemValidator)),
    checkpointTotal: v.optional(v.number()),
    checkpointCompleted: v.optional(v.number()),
    checkpointRevision: v.optional(v.number()),
    taskSortAt: v.number(),
    createdByProfileId: v.id("profiles"),
    updatedByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position", [
      "areaId",
      "kind",
      "parentPageId",
      "archivedAt",
      "position",
    ])
    .index("by_areaId_and_parentPageId_and_archivedAt_and_position", [
      "areaId",
      "parentPageId",
      "archivedAt",
      "position",
    ])
    .index("by_startup_area_parent_active_position", [
      "startupId",
      "areaId",
      "parentPageId",
      "archivedAt",
      "position",
    ])
    .index("by_parentPageId_and_archivedAt", ["parentPageId", "archivedAt"])
    .index("by_startupId_and_kind_and_archivedAt", [
      "startupId",
      "kind",
      "archivedAt",
    ])
    .index("by_startup_kind_active_sort", [
      "startupId",
      "kind",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_startupId_and_kind_and_taskStatus_and_archivedAt", [
      "startupId",
      "kind",
      "taskStatus",
      "archivedAt",
    ])
    .index("by_startup_status_active_sort", [
      "startupId",
      "kind",
      "taskStatus",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_assigneeProfileId_and_kind_and_archivedAt", [
      "assigneeProfileId",
      "kind",
      "archivedAt",
    ])
    .index("by_assigneeProfileId_and_kind_and_taskStatus_and_archivedAt", [
      "assigneeProfileId",
      "kind",
      "taskStatus",
      "archivedAt",
    ])
    .index("by_startupId_and_assigneeProfileId_and_archivedAt", [
      "startupId",
      "assigneeProfileId",
      "archivedAt",
    ])
    .index("by_startup_assignee_active_sort", [
      "startupId",
      "assigneeProfileId",
      "archivedAt",
      "taskSortAt",
    ])
    .index(
      "by_startupId_and_assigneeProfileId_and_taskStatus_and_archivedAt",
      [
        "startupId",
        "assigneeProfileId",
        "taskStatus",
        "archivedAt",
      ],
    )
    .index(
      "by_startup_assignee_status_sort",
      [
        "startupId",
        "assigneeProfileId",
        "taskStatus",
        "archivedAt",
        "taskSortAt",
      ],
    )
    .index("by_startupId_and_archivedAt_and_updatedAt", [
      "startupId",
      "archivedAt",
      "updatedAt",
    ])
    .index("by_areaId_and_kind_and_archivedAt_and_updatedAt", [
      "areaId",
      "kind",
      "archivedAt",
      "updatedAt",
    ])
    .index("by_startup_area_kind_active_updated", [
      "startupId",
      "areaId",
      "kind",
      "archivedAt",
      "updatedAt",
    ])
    .searchIndex("search_title_and_content", {
      searchField: "searchText",
      filterFields: ["startupId", "kind", "archivedAt"],
    }),

  taskCheckpoints: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    taskPageId: v.id("pages"),
    legacyId: v.string(),
    text: v.string(),
    completed: v.boolean(),
    position: v.number(),
    createdByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_taskPageId_and_archivedAt_and_position", [
      "taskPageId",
      "archivedAt",
      "position",
    ])
    .index("by_taskPageId_and_legacyId", ["taskPageId", "legacyId"]),

  taskCheckpointCanvasPlacements: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    canvasRootPageId: v.union(v.id("pages"), v.null()),
    checkpointId: v.id("taskCheckpoints"),
    x: v.number(),
    y: v.number(),
    updatedByProfileId: v.id("profiles"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_checkpointId_and_canvasRootPageId", [
      "checkpointId",
      "canvasRootPageId",
    ])
    .index("by_startupId_and_areaId_and_canvasRootPageId", [
      "startupId",
      "areaId",
      "canvasRootPageId",
    ]),

  ideaCanvases: defineTable({
    startupId: v.id("startups"),
    ownerProfileId: v.id("profiles"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerProfileId_and_startupId", [
    "ownerProfileId",
    "startupId",
  ]),

  ideaNodes: defineTable({
    startupId: v.id("startups"),
    authorProfileId: v.id("profiles"),
    title: v.union(v.string(), v.null()),
    text: v.string(),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    parentIdeaId: v.optional(v.id("ideaNodes")),
    color: thoughtColor,
    isParent: v.optional(v.boolean()),
    convertedPageId: v.union(v.id("pages"), v.null()),
    convertedAt: v.union(v.number(), v.null()),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_startupId_and_archivedAt_and_updatedAt", [
      "startupId",
      "archivedAt",
      "updatedAt",
    ])
    .index("by_parentIdeaId_and_archivedAt", [
      "parentIdeaId",
      "archivedAt",
    ]),

  ideaVotes: defineTable({
    startupId: v.id("startups"),
    ideaId: v.id("ideaNodes"),
    profileId: v.id("profiles"),
    voteType: v.union(v.literal("up"), v.literal("down")),
    createdAt: v.number(),
  })
    .index("by_ideaId_and_profileId", ["ideaId", "profileId"])
    .index("by_ideaId", ["ideaId"])
    .index("by_startupId", ["startupId"]),

  ideaEdges: defineTable({
    startupId: v.id("startups"),
    authorProfileId: v.id("profiles"),
    nodeAId: v.id("ideaNodes"),
    nodeBId: v.id("ideaNodes"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_startupId_and_pairKey", ["startupId", "pairKey"])
    .index("by_startupId_and_archivedAt", ["startupId", "archivedAt"]),

  pageEntries: defineTable({
    pageId: v.id("pages"),
    authorProfileId: v.id("profiles"),
    content: v.string(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pageId_and_position", ["pageId", "position"]),

  pageEdges: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    nodeAId: v.id("pages"),
    nodeBId: v.id("pages"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    authorProfileId: v.optional(v.id("profiles")),
    archivedAt: v.optional(v.union(v.number(), v.null())),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_areaId_and_pairKey", ["areaId", "pairKey"])
    .index("by_areaId", ["areaId"]),

  contentContributions: defineTable({
    startupId: v.id("startups"),
    targetKind: v.union(
      v.literal("idea"),
      v.literal("page"),
      v.literal("area"),
      v.literal("task_checkpoint"),
      v.literal("recovered"),
    ),
    targetKey: v.string(),
    targetId: v.string(),
    authorProfileId: v.optional(v.id("profiles")),
    attribution: v.union(v.literal("author"), v.literal("legacy_neutral")),
    content: v.string(),
    sourceKind: v.optional(
      v.union(
        v.literal("idea_original"),
        v.literal("page_entry"),
        v.literal("page_body"),
      ),
    ),
    sourceId: v.optional(v.string()),
    moderationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_targetKey_and_archivedAt_and_createdAt", [
      "targetKey",
      "archivedAt",
      "createdAt",
    ])
    .index("by_authorProfileId_and_archivedAt_and_createdAt", [
      "authorProfileId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_sourceKind_and_sourceId", ["sourceKind", "sourceId"]),

  recoveredContent: defineTable({
    startupId: v.id("startups"),
    title: v.string(),
    sourceKind: v.union(v.literal("idea"), v.literal("page")),
    sourceTargetId: v.string(),
    createdByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_startupId_and_archivedAt_and_createdAt", [
    "startupId",
    "archivedAt",
    "createdAt",
  ]),

  deletionRequests: defineTable({
    startupId: v.id("startups"),
    targetKind: v.union(
      v.literal("idea"),
      v.literal("idea_edge"),
      v.literal("page"),
      v.literal("page_edge"),
      v.literal("page_relation"),
      v.literal("task_checkpoint"),
      v.literal("contribution"),
      v.literal("recovered"),
    ),
    targetId: v.string(),
    targetTitle: v.string(),
    requesterProfileId: v.id("profiles"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("cancelled"),
    ),
    eligibleCount: v.number(),
    approveCount: v.number(),
    rejectCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_startupId_and_status_and_createdAt", [
      "startupId",
      "status",
      "createdAt",
    ])
    .index("by_targetKind_and_targetId_and_status", [
      "targetKind",
      "targetId",
      "status",
    ])
    .index("by_requesterProfileId_and_status_and_createdAt", [
      "requesterProfileId",
      "status",
      "createdAt",
    ]),

  deletionBallots: defineTable({
    requestId: v.id("deletionRequests"),
    startupId: v.id("startups"),
    profileId: v.id("profiles"),
    vote: v.union(
      v.literal("pending"),
      v.literal("approve"),
      v.literal("reject"),
      v.literal("excused"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_requestId_and_profileId", ["requestId", "profileId"])
    .index("by_profileId_and_vote_and_createdAt", [
      "profileId",
      "vote",
      "createdAt",
    ]),

  nestingRequests: defineTable({
    startupId: v.id("startups"),
    childIdeaId: v.id("ideaNodes"),
    parentIdeaId: v.id("ideaNodes"),
    requesterProfileId: v.id("profiles"),
    parentAuthorProfileId: v.id("profiles"),
    proposedX: v.optional(v.number()),
    proposedY: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_parentAuthorProfileId_and_status_and_createdAt", [
      "parentAuthorProfileId",
      "status",
      "createdAt",
    ])
    .index("by_requesterProfileId_and_status_and_createdAt", [
      "requesterProfileId",
      "status",
      "createdAt",
    ])
    .index("by_childIdeaId_and_parentIdeaId_and_status", [
      "childIdeaId",
      "parentIdeaId",
      "status",
    ])
    .index("by_startupId_and_status_and_updatedAt", [
      "startupId",
      "status",
      "updatedAt",
    ]),

  pageCanvasNodes: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    pageId: v.id("pages"),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_pageId", ["pageId"])
    .index("by_areaId", ["areaId"]),

  pageCanvases: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    ownerProfileId: v.id("profiles"),
    kind: pageKindValidator,
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerProfileId_and_areaId_and_kind", [
    "ownerProfileId",
    "areaId",
    "kind",
  ]),

  areaBodies: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    ownerProfileId: v.id("profiles"),
    content: v.string(),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_areaId", ["areaId"])
    .index("by_startupId_and_updatedAt", ["startupId", "updatedAt"]),

  pageCanvasPlacements: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    pageId: v.id("pages"),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    updatedByProfileId: v.id("profiles"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pageId", ["pageId"])
    .index("by_startupId_and_areaId_and_rootPageId", [
      "startupId",
      "areaId",
      "rootPageId",
    ]),

  pageCanvasEdgesV2: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    nodeAId: v.id("pages"),
    nodeBId: v.id("pages"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    authorProfileId: v.optional(v.id("profiles")),
    attribution: v.union(v.literal("author"), v.literal("legacy_neutral")),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index(
      "by_scope_active_pair",
      [
        "startupId",
        "areaId",
        "rootPageId",
        "archivedAt",
        "pairKey",
      ],
    )
    .index("by_nodeAId_and_archivedAt", ["nodeAId", "archivedAt"])
    .index("by_nodeBId_and_archivedAt", ["nodeBId", "archivedAt"]),

  pageCanvasViewports: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    viewerProfileId: v.id("profiles"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index(
    "by_viewerProfileId_and_startupId_and_areaId_and_rootPageId",
    ["viewerProfileId", "startupId", "areaId", "rootPageId"],
  ).index("by_rootPageId", ["rootPageId"]),

  pageNestingRequests: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    childPageId: v.id("pages"),
    sourceParentPageId: v.union(v.id("pages"), v.null()),
    targetParentPageId: v.id("pages"),
    requesterProfileId: v.id("profiles"),
    parentAuthorProfileId: v.id("profiles"),
    expectedTreeRevision: v.number(),
    proposedPosition: v.optional(v.number()),
    proposedX: v.optional(v.number()),
    proposedY: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_childPageId_and_status_and_updatedAt", [
      "childPageId",
      "status",
      "updatedAt",
    ])
    .index("by_targetParentPageId_and_status_and_createdAt", [
      "targetParentPageId",
      "status",
      "createdAt",
    ])
    .index("by_parentAuthorProfileId_and_status_and_createdAt", [
      "parentAuthorProfileId",
      "status",
      "createdAt",
    ])
    .index("by_requesterProfileId_and_status_and_createdAt", [
      "requesterProfileId",
      "status",
      "createdAt",
    ])
    .index("by_startupId_and_parentAuthorProfileId_and_status_and_createdAt", [
      "startupId",
      "parentAuthorProfileId",
      "status",
      "createdAt",
    ])
    .index("by_startupId_and_requesterProfileId_and_status_and_createdAt", [
      "startupId",
      "requesterProfileId",
      "status",
      "createdAt",
    ])
    .index("by_startupId_and_status_and_updatedAt", [
      "startupId",
      "status",
      "updatedAt",
    ]),

  pageRelations: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    notePageId: v.id("pages"),
    taskPageId: v.id("pages"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    authorProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_areaId_and_archivedAt_and_createdAt", [
      "areaId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_areaId_and_pairKey_and_archivedAt", [
      "areaId",
      "pairKey",
      "archivedAt",
    ])
    .index("by_startup_area_active_created", [
      "startupId",
      "areaId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_scope_pair_active", [
      "startupId",
      "areaId",
      "pairKey",
      "archivedAt",
    ])
    .index("by_notePageId_and_archivedAt", ["notePageId", "archivedAt"])
    .index("by_taskPageId_and_archivedAt", ["taskPageId", "archivedAt"]),

  areasMigrationIssues: defineTable({
    migrationKey: v.string(),
    sourceTable: v.string(),
    sourceId: v.string(),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_migrationKey_and_status_and_createdAt", [
      "migrationKey",
      "status",
      "createdAt",
    ])
    .index("by_sourceTable_and_sourceId_and_status", [
      "sourceTable",
      "sourceId",
      "status",
    ]),

  activities: defineTable({
    startupId: v.id("startups"),
    actorProfileId: v.id("profiles"),
    action: v.union(
      v.literal("startup_created"),
      v.literal("startup_updated"),
      v.literal("startup_archived"),
      v.literal("member_added"),
      v.literal("member_removed"),
      v.literal("invite_created"),
      v.literal("invite_claimed"),
      v.literal("invite_revoked"),
      v.literal("page_created"),
      v.literal("page_updated"),
      v.literal("page_moved"),
      v.literal("page_archived"),
      v.literal("task_updated"),
      v.literal("contribution_created"),
      v.literal("contribution_updated"),
      v.literal("deletion_requested"),
      v.literal("deletion_voted"),
      v.literal("deletion_resolved"),
      v.literal("nesting_requested"),
      v.literal("nesting_resolved"),
      v.literal("content_recovered"),
      v.literal("content_soft_deleted"),
    ),
    targetType: v.union(
      v.literal("startup"),
      v.literal("profile"),
      v.literal("invite"),
      v.literal("page"),
      v.literal("idea"),
      v.literal("contribution"),
      v.literal("request"),
      v.literal("recovered"),
    ),
    targetId: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_startupId_and_createdAt", ["startupId", "createdAt"])
    .index("by_actorProfileId_and_createdAt", [
      "actorProfileId",
      "createdAt",
    ]),
});
