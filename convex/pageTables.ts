import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireStartupMember } from "./lib/auth";
import {
  cleanCellValue,
  cleanColumnLabel,
  countActiveTableRows,
  getTableColumns,
  newTableKey,
  requireTableColumns,
  syncTableSummary,
  writeTableColumns,
  type TableColumn,
} from "./lib/page_tables";
import { requireVisiblePage } from "./lib/pages";
import {
  boundedLimit,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_IMPORT_BATCH,
  MAX_TABLE_PAGE_SIZE,
  MAX_TABLE_ROWS,
} from "./lib/validators";

const columnValidator = v.object({
  id: v.string(),
  label: v.string(),
  width: v.optional(v.number()),
});

const rowValidator = v.object({
  _id: v.id("pageTableRows"),
  rowKey: v.string(),
  position: v.number(),
  cells: v.record(v.string(), v.string()),
});

async function requireTablePage(
  ctx: QueryCtx | MutationCtx,
  pageId: Id<"pages">,
) {
  const page = await requireVisiblePage(ctx, pageId);
  if (page.kind !== "table") throw new Error("Ova stranica nije tabela.");
  const { profile } = await requireStartupMember(ctx, page.startupId);
  return { page, profile };
}

/**
 * Strukturu tabele (kolone, dodavanje i brisanje redova, uvoz) menja autor
 * kartice; vrednosti ćelija menja svaki aktivan član startupa — tabela koju
 * niko drugi ne može da popuni nema svrhu.
 */
function assertStructureOwner(
  createdByProfileId: Id<"profiles">,
  profileId: Id<"profiles">,
) {
  if (createdByProfileId !== profileId) {
    throw new Error("Strukturu tabele menja samo autor kartice.");
  }
}

export const getMeta = query({
  args: { pageId: v.id("pages") },
  returns: v.object({
    columns: v.array(columnValidator),
    revision: v.number(),
    canEditStructure: v.boolean(),
    canEditCells: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTablePage(ctx, args.pageId);
    const columnsRow = await getTableColumns(ctx, page._id);
    return {
      columns: columnsRow?.columns ?? [],
      revision: columnsRow?.revision ?? 0,
      canEditStructure: page.createdByProfileId === profile._id,
      // Vrednosti ćelija menja svaki aktivan član; strukturu samo autor.
      canEditCells: true,
    };
  },
});

export const listRows = query({
  args: {
    pageId: v.id("pages"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    const { page } = await requireTablePage(ctx, args.pageId);
    boundedLimit(
      args.paginationOpts.numItems,
      MAX_TABLE_PAGE_SIZE,
      MAX_TABLE_PAGE_SIZE,
    );
    const rows = await ctx.db
      .query("pageTableRows")
      .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
        q.eq("pageId", page._id).eq("archivedAt", null),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...rows,
      page: rows.page.map((row) => ({
        _id: row._id,
        rowKey: row.rowKey,
        position: row.position,
        cells: row.cells,
      })),
    };
  },
});

export const addColumn = mutation({
  args: { pageId: v.id("pages"), label: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTablePage(ctx, args.pageId);
    assertStructureOwner(page.createdByProfileId, profile._id);
    const now = Date.now();
    const columnsRow = await requireTableColumns(ctx, page, profile._id, now);
    const columnId = newTableKey("col", columnsRow.columns.length, now);
    await writeTableColumns(
      ctx,
      columnsRow,
      [
        ...columnsRow.columns,
        {
          id: columnId,
          label: cleanColumnLabel(
            args.label ?? "",
            `Kolona ${columnsRow.columns.length + 1}`,
          ),
        },
      ],
      profile._id,
      now,
    );
    await syncTableSummary(ctx, page, profile._id, now);
    return columnId;
  },
});

export const renameColumn = mutation({
  args: { pageId: v.id("pages"), columnId: v.string(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTablePage(ctx, args.pageId);
    assertStructureOwner(page.createdByProfileId, profile._id);
    const now = Date.now();
    const columnsRow = await requireTableColumns(ctx, page, profile._id, now);
    const index = columnsRow.columns.findIndex(
      (column) => column.id === args.columnId,
    );
    if (index === -1) throw new Error("Kolona nije pronađena.");
    const next = [...columnsRow.columns];
    next[index] = {
      ...next[index],
      label: cleanColumnLabel(args.label, `Kolona ${index + 1}`),
    };
    await writeTableColumns(ctx, columnsRow, next, profile._id, now);
    return null;
  },
});

export const removeColumn = mutation({
  args: { pageId: v.id("pages"), columnId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTablePage(ctx, args.pageId);
    assertStructureOwner(page.createdByProfileId, profile._id);
    const now = Date.now();
    const columnsRow = await requireTableColumns(ctx, page, profile._id, now);
    const next = columnsRow.columns.filter(
      (column) => column.id !== args.columnId,
    );
    if (next.length === columnsRow.columns.length) {
      throw new Error("Kolona nije pronađena.");
    }
    await writeTableColumns(ctx, columnsRow, next, profile._id, now);
    // Vrednosti obrisane kolone se čiste iz redova da dokument ne nosi mrtve
    // ključeve zauvek.
    const rows = await ctx.db
      .query("pageTableRows")
      .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
        q.eq("pageId", page._id).eq("archivedAt", null),
      )
      .take(MAX_TABLE_ROWS);
    for (const row of rows) {
      if (!(args.columnId in row.cells)) continue;
      const cells = { ...row.cells };
      delete cells[args.columnId];
      await ctx.db.patch("pageTableRows", row._id, { cells, updatedAt: now });
    }
    await syncTableSummary(ctx, page, profile._id, now);
    return null;
  },
});

export const moveColumn = mutation({
  args: { pageId: v.id("pages"), columnId: v.string(), toIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTablePage(ctx, args.pageId);
    assertStructureOwner(page.createdByProfileId, profile._id);
    const now = Date.now();
    const columnsRow = await requireTableColumns(ctx, page, profile._id, now);
    const fromIndex = columnsRow.columns.findIndex(
      (column) => column.id === args.columnId,
    );
    if (fromIndex === -1) throw new Error("Kolona nije pronađena.");
    const target = Math.min(
      Math.max(Math.trunc(args.toIndex), 0),
      columnsRow.columns.length - 1,
    );
    if (target === fromIndex) return null;
    const next = [...columnsRow.columns];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(target, 0, moved);
    await writeTableColumns(ctx, columnsRow, next, profile._id, now);
    return null;
  },
});

export const addRow = mutation({
  args: { pageId: v.id("pages"), afterPosition: v.optional(v.number()) },
  returns: v.id("pageTableRows"),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTablePage(ctx, args.pageId);
    assertStructureOwner(page.createdByProfileId, profile._id);
    const now = Date.now();
    await requireTableColumns(ctx, page, profile._id, now);
    const rows = await ctx.db
      .query("pageTableRows")
      .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
        q.eq("pageId", page._id).eq("archivedAt", null),
      )
      .order("asc")
      .take(MAX_TABLE_ROWS + 1);
    if (rows.length >= MAX_TABLE_ROWS) {
      throw new Error(`Tabela može imati najviše ${MAX_TABLE_ROWS} redova.`);
    }
    const insertAt =
      args.afterPosition === undefined
        ? rows.length
        : Math.min(Math.max(Math.trunc(args.afterPosition) + 1, 0), rows.length);
    for (const row of rows.slice(insertAt)) {
      await ctx.db.patch("pageTableRows", row._id, {
        position: row.position + 1,
        updatedAt: now,
      });
    }
    const rowId = await ctx.db.insert("pageTableRows", {
      startupId: page.startupId,
      areaId: page.areaId,
      pageId: page._id,
      rowKey: newTableKey("row", insertAt, now),
      position: insertAt,
      cells: {},
      updatedByProfileId: profile._id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await syncTableSummary(ctx, page, profile._id, now);
    return rowId;
  },
});

export const removeRow = mutation({
  args: { rowId: v.id("pageTableRows") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("pageTableRows", args.rowId);
    if (row === null || row.archivedAt !== null) {
      throw new Error("Red nije pronađen.");
    }
    const { page, profile } = await requireTablePage(ctx, row.pageId);
    assertStructureOwner(page.createdByProfileId, profile._id);
    const now = Date.now();
    await ctx.db.delete(row._id);
    const remaining = await ctx.db
      .query("pageTableRows")
      .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
        q.eq("pageId", page._id).eq("archivedAt", null),
      )
      .order("asc")
      .take(MAX_TABLE_ROWS);
    for (const [position, current] of remaining.entries()) {
      if (current.position === position) continue;
      await ctx.db.patch("pageTableRows", current._id, {
        position,
        updatedAt: now,
      });
    }
    await syncTableSummary(ctx, page, profile._id, now);
    return null;
  },
});

export const setCells = mutation({
  args: {
    rowId: v.id("pageTableRows"),
    values: v.record(v.string(), v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("pageTableRows", args.rowId);
    if (row === null || row.archivedAt !== null) {
      throw new Error("Red nije pronađen.");
    }
    const { page, profile } = await requireTablePage(ctx, row.pageId);
    const columnsRow = await getTableColumns(ctx, page._id);
    const knownIds = new Set((columnsRow?.columns ?? []).map((c) => c.id));
    const cells = { ...row.cells };
    let changed = false;
    for (const [columnId, value] of Object.entries(args.values)) {
      if (!knownIds.has(columnId)) {
        throw new Error("Kolona nije pronađena.");
      }
      const cleaned = cleanCellValue(value);
      if (cells[columnId] === cleaned) continue;
      if (cleaned === "") delete cells[columnId];
      else cells[columnId] = cleaned;
      changed = true;
    }
    if (!changed) return null;
    await ctx.db.patch("pageTableRows", row._id, {
      cells,
      updatedByProfileId: profile._id,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const importRows = mutation({
  args: {
    pageId: v.id("pages"),
    /** Zaglavlja se šalju samo u prvoj seriji. */
    columns: v.optional(v.array(v.string())),
    rows: v.array(v.array(v.string())),
    mode: v.union(v.literal("append"), v.literal("replace")),
  },
  returns: v.object({ importedRows: v.number(), totalRows: v.number() }),
  handler: async (ctx, args) => {
    const { page, profile } = await requireTablePage(ctx, args.pageId);
    assertStructureOwner(page.createdByProfileId, profile._id);
    if (args.rows.length > MAX_TABLE_IMPORT_BATCH) {
      throw new Error(
        `Jedna serija uvoza može imati najviše ${MAX_TABLE_IMPORT_BATCH} redova.`,
      );
    }
    const now = Date.now();
    let columnsRow = await requireTableColumns(ctx, page, profile._id, now);

    if (args.mode === "replace") {
      const existing = await ctx.db
        .query("pageTableRows")
        .withIndex("by_pageId_and_archivedAt_and_position", (q) =>
          q.eq("pageId", page._id).eq("archivedAt", null),
        )
        .take(MAX_TABLE_ROWS);
      for (const row of existing) await ctx.db.delete(row._id);
    }

    if (args.columns !== undefined) {
      if (args.columns.length > MAX_TABLE_COLUMNS) {
        throw new Error(
          `Tabela može imati najviše ${MAX_TABLE_COLUMNS} kolona.`,
        );
      }
      const nextColumns: TableColumn[] = args.columns.map((label, index) => ({
        id: columnsRow.columns[index]?.id ?? newTableKey("col", index, now),
        label: cleanColumnLabel(label, `Kolona ${index + 1}`),
      }));
      await writeTableColumns(
        ctx,
        columnsRow,
        nextColumns.length === 0 ? columnsRow.columns : nextColumns,
        profile._id,
        now,
      );
      const refreshed = await getTableColumns(ctx, page._id);
      if (refreshed !== null) columnsRow = refreshed;
    }

    const startPosition = await countActiveTableRows(ctx, page._id);
    if (startPosition + args.rows.length > MAX_TABLE_ROWS) {
      throw new Error(`Tabela može imati najviše ${MAX_TABLE_ROWS} redova.`);
    }

    for (const [offset, values] of args.rows.entries()) {
      const cells: Record<string, string> = {};
      for (const [index, column] of columnsRow.columns.entries()) {
        const value = values[index];
        if (value === undefined || value === "") continue;
        cells[column.id] = cleanCellValue(value);
      }
      await ctx.db.insert("pageTableRows", {
        startupId: page.startupId,
        areaId: page.areaId,
        pageId: page._id,
        rowKey: newTableKey("row", startPosition + offset, now),
        position: startPosition + offset,
        cells,
        updatedByProfileId: profile._id,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await syncTableSummary(ctx, page, profile._id, now);
    return {
      importedRows: args.rows.length,
      totalRows: startPosition + args.rows.length,
    };
  },
});
