"use client";

import { useRef, useState } from "react";
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
import { normalizeTableMatrix } from "@/lib/csv";
import { estimateTableHtmlLength, readTableFile } from "@/lib/table-file";

/**
 * Tabela u belešci živi u HTML telu koje server seče na 80.000 znakova
 * (`cleanPageContent`), pa su granice mnogo uže nego kod tabela oblačića.
 * Za velike tabele i dalje postoji tabela oblačić.
 */
const NOTE_TABLE_MAX_ROWS = 100;
const NOTE_TABLE_MAX_COLS = 20;
const BODY_LIMIT_SAFETY = 78_000;
const PREVIEW_ROWS = 6;

export function NoteTableImportDialog({
  open,
  onOpenChange,
  onImport,
  getBodyLength,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ubacuje matricu u editor; poziva se tek posle svih provera. */
  onImport: (matrix: string[][], firstRowIsHeader: boolean) => void;
  /** Trenutna dužina HTML tela — za procenu da li uvoz staje u granicu. */
  getBodyLength: () => number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [busy, setBusy] = useState(false);

  function reset() {
    setMatrix(null);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function fitsBody(candidate: string[][]) {
    return (
      getBodyLength() + estimateTableHtmlLength(candidate) <= BODY_LIMIT_SAFETY
    );
  }

  async function readFile(file: File) {
    setBusy(true);
    try {
      const rows = await readTableFile(file);
      // Širina se normalizuje na granicu + 1 da bi se prekoračenje primetilo,
      // umesto da se višak kolona tiho odseče.
      const normalized = normalizeTableMatrix(rows, NOTE_TABLE_MAX_COLS + 1);
      if (normalized.length === 0) {
        toast.error("U fajlu nema podataka za uvoz.");
        reset();
        return;
      }
      if (
        normalized.length > NOTE_TABLE_MAX_ROWS ||
        normalized[0].length > NOTE_TABLE_MAX_COLS
      ) {
        toast.error(
          `Tabela u belešci može imati najviše ${NOTE_TABLE_MAX_ROWS} redova i ${NOTE_TABLE_MAX_COLS} kolona — za veće tabele koristi tabela oblačić.`,
        );
        reset();
        return;
      }
      if (!fitsBody(normalized)) {
        toast.error(
          "Tabela je prevelika za telo ove beleške — koristi tabela oblačić.",
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

  function runImport() {
    if (matrix === null) return;
    // Telo je moglo da poraste dok je dijalog bio otvoren — provera se ponavlja.
    if (!fitsBody(matrix)) {
      toast.error(
        "Tabela je prevelika za telo ove beleške — koristi tabela oblačić.",
      );
      return;
    }
    onImport(matrix, firstRowIsHeader);
    onOpenChange(false);
    reset();
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
          <DialogTitle>Uvoz tabele u belešku</DialogTitle>
          <DialogDescription>
            Podržani su .xlsx, .xls i .csv; iz Excel radne sveske uvozi se prvi
            list. Tabela postaje deo teksta i može da se uređuje. Najviše{" "}
            {NOTE_TABLE_MAX_ROWS} redova i {NOTE_TABLE_MAX_COLS} kolona.
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
              <span className="font-semibold text-foreground">{fileName}</span>{" "}
              — {matrix.length} {matrix.length === 1 ? "red" : "redova"} ×{" "}
              {matrix[0].length} kolona
            </p>

            <Label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={firstRowIsHeader}
                onCheckedChange={(value) => setFirstRowIsHeader(value === true)}
              />
              Prvi red su zaglavlja
            </Label>

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
              <Button type="button" disabled={busy} onClick={runImport}>
                Ubaci tabelu
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
