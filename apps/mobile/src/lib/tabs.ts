/**
 * Tabovi telefona posle prelaska na lični nivo (O1, plan K01 §6) — ČISTO
 * (vitest). Imena fajlova (`Tabs.Screen name`) se NE menjaju (D1): deep linkovi
 * (`devotion://chat`), `router.navigate('/chat')` i typed routes ostaju važeći.
 * Menjaju se naslovi, ikonice (E13) i izvor bedževa (P14).
 */

export type TabName = 'danas' | 'prostor' | 'chat' | 'obavestenja' | 'vise';

export const TAB_ORDER: readonly TabName[] = ['danas', 'prostor', 'chat', 'obavestenja', 'vise'];

/** Naslovi tabova (plan K07 §3): Danas · Prostor · Poruke · Inbox · Više. */
export const TAB_TITLES: Record<TabName, string> = {
  danas: 'Danas',
  prostor: 'Prostor',
  chat: 'Poruke',
  obavestenja: 'Inbox',
  vise: 'Više',
};

/** Opseg taba: globalni tabovi ne čitaju aktivan startup za podatke (plan K01 §6). */
export const TAB_SCOPE: Record<TabName, 'me' | 'startup' | 'app'> = {
  danas: 'me',
  prostor: 'startup',
  chat: 'me',
  obavestenja: 'me',
  vise: 'app',
};

/** Iznad ovoga bedž prikazuje „99+" — dvocifren broj je granica čitljivosti. */
export const BADGE_CAP = 99;

export function badgeLabel(count: number, capped = false): string | undefined {
  if (count <= 0) return undefined;
  if (capped || count > BADGE_CAP) return `${BADGE_CAP}+`;
  return String(count);
}

/** Srpska množina: 1, 21… → one; 2–4, 22–24… → few; ostalo (i 11–14) → many. */
function pluralForm(count: number): 'one' | 'few' | 'many' {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

/** „1 nepročitano", „3 nepročitana", „12 nepročitanih", „više od 99 nepročitanih". */
export function unreadPhrase(count: number, capped = false): string {
  if (capped || count > BADGE_CAP) return 'više od 99 nepročitanih';
  const form = pluralForm(count);
  return `${count} ${form === 'one' ? 'nepročitano' : form === 'few' ? 'nepročitana' : 'nepročitanih'}`;
}

/** „1 nepročitana poruka", „3 nepročitane poruke", „7 nepročitanih poruka". */
export function unreadMessagesPhrase(count: number, capped = false): string {
  if (capped || count > BADGE_CAP) return 'više od 99 nepročitanih poruka';
  const form = pluralForm(count);
  return form === 'one'
    ? `${count} nepročitana poruka`
    : form === 'few'
      ? `${count} nepročitane poruke`
      : `${count} nepročitanih poruka`;
}

export type TabBadge = { label: string | undefined; accessibilityLabel: string };

type InboxCounts = { total: { count: number; capped: boolean } };
type ChatSummary = { total: { unreadCount: number } };

/**
 * Bedž taba Inbox (P14): broj nepročitanih obaveštenja iz SVIH startupa i
 * ličnih poruka (`inbox.unreadCounts.total`). Dok upit ne stigne (ili padne),
 * bedža nema, a tab se čita samo po imenu.
 */
export function inboxBadge(counts: InboxCounts | null | undefined): TabBadge {
  const title = TAB_TITLES.obavestenja;
  if (!counts || counts.total.count <= 0) return { label: undefined, accessibilityLabel: title };
  return {
    label: badgeLabel(counts.total.count, counts.total.capped),
    accessibilityLabel: `${title}, ${unreadPhrase(counts.total.count, counts.total.capped)}`,
  };
}

/**
 * Bedž taba Poruke (P14): nepročitane poruke svih aktivnih startupa + lične
 * (`chat.unreadSummary.total`, D3 — napušteni startupi se ne broje).
 */
export function chatBadge(summary: ChatSummary | null | undefined): TabBadge {
  const title = TAB_TITLES.chat;
  const count = summary?.total.unreadCount ?? 0;
  if (count <= 0) return { label: undefined, accessibilityLabel: title };
  return {
    label: badgeLabel(count),
    accessibilityLabel: `${title}, ${unreadMessagesPhrase(count)}`,
  };
}

