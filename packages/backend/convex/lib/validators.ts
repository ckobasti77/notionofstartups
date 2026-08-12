import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
);

export const areaKeyValidator = v.string();

export const pageKindValidator = v.union(
  v.literal("note"),
  v.literal("task"),
  v.literal("file"),
  v.literal("table"),
);

/** Kategorija priloga; izvodi se iz `contentType` na serveru. */
export const pageFileCategoryValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("pdf"),
  v.literal("audio"),
  v.literal("sheet"),
  v.literal("document"),
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

export const notificationTypeValidator = v.union(
  v.literal("task_assigned"),
  v.literal("task_status_changed"),
  v.literal("task_due_soon"),
  v.literal("task_due_today"),
  v.literal("task_overdue"),
  v.literal("idea_voted"),
  v.literal("idea_converted"),
  v.literal("vote_requested"),
  v.literal("request_resolved"),
  v.literal("puls_ready"),
  // Chat (vidi docs/mobile/04-CHAT.md sekcija 6). Zvuci se mapiraju po tipu.
  v.literal("chat_message"),
  v.literal("chat_mention"),
  v.literal("chat_dm"),
);

/** Kuda vodi klik na obaveštenje. `chat` vodi na kanal (targetId je channelId). */
export const notificationTargetTypeValidator = v.union(
  v.literal("page"),
  v.literal("ideas"),
  v.literal("approvals"),
  v.literal("puls"),
  v.literal("chat"),
);

// --- Chat (docs/mobile/04-CHAT.md) ---------------------------------------

/**
 * Vrsta chat kanala. `startup` je opšti kanal — tačno jedan po startupu,
 * implicitno članstvo, ne može da se napusti ni arhivira (sekcija 5b). `agent`
 * je AI sagovornik, po korisniku jedan (docs/mobile/06-AGENT.md).
 */
export const chatChannelKindValidator = v.union(
  v.literal("startup"),
  v.literal("area"),
  v.literal("custom"),
  v.literal("dm"),
  v.literal("thread"),
  v.literal("agent"),
);

/**
 * Entitet za koji je thread kanal zakačen (`kind === "thread"`). `message` je
 * diskusija otvorena iz same chat poruke — thread nasleđuje pristup od kanala
 * te poruke (04-CHAT.md 5c). Pronalaženje ide preko `chatChannels.by_anchor`.
 */
export const chatAnchorTypeValidator = v.union(
  v.literal("page"),
  v.literal("idea"),
  v.literal("thought"),
  v.literal("deletionRequest"),
  v.literal("message"),
);

export const chatMessageKindValidator = v.union(
  v.literal("text"),
  v.literal("file"),
  v.literal("voice"),
  v.literal("system"),
);

export const chatMemberRoleValidator = v.union(
  v.literal("owner"),
  v.literal("member"),
);

/**
 * Nivo obaveštenja po kanalu, po profilu. Živi na `chatReads` (ne na
 * `chatMembers`) da bi radio i za implicitne startup/area kanale. Odsutan red
 * ili polje = `all`.
 */
export const chatNotificationLevelValidator = v.union(
  v.literal("all"),
  v.literal("mentions"),
  v.literal("none"),
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
export const MAX_TASK_ASSIGNEES = 10;
export const MAX_TASK_CHECKPOINTS = 100;
export const MAX_TASK_CHECKPOINT_ID_LENGTH = 128;
export const MAX_TASK_PAGE_SIZE = 100;
export const MAX_TABLE_COLUMNS = 64;
export const MAX_TABLE_ROWS = 5_000;
export const MAX_TABLE_CELL_LENGTH = 2_000;
export const MAX_TABLE_LABEL_LENGTH = 120;
/** Jedan uvoz šalje redove u serijama; mutacija ima transakcione limite. */
export const MAX_TABLE_IMPORT_BATCH = 200;
export const MAX_TABLE_PAGE_SIZE = 200;
export const MAX_TASK_DUE_DATE = 253_402_300_799_999;

// --- Chat limiti (docs/mobile/04-CHAT.md) --------------------------------
export const MAX_CHAT_MESSAGE_LENGTH = 10_000;
/** Denormalizovani pregled poslednje poruke u listi razgovora. */
export const CHAT_PREVIEW_LENGTH = 100;
/** Prozor u kome autor sme da izmeni poruku (04-CHAT.md 8, „~15 min"). */
export const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1_000;
export const MAX_CHAT_MENTIONS = 50;
/** Gornja granica čitanja u listama — zaštita, ne očekivanje. */
export const CHAT_CHANNELS_CAP = 200;
export const CHAT_UNREAD_SUMMARY_CAP = 500;
export const CHAT_SEARCH_CAP = 50;
/** Koliko primalaca dobija unread/notifikaciju po poruci pre batch obrasca. */
export const CHAT_RECIPIENTS_CAP = 200;
/**
 * Koliko dugo posle poslednjeg otkucaja korisnik i dalje važi kao „gleda ovaj
 * kanal i stoji na dnu" — jedini slučaj u kome poruka ne pravi obaveštenje.
 *
 * Ovo je MREŽA ZA PAD, ne primarni mehanizam: klijent prisustvo gasi eksplicitno
 * (blur, odlazak sa ekrana, skrol gore). TTL pokriva samo nasilno gašenje app-a i
 * pucanje mreže — i zato mora da postoji: bez njega bi takav korisnik ostao
 * „prisutan" zauvek i više nikad ne bi dobio obaveštenje iz tog kanala.
 */
export const CHAT_PRESENCE_TTL_MS = 45_000;
/** Klijentski interval obnavljanja prisustva — TTL/3, da jedan promašaj ne gasi. */
export const CHAT_PRESENCE_REFRESH_MS = 15_000;

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
  completedAt: v.optional(v.union(v.number(), v.null())),
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
