/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  MAX_TABLE_CELL_LENGTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_IMPORT_BATCH,
} from "./lib/validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedTableWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const createPerson = async (name: string) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await createPerson("Owner");
    const member = await createPerson("Member");
    const startupId = await ctx.db.insert("startups", {
      name: "Table startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, member]) {
      await ctx.db.insert("startupMembers", {
        startupId,
        profileId: person.profileId,
        addedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    const areaId = await ctx.db.insert("startupAreas", {
      startupId,
      key: "table-area",
      label: "Table area",
      position: 0,
      createdAt: now,
    });
    return { owner, member, startupId, areaId };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|table-test` });
  const asOwner = asPerson(seeded.owner);
  const asMember = asPerson(seeded.member);
  const pageId = await asOwner.mutation(api.pages.create, {
    startupId: seeded.startupId,
    areaId: seeded.areaId,
    parentPageId: null,
    kind: "table",
    title: "Budžet",
  });

  const readAll = async () => {
    const meta = await asOwner.query(api.pageTables.getMeta, { pageId });
    const rows = await asOwner.query(api.pageTables.listRows, {
      pageId,
      paginationOpts: { numItems: 200, cursor: null },
    });
    return { meta, rows: rows.page };
  };

  return { t, ...seeded, asOwner, asMember, pageId, readAll };
}

describe("tabela kao vrsta oblačića", () => {
  test("nova tabela startuje sa jednom kolonom i jednim redom", async () => {
    const { t, pageId, readAll } = await seedTableWorkspace();
    const { meta, rows } = await readAll();

    expect(meta.columns).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.get("pages", pageId)),
    ).toMatchObject({ tableRowCount: 1, tableColumnCount: 1 });
  });

  test("plus desno dodaje kolonu, plus dole dodaje red, sažetak prati", async () => {
    const { t, pageId, asOwner, readAll } = await seedTableWorkspace();

    await asOwner.mutation(api.pageTables.addColumn, { pageId });
    await asOwner.mutation(api.pageTables.addColumn, {
      pageId,
      label: "Iznos",
    });
    await asOwner.mutation(api.pageTables.addRow, { pageId });

    const { meta, rows } = await readAll();
    expect(meta.columns.map((column) => column.label)).toEqual([
      "Kolona 1",
      "Kolona 2",
      "Iznos",
    ]);
    expect(rows).toHaveLength(2);
    expect(
      await t.run((ctx) => ctx.db.get("pages", pageId)),
    ).toMatchObject({ tableRowCount: 2, tableColumnCount: 3 });
  });

  test("brisanje kolone čisti njene vrednosti iz redova", async () => {
    const { pageId, asOwner, readAll } = await seedTableWorkspace();
    const columnId = await asOwner.mutation(api.pageTables.addColumn, {
      pageId,
    });
    const before = await readAll();
    await asOwner.mutation(api.pageTables.setCells, {
      rowId: before.rows[0]._id,
      values: { [columnId]: "vrednost" },
    });
    expect((await readAll()).rows[0].cells[columnId]).toBe("vrednost");

    await asOwner.mutation(api.pageTables.removeColumn, { pageId, columnId });
    const after = await readAll();
    expect(after.meta.columns).toHaveLength(1);
    expect(after.rows[0].cells[columnId]).toBeUndefined();
  });

  test("poslednja kolona se ne može obrisati", async () => {
    const { pageId, asOwner, readAll } = await seedTableWorkspace();
    const { meta } = await readAll();
    await expect(
      asOwner.mutation(api.pageTables.removeColumn, {
        pageId,
        columnId: meta.columns[0].id,
      }),
    ).rejects.toThrow("bar jednu kolonu");
  });

  test("strukturu menja autor, ćelije menja svaki član", async () => {
    const { pageId, asOwner, asMember, readAll } = await seedTableWorkspace();
    const { meta, rows } = await readAll();

    await expect(
      asMember.mutation(api.pageTables.addColumn, { pageId }),
    ).rejects.toThrow("samo autor kartice");
    await expect(
      asMember.mutation(api.pageTables.addRow, { pageId }),
    ).rejects.toThrow("samo autor kartice");

    await asMember.mutation(api.pageTables.setCells, {
      rowId: rows[0]._id,
      values: { [meta.columns[0].id]: "član je upisao" },
    });
    expect((await readAll()).rows[0].cells[meta.columns[0].id]).toBe(
      "član je upisao",
    );
    void asOwner;
  });

  test("nepoznata kolona i predugačka ćelija se odbijaju", async () => {
    const { pageId, asOwner, readAll } = await seedTableWorkspace();
    const { meta, rows } = await readAll();

    await expect(
      asOwner.mutation(api.pageTables.setCells, {
        rowId: rows[0]._id,
        values: { "col-ne-postoji": "x" },
      }),
    ).rejects.toThrow("Kolona nije pronađena.");
    await expect(
      asOwner.mutation(api.pageTables.setCells, {
        rowId: rows[0]._id,
        values: { [meta.columns[0].id]: "x".repeat(MAX_TABLE_CELL_LENGTH + 1) },
      }),
    ).rejects.toThrow(`najviše ${MAX_TABLE_CELL_LENGTH} znakova`);
    void pageId;
  });

  test("uvoz sa zaglavljima zamenjuje sadržaj i postavlja kolone", async () => {
    const { pageId, asOwner, readAll } = await seedTableWorkspace();

    const result = await asOwner.mutation(api.pageTables.importRows, {
      pageId,
      columns: ["Ime", "Iznos"],
      rows: [
        ["Ana", "1200"],
        ["Bora", "800"],
      ],
      mode: "replace",
    });
    expect(result).toEqual({ importedRows: 2, totalRows: 2 });

    const { meta, rows } = await readAll();
    expect(meta.columns.map((column) => column.label)).toEqual([
      "Ime",
      "Iznos",
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].cells[meta.columns[0].id]).toBe("Ana");
    expect(rows[1].cells[meta.columns[1].id]).toBe("800");
  });

  test("druga serija uvoza dopunjuje, ne zamenjuje", async () => {
    const { pageId, asOwner, readAll } = await seedTableWorkspace();
    await asOwner.mutation(api.pageTables.importRows, {
      pageId,
      columns: ["Ime"],
      rows: [["Ana"]],
      mode: "replace",
    });
    await asOwner.mutation(api.pageTables.importRows, {
      pageId,
      rows: [["Bora"], ["Cveta"]],
      mode: "append",
    });

    const { meta, rows } = await readAll();
    expect(rows.map((row) => row.cells[meta.columns[0].id])).toEqual([
      "Ana",
      "Bora",
      "Cveta",
    ]);
    expect(rows.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  test("uvoz staje na granici serije i broja kolona", async () => {
    const { pageId, asOwner } = await seedTableWorkspace();

    await expect(
      asOwner.mutation(api.pageTables.importRows, {
        pageId,
        rows: Array.from({ length: MAX_TABLE_IMPORT_BATCH + 1 }, () => ["x"]),
        mode: "append",
      }),
    ).rejects.toThrow(`najviše ${MAX_TABLE_IMPORT_BATCH} redova`);

    await expect(
      asOwner.mutation(api.pageTables.importRows, {
        pageId,
        columns: Array.from(
          { length: MAX_TABLE_COLUMNS + 1 },
          (_, index) => `K${index}`,
        ),
        rows: [],
        mode: "replace",
      }),
    ).rejects.toThrow(`najviše ${MAX_TABLE_COLUMNS} kolona`);
  });

  test("brisanje reda prenumeriše preostale", async () => {
    const { pageId, asOwner, readAll } = await seedTableWorkspace();
    await asOwner.mutation(api.pageTables.importRows, {
      pageId,
      columns: ["Ime"],
      rows: [["A"], ["B"], ["C"]],
      mode: "replace",
    });
    const before = await readAll();
    await asOwner.mutation(api.pageTables.removeRow, {
      rowId: before.rows[1]._id,
    });

    const after = await readAll();
    expect(after.rows.map((row) => row.position)).toEqual([0, 1]);
    expect(
      after.rows.map((row) => row.cells[after.meta.columns[0].id]),
    ).toEqual(["A", "C"]);
  });

  test("tabela API odbija stranice koje nisu tabela", async () => {
    const { startupId, areaId, asOwner } = await seedTableWorkspace();
    const noteId = await asOwner.mutation(api.pages.create, {
      startupId,
      areaId,
      parentPageId: null,
      kind: "note",
      title: "Nije tabela",
    });
    await expect(
      asOwner.query(api.pageTables.getMeta, { pageId: noteId }),
    ).rejects.toThrow("nije tabela");
  });
});
