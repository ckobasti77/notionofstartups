import type { FunctionReturnType } from 'convex/server';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

// Tipovi izvedeni iz backend povratnih vrednosti — jedan izvor istine, isti kao
// na webu (apps/web/lib/chat.ts). Sve tri liste vraćaju isti oblik kanala.
export type ChatChannel = FunctionReturnType<typeof api.chat.listChannels>[number];
export type ChatChannelKind = ChatChannel['kind'];
/** Jedna poruka iz paginirane `api.chat.messages` (isti izvor istine kao web). */
export type ChatMessage = FunctionReturnType<typeof api.chat.messages>['page'][number];
export type ChatReaction = ChatMessage['reactions'][number];
/** Član startupa (za @-pominjanja i imena autora) iz `startups.listMembers`. */
export type ChatMember = FunctionReturnType<typeof api.startups.listMembers>[number];

/** Segmenti liste razgovora u traženom redosledu (docs/mobile/02-EKRANI.md §6). */
export const CHAT_SEGMENTS = [
  { id: 'channels', label: 'Kanali' },
  { id: 'direct', label: 'Direktne' },
  { id: 'threads', label: 'Praćeno' },
] as const;
export type ChatSegmentId = (typeof CHAT_SEGMENTS)[number]['id'];

/**
 * Kanali za segment „Kanali": opšti kanal + kanali oblasti/prilagođeni. DM i
 * threadovi imaju svoje segmente, pa se ovde izostavljaju. Redosled: „Opšte"
 * uvek prvo, pa ostali po vremenu poslednje poruke (backend već sortira opadajuće).
 */
export function channelsForSegment(channels: ChatChannel[]): ChatChannel[] {
  return channels
    .filter(
      (channel) =>
        channel.kind === 'startup' ||
        channel.kind === 'area' ||
        channel.kind === 'custom',
    )
    .sort((a, b) => {
      if (a.kind === 'startup') return -1;
      if (b.kind === 'startup') return 1;
      return b.lastMessageAt - a.lastMessageAt;
    });
}

/** Prikazano ime kanala: DM nosi ime sagovornika, opšti kanal je „Opšte". */
export function channelDisplayName(channel: ChatChannel): string {
  if (channel.kind === 'dm') {
    return channel.otherParticipant?.displayName ?? 'Direktna poruka';
  }
  if (channel.kind === 'startup') return channel.name || 'Opšte';
  return channel.name || 'Razgovor';
}

/**
 * Pregled poslednje poruke za red liste. Za kanale/threadove prefiksujemo ime
 * autora („Marko: …") kao u maketi; za DM to je suvišno. Bez poruka → „Bez poruka".
 */
export function channelPreview(channel: ChatChannel): string {
  if (channel.messageCount === 0 || channel.lastMessagePreview.length === 0) {
    return 'Bez poruka';
  }
  if (channel.kind !== 'dm' && channel.lastMessageAuthor) {
    const firstName = channel.lastMessageAuthor.displayName.split(/\s+/)[0];
    return `${firstName}: ${channel.lastMessagePreview}`;
  }
  return channel.lastMessagePreview;
}

const shortTime = new Intl.DateTimeFormat('sr-Latn-RS', {
  hour: '2-digit',
  minute: '2-digit',
});
const shortWeekday = new Intl.DateTimeFormat('sr-Latn-RS', { weekday: 'short' });
const shortDate = new Intl.DateTimeFormat('sr-Latn-RS', {
  day: 'numeric',
  month: 'numeric',
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Vreme poslednje poruke za listu: danas → „14:22", juče → „juče", u poslednjih
 * 7 dana → dan u nedelji, inače → „5.8.". Prazan string kad kanal nema poruka.
 */
export function formatListTimestamp(channel: ChatChannel): string {
  if (channel.messageCount === 0) return '';
  const then = new Date(channel.lastMessageAt);
  const now = new Date();

  if (isSameDay(then, now)) return shortTime.format(then);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(then, yesterday)) return 'juče';

  const weekAgo = now.getTime() - 6 * 24 * 60 * 60 * 1_000;
  if (channel.lastMessageAt >= weekAgo) return shortWeekday.format(then);

  return shortDate.format(then);
}

// ── Ekran razgovora ──────────────────────────────────────────────────────────
// Čiste funkcije za mehuriće, grupisanje i separatore. Portovano sa web
// `apps/web/lib/chat.ts` — ista logika, bez DOM-a.

/** „1 poruka", „3 poruke", „7 poruka" — srpska pluralizacija (ogledalo weba). */
export function porukaWord(count: number): string {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return 'poruka';
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return 'poruke';
  }
  return 'poruka';
}

/** Curirani brzi set reakcija (bez emoji biblioteke), isti kao na webu. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅', '🙏', '🔥'] as const;

const dayLong = new Intl.DateTimeFormat('sr-Latn-RS', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Da li su dva trenutka istog kalendarskog dana. */
export function sameDay(a: number, b: number): boolean {
  return isSameDay(new Date(a), new Date(b));
}

/** Vreme poruke: „14:07" (sr-Latn-RS). */
export function formatMessageTime(ts: number): string {
  return shortTime.format(new Date(ts));
}

/** Labela dnevnog separatora: „Danas" / „Juče" / pun datum. */
export function formatDaySeparator(ts: number): string {
  const then = new Date(ts);
  const now = new Date();
  if (isSameDay(then, now)) return 'Danas';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(then, yesterday)) return 'Juče';
  return dayLong.format(then);
}

/**
 * Da li dve uzastopne poruke dele zaglavlje autora (grupisanje). Uslov: isti
 * autor, obe nesistemske, u razmaku kraćem od 5 minuta i istog dana.
 */
const GROUP_WINDOW_MS = 5 * 60 * 1_000;
export function shouldGroupWithPrevious(
  message: ChatMessage,
  previous: ChatMessage | undefined,
): boolean {
  if (previous === undefined) return false;
  if (message.authorProfileId === null || previous.authorProfileId === null) {
    return false;
  }
  return (
    message.authorProfileId === previous.authorProfileId &&
    message.createdAt - previous.createdAt < GROUP_WINDOW_MS &&
    sameDay(message.createdAt, previous.createdAt)
  );
}

/**
 * Deli telo poruke na segmente teksta i pominjanja radi isticanja. Pominjanje se
 * prepoznaje kao `@Ime` gde `Ime` odgovara prikazanom imenu pomenutog profila.
 * Duža imena imaju prednost kod poklapanja.
 */
export type MessageSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string };

export function splitMentions(
  body: string,
  mentionNames: string[],
): MessageSegment[] {
  const names = [...new Set(mentionNames.filter((name) => name.trim().length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  if (names.length === 0) return [{ kind: 'text', value: body }];

  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`@(?:${escaped.join('|')})`, 'g');

  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ kind: 'text', value: body.slice(lastIndex, start) });
    }
    segments.push({ kind: 'mention', value: match[0] });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ kind: 'text', value: body.slice(lastIndex) });
  }
  return segments;
}

export type MentionQuery = { start: number; query: string };

/**
 * Aktivni `@token` neposredno PRE KURSORA — port web `chat/mention-textarea.tsx`
 * (`findMentionQuery`). Token počinje `@` na početku unosa ili posle razmaka /
 * `(` / `<`, i ne sme da sadrži razmak.
 *
 * Zašto od kursora unazad, a ne `lastIndexOf('@')`: mobilni je do faze P3 gledao
 * poslednji `@` u CELOM tekstu i pri izboru brisao sve iza njega — pomen usred
 * rečenice je gutao ostatak poruke. Ovako se gleda samo reč pod kursorom.
 */
export function findMentionQuery(value: string, caret: number): MentionQuery | null {
  let index = Math.min(caret, value.length) - 1;
  while (index >= 0) {
    const char = value[index];
    if (char === '@') {
      const before = index === 0 ? ' ' : value[index - 1];
      if (index === 0 || /\s|[(<]/.test(before)) {
        return { start: index, query: value.slice(index + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(char)) return null;
    index -= 1;
  }
  return null;
}

/**
 * Izvlači id-jeve pomenutih profila iz teksta pri slanju: član je pomenut ako se
 * `@Ime` (njegovo prikazano ime) pojavljuje kao ceo token. Negativni lookahead
 * sprečava da `@Ana` upadne u `@Anastasija`.
 */
export function resolveMentions(
  body: string,
  members: Array<{ profile: { _id: Id<'profiles'>; displayName: string } }>,
): Id<'profiles'>[] {
  const ids: Id<'profiles'>[] = [];
  for (const { profile } of members) {
    const name = profile.displayName?.trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, 'u');
    if (regex.test(body)) ids.push(profile._id);
  }
  return ids;
}

/** Trajanje glasovne poruke: „0:07" / „1:23". */
export function formatVoiceDuration(ms: number | null): string {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Veličina fajla: „842 B" / „12,3 KB" / „4,1 MB". */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const rounded = size >= 100 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${rounded.toLocaleString('sr-Latn-RS')} ${units[unit]}`;
}

/**
 * Privremeni `_id` optimističke poruke. RN Hermes nema `crypto.randomUUID`, pa
 * pravimo prepoznatljiv id (prefiks) — mehurić po njemu prikazuje „šalje se", a
 * kad server potvrdi, Convex ga zameni pravom porukom sa pravim id-jem.
 */
export const OPTIMISTIC_ID_PREFIX = 'optimistic-';
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}
