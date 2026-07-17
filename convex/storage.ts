import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProfile } from "./lib/auth";

async function hashUploadToken(token: string) {
  const bytes = new TextEncoder().encode(`notion-clone-avatar:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function generateUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const now = Date.now();
    const previous = await ctx.db
      .query("avatarUploads")
      .withIndex("by_profileId_and_createdAt", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(20);
    await Promise.all(previous.map((upload) => ctx.db.delete(upload._id)));
    const token = generateUploadToken();
    const expiresAt = now + 10 * 60 * 1_000;
    await ctx.db.insert("avatarUploads", {
      profileId: profile._id,
      tokenHash: await hashUploadToken(token),
      expiresAt,
      createdAt: now,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
      token,
      expiresAt,
    };
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage"), token: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const tokenHash = await hashUploadToken(args.token);
    const upload = await ctx.db
      .query("avatarUploads")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (upload === null || upload.profileId !== profile._id || upload.expiresAt <= Date.now()) {
      throw new Error("Dozvola za slanje slike nije ispravna ili je istekla.");
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) throw new Error("Slika nije pronađena.");
    if (!metadata.contentType?.startsWith("image/")) {
      throw new Error("Avatar mora biti slika.");
    }
    if (metadata.size > 5 * 1024 * 1024) {
      throw new Error("Avatar može imati najviše 5 MB.");
    }
    const existingOwner = await ctx.db
      .query("profiles")
      .withIndex("by_avatarStorageId", (q) => q.eq("avatarStorageId", args.storageId))
      .unique();
    if (existingOwner !== null && existingOwner._id !== profile._id) {
      throw new Error("Ova slika već pripada drugom profilu.");
    }
    if (
      profile.avatarStorageId !== undefined &&
      profile.avatarStorageId !== args.storageId
    ) {
      await ctx.storage.delete(profile.avatarStorageId);
    }
    await ctx.db.patch("profiles", profile._id, {
      avatarStorageId: args.storageId,
      updatedAt: Date.now(),
    });
    await ctx.db.delete(upload._id);
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    if (profile.avatarStorageId !== undefined) {
      await ctx.storage.delete(profile.avatarStorageId);
      await ctx.db.patch("profiles", profile._id, {
        avatarStorageId: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const getMyAvatarUrl = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    return profile.avatarStorageId === undefined
      ? null
      : await ctx.storage.getUrl(profile.avatarStorageId);
  },
});
