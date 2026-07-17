import { query } from "./_generated/server";
import { requireProfile } from "./lib/auth";
import { summarizePage } from "./lib/pages";

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const memberships = await ctx.db
      .query("startupMembers")
      .withIndex("by_profileId_and_startupId", (q) =>
        q.eq("profileId", profile._id),
      )
      .take(20);

    const startups = [];
    const startupIds = new Set<string>();
    for (const membership of memberships) {
      if (membership.archivedAt !== null) continue;
      const startup = await ctx.db.get("startups", membership.startupId);
      if (startup === null || startup.archivedAt !== null) continue;
      startupIds.add(startup._id);
      const areas = await ctx.db
        .query("startupAreas")
        .withIndex("by_startupId_and_position", (q) =>
          q.eq("startupId", startup._id),
        )
        .take(4);
      startups.push({ ...startup, areas });
    }

    const candidateTasks = await ctx.db
      .query("pages")
      .withIndex("by_assigneeProfileId_and_kind_and_archivedAt", (q) =>
        q
          .eq("assigneeProfileId", profile._id)
          .eq("kind", "task")
          .eq("archivedAt", null),
      )
      .take(100);
    const myTasks = [];
    for (const task of candidateTasks) {
      if (!startupIds.has(task.startupId)) {
        continue;
      }
      const startup = startups.find((item) => item._id === task.startupId) ?? null;
      myTasks.push({ ...summarizePage(task), startup });
    }
    myTasks.sort((a, b) => {
      if (a.taskStatus === "done" && b.taskStatus !== "done") return 1;
      if (a.taskStatus !== "done" && b.taskStatus === "done") return -1;
      if (a.dueDate === null && b.dueDate === null) return b.updatedAt - a.updatedAt;
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate - b.dueDate;
    });

    const recentActivity = [];
    for (const startup of startups) {
      const rows = await ctx.db
        .query("activities")
        .withIndex("by_startupId_and_createdAt", (q) =>
          q.eq("startupId", startup._id),
        )
        .order("desc")
        .take(8);
      for (const activity of rows) {
        const actor = await ctx.db.get("profiles", activity.actorProfileId);
        recentActivity.push({ ...activity, startup, actor });
      }
    }
    recentActivity.sort((a, b) => b.createdAt - a.createdAt);

    return {
      profile: {
        ...profile,
        avatarUrl:
          profile.avatarStorageId === undefined
            ? null
            : await ctx.storage.getUrl(profile.avatarStorageId),
      },
      startups: startups.sort((a, b) => b.updatedAt - a.updatedAt),
      myTasks: myTasks.slice(0, 40),
      recentActivity: recentActivity.slice(0, 30),
      summary: {
        startupCount: startups.length,
        openTaskCount: myTasks.filter((task) => task.taskStatus !== "done").length,
        blockedTaskCount: myTasks.filter((task) => task.taskStatus === "blocked").length,
      },
    };
  },
});
