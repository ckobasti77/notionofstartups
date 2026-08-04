import {
  CheckSquare2,
  FileText,
  Paperclip,
  Table2,
  type LucideIcon,
} from "lucide-react";

export type PageKind = "note" | "task" | "file" | "table";

export const PAGE_KIND_KEYS: readonly PageKind[] = [
  "note",
  "task",
  "file",
  "table",
] as const;

type PageKindMeta = {
  /** Nominativ: „Beleška”. */
  label: string;
  /** Akuzativ: „Poveži sa …”. */
  labelAccusative: string;
  /** Instrumental: „Povezano sa …”. */
  labelInstrumental: string;
  /** Genitiv množine za brojanje: „3 …”. */
  labelPlural: string;
  icon: LucideIcon;
  /** Klasa `--node-accent` iz `connected-canvas.module.css`. */
  accentToken: "note" | "task" | "file" | "table";
  /** Obod kartice na kanvasu. */
  shape: "organic" | "rounded";
  /** Boja tačke na minimapi. */
  miniMapColor: string;
  /** Tailwind boja teksta za značku vrste. */
  textClass: string;
};

/**
 * Jedini izvor istine o tome kako se vrsta stranice prikazuje. Sve što je ranije
 * bilo `kind === "task" ? A : B` mora ići kroz ovu mapu — inače nova vrsta tiho
 * dobije izgled beleške.
 */
export const PAGE_KIND_META: Record<PageKind, PageKindMeta> = {
  note: {
    label: "Beleška",
    labelAccusative: "belešku",
    labelInstrumental: "beleškom",
    labelPlural: "beleški",
    icon: FileText,
    accentToken: "note",
    shape: "organic",
    miniMapColor: "#38bdf8",
    textClass: "text-sky-700 dark:text-sky-300",
  },
  task: {
    label: "Zadatak",
    labelAccusative: "zadatak",
    labelInstrumental: "zadatkom",
    labelPlural: "zadataka",
    icon: CheckSquare2,
    accentToken: "task",
    shape: "rounded",
    miniMapColor: "#10b981",
    textClass: "text-emerald-700 dark:text-emerald-300",
  },
  file: {
    label: "Fajl",
    labelAccusative: "fajl",
    labelInstrumental: "fajlom",
    labelPlural: "fajlova",
    icon: Paperclip,
    accentToken: "file",
    shape: "rounded",
    miniMapColor: "#f59e0b",
    textClass: "text-amber-700 dark:text-amber-300",
  },
  table: {
    label: "Tabela",
    labelAccusative: "tabelu",
    labelInstrumental: "tabelom",
    labelPlural: "tabela",
    icon: Table2,
    accentToken: "table",
    shape: "rounded",
    miniMapColor: "#c084fc",
    textClass: "text-fuchsia-700 dark:text-fuchsia-300",
  },
};

export function pageKindMeta(kind: PageKind) {
  return PAGE_KIND_META[kind];
}

export function pageKindLabel(kind: PageKind) {
  return PAGE_KIND_META[kind].label;
}

export function pageKindIcon(kind: PageKind) {
  return PAGE_KIND_META[kind].icon;
}

/** Samo zadatak nosi status, prioritet, rok, izvršioce i checkpointe. */
export function supportsTaskData(kind: PageKind) {
  return kind === "task";
}

/** Samo beleška ima rich-text telo kao glavni sadržaj. */
export function supportsRichTextBody(kind: PageKind) {
  return kind === "note";
}

export type PageFileCategory =
  | "image"
  | "video"
  | "pdf"
  | "audio"
  | "sheet"
  | "document";

export const PAGE_FILE_CATEGORY_LABELS: Record<PageFileCategory, string> = {
  image: "Slika",
  video: "Video",
  pdf: "PDF",
  audio: "Audio",
  sheet: "Tabela",
  document: "Dokument",
};

/** „Fajl · PDF” — kako se prilog imenuje u interfejsu. */
export function fileKindLabel(category: PageFileCategory | null) {
  return category === null
    ? PAGE_KIND_META.file.label
    : `${PAGE_KIND_META.file.label} · ${PAGE_FILE_CATEGORY_LABELS[category]}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
