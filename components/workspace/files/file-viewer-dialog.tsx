"use client";


import { ChevronLeft, ChevronRight, Download, FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { workspaceItemDialogContentClass } from "@/components/workspace/workspace-item-dialog";
import {
  fileKindLabel,
  formatFileSize,
  type PageFileCategory,
} from "@/lib/page-kinds";

export type ViewableFile = {
  _id: string;
  name: string;
  contentType: string;
  size: number;
  category: PageFileCategory;
  url: string | null;
};

function FileBody({ file }: { file: ViewableFile }) {
  if (file.url === null) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
        Fajl više nije dostupan u skladištu.
      </p>
    );
  }
  if (file.category === "image") {
    return (
      // Slike su korisnički prilozi sa udaljenog Convex URL-a; `next/image` se
      // u ovom projektu ne koristi (vidi `components/ui/avatar.tsx`).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.url}
        alt={file.name}
        className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
      />
    );
  }
  if (file.category === "video") {
    return (
      <video
        src={file.url}
        controls
        className="mx-auto max-h-[70vh] w-full rounded-xl bg-black"
      >
        <track kind="captions" />
      </video>
    );
  }
  if (file.category === "audio") {
    return <audio src={file.url} controls className="w-full" />;
  }
  if (file.category === "pdf") {
    // CSP u `next.config.ts` ima `object-src 'none'`, pa `<embed>`/`<object>`
    // ovde ne rade — `<iframe>` je jedini prikaz koji prolazi.
    return (
      <iframe
        src={file.url}
        title={file.name}
        className="h-[70vh] w-full rounded-xl border border-border/70 bg-card"
      />
    );
  }
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 py-12 text-center">
      <FileQuestion className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Ovaj tip se ne prikazuje u pregledu. Preuzmi ga da bi ga otvorio.
      </p>
    </div>
  );
}

/**
 * Veliki modal sa galerijom priloga jednog oblačića. Otvoreni fajl je u
 * propu — modal nema sopstveno stanje indeksa, pa ne može da odluta od liste
 * kad se prilozi promene ispod njega.
 */
export function FileViewerDialog({
  files,
  openFileId,
  onOpenChange,
}: {
  files: ViewableFile[];
  openFileId: string | null;
  onOpenChange: (fileId: string | null) => void;
}) {
  const index = files.findIndex((candidate) => candidate._id === openFileId);
  const file = index >= 0 ? files[index] : undefined;
  const open = openFileId !== null && file !== undefined;
  const step = (delta: number) => {
    if (files.length === 0) return;
    const next = (index + delta + files.length) % files.length;
    onOpenChange(files[next]._id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(null);
      }}
    >
      <DialogContent className={`${workspaceItemDialogContentClass} sm:!max-w-4xl`}>
        {file ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
            <DialogHeader className="border-b border-border/70 px-5 py-5 pr-14 sm:px-6 sm:pr-16">
              <DialogTitle className="truncate">{file.name}</DialogTitle>
              <DialogDescription>
                {fileKindLabel(file.category)} · {formatFileSize(file.size)}
                {files.length > 1 ? ` · ${index + 1} od ${files.length}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="scrollbar-thin min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
              <FileBody file={file} />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={files.length < 2}
                  aria-label="Prethodni fajl"
                  onClick={() => step(-1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={files.length < 2}
                  aria-label="Sledeći fajl"
                  onClick={() => step(1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {file.url ? (
                <Button asChild variant="outline">
                  <a href={file.url} download={file.name}>
                    <Download className="size-4" /> Preuzmi
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
