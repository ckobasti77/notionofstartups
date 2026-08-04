"use client";

import { useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { MoreHorizontal, Plus, Table2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableImportDialog } from "@/components/workspace/tables/table-import-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type CellAddress = {
  pageId: Id<"pages">;
  rowId: Id<"pageTableRows">;
  columnId: string;
};

function sameCell(a: CellAddress | null, b: CellAddress) {
  return (
    a !== null &&
    a.pageId === b.pageId &&
    a.rowId === b.rowId &&
    a.columnId === b.columnId
  );
}

/** Brojevi se čitaju lakše desno poravnati, i kad je ćelija samo tekst. */
function looksNumeric(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return /^-?[\d.,\s]+(%|€|\$|din\.?|RSD)?$/i.test(trimmed);
}

export function PageTablePanel({
  pageId,
  className,
}: {
  pageId: Id<"pages">;
  className?: string;
}) {
  const meta = useQuery(api.pageTables.getMeta, { pageId });
  const {
    results: rows,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.pageTables.listRows,
    { pageId },
    { initialNumItems: 100 },
  );
  const addColumn = useMutation(api.pageTables.addColumn);
  const renameColumn = useMutation(api.pageTables.renameColumn);
  const removeColumn = useMutation(api.pageTables.removeColumn);
  const moveColumn = useMutation(api.pageTables.moveColumn);
  const addRow = useMutation(api.pageTables.addRow);
  const removeRow = useMutation(api.pageTables.removeRow);
  const setCells = useMutation(api.pageTables.setCells);

  const [editing, setEditing] = useState<CellAddress | null>(null);
  const [draft, setDraft] = useState("");
  const [renamingColumnId, setRenamingColumnId] = useState<string | null>(null);
  const [columnDraft, setColumnDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const busyRef = useRef(false);

  if (meta === undefined) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-9 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const columns = meta.columns;
  const canEditCells = meta.canEditCells;

  async function commitCell(address: CellAddress, value: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await setCells({ rowId: address.rowId, values: { [address.columnId]: value } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Ćelija nije sačuvana.",
      );
    } finally {
      busyRef.current = false;
    }
  }

  function startEdit(address: CellAddress, value: string) {
    if (!canEditCells) return;
    setEditing(address);
    setDraft(value);
  }

  return (
    <section className={cn("space-y-3", className)} aria-label="Tabela">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Table2 className="size-4 text-primary" aria-hidden="true" />
          Tabela
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-muted-foreground">
            {rows.length} × {columns.length}
          </span>
        </h3>
        {meta.canEditStructure ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="size-3.5" /> Uvezi Excel / CSV
          </Button>
        ) : null}
      </div>

      {/* Grid + dve ivice sa „+”: desno nova kolona, dole novi red. */}
      <div className="flex gap-2">
        <div className="scrollbar-thin min-w-0 flex-1 overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th
                  scope="col"
                  className="w-10 border-b border-r border-border/60 px-2 py-2 text-[0.6875rem] font-bold text-muted-foreground"
                >
                  #
                </th>
                {columns.map((column, columnIndex) => (
                  <th
                    key={column.id}
                    scope="col"
                    className="min-w-40 border-b border-r border-border/60 px-1 py-1 last:border-r-0"
                  >
                    <div className="flex items-center gap-1">
                      {renamingColumnId === column.id ? (
                        <Input
                          autoFocus
                          value={columnDraft}
                          className="h-8 min-w-0 flex-1"
                          onChange={(event) => setColumnDraft(event.target.value)}
                          onBlur={() => setRenamingColumnId(null)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setRenamingColumnId(null);
                            if (event.key === "Enter") {
                              void renameColumn({
                                pageId,
                                columnId: column.id,
                                label: columnDraft,
                              })
                                .then(() => setRenamingColumnId(null))
                                .catch((error) =>
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Naziv kolone nije sačuvan.",
                                  ),
                                );
                            }
                          }}
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate px-2 py-1 text-xs font-bold">
                          {column.label}
                        </span>
                      )}
                      {meta.canEditStructure ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              data-compact="true"
                              className="size-7 shrink-0"
                              aria-label={`Akcije za kolonu ${column.label}`}
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setRenamingColumnId(column.id);
                                setColumnDraft(column.label);
                              }}
                            >
                              Preimenuj kolonu
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={columnIndex === 0}
                              onSelect={() =>
                                void moveColumn({
                                  pageId,
                                  columnId: column.id,
                                  toIndex: columnIndex - 1,
                                })
                              }
                            >
                              Pomeri levo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={columnIndex === columns.length - 1}
                              onSelect={() =>
                                void moveColumn({
                                  pageId,
                                  columnId: column.id,
                                  toIndex: columnIndex + 1,
                                })
                              }
                            >
                              Pomeri desno
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={columns.length <= 1}
                              onSelect={() =>
                                void removeColumn({
                                  pageId,
                                  columnId: column.id,
                                }).catch((error) =>
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Kolona nije obrisana.",
                                  ),
                                )
                              }
                            >
                              Obriši kolonu
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status === "LoadingFirstPage" ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-3 py-6 text-center text-xs text-muted-foreground"
                  >
                    Učitavanje…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-3 py-6 text-center text-xs text-muted-foreground"
                  >
                    Tabela je prazna. Dodaj red dugmetom ispod ili uvezi fajl.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => (
                  <tr key={row._id} className="border-t border-border/60">
                    <th
                      scope="row"
                      className="group/row w-10 border-r border-border/60 px-1 py-1 text-center align-middle text-[0.6875rem] font-semibold tabular-nums text-muted-foreground"
                    >
                      {meta.canEditStructure ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              data-compact="true"
                              className="w-full rounded px-1 py-1 hover:bg-muted"
                              aria-label={`Akcije za red ${rowIndex + 1}`}
                            >
                              {rowIndex + 1}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onSelect={() =>
                                void addRow({
                                  pageId,
                                  afterPosition: row.position,
                                })
                              }
                            >
                              Dodaj red ispod
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                void removeRow({ rowId: row._id }).catch(
                                  (error) =>
                                    toast.error(
                                      error instanceof Error
                                        ? error.message
                                        : "Red nije obrisan.",
                                    ),
                                )
                              }
                            >
                              Obriši red
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        rowIndex + 1
                      )}
                    </th>
                    {columns.map((column) => {
                      const address = {
                        pageId,
                        rowId: row._id,
                        columnId: column.id,
                      };
                      const value = row.cells[column.id] ?? "";
                      const isEditing = sameCell(editing, address);
                      return (
                        <td
                          key={column.id}
                          className="min-w-40 border-r border-border/60 p-0 last:border-r-0"
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={draft}
                              aria-label={`${column.label}, red ${rowIndex + 1}`}
                              className="h-9 w-full bg-primary/5 px-2 text-sm outline-none ring-1 ring-inset ring-primary/40"
                              onChange={(event) => setDraft(event.target.value)}
                              onBlur={() => {
                                void commitCell(address, draft);
                                setEditing(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  setEditing(null);
                                  return;
                                }
                                if (event.key === "Enter" || event.key === "Tab") {
                                  event.preventDefault();
                                  void commitCell(address, draft);
                                  setEditing(null);
                                }
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              data-compact="true"
                              disabled={!canEditCells}
                              className={cn(
                                "h-9 w-full truncate px-2 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default",
                                looksNumeric(value) && "text-right tabular-nums",
                              )}
                              aria-label={`${column.label}, red ${rowIndex + 1}: ${
                                value || "prazno"
                              }`}
                              onClick={() => startEdit(address, value)}
                            >
                              {value}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta.canEditStructure ? (
          <button
            type="button"
            className="grid w-10 shrink-0 place-items-center rounded-xl border border-dashed border-border/70 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
            aria-label="Dodaj kolonu"
            title="Dodaj kolonu"
            onClick={() =>
              void addColumn({ pageId }).catch((error) =>
                toast.error(
                  error instanceof Error ? error.message : "Kolona nije dodata.",
                ),
              )
            }
          >
            <Plus className="size-4" />
          </button>
        ) : null}
      </div>

      {meta.canEditStructure ? (
        <button
          type="button"
          className="grid h-10 w-full place-items-center rounded-xl border border-dashed border-border/70 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          aria-label="Dodaj red"
          title="Dodaj red"
          onClick={() =>
            void addRow({ pageId }).catch((error) =>
              toast.error(
                error instanceof Error ? error.message : "Red nije dodat.",
              ),
            )
          }
        >
          <Plus className="size-4" />
        </button>
      ) : null}

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(100)}
          >
            {status === "LoadingMore" ? "Učitavam…" : "Učitaj još redova"}
          </Button>
        </div>
      ) : null}

      <TableImportDialog
        pageId={pageId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </section>
  );
}
