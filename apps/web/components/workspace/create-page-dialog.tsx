"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  FileSpreadsheet,
  LoaderCircle,
  Paperclip,
  Plus,
  ListChecks,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssigneePicker } from "@/components/workspace/assignee-picker";
import {
  PAGE_KIND_KEYS,
  PAGE_KIND_META,
  formatFileSize,
  type PageKind,
} from "@/lib/page-kinds";
import { workspaceItemDialogContentClass } from "@/components/workspace/workspace-item-dialog";
import { useQueryTolerant } from "@/components/workspace/workspace-error-boundary";
import {
  TaskCheckpointDraftList,
  type TaskCheckpointDraft,
} from "@/components/workspace/task-checkpoint-list";
import type { CreatePageTarget, StartupWithAreas } from "@/components/workspace/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_TABLE_CELL_LENGTH,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_IMPORT_BATCH,
  MAX_TABLE_ROWS,
} from "@/convex/lib/validators";
import { clampCellLengths, sourceWidth } from "@devotion/shared";
import { normalizeTableMatrix } from "@/lib/csv";
import { accessErrorMessage } from "@/lib/errors";
import {
  MAX_FILES,
  isSupportedFile,
  maxBytesForFile,
  uploadPageFile,
} from "@/lib/page-files";
import { readTableFile } from "@/lib/table-file";
import { TASK_PRIORITY_META, TASK_STATUS_META, fromDateInputValue, type TaskPriority, type TaskStatus } from "@/lib/workspace";

const TITLE_PLACEHOLDER: Record<PageKind, string> = {
  note: "Naslov beleške…",
  task: "Šta treba uraditi?",
  file: "Naziv fajl oblačića…",
  table: "Naziv tabele…",
};

/** Ručni unos je za male tabele; masovni sadržaj ide kroz uvoz fajla. */
const MANUAL_ROWS_CAP = 20;
const IMPORT_PREVIEW_ROWS = 4;

type TableDraft =
  | { source: "import"; fileName: string; matrix: string[][] }
  | null;

export function CreatePageDialog({ open, onOpenChange, startup, target, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; startup: StartupWithAreas; target?: CreatePageTarget; onCreated: (pageId: Id<"pages">) => void }) {
  const createPage = useMutation(api.areasV2.createPage);
  const archivePage = useMutation(api.areasV2.archivePage);
  const importRows = useMutation(api.pageTables.importRows);
  const generateUploadUrl = useMutation(api.pageFiles.generateUploadUrl);
  const attachPageFile = useMutation(api.pageFiles.attach);
  const members = useQuery(api.startups.listMembers, open ? { startupId: startup._id, limit: 50 } : "skip");
  // Tolerantno: pokvaren roditelj ne sme da sruši dijalog za kreiranje.
  const targetParent = useQueryTolerant(
    api.pages.get,
    open && target?.parentPageId
      ? { pageId: target.parentPageId }
      : "skip",
  );
  const fallbackAreaId = startup.areas[0]?._id;
  const [title, setTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [kind, setKind] = useState<PageKind>(target?.initialKind ?? "note");
  const [areaId, setAreaId] = useState<Id<"startupAreas"> | undefined>(target?.areaId ?? fallbackAreaId);
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeIds, setAssigneeIds] = useState<Array<Id<"profiles">>>([]);
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [checkpoints, setCheckpoints] = useState<TaskCheckpointDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Faza POSLE kreiranja (upis tabele / otpremanje fajlova) — dok traje, dijalog
  // se ne zatvara da polukreirana stranica ne ostane bez nadzora.
  const [phase, setPhase] = useState<{ label: string; done: number; total: number } | null>(null);

  // Tabela: uvoz fajla ili ručne kolone + početni redovi.
  const [tableMode, setTableMode] = useState<"import" | "manual">("import");
  const [tableDraft, setTableDraft] = useState<TableDraft>(null);
  const [tableBusy, setTableBusy] = useState(false);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [manualColumns, setManualColumns] = useState<string[]>(["", ""]);
  const [manualRows, setManualRows] = useState<string[][]>([]);
  const tableFileInputRef = useRef<HTMLInputElement | null>(null);

  // Prilozi: izbor PRE kreiranja; otpremanje ide tek posle `createPage`.
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const selectedArea = useMemo(() => startup.areas.find((area) => area._id === areaId), [areaId, startup.areas]);
  const CreateKindIcon = PAGE_KIND_META[kind].icon;

  async function readTableImportFile(file: File) {
    setTableBusy(true);
    try {
      const rows = await readTableFile(file);
      // Kolone se mere na SIROVOJ širini (pre sečenja na limit) — inače bi se
      // višak preko granice tiho izgubio, bez poruke.
      const sourceColumns = sourceWidth(rows);
      if (sourceColumns > MAX_TABLE_COLUMNS) {
        toast.error(`Fajl ima ${sourceColumns} kolona; granica je ${MAX_TABLE_COLUMNS}.`);
        return;
      }
      const normalized = normalizeTableMatrix(rows, MAX_TABLE_COLUMNS);
      if (normalized.length === 0) {
        toast.error("U fajlu nema podataka za uvoz.");
        return;
      }
      if (normalized.length > MAX_TABLE_ROWS + 1) {
        toast.error(`Fajl ima ${normalized.length} redova; granica je ${MAX_TABLE_ROWS}.`);
        return;
      }
      // Predugačke ćelije se seku odmah (server bi odbio celu seriju) i to se kaže.
      const { matrix, truncated } = clampCellLengths(normalized, MAX_TABLE_CELL_LENGTH);
      if (truncated > 0) {
        toast.warning(`Skraćeno je ${truncated} ćelija dužih od ${MAX_TABLE_CELL_LENGTH} znakova.`);
      }
      setTableDraft({ source: "import", fileName: file.name, matrix });
      if (title.trim() === "") {
        setTitle(file.name.replace(/\.(xlsx|xls|csv)$/i, ""));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? `Fajl nije pročitan: ${error.message}` : "Fajl nije pročitan.",
      );
    } finally {
      setTableBusy(false);
      if (tableFileInputRef.current) tableFileInputRef.current.value = "";
    }
  }

  /** Kolone + redovi koji idu u `importRows` odmah posle kreiranja, ili `null` za praznu tabelu. */
  function resolveTableData(): { columns: string[]; dataRows: string[][] } | null {
    if (kind !== "table") return null;
    if (tableMode === "import") {
      if (tableDraft === null) return null;
      const matrix = tableDraft.matrix;
      const header = firstRowIsHeader ? matrix[0] : null;
      const dataRows = firstRowIsHeader ? matrix.slice(1) : matrix;
      const columns =
        header?.map((label, index) => label.trim() || `Kolona ${index + 1}`) ??
        Array.from({ length: matrix[0].length }, (_, index) => `Kolona ${index + 1}`);
      return { columns, dataRows };
    }
    const columns = manualColumns.map((label, index) => label.trim() || `Kolona ${index + 1}`);
    if (columns.length === 0) return null;
    const dataRows = manualRows
      .map((row) => row.map((cell) => cell.slice(0, MAX_TABLE_CELL_LENGTH)))
      .filter((row) => row.some((cell) => cell.trim() !== ""));
    // Netaknut ručni režim (prazni nazivi, nula redova) = obična prazna tabela.
    if (dataRows.length === 0 && manualColumns.every((label) => label.trim() === "")) {
      return null;
    }
    return { columns, dataRows };
  }

  function addPickedFiles(incoming: FileList | File[]) {
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (!isSupportedFile(file)) {
        rejected.push(`${file.name}: ovaj tip fajla nije podržan`);
        continue;
      }
      if (file.size > maxBytesForFile(file)) {
        rejected.push(
          `${file.name}: veći je od ${Math.round(maxBytesForFile(file) / (1024 * 1024))} MB (ima ${formatFileSize(file.size)})`,
        );
        continue;
      }
      accepted.push(file);
    }
    setPickedFiles((current) => {
      const merged = [...current, ...accepted];
      if (merged.length > MAX_FILES) {
        rejected.push(`Najviše ${MAX_FILES} fajlova po oblačiću.`);
      }
      return merged.slice(0, MAX_FILES);
    });
    if (rejected.length > 0) toast.error(rejected.join(" · "));
  }

  /** Toast uspeha sa „Poništi" — kreiranje je izmena u bazi, pa ima put nazad. */
  function showCreatedToast(pageId: Id<"pages">, pending: boolean) {
    toast.success(
      pending
        ? `${PAGE_KIND_META[kind].label} je kreiran/a u oblasti i čeka odobrenje autora ciljne stranice.`
        : `${PAGE_KIND_META[kind].label} je kreiran/a.`,
      {
        duration: 8_000,
        action: {
          label: "Poništi",
          onClick: () => {
            void archivePage({ startupId: startup._id, pageId })
              .then(() => toast.info("Kreiranje je poništeno."))
              .catch((error: unknown) =>
                toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")),
              );
          },
        },
      },
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!areaId || title.trim().length === 0 || submitting) return;

    const tableData = resolveTableData();
    if (tableData && tableData.dataRows.length > MAX_TABLE_ROWS) {
      toast.error(`Uvoz bi napravio ${tableData.dataRows.length} redova; granica je ${MAX_TABLE_ROWS}.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await createPage({
        startupId: startup._id,
        areaId,
        rootPageId: target?.parentPageId ?? null,
        kind,
        title: title.trim(),
        content: kind === "note" ? noteContent : "",
        ...(kind === "task" ? {
          taskStatus: status,
          taskPriority: priority,
          ...(assigneeIds.length === 0 ? {} : { assigneeProfileIds: assigneeIds }),
          ...(dueDate ? { dueDate: fromDateInputValue(dueDate) } : {}),
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
          ...(checkpoints.length > 0 ? { checkpoints } : {}),
        } : {}),
      });
      const pageId = result.pageId;
      let followUpWarning: string | null = null;

      if (tableData) {
        // Serije od `MAX_TABLE_IMPORT_BATCH` — jedna mutacija ima transakcione
        // limite. Prva serija nosi kolone i briše seed red (`replace`).
        const { columns, dataRows } = tableData;
        setPhase({ label: "Upisujem tabelu", done: 0, total: dataRows.length });
        let imported = 0;
        try {
          if (dataRows.length === 0) {
            await importRows({ pageId, columns, rows: [], mode: "replace" });
          }
          for (let start = 0; start < dataRows.length; start += MAX_TABLE_IMPORT_BATCH) {
            const batch = dataRows.slice(start, start + MAX_TABLE_IMPORT_BATCH);
            await importRows({
              pageId,
              ...(start === 0 ? { columns } : {}),
              rows: batch,
              mode: start === 0 ? "replace" : "append",
            });
            imported += batch.length;
            setPhase({ label: "Upisujem tabelu", done: imported, total: dataRows.length });
          }
        } catch (error) {
          const message = accessErrorMessage(error, "Upis tabele nije uspeo.");
          if (imported === 0) {
            // Prva serija je pala — bez podataka stranica je husk; čisti se odmah.
            await archivePage({ startupId: startup._id, pageId }).catch(() => undefined);
            toast.error(`Tabela nije kreirana: ${message}`);
            return;
          }
          followUpWarning = `Upisano je ${imported} od ${dataRows.length} redova (${message}). Ostatak dodaj kroz „Uvezi Excel / CSV" u prikazu tabele.`;
        }
      }

      if (kind === "file" && pickedFiles.length > 0) {
        const failures: string[] = [];
        let done = 0;
        setPhase({ label: "Otpremam fajlove", done: 0, total: pickedFiles.length });
        for (const file of pickedFiles) {
          try {
            await uploadPageFile({
              pageId,
              file,
              generateUploadUrl,
              attach: attachPageFile,
            });
          } catch (error) {
            failures.push(
              `${file.name} — ${error instanceof Error ? error.message : "otpremanje nije uspelo"}`,
            );
          }
          done += 1;
          setPhase({ label: "Otpremam fajlove", done, total: pickedFiles.length });
        }
        if (failures.length === pickedFiles.length) {
          // Nijedan fajl nije prošao — prazan oblačić se ne ostavlja za sobom.
          await archivePage({ startupId: startup._id, pageId }).catch(() => undefined);
          toast.error(`Oblačić nije kreiran — nijedan fajl nije otpremljen. ${failures[0]}`);
          return;
        }
        if (failures.length > 0) {
          followUpWarning = `Nisu otpremljeni: ${failures.join(" · ")}. Dodaj ih ponovo iz detalja oblačića.`;
        }
      }

      showCreatedToast(pageId, result.nestingStatus === "pending");
      if (followUpWarning) toast.warning(followUpWarning, { duration: 10_000 });
      onOpenChange(false);
      onCreated(pageId);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stranica nije kreirana."));
    } finally {
      setSubmitting(false);
      setPhase(null);
    }
  }

  const importPreview = tableDraft?.matrix ?? null;
  const importPreviewHeader = importPreview && firstRowIsHeader ? importPreview[0] : null;
  const importPreviewRows = importPreview
    ? (firstRowIsHeader ? importPreview.slice(1) : importPreview).slice(0, IMPORT_PREVIEW_ROWS)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dok traje kreiranje/otpremanje, zatvaranje bi ostavilo posao bez
        // nadzora — dijalog ostaje otvoren do kraja ili greške.
        if (!next && submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={`${workspaceItemDialogContentClass} sm:!max-w-2xl`}
      >
        <form
          className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]"
          onSubmit={submit}
        >
          <DialogHeader className="border-b border-border/70 px-5 py-5 pr-14 sm:px-6 sm:pr-16">
            <DialogTitle className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Plus className="size-4" /></span> Nova stranica</DialogTitle>
            <DialogDescription>
              {target?.parentPageId
                ? targetParent && !targetParent.permissions.canEdit
                  ? "Stavka će biti kreirana u korenu oblasti, a autor ciljne stranice dobija zahtev za ugnježđavanje."
                  : "Biće ugnježdena unutar izabrane stranice."
                : `Dodaješ sadržaj u ${selectedArea?.label ?? "oblast"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="scrollbar-thin min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <fieldset className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-1 sm:grid-cols-4">
              <legend className="sr-only">Vrsta stranice</legend>
              {PAGE_KIND_KEYS.map((value) => {
                const Icon = PAGE_KIND_META[value].icon;
                return (
                  <label
                    key={value}
                    className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring ${kind === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <input
                      type="radio"
                      name="page-kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                      className="sr-only"
                    />
                    <Icon className="size-4" />
                    {PAGE_KIND_META[value].label}
                  </label>
                );
              })}
            </fieldset>
            <div className="space-y-2"><Label htmlFor="new-page-title">Naslov</Label><Input id="new-page-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={TITLE_PLACEHOLDER[kind]} maxLength={200} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="new-page-area">Oblast</Label><Select value={areaId} onValueChange={(value) => setAreaId(value as Id<"startupAreas">)} disabled={Boolean(target?.areaId)}><SelectTrigger id="new-page-area"><SelectValue /></SelectTrigger><SelectContent>{startup.areas.map((area) => <SelectItem key={area._id} value={area._id}>{area.label}</SelectItem>)}</SelectContent></Select></div>

            {kind === "file" ? (
              <div className="space-y-3">
                <Label>Fajlovi (odmah pri kreiranju)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    if (event.target.files) addPickedFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div
                  className={`rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border/70 bg-muted/20"}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    if (event.dataTransfer.files.length > 0) addPickedFiles(event.dataTransfer.files);
                  }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    Izaberi fajlove
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Više odjednom (najviše {MAX_FILES}); može i prevlačenjem ovde.
                    Otpremaju se čim se oblačić kreira.
                  </p>
                </div>
                {pickedFiles.length > 0 ? (
                  <ul className="space-y-1.5">
                    {pickedFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
                      >
                        <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          aria-label={`Ukloni ${file.name}`}
                          disabled={submitting}
                          onClick={() => setPickedFiles((current) => current.filter((_, i) => i !== index))}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Još nema izabranih fajlova — oblačić može da se kreira i prazan.
                  </p>
                )}
              </div>
            ) : kind === "table" ? (
              <div className="space-y-3">
                <Label>Podaci tabele (odmah pri kreiranju)</Label>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-1">
                  {([
                    { value: "import", label: "Uvezi CSV/XLSX" },
                    { value: "manual", label: "Ručno" },
                  ] as const).map((mode) => (
                    <label
                      key={mode.value}
                      className={`flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-ring ${tableMode === mode.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <input
                        type="radio"
                        name="table-mode"
                        value={mode.value}
                        checked={tableMode === mode.value}
                        onChange={() => setTableMode(mode.value)}
                        className="sr-only"
                      />
                      {mode.label}
                    </label>
                  ))}
                </div>

                {tableMode === "import" ? (
                  <div className="space-y-3">
                    <input
                      ref={tableFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,text/csv"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void readTableImportFile(file);
                      }}
                    />
                    {tableDraft === null ? (
                      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={tableBusy || submitting}
                          onClick={() => tableFileInputRef.current?.click()}
                        >
                          {tableBusy ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                          Izaberi fajl
                        </Button>
                        <p className="mt-2 text-xs text-muted-foreground">
                          .xlsx, .xls ili .csv (radi i sa `;` i ćirilicom). Najviše {MAX_TABLE_COLUMNS} kolona i {MAX_TABLE_ROWS} redova.
                          Bez fajla se pravi prazna tabela.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="min-w-0 flex-1 truncate text-sm">
                            <span className="font-semibold">{tableDraft.fileName}</span>{" "}
                            <span className="text-muted-foreground">
                              — {tableDraft.matrix.length} {tableDraft.matrix.length === 1 ? "red" : "redova"} × {tableDraft.matrix[0].length} kolona
                            </span>
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={submitting}
                            onClick={() => setTableDraft(null)}
                          >
                            <X className="size-3.5" />
                            Ukloni fajl
                          </Button>
                        </div>
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={firstRowIsHeader}
                            onCheckedChange={(value) => setFirstRowIsHeader(value === true)}
                          />
                          Prvi red su zaglavlja
                        </Label>
                        <div className="overflow-x-auto rounded-xl border border-border/70">
                          <table className="w-full text-left text-xs">
                            {importPreviewHeader ? (
                              <thead className="bg-muted/50">
                                <tr>
                                  {importPreviewHeader.map((label, index) => (
                                    <th key={index} className="whitespace-nowrap px-3 py-2 font-bold">
                                      {label || `Kolona ${index + 1}`}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                            ) : null}
                            <tbody>
                              {importPreviewRows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-t border-border/60">
                                  {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="max-w-56 truncate px-3 py-1.5">
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
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Kolone</p>
                      {manualColumns.map((column, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={column}
                            placeholder={`Kolona ${index + 1}`}
                            maxLength={120}
                            onChange={(event) =>
                              setManualColumns((current) =>
                                current.map((value, i) => (i === index ? event.target.value : value)),
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0"
                            aria-label={`Ukloni kolonu ${index + 1}`}
                            disabled={manualColumns.length <= 1 || submitting}
                            onClick={() => {
                              setManualColumns((current) => current.filter((_, i) => i !== index));
                              setManualRows((current) => current.map((row) => row.filter((_, i) => i !== index)));
                            }}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={manualColumns.length >= MAX_TABLE_COLUMNS || submitting}
                        onClick={() => {
                          setManualColumns((current) => [...current, ""]);
                          setManualRows((current) => current.map((row) => [...row, ""]));
                        }}
                      >
                        <Plus className="size-3.5" />
                        Dodaj kolonu
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Početni redovi</p>
                      {manualRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Bez redova se pravi tabela samo sa kolonama.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-border/70 p-2">
                          <table className="w-full">
                            <tbody>
                              {manualRows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                  {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="p-1 align-top">
                                      <Input
                                        value={cell}
                                        aria-label={`Red ${rowIndex + 1}, ${manualColumns[cellIndex]?.trim() || `Kolona ${cellIndex + 1}`}`}
                                        placeholder={manualColumns[cellIndex]?.trim() || `Kolona ${cellIndex + 1}`}
                                        className="min-w-32"
                                        onChange={(event) =>
                                          setManualRows((current) =>
                                            current.map((r, ri) =>
                                              ri === rowIndex
                                                ? r.map((value, ci) => (ci === cellIndex ? event.target.value : value))
                                                : r,
                                            ),
                                          )
                                        }
                                      />
                                    </td>
                                  ))}
                                  <td className="p-1 align-middle">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-9"
                                      aria-label={`Ukloni red ${rowIndex + 1}`}
                                      disabled={submitting}
                                      onClick={() => setManualRows((current) => current.filter((_, i) => i !== rowIndex))}
                                    >
                                      <X className="size-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={manualRows.length >= MANUAL_ROWS_CAP || submitting}
                        onClick={() => setManualRows((current) => [...current, manualColumns.map(() => "")])}
                      >
                        <Plus className="size-3.5" />
                        Dodaj red
                      </Button>
                      {manualRows.length >= MANUAL_ROWS_CAP ? (
                        <p className="text-xs text-muted-foreground">
                          Ručno ide do {MANUAL_ROWS_CAP} redova — za više koristi uvoz fajla.
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : kind === "note" ? (
              <div className="space-y-2">
                <Label>Sadržaj beleške (Rich Text Editor)</Label>
                <div className="min-h-[16rem] rounded-xl border border-border/70 bg-card p-3">
                  <RichTextEditor
                    content={noteContent}
                    documentKey="new-note-dialog"
                    placeholder="Zapiši detalje beleške ovde…"
                    onChange={({ html }) => setNoteContent(html)}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="new-task-status">Status</Label><Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}><SelectTrigger id="new-task-status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_STATUS_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="new-task-priority">Prioritet</Label><Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}><SelectTrigger id="new-task-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_PRIORITY_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="new-task-assignee">Izvršioci</Label><AssigneePicker id="new-task-assignee" members={members} value={assigneeIds} onChange={setAssigneeIds} /></div>
                  <div className="space-y-2"><Label htmlFor="new-task-due">Rok</Label><Input id="new-task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-task-instructions">Instrukcije (opciono)</Label>
                  <textarea
                    id="new-task-instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Napiši šta treba uraditi i koji rezultat se očekuje…"
                    className="flex min-h-20 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    rows={3}
                    maxLength={20_000}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><ListChecks className="size-4 text-primary" /> Podzadaci / Checkpointi</Label>
                  <TaskCheckpointDraftList
                    items={checkpoints}
                    onChange={setCheckpoints}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="relative z-20 shrink-0 border-t border-border/70 bg-background/95 px-5 py-4 shadow-[0_-12px_28px_-22px_rgba(0,0,0,0.55)] backdrop-blur sm:px-6">
            {phase ? (
              <p
                className="mr-auto self-center text-xs text-muted-foreground tabular-nums"
                role="status"
                aria-live="polite"
              >
                {phase.label}: {phase.done}/{phase.total}
              </p>
            ) : null}
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>Otkaži</Button>
            <Button type="submit" disabled={submitting || !areaId || title.trim().length === 0}>{submitting ? <LoaderCircle className="animate-spin" /> : <CreateKindIcon className="size-4" />} Kreiraj</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
