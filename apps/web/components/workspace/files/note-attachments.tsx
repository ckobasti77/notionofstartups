"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import {
  FileViewerDialog,
  type ViewableFile,
} from "@/components/workspace/files/file-viewer-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadPageFile, type AttachedPageFile } from "@/lib/page-files";
import type { PageFileCategory } from "@/lib/page-kinds";

/** Red iz `api.pageFiles.list` — onoliko koliko treba prikazu u telu beleške. */
export type NoteAttachmentRow = {
  _id: Id<"pageFiles">;
  name: string;
  contentType: string;
  size: number;
  category: PageFileCategory;
  url: string | null;
  canManage: boolean;
};

type NoteAttachmentsContextValue = {
  /** `undefined` dok se spisak još učitava. */
  files: NoteAttachmentRow[] | undefined;
  openFile: (fileId: string) => void;
};

/**
 * Node view-ovi u editoru žive u portalima ispod `EditorContent`, pa context
 * postavljen oko `RichTextEditor`-a stiže do njih. Bez providera (npr. dialog
 * za novu stranicu) prilozi se prikazuju kao nedostupni — vidi `NoteFileView`.
 */
const NoteAttachmentsContext = createContext<NoteAttachmentsContextValue | null>(
  null,
);

export function useNoteAttachments() {
  return useContext(NoteAttachmentsContext);
}

export function NoteAttachmentsProvider({
  files,
  children,
}: {
  files: NoteAttachmentRow[] | undefined;
  children: React.ReactNode;
}) {
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const openFile = useCallback((fileId: string) => setOpenFileId(fileId), []);
  const value = useMemo(() => ({ files, openFile }), [files, openFile]);

  return (
    <NoteAttachmentsContext.Provider value={value}>
      {children}
      <FileViewerDialog
        files={(files ?? []) as ViewableFile[]}
        openFileId={openFileId}
        onOpenChange={setOpenFileId}
      />
    </NoteAttachmentsContext.Provider>
  );
}

/**
 * Upload priloga za telo beleške. Vraća `null` umesto funkcije kad stranica ne
 * prima fajlove (nema je još, ili korisnik ne sme da menja telo) — editor tada
 * ne nudi upload. Greške toast-uje sam, u istom obliku kao panel fajlova.
 */
export function useNoteFileUpload(pageId: Id<"pages"> | null) {
  const generateUploadUrl = useMutation(api.pageFiles.generateUploadUrl);
  const attach = useMutation(api.pageFiles.attach);

  return useMemo(() => {
    if (pageId === null) return null;
    return async (file: File): Promise<AttachedPageFile | null> => {
      try {
        return await uploadPageFile({
          pageId,
          file,
          generateUploadUrl,
          attach,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `„${file.name}”: ${error.message}`
            : `„${file.name}” nije dodat.`,
        );
        return null;
      }
    };
  }, [pageId, generateUploadUrl, attach]);
}
