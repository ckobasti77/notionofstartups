import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(v.literal("admin"), v.literal("member"));
const areaKey = v.union(
  v.literal("dev"),
  v.literal("marketing"),
  v.literal("sales"),
  v.literal("other"),
);
const pageKind = v.union(v.literal("note"), v.literal("task"));
const taskStatus = v.union(
  v.literal("backlog"),
  v.literal("next"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);
const taskPriority = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
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
    .index("by_profileId_and_startupId", ["profileId", "startupId"]),

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

  pageBodies: defineTable({
    pageId: v.id("pages"),
    content: v.string(),
    updatedAt: v.number(),
  }).index("by_pageId", ["pageId"]),

  pages: defineTable({
    startupId: v.id("startups"),
    areaId: v.id("startupAreas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: pageKind,
    title: v.string(),
    searchText: v.string(),
    revision: v.number(),
    position: v.number(),
    taskStatus: v.union(taskStatus, v.null()),
    taskPriority: v.union(taskPriority, v.null()),
    assigneeProfileId: v.union(v.id("profiles"), v.null()),
    dueDate: v.union(v.number(), v.null()),
    taskSortAt: v.number(),
    createdByProfileId: v.id("profiles"),
    updatedByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_areaId_and_parentPageId_and_archivedAt_and_position", [
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
    .searchIndex("search_title_and_content", {
      searchField: "searchText",
      filterFields: ["startupId", "kind", "archivedAt"],
    }),

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
    ),
    targetType: v.union(
      v.literal("startup"),
      v.literal("profile"),
      v.literal("invite"),
      v.literal("page"),
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
