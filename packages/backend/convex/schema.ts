import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  chatAnchorTypeValidator,
  chatChannelKindValidator,
  chatMemberRoleValidator,
  chatMessageKindValidator,
  chatNotificationLevelValidator,
  checkpointItemValidator,
  notificationTargetTypeValidator,
  notificationTypeValidator,
  pageFileCategoryValidator,
  pageKindValidator,
  taskCheckpointCanvasEndpointValidator,
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
    // Poruka iz koje je misao nastala (chat „Pretvori u…", 04-CHAT.md 5c).
    sourceMessageId: v.optional(v.id("chatMessages")),
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
    // Deprecated projekcija prvog izvršioca. `taskAssignees` je kanonski izvor;
    // ovo polje postoji da bi indeksi po izvršiocu i `pageSummaryValidator`
    // ostali upotrebljivi.
    assigneeProfileId: v.union(v.id("profiles"), v.null()),
    dueDate: v.union(v.number(), v.null()),
    instructions: v.optional(v.string()),
    // Deprecated rollback projection. taskCheckpoints is the canonical source.
    checkpoints: v.optional(v.array(checkpointItemValidator)),
    checkpointTotal: v.optional(v.number()),
    checkpointCompleted: v.optional(v.number()),
    checkpointRevision: v.optional(v.number()),
    // Sažeci za `file` i `table` kartice, da kanvas ne mora da čita priloge i
    // redove svake kartice posebno.
    fileCount: v.optional(v.number()),
    filePreviewStorageId: v.optional(v.id("_storage")),
    filePrimaryCategory: v.optional(pageFileCategoryValidator),
    tableRowCount: v.optional(v.number()),
    tableColumnCount: v.optional(v.number()),
    taskSortAt: v.number(),
    // Trenutak prelaska u „Gotovo”. `updatedAt` nije upotrebljiv kao izvor jer
    // svaka kasnija izmena završenog zadatka pomera nedelju u kojoj je završen.
    completedAt: v.optional(v.union(v.number(), v.null())),
    // Poruka iz koje je zadatak/beleška nastao (chat „Pretvori u…", 04-CHAT.md
    // 5c). Bez indeksa u v1: skok je entitet→poruka; obrnuti smer ide preko
    // sistemske poruke u kanalu, ne upitom.
    sourceMessageId: v.optional(v.id("chatMessages")),
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
    // Vezan korak se ne može završiti dok prethodni nije gotov. `undefined` je
    // isto što i `false` — zapisi od pre uvođenja lanca ostaju slobodni.
    chainedToPrevious: v.optional(v.boolean()),
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

  // Kanonski spisak izvršilaca zadatka. `pages.assigneeProfileId` je samo
  // projekcija prvog reda odavde — postoji da bi postojeći indeksi i wire
  // ugovori nastavili da rade, isto kao `pages.checkpoints` uz `taskCheckpoints`.
  // Kolone su ograničene (64) pa staju u jedan dokument; redovi su
  // neograničeni pa idu u zasebnu tabelu, po pravilu iz Convex guidelines.
  pageTableColumns: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    pageId: v.id("pages"),
    columns: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        width: v.optional(v.number()),
      }),
    ),
    revision: v.number(),
    updatedByProfileId: v.id("profiles"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pageId", ["pageId"]),

  pageTableRows: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    pageId: v.id("pages"),
    rowKey: v.string(),
    position: v.number(),
    // `columnId -> tekst`. Ceo red je jedan dokument, pa izmena jedne ćelije
    // prepisuje samo taj red.
    cells: v.record(v.string(), v.string()),
    updatedByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pageId_and_archivedAt_and_position", [
      "pageId",
      "archivedAt",
      "position",
    ])
    .index("by_pageId_and_rowKey", ["pageId", "rowKey"]),

  // Prilozi „fajl” oblačića. Jedan oblačić drži više fajlova; kategorija se
  // izvodi iz `contentType` na serveru, klijent je ne bira.
  pageFiles: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    pageId: v.id("pages"),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    category: pageFileCategoryValidator,
    position: v.number(),
    uploadedByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pageId_and_archivedAt_and_position", [
      "pageId",
      "archivedAt",
      "position",
    ])
    .index("by_storageId", ["storageId"]),

  pageFileUploads: defineTable({
    pageId: v.id("pages"),
    profileId: v.id("profiles"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_profileId_and_createdAt", ["profileId", "createdAt"]),

  taskAssignees: defineTable({
    startupId: v.id("startups"),
    taskPageId: v.id("pages"),
    profileId: v.id("profiles"),
    // Ogledala sa `pages`, da lista „Moji zadaci” može da se sortira i filtrira
    // bez čitanja svake stranice. Osvežavaju se u istoj mutaciji kao i zadatak.
    taskStatus: v.union(taskStatusValidator, v.null()),
    taskSortAt: v.number(),
    addedByProfileId: v.id("profiles"),
    // Samo skidanje sa zadatka. Arhiviranje same stranice se namerno ne ogleda
    // ovde — grana može imati 250 stranica, pa bi to probilo transakciju.
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task_active_created", [
      "taskPageId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_task_and_profile", ["taskPageId", "profileId"])
    .index("by_profile_active_sort", [
      "profileId",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_profile_status_active_sort", [
      "profileId",
      "taskStatus",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_startup_profile_active_sort", [
      "startupId",
      "profileId",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_startup_profile_status_active_sort", [
      "startupId",
      "profileId",
      "taskStatus",
      "archivedAt",
      "taskSortAt",
    ]),

  taskCheckpointCanvasPlacements: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    canvasRootPageId: v.union(v.id("pages"), v.null()),
    checkpointId: v.id("taskCheckpoints"),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
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

  taskCheckpointCanvasEdges: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    endpointA: taskCheckpointCanvasEndpointValidator,
    endpointB: taskCheckpointCanvasEndpointValidator,
    endpointAKey: v.string(),
    endpointBKey: v.string(),
    endpointAPageId: v.id("pages"),
    endpointBPageId: v.id("pages"),
    pairKey: v.string(),
    authorProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope_active_pair", [
      "startupId",
      "areaId",
      "rootPageId",
      "archivedAt",
      "pairKey",
    ])
    .index("by_endpointAKey_and_archivedAt", [
      "endpointAKey",
      "archivedAt",
    ])
    .index("by_endpointBKey_and_archivedAt", [
      "endpointBKey",
      "archivedAt",
    ])
    .index("by_endpointAPageId_and_archivedAt", [
      "endpointAPageId",
      "archivedAt",
    ])
    .index("by_endpointBPageId_and_archivedAt", [
      "endpointBPageId",
      "archivedAt",
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
    // Poruka iz koje je ideja nastala (chat „Pretvori u…", 04-CHAT.md 5c).
    sourceMessageId: v.optional(v.id("chatMessages")),
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
      v.literal("task_checkpoint_edge"),
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
    // Deprecated par: relacija je nekad spajala isključivo belešku i zadatak.
    // Kanon su `pageAId`/`pageBId`; stara polja se i dalje upisuju da bi
    // rollback aplikacije radio bez vraćanja baze.
    notePageId: v.id("pages"),
    taskPageId: v.id("pages"),
    pageAId: v.optional(v.id("pages")),
    pageBId: v.optional(v.id("pages")),
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
    // Jedinstvenost para je na nivou startupa otkako relacije smeju da spajaju
    // stranice iz različitih oblasti; `by_scope_pair_active` ostaje zbog
    // rollback-a aplikacije, kao i deprecated polja iznad.
    .index("by_startupId_and_pairKey_and_archivedAt", [
      "startupId",
      "pairKey",
      "archivedAt",
    ])
    .index("by_notePageId_and_archivedAt", ["notePageId", "archivedAt"])
    .index("by_taskPageId_and_archivedAt", ["taskPageId", "archivedAt"])
    .index("by_pageAId_and_archivedAt", ["pageAId", "archivedAt"])
    .index("by_pageBId_and_archivedAt", ["pageBId", "archivedAt"]),

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

  notifications: defineTable({
    recipientProfileId: v.id("profiles"),
    startupId: v.id("startups"),
    type: notificationTypeValidator,
    title: v.string(),
    body: v.optional(v.string()),
    targetType: notificationTargetTypeValidator,
    targetId: v.union(v.string(), v.null()),
    // `null` kad je pošiljalac sistem (cron podsetnici).
    actorProfileId: v.union(v.id("profiles"), v.null()),
    // Sprečava da isti podsetnik uđe dva puta; `null` za događaje.
    dedupeKey: v.union(v.string(), v.null()),
    readAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
  })
    .index("by_recipient_and_startup_and_readAt", [
      "recipientProfileId",
      "startupId",
      "readAt",
    ])
    .index("by_recipient_and_startup_and_createdAt", [
      "recipientProfileId",
      "startupId",
      "createdAt",
    ])
    .index("by_dedupeKey", ["dedupeKey"]),

  pushSubscriptions: defineTable({
    profileId: v.id("profiles"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    // Broj neuspelih dostava; posle praga se pretplata gasi.
    failureCount: v.number(),
    lastSuccessAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_endpoint", ["endpoint"])
    .index("by_profileId", ["profileId"]),

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

  // --- Chat (docs/mobile/04-CHAT.md) --------------------------------------

  chatChannels: defineTable({
    startupId: v.id("startups"),
    kind: chatChannelKindValidator,
    // kind === "area": kanal oblasti.
    areaId: v.union(v.id("startupAreas"), v.null()),
    // kind === "thread": polimorfna veza ka entitetu.
    anchorType: v.union(chatAnchorTypeValidator, v.null()),
    anchorId: v.union(v.string(), v.null()),
    // kind === "dm": sortirani par "profileA:profileB". Za `agent` kanal:
    // "agent:<profileId>" — deterministično pronalaženje bez posebnog indeksa.
    dmKey: v.union(v.string(), v.null()),
    name: v.string(),
    isPrivate: v.boolean(),
    // Denormalizovano zbog liste razgovora — bez ovoga je pregled N+1.
    lastMessageAt: v.number(),
    lastMessagePreview: v.string(),
    lastMessageAuthorId: v.union(v.id("profiles"), v.null()),
    messageCount: v.number(),
    createdByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
  })
    // Globalni/admin pogled po skorašnjosti. Lista po korisniku se sklapa iz
    // by_startup_and_kind (javni) + chatMembers (DM/privatni/thread) — ovaj
    // indeks NE daje access-filtriranu listu (04-CHAT.md, analiza B2).
    .index("by_startup_and_lastMessageAt", [
      "startupId",
      "archivedAt",
      "lastMessageAt",
    ])
    .index("by_startup_and_kind", ["startupId", "kind", "archivedAt"])
    .index("by_anchor", ["anchorType", "anchorId"])
    .index("by_startup_and_dmKey", ["startupId", "dmKey"])
    .index("by_area", ["areaId", "archivedAt"]),

  chatMessages: defineTable({
    channelId: v.id("chatChannels"),
    // Duplirano zbog provere pristupa bez join-a i kao search filterField.
    startupId: v.id("startups"),
    authorProfileId: v.union(v.id("profiles"), v.null()), // null = sistemska
    body: v.string(),
    mentions: v.array(v.id("profiles")),
    kind: chatMessageKindValidator,
    attachmentStorageId: v.optional(v.id("_storage")),
    attachmentName: v.union(v.string(), v.null()),
    attachmentType: v.union(v.string(), v.null()),
    attachmentSize: v.union(v.number(), v.null()),
    voiceDurationMs: v.union(v.number(), v.null()),
    replyToMessageId: v.union(v.id("chatMessages"), v.null()),
    editedAt: v.union(v.number(), v.null()),
    deletedAt: v.union(v.number(), v.null()), // soft delete
    createdAt: v.number(),
  })
    // Lista poruka: uključuje i soft-obrisane (prikazuju se kao tombstone).
    .index("by_channel_and_createdAt", ["channelId", "createdAt"])
    .index("by_channel_active", ["channelId", "deletedAt", "createdAt"])
    .index("by_author", ["authorProfileId", "createdAt"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["startupId", "channelId", "deletedAt"],
    }),

  // Eksplicitno članstvo — DM, privatni/custom kanali, threadovi, agent. Za
  // kind === "startup"/"area" članstvo je implicitno (startupMembers), pa ovde
  // nema redova. Nivo obaveštenja NIJE ovde — živi na chatReads (04-CHAT.md D).
  chatMembers: defineTable({
    channelId: v.id("chatChannels"),
    profileId: v.id("profiles"),
    startupId: v.id("startups"),
    role: chatMemberRoleValidator,
    joinedAt: v.number(),
    leftAt: v.union(v.number(), v.null()),
  })
    .index("by_channel", ["channelId", "leftAt"])
    .index("by_profile", ["profileId", "leftAt"])
    .index("by_channel_and_profile", ["channelId", "profileId"])
    // „Moji DM/threadovi u startupu" bez skeniranja članstava kroz sve startupe.
    .index("by_profile_and_startup", ["profileId", "startupId", "leftAt"]),

  // Po kanalu, po profilu. Nosi unread brojače i nivo obaveštenja. Nedostajući
  // red = 0 unread i nivo „all"; redovi nastaju lenjo (nema seed migracije).
  chatReads: defineTable({
    channelId: v.id("chatChannels"),
    profileId: v.id("profiles"),
    startupId: v.id("startups"),
    lastReadAt: v.number(),
    lastReadMessageId: v.union(v.id("chatMessages"), v.null()),
    unreadCount: v.number(), // održavano inkrementalno, ne računa se pri čitanju
    mentionCount: v.number(),
    notificationLevel: v.optional(chatNotificationLevelValidator),
    updatedAt: v.number(),
  })
    .index("by_channel_and_profile", ["channelId", "profileId"])
    .index("by_profile", ["profileId"])
    .index("by_profile_and_startup", ["profileId", "startupId"]),

  chatReactions: defineTable({
    messageId: v.id("chatMessages"),
    profileId: v.id("profiles"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_profile_and_emoji", [
      "messageId",
      "profileId",
      "emoji",
    ]),
});
