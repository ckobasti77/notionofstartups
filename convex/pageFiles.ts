import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { requireStartupMember } from "./lib/auth";
import {
  cleanPageFileName,
  listActivePageFiles,
  MAX_PAGE_FILE_BYTES,
  MAX_PAGE_FILES,
  pageFileCategoryFor,
  syncPageFileSummary,
} from "./lib/page_files";
import { requireVisiblePage } from "./lib/pages";
import { pageFileCategoryValidator } from "./lib/validators";

const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

const pageFileValidator = v.object({
  _id: v.id("pageFiles"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  category: pageFileCategoryValidator,
  position: v.number(),
  url: v.union(v.string(), v.null()),
  uploadedByProfileId: v.id("profiles"),
  createdAt: v.number(),
  canManage: v.boolean(),
});

async function hashUploadToken(token: string) {
  const bytes = new TextEncoder().encode(`notion-clone-page-file:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function generateUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function requireFilePage(
  ctx: QueryCtx | MutationCtx,
  pageId: Id<"pages">,
) {
  const page = await requireVisiblePage(ctx, pageId);
  if (page.kind !== "file") {
    throw new Error("Ova stranica nije fajl oblačić.");
  }
  const { profile } = await requireStartupMember(ctx, page.startupId);
  return { page, profile };
}

function assertOwner(
  createdByProfileId: Id<"profiles">,
  profileId: Id<"profiles">,
) {
  if (createdByProfileId !== profileId) {
    throw new Error("Fajlove ovog oblačića menja samo njegov autor.");
  }
}

export const list = query({
  args: { pageId: v.id("pages") },
  returns: v.array(pageFileValidator),
  handler: async (ctx, args) => {
    const { page, profile } = await requireFilePage(ctx, args.pageId);
    const rows = await listActivePageFiles(ctx, page._id);
    const canManage = page.createdByProfileId === profile._id;
    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        name: row.name,
        contentType: row.contentType,
        size: row.size,
        category: row.category,
        position: row.position,
        url: await ctx.storage.getUrl(row.storageId),
        uploadedByProfileId: row.uploadedByProfileId,
        createdAt: row.createdAt,
        canManage,
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: { pageId: v.id("pages") },
  returns: v.object({
    uploadUrl: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { page, profile } = await requireFilePage(ctx, args.pageId);
    assertOwner(page.createdByProfileId, profile._id);
    const rows = await listActivePageFiles(ctx, page._id);
    if (rows.length >= MAX_PAGE_FILES) {
      throw new Error(
        `Oblačić već ima najviše ${MAX_PAGE_FILES} fajlova.`,
      );
    }
    const now = Date.now();
    // Stare dozvole ovog člana se čiste da tabela ne raste bez granice.
    const previous = await ctx.db
      .query("pageFileUploads")
      .withIndex("by_profileId_and_createdAt", (q) =>
        q.eq("profileId", profile._id),
      )
      .order("desc")
      .take(20);
    for (const upload of previous) {
      if (upload.expiresAt <= now) await ctx.db.delete(upload._id);
    }
    const token = generateUploadToken();
    const expiresAt = now + UPLOAD_TOKEN_TTL_MS;
    await ctx.db.insert("pageFileUploads", {
      pageId: page._id,
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

export const attach = mutation({
  args: {
    pageId: v.id("pages"),
    storageId: v.id("_storage"),
    token: v.string(),
    name: v.string(),
  },
  returns: v.id("pageFiles"),
  handler: async (ctx, args) => {
    const { page, profile } = await requireFilePage(ctx, args.pageId);
    assertOwner(page.createdByProfileId, profile._id);

    const tokenHash = await hashUploadToken(args.token);
    const upload = await ctx.db
      .query("pageFileUploads")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    const now = Date.now();
    if (
      upload === null ||
      upload.profileId !== profile._id ||
      upload.pageId !== page._id ||
      upload.expiresAt <= now
    ) {
      throw new Error("Dozvola za slanje fajla nije ispravna ili je istekla.");
    }

    // Metapodaci se čitaju sa servera; klijentu se ne veruje ni za tip ni za
    // veličinu, jer o njima zavise i prikaz i granica potrošnje.
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) throw new Error("Fajl nije pronađen.");
    const name = cleanPageFileName(args.name);
    const category = pageFileCategoryFor(metadata.contentType, name);
    // Napomena: mutacija koja baci se cela poništava, pa se blob odbačenog
    // fajla ne može obrisati u istoj transakciji — ostaje bez reference, isto
    // kao kod avatara (`storage.setAvatar`). Klijent zato proverava tip i
    // veličinu pre slanja, da se do ovde stigne samo u retkim slučajevima.
    if (category === null) {
      throw new Error(
        `Ovaj tip fajla nije podržan${
          metadata.contentType ? `: ${metadata.contentType}` : ""
        }.`,
      );
    }
    if (metadata.size > MAX_PAGE_FILE_BYTES) {
      throw new Error(
        `Fajl može imati najviše ${Math.round(
          MAX_PAGE_FILE_BYTES / (1024 * 1024),
        )} MB.`,
      );
    }
    const existingOwner = await ctx.db
      .query("pageFiles")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existingOwner !== null) {
      throw new Error("Ovaj fajl je već zakačen za neki oblačić.");
    }

    const rows = await listActivePageFiles(ctx, page._id);
    if (rows.length >= MAX_PAGE_FILES) {
      throw new Error(
        `Oblačić može imati najviše ${MAX_PAGE_FILES} fajlova.`,
      );
    }

    const fileId = await ctx.db.insert("pageFiles", {
      startupId: page.startupId,
      areaId: page.areaId,
      pageId: page._id,
      storageId: args.storageId,
      name,
      contentType: metadata.contentType ?? "application/octet-stream",
      size: metadata.size,
      category,
      position: rows.length,
      uploadedByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.delete(upload._id);
    await syncPageFileSummary(ctx, page, profile._id, now);
    await recordActivity(ctx, {
      startupId: page.startupId,
      actorProfileId: profile._id,
      action: "page_updated",
      targetType: "page",
      targetId: page._id,
      title: `Fajl je dodat u „${page.title}”`,
      detail: name,
    });
    return fileId;
  },
});

export const rename = mutation({
  args: { fileId: v.id("pageFiles"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get("pageFiles", args.fileId);
    if (file === null || file.archivedAt !== null) {
      throw new Error("Fajl nije pronađen.");
    }
    const { page, profile } = await requireFilePage(ctx, file.pageId);
    assertOwner(page.createdByProfileId, profile._id);
    const name = cleanPageFileName(args.name);
    if (name === file.name) return null;
    await ctx.db.patch("pageFiles", file._id, { name, updatedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { fileId: v.id("pageFiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get("pageFiles", args.fileId);
    if (file === null || file.archivedAt !== null) {
      throw new Error("Fajl nije pronađen.");
    }
    const { page, profile } = await requireFilePage(ctx, file.pageId);
    assertOwner(page.createdByProfileId, profile._id);
    const now = Date.now();
    // Red se briše zajedno sa blobom — arhiviran prilog niko ne može da vrati,
    // pa bi ostavljanje bloba samo trošilo prostor.
    await ctx.db.delete(file._id);
    await ctx.storage.delete(file.storageId);
    const remaining = await listActivePageFiles(ctx, page._id);
    for (const [position, row] of remaining.entries()) {
      if (row.position === position) continue;
      await ctx.db.patch("pageFiles", row._id, { position, updatedAt: now });
    }
    await syncPageFileSummary(ctx, page, profile._id, now);
    return null;
  },
});

export const reorder = mutation({
  args: { pageId: v.id("pages"), fileIds: v.array(v.id("pageFiles")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile } = await requireFilePage(ctx, args.pageId);
    assertOwner(page.createdByProfileId, profile._id);
    const rows = await listActivePageFiles(ctx, page._id);
    const byId = new Map(rows.map((row) => [row._id, row]));
    if (
      args.fileIds.length !== rows.length ||
      args.fileIds.some((fileId) => !byId.has(fileId))
    ) {
      throw new Error("Spisak fajlova nije potpun.");
    }
    const now = Date.now();
    for (const [position, fileId] of args.fileIds.entries()) {
      const row = byId.get(fileId)!;
      if (row.position === position) continue;
      await ctx.db.patch("pageFiles", fileId, { position, updatedAt: now });
    }
    await syncPageFileSummary(ctx, page, profile._id, now);
    return null;
  },
});
