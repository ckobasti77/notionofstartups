"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Eye,
  LoaderCircle,
  Paperclip,
  Pencil,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileViewerDialog,
  type ViewableFile,
} from "@/components/workspace/files/file-viewer-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_FILE_BYTES, MAX_FILES, uploadPageFile } from "@/lib/page-files";
import {
  fileKindLabel,
  formatFileSize,
  PAGE_KIND_META,
} from "@/lib/page-kinds";
import { cn } from "@/lib/utils";

export function PageFilesPanel({
  pageId,
  canManage,
  onCreateTableFromFile,
  className,
}: {
  pageId: Id<"pages">;
  canManage: boolean;
  onCreateTableFromFile?: (file: { fileId: Id<"pageFiles">; name: string }) => void;
  className?: string;
}) {
  const files = useQuery(api.pageFiles.list, { pageId });
  const generateUploadUrl = useMutation(api.pageFiles.generateUploadUrl);
  const attach = useMutation(api.pageFiles.attach);
  const renameFile = useMutation(api.pageFiles.rename);
  const removeFile = useMutation(api.pageFiles.remove);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<Id<"pageFiles"> | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  async function uploadMany(selected: FileList | File[]) {
    const list = Array.from(selected);
    if (list.length === 0) return;
    setUploading(true);
    let added = 0;
    try {
      for (const file of list) {
        try {
          await uploadPageFile({ pageId, file, generateUploadUrl, attach });
          added += 1;
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `„${file.name}”: ${error.message}`
              : `„${file.name}” nije dodat.`,
          );
        }
      }
      if (added > 0) {
        toast.success(
          added === 1 ? "Fajl je dodat." : `Dodato je ${added} fajlova.`,
        );
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const FileIcon = PAGE_KIND_META.file.icon;

  return (
    <section className={cn("space-y-3", className)} aria-label="Fajlovi">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Paperclip className="size-4 text-primary" aria-hidden="true" />
          Fajlovi
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-muted-foreground">
            {files?.length ?? 0}/{MAX_FILES}
          </span>
        </h3>
      </div>

      {canManage ? (
        <div
          className={cn(
            "rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/6"
              : "border-border/70 bg-muted/20",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void uploadMany(event.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            id={`page-files-${pageId}`}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void uploadMany(event.target.files);
            }}
          />
          <FileIcon
            className="mx-auto mb-2 size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Prevuci fajlove ovde ili ih izaberi. Najviše {MAX_FILES} po oblačiću,{" "}
            {Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB po fajlu.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={uploading || (files?.length ?? 0) >= MAX_FILES}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Dodaj fajlove
          </Button>
        </div>
      ) : null}

      {files === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
          Još nema fajlova u ovom oblačiću.
        </p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file._id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2"
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300"
                aria-hidden="true"
              >
                <FileIcon className="size-4" />
              </span>
              {renamingId === file._id ? (
                <Input
                  autoFocus
                  value={renameDraft}
                  className="h-9 min-w-0 flex-1"
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setRenamingId(null);
                    if (event.key === "Enter" && renameDraft.trim()) {
                      void renameFile({
                        fileId: file._id,
                        name: renameDraft,
                      })
                        .then(() => setRenamingId(null))
                        .catch((error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Ime nije sačuvano.",
                          ),
                        );
                    }
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {file.name}
                  </span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {fileKindLabel(file.category)} · {formatFileSize(file.size)}
                  </span>
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label={`Otvori pregled: ${file.name}`}
                title="Otvori pregled"
                onClick={() => setOpenFileId(file._id)}
              >
                <Eye className="size-3.5" />
              </Button>
              {file.category === "sheet" && onCreateTableFromFile ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={`Napravi tabelu od fajla: ${file.name}`}
                  title="Napravi tabelu od ovog fajla"
                  onClick={() =>
                    onCreateTableFromFile({ fileId: file._id, name: file.name })
                  }
                >
                  <Table2 className="size-3.5" />
                </Button>
              ) : null}
              {file.canManage ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    aria-label={`Preimenuj fajl: ${file.name}`}
                    title="Preimenuj"
                    onClick={() => {
                      setRenamingId(file._id);
                      setRenameDraft(file.name);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 text-muted-foreground hover:text-destructive"
                    aria-label={`Obriši fajl: ${file.name}`}
                    title="Obriši fajl"
                    onClick={() => {
                      void removeFile({ fileId: file._id })
                        .then(() => toast.success("Fajl je obrisan."))
                        .catch((error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Fajl nije obrisan.",
                          ),
                        );
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <FileViewerDialog
        files={(files ?? []) as ViewableFile[]}
        openFileId={openFileId}
        onOpenChange={setOpenFileId}
      />
    </section>
  );
}
