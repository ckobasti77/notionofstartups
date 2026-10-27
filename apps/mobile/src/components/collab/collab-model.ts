/**
 * Čista logika zajedničkih komponenti saradnje na telefonu (PROSTOR K12, plan K07
 * §6): prisustvo („<Ime> uređuje"), Istorija izmena, konflikt, zaključano i
 * komentari. Blizanac `apps/web/components/collab/collab-model.ts` — isti
 * tekstovi i ista pravila, bez React-a i bez Convex klijenta, pa se testira u
 * `collab-model.test.ts`. Ono što je zajedničko živi u `@devotion/shared`.
 */
import {
  dayKeyOf,
  filterPeople,
  formatClock,
  formatDateShort,
  formatDayRelative,
  formatEditTime,
  parseCommentSegments,
  type MentionCandidate,
} from '@devotion/shared';

import { isPresenceFresh } from '@/convex/lib/pagePresence';
import { accessErrorCode } from '@/lib/errors';

// --- Prisustvo ---------------------------------------------------------------

export type PresenceRow = {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  editing: boolean;
  expiresAt: number;
};

/**
 * Ko trenutno uređuje (P23): samo sveži redovi (`expiresAt > now`, TTL računa
 * klijent jer upit ne čita sat) sa `editing: true`, bez duplikata, abecedno.
 */
export function activeEditors<Row extends PresenceRow>(
  rows: ReadonlyArray<Row> | undefined,
  now: number,
): Row[] {
  if (!rows) return [];
  const seen = new Set<string>();
  const result: Row[] = [];
  for (const row of rows) {
    if (!row.editing || !isPresenceFresh(row.expiresAt, now) || seen.has(row.profileId)) continue;
    seen.add(row.profileId);
    result.push(row);
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName, 'sr-Latn'));
}

export function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === '') return 'Član tima';
  return trimmed.split(/\s+/)[0];
}

/** „Ana uređuje" · „Ana i Marko uređuju" · „Ana i još 2 uređuju"; prazno = `null`. */
export function presenceLabel(names: ReadonlyArray<string>): string | null {
  if (names.length === 0) return null;
  const first = firstName(names[0]);
  if (names.length === 1) return `${first} uređuje`;
  if (names.length === 2) return `${first} i ${firstName(names[1])} uređuju`;
  return `${first} i još ${names.length - 1} uređuju`;
}

/**
 * Posle ovoliko od poslednjeg unosa „uređuješ" prestaje da važi — isto kao
 * otkucaj na webu (`PAGE_PRESENCE_REFRESH_MS`).
 */
export const EDITING_IDLE_MS = 15_000;
/** Prvi unos posle tišine šalje otkucaj odmah, ali ne češće od ovoga. */
export const EAGER_HEARTBEAT_GAP_MS = 3_000;

/** „Uređuješ" = pravo izmene ∧ unos u poslednjih `EDITING_IDLE_MS`. */
export function isEditingNow(input: {
  canEdit: boolean;
  lastActivityAt: number;
  now: number;
}): boolean {
  return input.canEdit && input.now - input.lastActivityAt < EDITING_IDLE_MS;
}

/**
 * Da li prvi unos posle tišine treba odmah da javi „uređujem" (bez čekanja na
 * sledeći otkucaj): samo ako server to još ne zna i nije skoro slato.
 */
export function shouldSendEagerHeartbeat(input: {
  canEdit: boolean;
  reportedEditing: boolean;
  lastSentAt: number;
  now: number;
}): boolean {
  return (
    input.canEdit &&
    !input.reportedEditing &&
    input.now - input.lastSentAt > EAGER_HEARTBEAT_GAP_MS
  );
}

// --- Istorija izmena ----------------------------------------------------------

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toLocaleUpperCase('sr-Latn') + value.slice(1);
}

/** „Danas" · „Juče" · „Uto 27. okt" — naslov grupe revizija jednog dana. */
export function revisionDayLabel(ms: number, nowMs: number, zone?: string): string {
  return capitalize(formatDayRelative(ms, nowMs, zone));
}

export type RevisionDayGroup<Revision> = { key: string; label: string; items: Revision[] };

/**
 * Revizije (stižu najnovije prve) u grupe po lokalnom danu, istim redom. Dan
 * revizije je dan njene poslednje izmene (`updatedAt`, spajanje u 10 min).
 */
export function groupRevisionsByDay<Revision extends { updatedAt: number }>(
  revisions: ReadonlyArray<Revision>,
  nowMs: number,
  zone?: string,
): Array<RevisionDayGroup<Revision>> {
  const groups: Array<RevisionDayGroup<Revision>> = [];
  for (const revision of revisions) {
    const key = dayKeyOf(revision.updatedAt, zone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(revision);
    } else {
      groups.push({ key, label: revisionDayLabel(revision.updatedAt, nowMs, zone), items: [revision] });
    }
  }
  return groups;
}

export type RevisionListEntry<Revision> =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'revision'; key: string; revision: Revision };

/** Grupe po danu spljoštene u jednu listu (naslov dana, pa njegove revizije) za `FlatList`. */
export function revisionListEntries<Revision extends { _id: string; updatedAt: number }>(
  revisions: ReadonlyArray<Revision>,
  nowMs: number,
  zone?: string,
): Array<RevisionListEntry<Revision>> {
  const entries: Array<RevisionListEntry<Revision>> = [];
  for (const group of groupRevisionsByDay(revisions, nowMs, zone)) {
    entries.push({ kind: 'day', key: `day:${group.key}`, label: group.label });
    for (const revision of group.items) {
      entries.push({ kind: 'revision', key: revision._id, revision });
    }
  }
  return entries;
}

/** Trenutak verzije za potvrdu i obaveštenje: „danas u 09:30", „juče u 18:05", „sub 24. okt u 09:30". */
export function revisionMoment(ms: number, nowMs: number, zone?: string): string {
  const day = formatDayRelative(ms, nowMs, zone);
  const label = day === 'danas' || day === 'juče' ? day : formatDateShort(ms, zone);
  return `${label} u ${formatClock(ms, zone)}`;
}

export function restoreConfirmTitle(ms: number, nowMs: number, zone?: string): string {
  return `Vratiti verziju od ${revisionMoment(ms, nowMs, zone)}?`;
}

/** Ishod „Vrati ovu verziju" (K07 R2: `changed: false` kad je verzija ista kao trenutna). */
export function restoreOutcomeMessage(
  changed: boolean,
  ms: number,
  nowMs: number,
  zone?: string,
): string {
  return changed
    ? `Vraćena je verzija od ${revisionMoment(ms, nowMs, zone)}.`
    : 'Ova verzija je ista kao trenutna.';
}

// --- Konflikt i zaključavanje ---------------------------------------------------

export type ConflictSubject = 'page' | 'area' | 'task';

export const UNKNOWN_EDITOR = 'Neko iz tima';

export type ConflictInfo = {
  /** Revizija na serveru; `null` kad je greška iz starog oblika (samo tekst). */
  currentRevision: number | null;
  updatedByProfileId: string | null;
  updatedAt: number | null;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Konflikt revizije (K07 R1): `ConvexError` sa kodom `KONFLIKT_IZMENA` i
 * podacima o trenutnoj verziji; stari oblik (samo tekst) se i dalje prepoznaje.
 */
export function conflictFromError(error: unknown): ConflictInfo | null {
  if (accessErrorCode(error) === 'KONFLIKT_IZMENA') {
    const data = (error as Error & { data?: Record<string, unknown> }).data ?? {};
    const updatedBy = data.updatedByProfileId;
    return {
      currentRevision: numberOrNull(data.currentRevision),
      updatedByProfileId: typeof updatedBy === 'string' ? updatedBy : null,
      updatedAt: numberOrNull(data.updatedAt),
    };
  }
  if (String(error).includes('KONFLIKT_IZMENA')) {
    return { currentRevision: null, updatedByProfileId: null, updatedAt: null };
  }
  return null;
}

/** Tekst konflikta (K07 §6.5); telo kaže ko je sačuvao i kad. */
export function conflictCopy(input: {
  subject: ConflictSubject;
  updaterName: string | null;
  updatedAt: number | null;
  now: number;
}): { title: string; body: string } {
  const title =
    input.subject === 'area'
      ? 'Neko je u međuvremenu izmenio opis oblasti'
      : input.subject === 'task'
        ? 'Neko je u međuvremenu izmenio zadatak'
        : 'Neko je u međuvremenu izmenio stranicu';
  const name = input.updaterName?.trim() || UNKNOWN_EDITOR;
  const when =
    input.updatedAt !== null && input.updatedAt > 0
      ? ` ${formatEditTime(input.updatedAt, input.now)}`
      : '';
  return { title, body: `${name} je sačuvao/la izmenu${when}. Tvoja verzija još nije sačuvana.` };
}

/** Potvrda „Prepiši": tuđa verzija ostaje u Istoriji izmena. */
export const OVERWRITE_NOTICE = 'Tuđa verzija ostaje u Istoriji izmena.';

export const LOCK_NOTICE =
  'Zaključano. Menjaju je autor, vlasnik startupa i admin — ti možeš da komentarišeš.';

/** Isto za zadatak (muški rod); izvršilac na zaključanom zadatku još menja status i korake. */
export const LOCK_NOTICE_TASK =
  'Zaključano. Menjaju ga autor, vlasnik startupa i admin — ti možeš da komentarišeš. Izvršilac menja status i završava korake.';

/** Opis oznake „Zaključano": „Zaključao/la Ana · 24. okt u 09:30". */
export function lockedByLabel(input: {
  lockedByName: string | null;
  lockedAt: number | null;
  now: number;
}): string {
  const who = `Zaključao/la ${input.lockedByName?.trim() || UNKNOWN_EDITOR}`;
  return input.lockedAt === null ? who : `${who} · ${revisionMoment(input.lockedAt, input.now)}`;
}

/** Meta red ispod naslova: „Ana · izmenio/la Marko pre 5 min · Zaključano". */
export function pageMetaLine(input: {
  creatorName: string | null;
  updaterName: string | null;
  updatedAt: number;
  now: number;
  locked: boolean;
}): string {
  const parts: string[] = [];
  if (input.creatorName) parts.push(input.creatorName);
  const when = formatEditTime(input.updatedAt, input.now);
  parts.push(input.updaterName ? `izmenio/la ${input.updaterName} ${when}` : `izmena ${when}`);
  if (input.locked) parts.push('Zaključano');
  return parts.join(' · ');
}

// --- Komentari -----------------------------------------------------------------

/** Ko se prikazuje kao autor komentara (`legacy_shared` = raniji zajednički tekst). */
export function commentAuthorName(comment: {
  origin: 'comment' | 'legacy_entry' | 'legacy_shared';
  author: { displayName: string } | null;
}): string {
  if (comment.origin === 'legacy_shared' || comment.author === null) return 'Raniji tekst tima';
  return comment.author.displayName;
}

/** Meta reda komentara: „pre 5 min · izmenjeno · Odbijeno ranije". */
export function commentMeta(
  comment: {
    createdAt: number;
    edited: boolean;
    moderationStatus: 'pending' | 'approved' | 'rejected';
  },
  now: number,
): string {
  const parts = [formatEditTime(comment.createdAt, now)];
  if (comment.edited) parts.push('izmenjeno');
  if (comment.moderationStatus === 'rejected') parts.push('Odbijeno ranije');
  return parts.join(' · ');
}

/** Sadržaj komentara kao običan tekst jednog reda (isečak u redu „Komentari"). */
export function commentExcerpt(content: string, maxLength = 90): string {
  let result = '';
  for (const segment of parseCommentSegments(content)) {
    if (segment.kind === 'break') result += ' ';
    else result += segment.kind === 'text' ? segment.text : segment.label;
  }
  const flat = result.replace(/\s+/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat;
}

/**
 * Sačuvan komentar → tekst za polje i spisak pominjanja (izmena u mestu).
 * Obrnuto od `serializeComment`: `@Ime` ostaje u tekstu, a pominjanje se
 * ponovo prepoznaje dok god „@Ime" stoji u polju.
 */
export function commentToDraft(content: string): { text: string; mentions: MentionCandidate[] } {
  let text = '';
  const mentions: MentionCandidate[] = [];
  for (const segment of parseCommentSegments(content)) {
    if (segment.kind === 'break') text += '\n';
    else if (segment.kind === 'text') text += segment.text;
    else {
      text += segment.label;
      const displayName = segment.label.replace(/^@/, '');
      if (displayName !== '' && !mentions.some((mention) => mention.profileId === segment.profileId)) {
        mentions.push({ profileId: segment.profileId, displayName });
      }
    }
  }
  return { text, mentions };
}

/** Najviše predloga u listi za @. */
export const MENTION_SUGGESTIONS_MAX = 6;

/**
 * Kandidati za @ (bez autora komentara): po rečima upita, bez dijakritika,
 * abecedno, najviše `MENTION_SUGGESTIONS_MAX`.
 */
export function mentionSuggestions<Member extends MentionCandidate>(
  members: ReadonlyArray<Member>,
  query: string,
  selfProfileId: string | null,
): Member[] {
  const others = members.filter(
    (member) => member.profileId !== selfProfileId && member.displayName.trim() !== '',
  );
  return filterPeople(others, query)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'sr-Latn'))
    .slice(0, MENTION_SUGGESTIONS_MAX);
}

/** Pominjanja koja i dalje stoje u tekstu (obrisano „@Ime" ispada), bez duplikata. */
export function keptMentions<Member extends MentionCandidate>(
  text: string,
  mentions: ReadonlyArray<Member>,
): Member[] {
  const result: Member[] = [];
  for (const mention of mentions) {
    if (result.some((item) => item.profileId === mention.profileId)) continue;
    if (text.includes(`@${mention.displayName}`)) result.push(mention);
  }
  return result;
}

/** Naslov reda „Komentari · 4"; preko granice servera „20+" (`capped`). */
export function commentsEntryTitle(count: number | null, capped: boolean): string {
  if (count === null) return 'Komentari';
  return `Komentari · ${count}${capped ? '+' : ''}`;
}
