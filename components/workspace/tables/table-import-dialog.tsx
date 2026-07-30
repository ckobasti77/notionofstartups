"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeTableMatrix, parseCsv } from "@/lib/csv";

const MAX_COLUMNS = 64;
const MAX_ROWS = 5_000;
const IMPORT_BATCH = 200;
const PREVIEW_ROWS = 6;

function isExcel(file: File) {
  return /\.xlsx?$/i.test(file.name);
}

/**
 * Excel čitač se učitava tek na klik, da ne uđe u glavni bundle. Paket nema root
 * export — browser build je jedini koji radi u pregledaču.
 */
async function readWorkbook(file: File): Promise<string[][]> {
  // `readSheet` vraća prvi list; `readXlsxFile` bi vratio sve listove odjednom.
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  return rows.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell);
    }),
  );
}

export function TableImportDialog({
  pageId,
  open,
  onOpenChange,
}: {
  pageId: Id<"pages">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importRows = useMutation(api.pageTables.importRows);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  function reset() {
    setMatrix(null);
    setFileName("");
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function readFile(file: File) {
    setBusy(true);
    try {
      const rows = isExcel(file)
        ? await readWorkbook(file)
        : parseCsv(await file.text()).rows;
      const normalized = normalizeTableMatrix(rows, MAX_COLUMNS);
      if (normalized.length === 0) {
        toast.error("U fajlu nema podataka za uvoz.");
        reset();
        return;
      }
      if (normalized.length > MAX_ROWS) {
        toast.error(
          `Fajl ima ${normalized.length} redova; granica je ${MAX_ROWS}.`,
        );
        reset();
        return;
      }
      setMatrix(normalized);
      setFileName(file.name);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Fajl nije pročitan: ${error.message}`
          : "Fajl nije pročitan.",
      );
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (matrix === null) return;
    const header = firstRowIsHeader ? matrix[0] : null;
    const dataRows = firstRowIsHeader ? matrix.slice(1) : matrix;
    const columns =
      header ??
      Array.from({ length: matrix[0].length }, (_, index) => `Kolona ${index + 1}`);

    setBusy(true);
    setProgress({ done: 0, total: dataRows.length });
    try {
      // Serije od 200 redova — jedna Convex mutacija ima transakcione limite.
      let batchIndex = 0;
      if (dataRows.length === 0) {
        await importRows({
          pageId,
          columns,
          rows: [],
          mode: replace ? "replace" : "append",
        });
      }
      for (let start = 0; start < dataRows.length; start += IMPORT_BATCH) {
        const batch = dataRows.slice(start, start + IMPORT_BATCH);
        await importRows({
          pageId,
          // Zaglavlja i „zameni” važe samo za prvu seriju; ostale dopunjuju.
          ...(batchIndex === 0 ? { columns } : {}),
          rows: batch,
          mode: batchIndex === 0 && replace ? "replace" : "append",
        });
        batchIndex += 1;
        setProgress({
          done: Math.min(start + batch.length, dataRows.length),
          total: dataRows.length,
        });
      }
      toast.success(
        `Uvezeno: ${dataRows.length} ${dataRows.length === 1 ? "red" : "redova"}.`,
      );
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Uvoz nije uspeo.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const previewHeader = matrix && firstRowIsHeader ? matrix[0] : null;
  const previewRows = matrix
    ? (firstRowIsHeader ? matrix.slice(1) : matrix).slice(0, PREVIEW_ROWS)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(48rem,92vh)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Uvoz iz Excel-a ili CSV-a</DialogTitle>
          <DialogDescription>
            Podržani su .xlsx, .xls i .csv. Iz Excel radne sveske uvozi se prvi
            list. Najviše {MAX_COLUMNS} kolona i {MAX_ROWS} redova.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />

        {matrix === null ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Izaberi fajl
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{fileName}</span> —{" "}
              {matrix.length} {matrix.length === 1 ? "red" : "redova"} ×{" "}
              {matrix[0].length} kolona
            </p>

            <div className="flex flex-wrap gap-4">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={firstRowIsHeader}
                  onCheckedChange={(value) => setFirstRowIsHeader(value === true)}
                />
                Prvi red su zaglavlja
              </Label>
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={replace}
                  onCheckedChange={(value) => setReplace(value === true)}
                />
                Zameni postojeći sadržaj
              </Label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-left text-xs">
                {previewHeader ? (
                  <thead className="bg-muted/50">
                    <tr>
                      {previewHeader.map((label, index) => (
                        <th
                          key={index}
                          className="whitespace-nowrap px-3 py-2 font-bold"
                        >
                          {label || `Kolona ${index + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-border/60">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="max-w-56 truncate px-3 py-1.5"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {progress ? (
              <p
                className="text-xs text-muted-foreground tabular-nums"
                role="status"
                aria-live="polite"
              >
                Uvoz u toku: {progress.done}/{progress.total}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          {matrix === null ? null : (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                Izaberi drugi fajl
              </Button>
              <Button type="button" disabled={busy} onClick={() => void runImport()}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Uvezi
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
