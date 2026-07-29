import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
);

export const areaKeyValidator = v.string();

export const pageKindValidator = v.union(
  v.literal("note"),
  v.literal("task"),
);

export const taskStatusValidator = v.union(
  v.literal("backlog"),
  v.literal("next"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

export const taskPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const checkpointItemValidator = v.object({
  id: v.string(),
  text: v.string(),
  completed: v.boolean(),
});

export const taskCheckpointCanvasEndpointValidator = v.union(
  v.object({
    kind: v.literal("page"),
    id: v.id("pages"),
  }),
  v.object({
    kind: v.literal("task_checkpoint"),
    id: v.id("taskCheckpoints"),
  }),
);

/** Statusi koje komandni centar smatra otvorenim poslom. */
export const OPEN_TASK_STATUSES = [
  "backlog",
  "next",
  "in_progress",
  "blocked",
] as const;

/**
 * Gornja granica čitanja po statusu u komandnom centru. Trijaža mora da prikaže
 * tačne brojeve, pa se čita bez paginacije — granica je zaštita, ne očekivanje.
 */
export const COMMAND_CENTER_STATUS_CAP = 150;

export const MAX_TASK_INSTRUCTIONS_LENGTH = 20_000;
export const MAX_TASK_CHECKPOINTS = 100;
export const MAX_TASK_CHECKPOINT_ID_LENGTH = 128;
export const MAX_TASK_PAGE_SIZE = 100;
export const MAX_TASK_DUE_DATE = 253_402_300_799_999;

export type TaskCheckpointInput = {
  id: string;
  text: string;
  completed: boolean;
};

export function normalizeTaskInstructions(
  value: string | null | undefined,
) {
  if (value === undefined || value === null) return undefined;
  if (value.length > MAX_TASK_INSTRUCTIONS_LENGTH) {
    throw new Error(
      `Instrukcije mogu imati najviše ${MAX_TASK_INSTRUCTIONS_LENGTH} znakova.`,
    );
  }
  const cleaned = value.trim();
  return cleaned.length === 0 ? undefined : cleaned;
}

export function normalizeTaskCheckpoints(
  value: Array<TaskCheckpointInput> | null | undefined,
) {
  if (value === undefined || value === null) return undefined;
  if (value.length > MAX_TASK_CHECKPOINTS) {
    throw new Error(
      `Zadatak može imati najviše ${MAX_TASK_CHECKPOINTS} checkpointa.`,
    );
  }

  const ids = new Set<string>();
  return value.map((checkpoint) => {
    if (checkpoint.id.length > MAX_TASK_CHECKPOINT_ID_LENGTH) {
      throw new Error(
        `ID checkpointa može imati najviše ${MAX_TASK_CHECKPOINT_ID_LENGTH} znakova.`,
      );
    }
    const id = checkpoint.id.trim();
    const text = checkpoint.text.trim();
    if (id.length === 0) throw new Error("ID checkpointa je obavezno polje.");
    if (text.length === 0) {
      throw new Error("Tekst checkpointa je obavezno polje.");
    }
    if (ids.has(id)) {
      throw new Error("ID-jevi checkpointa moraju biti jedinstveni.");
    }
    ids.add(id);
    return { id, text, completed: checkpoint.completed };
  });
}

export function validateTaskDueDate(
  value: number | null | undefined,
) {
  if (value === undefined || value === null) return value;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_TASK_DUE_DATE
  ) {
    throw new Error("Rok nije ispravan.");
  }
  return value;
}

export const pageSummaryValidator = v.object({
  _id: v.id("pages"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  areaId: v.id("startupAreas"),
  parentPageId: v.union(v.id("pages"), v.null()),
  kind: pageKindValidator,
  title: v.string(),
  searchText: v.string(),
  revision: v.number(),
  position: v.number(),
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  assigneeProfileId: v.union(v.id("profiles"), v.null()),
  dueDate: v.union(v.number(), v.null()),
  instructions: v.optional(v.string()),
  checkpoints: v.optional(v.array(checkpointItemValidator)),
  checkpointTotal: v.optional(v.number()),
  checkpointCompleted: v.optional(v.number()),
  checkpointRevision: v.optional(v.number()),
  taskSortAt: v.number(),
  createdByProfileId: v.id("profiles"),
  updatedByProfileId: v.id("profiles"),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const startupDocumentValidator = v.object({
  _id: v.id("startups"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.string(),
  logoStorageId: v.optional(v.id("_storage")),
  createdByProfileId: v.id("profiles"),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const startupAreaDocumentValidator = v.object({
  _id: v.id("startupAreas"),
  _creationTime: v.number(),
  startupId: v.id("startups"),
  key: v.string(),
  label: v.string(),
  position: v.number(),
  createdAt: v.number(),
});

export const AREA_DEFINITIONS = [
  { key: "dev", label: "Dev notes", position: 0 },
  { key: "marketing", label: "Marketing notes", position: 1 },
  { key: "sales", label: "Sales notes", position: 2 },
  { key: "other", label: "Other notes", position: 3 },
] as const;

export function boundedLimit(value: number | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Limit mora biti ceo broj između 1 i ${max}.`);
  }
  return value;
}

export function cleanRequiredText(value: string, label: string, maxLength: number) {
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new Error(`${label} je obavezno polje.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned;
}

export function cleanOptionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned;
}

export function normalizeEmail(email: string) {
  const normalized = email.trim().toLocaleLowerCase("en-US");
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new Error("Unesite ispravnu email adresu.");
  }
  return normalized;
}
