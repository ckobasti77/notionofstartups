import type { Id } from "@/convex/_generated/dataModel";
import type { PageFileCategory } from "@/lib/page-kinds";

/** Mora da prati `MAX_PAGE_FILE_BYTES` i `MAX_PAGE_FILES` na serveru. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 25;

/** Ista lista kao `pageFileCategoryFor` na serveru; server je i dalje autoritet. */
const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic",
  "mp4", "webm", "mov", "mp3", "wav", "m4a", "ogg",
  "csv", "xls", "xlsx", "ods",
  "txt", "md", "rtf", "json", "doc", "docx", "odt", "ppt", "pptx", "zip",
]);
const SUPPORTED_MIME_PREFIXES = ["image/", "video/", "audio/"];

export function isSupportedFile(file: File) {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (
    type !== "" &&
    type !== "application/octet-stream" &&
    (type === "application/pdf" ||
      SUPPORTED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix)))
  ) {
    return true;
  }
  const extension = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(extension);
}

/** Šta `pageFiles.attach` vraća — dovoljno da se prilog odmah prikaže. */
export type AttachedPageFile = {
  fileId: Id<"pageFiles">;
  name: string;
  size: number;
  category: PageFileCategory;
};

type GenerateUploadUrl = (args: {
  pageId: Id<"pages">;
}) => Promise<{ uploadUrl: string; token: string; expiresAt: number }>;

type AttachPageFile = (args: {
  pageId: Id<"pages">;
  storageId: Id<"_storage">;
  token: string;
  name: string;
}) => Promise<AttachedPageFile>;

/**
 * Tri koraka slanja: dozvola → POST bloba → attach. Provere pre slanja postoje
 * jer se odbijena mutacija poništava zajedno sa brisanjem bloba, pa fajl koji
 * server ne prima ne treba ni da stigne do skladišta. Poruke o grešci su
 * fragmenti („veći je od…”) — pozivalac ih prefiksuje imenom fajla.
 */
export async function uploadPageFile({
  pageId,
  file,
  generateUploadUrl,
  attach,
}: {
  pageId: Id<"pages">;
  file: File;
  generateUploadUrl: GenerateUploadUrl;
  attach: AttachPageFile;
}): Promise<AttachedPageFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `veći je od ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB`,
    );
  }
  if (!isSupportedFile(file)) {
    throw new Error("ovaj tip fajla nije podržan");
  }
  const upload = await generateUploadUrl({ pageId });
  const response = await fetch(upload.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) throw new Error("Slanje fajla nije uspelo.");
  const { storageId } = (await response.json()) as {
    storageId: Id<"_storage">;
  };
  return await attach({
    pageId,
    storageId,
    token: upload.token,
    name: file.name,
  });
}
