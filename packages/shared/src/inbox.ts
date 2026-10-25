/**
 * Inbox (K14, plan K07 §1.5) — ČISTA logika koju dele web i telefon: grupisanje
 * po danima, izbor cilja za klik, argumenti upita po opsegu/segmentu, brojači,
 * tekstovi praznih stanja i stavke „Čeka tebe". Bez React-a i bez Convex tipova
 * (id-jevi su stringovi; klijent ih kastuje u `Id<...>` na ivici).
 */
import { addDaysToKey, dayKeyOf, formatClock, formatDayRelative } from "./dates";

// --- Segmenti i opseg --------------------------------------------------------

export type InboxSegment = "all" | "unread" | "pending";

/** Segmenti redom prikaza (plan K07 §3: „Sve" · „Nepročitano" · „Čeka tebe"). */
export const INBOX_SEGMENTS: ReadonlyArray<{ key: InboxSegment; label: string }> = [
  { key: "all", label: "Sve" },
  { key: "unread", label: "Nepročitano" },
  { key: "pending", label: "Čeka tebe" },
];

/** Čip opsega: svi, samo lično ili jedan startup. */
export type InboxScope =
  | { kind: "all" }
  | { kind: "personal" }
  | { kind: "startup"; startupId: string };

export function inboxScopeKey(scope: InboxScope): string {
  return scope.kind === "startup" ? `startup:${scope.startupId}` : scope.kind;
}

export type InboxFeedArgs = { startupId?: string | null; unreadOnly?: boolean };

/**
 * Argumenti `inbox.feed` (bez `paginationOpts`): „Lično" šalje `startupId: null`,
 * „Svi" izostavlja polje. Segment „Čeka tebe" ne koristi feed — vraća isto što i
 * „Sve" da hook može da bude uvek pretplaćen na istu listu.
 */
export function inboxFeedArgs(scope: InboxScope, segment: InboxSegment): InboxFeedArgs {
  const args: InboxFeedArgs = {};
  if (scope.kind === "personal") args.startupId = null;
  else if (scope.kind === "startup") args.startupId = scope.startupId;
  if (segment === "unread") args.unreadOnly = true;
  return args;
}

export type InboxMarkAllArgs = { startupId?: string | null };

/** Argumenti `inbox.markAllRead`: „Označi sve" poštuje čip opsega (K07 §1.5). */
export function inboxMarkAllArgs(scope: InboxScope): InboxMarkAllArgs {
  if (scope.kind === "personal") return { startupId: null };
  if (scope.kind === "startup") return { startupId: scope.startupId };
  return {};
}

/** Strukturni oblik odgovora `inbox.unreadCounts`. */
export type InboxCounts = {
  total: { count: number; capped: boolean };
  byStartup: ReadonlyArray<{ startupId: string; count: number; capped: boolean }>;
  personal: { count: number; capped: boolean };
};

/** Nepročitano u izabranom opsegu (`byStartup` nema startup bez nepročitanog → 0). */
export function inboxUnreadFor(
  counts: InboxCounts,
  scope: InboxScope,
): { count: number; capped: boolean } {
  if (scope.kind === "all") return counts.total;
  if (scope.kind === "personal") return counts.personal;
  const entry = counts.byStartup.find((item) => item.startupId === scope.startupId);
  return entry
    ? { count: entry.count, capped: entry.capped }
    : { count: 0, capped: counts.total.capped };
}

/** „12", a od 100 naviše ili kad je brojač odsečen „99+" (isto kao bedževi). */
export function inboxCountLabel(count: number, capped = false): string {
  return capped || count > 99 ? "99+" : String(count);
}

/** Reč uz broj: 1, 21 → „nepročitano"; 2–4, 22–24 → „nepročitana"; ostalo (i 11–14) → „nepročitanih". */
export function inboxUnreadWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "nepročitano";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "nepročitana";
  return "nepročitanih";
}

// --- Grupisanje po danima ----------------------------------------------------

export type InboxDayGroup<T> = {
  key: "today" | "yesterday" | "earlier";
  title: "Danas" | "Juče" | "Ranije";
  items: T[];
};

const DAY_GROUPS: ReadonlyArray<Pick<InboxDayGroup<never>, "key" | "title">> = [
  { key: "today", title: "Danas" },
  { key: "yesterday", title: "Juče" },
  { key: "earlier", title: "Ranije" },
];

/**
 * Grupiše stavke (najnovije prvo) na Danas / Juče / Ranije po lokalnom kalendarskom
 * danu (`zone` samo za testove i server). Redosled unutar grupe je ulazni; prazne
 * grupe se izostavljaju. Vreme iz budućnosti (razlika satova) pada u „Danas".
 */
export function groupInboxByDay<T extends { createdAt: number }>(
  items: ReadonlyArray<T>,
  now: number,
  zone?: string,
): InboxDayGroup<T>[] {
  const today = dayKeyOf(now, zone);
  const yesterday = addDaysToKey(today, -1);
  const buckets: Record<InboxDayGroup<T>["key"], T[]> = { today: [], yesterday: [], earlier: [] };
  for (const item of items) {
    const key = dayKeyOf(item.createdAt, zone);
    // Ključevi `YYYY-MM-DD` se porede leksikografski kao datumi.
    if (key >= today) buckets.today.push(item);
    else if (key === yesterday) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  }
  return DAY_GROUPS.filter((group) => buckets[group.key].length > 0).map((group) => ({
    ...group,
    items: buckets[group.key],
  }));
}

/** Vreme u redu: danas „09:12", juče „juče", ranije „uto 27. okt" (druga godina numerički). */
export function formatInboxTime(createdAt: number, now: number, zone?: string): string {
  return dayKeyOf(createdAt, zone) >= dayKeyOf(now, zone)
    ? formatClock(createdAt, zone)
    : formatDayRelative(createdAt, now, zone);
}

// --- Cilj klika --------------------------------------------------------------

/** Ono što `inboxTarget` čita iz stavke feed-a (ili iz „Čeka tebe"). */
export type InboxTargetItem = {
  targetType: string;
  targetId: string | null;
  /** `null` = lično obaveštenje (poruka iz ličnog razgovora). */
  startupId: string | null;
};

/**
 * Gde vodi klik na stavku:
 *  - startup obaveštenje → `startup` sa Id-jem startupa i klijent-neutralnom
 *    destinacijom (`notificationDestination`: ekran + entitet);
 *  - lična poruka → `personal-chat` (razgovor po id-ju, BEZ promene startupa;
 *    `channelId: null` otvara listu Poruka);
 *  - lično obaveštenje bilo kog drugog tipa → `none` (označi pročitano, ostani).
 */
export type InboxTarget<D> =
  | { kind: "startup"; startupId: string; destination: D }
  | { kind: "personal-chat"; channelId: string | null }
  | { kind: "none" };

/**
 * `resolve` je `notificationDestination` iz `convex/lib/notificationTarget.ts`
 * (JEDAN izvor istine za cilj obaveštenja, deli ga i push); prosleđuje ga
 * pozivalac jer shared ne uvozi backend.
 */
export function inboxTarget<D>(
  item: InboxTargetItem,
  resolve: (targetType: string, targetId: string | null, startupId: string | null) => D,
): InboxTarget<D> {
  if (item.startupId === null) {
    return item.targetType === "chat"
      ? { kind: "personal-chat", channelId: item.targetId }
      : { kind: "none" };
  }
  return {
    kind: "startup",
    startupId: item.startupId,
    destination: resolve(item.targetType, item.targetId, item.startupId),
  };
}

// --- „Čeka tebe" -------------------------------------------------------------

/** Strukturni oblik stavke `inbox.pending`. */
export type PendingItemLike =
  | {
      kind: "deletion_vote";
      ballotId: string;
      title: string;
      startup: { _id: string };
    }
  | {
      kind: "page_nesting" | "idea_nesting";
      requestId: string;
      childTitle: string;
      parentTitle: string;
      requesterName: string | null;
      startup: { _id: string };
    };

/** Tekst stavke „Čeka tebe" (plan K07 §3, Inbox). */
export function pendingTitle(item: PendingItemLike): string {
  if (item.kind === "deletion_vote") return `Glasanje o brisanju: „${item.title}“`;
  const who = item.requesterName ?? "Neko";
  return `${who} predlaže da „${item.childTitle}“ pređe pod „${item.parentTitle}“`;
}

/** Stabilan ključ stavke (listić ili zahtev). */
export function pendingKey(item: PendingItemLike): string {
  return item.kind === "deletion_vote" ? `vote:${item.ballotId}` : `${item.kind}:${item.requestId}`;
}

/** „Čeka tebe" u izabranom opsegu: lično nikad nema odobrenja, startup filtrira. */
export function inboxPendingFor<T extends { startup: { _id: string } }>(
  items: ReadonlyArray<T>,
  scope: InboxScope,
): T[] {
  if (scope.kind === "all") return [...items];
  if (scope.kind === "personal") return [];
  return items.filter((item) => item.startup._id === scope.startupId);
}

// --- Tekstovi ----------------------------------------------------------------

export type InboxEmptyCopy = { title: string; description: string };

/** Prazno stanje po segmentu; sa čipom opsega kaže da je prazan baš taj opseg. */
export function inboxEmptyCopy(segment: InboxSegment, scope: InboxScope): InboxEmptyCopy {
  const filtered = scope.kind !== "all";
  if (segment === "unread") {
    return {
      title: "Sve je pročitano",
      description: filtered
        ? "Za ovaj filter nema nepročitanih obaveštenja."
        : "Nova obaveštenja će se pojaviti ovde.",
    };
  }
  if (segment === "pending") {
    return {
      title: "Niko ne čeka tvoju odluku",
      description:
        scope.kind === "personal"
          ? "Lične poruke nemaju odobrenja. Izaberi „Svi“ ili startup."
          : filtered
            ? "U ovom startupu ništa ne čeka tvoju odluku."
            : "Glasanja o brisanju i predlozi za premeštanje stižu ovde.",
    };
  }
  return filtered
    ? { title: "Nema obaveštenja", description: "Za ovaj filter još nema obaveštenja." }
    : {
        title: "Inbox je prazan",
        description: "Obaveštenja iz svih startupa i ličnih poruka stižu ovde.",
      };
}

/** Poruka posle „Označi sve" (`inbox.markAllRead` vraća `marked` i `hasMore`). */
export function inboxMarkedMessage(result: { marked: number; hasMore: boolean }): string {
  if (result.marked === 0) return "Nema nepročitanih obaveštenja.";
  if (result.hasMore) return `Označeno je prvih ${result.marked}, ostalo se označava.`;
  return `Označeno kao pročitano: ${result.marked}.`;
}
