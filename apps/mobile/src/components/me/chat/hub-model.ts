/**
 * Poruke na telefonu (K16) — čista logika ekrana koja NIJE zajednička sa webom
 * (sekcije `SectionList`-a, radnje dugog pritiska, pamćenje sklopljenih grupa,
 * tekst zaglavlja). Sve što je isto na obe strane (grupisanje, pretraga, ime i
 * pregled reda, množine, pominjanja, nacrt grupe, dozvole) uvozi se iz
 * `@devotion/shared` (`chat-hub.ts`). Bez React-a i bez RN-a (vitest).
 */
import {
  hubMentionLabel,
  hubUnreadLabel,
  PERSONAL_HUB_KEY,
  type HubChannel,
  type HubGroup,
} from '@devotion/shared';

// --- Sklopljene grupe ----------------------------------------------------------

/** Najviše ovoliko zapamćenih ključeva (`SecureStore` upozorava preko 2 KB). */
export const HUB_COLLAPSED_MAX = 40;

/**
 * Zapamćene sklopljene grupe iz sirovog zapisa. Pokvaren zapis ili tuđ oblik
 * daju praznu listu; „Lično" se nikad ne sklapa, pa se ni ne vraća.
 */
export function parseHubCollapsed(raw: string | null): Set<string> {
  if (raw === null || raw.length === 0) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((item): item is string => typeof item === 'string' && item !== PERSONAL_HUB_KEY)
        .slice(0, HUB_COLLAPSED_MAX),
    );
  } catch {
    return new Set();
  }
}

/** Zapis za `SecureStore`: samo ključevi startupa, najnoviji izbor zadržan. */
export function serializeHubCollapsed(keys: ReadonlySet<string>): string {
  const list = [...keys].filter((key) => key !== PERSONAL_HUB_KEY);
  return JSON.stringify(list.slice(Math.max(0, list.length - HUB_COLLAPSED_MAX)));
}

/** Sklopi / rasklopi grupu (novi `Set`, ulaz se ne menja). */
export function toggleHubCollapsed(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// --- Sekcije liste -------------------------------------------------------------

export type HubSection<C extends HubChannel = HubChannel> = {
  key: string;
  group: HubGroup<C>;
  /** Redovi sekcije; sklopljena grupa nema redove (zaglavlje ostaje). */
  data: C[];
};

/** Grupe huba (`hubGroups`) → sekcije `SectionList`-a. */
export function hubSections<C extends HubChannel>(
  groups: ReadonlyArray<HubGroup<C>>,
): HubSection<C>[] {
  return groups.map((group) => ({
    key: group.key,
    group,
    data: group.collapsed ? [] : group.channels,
  }));
}

/** Broj redova koji se vide (za odluku o layout animacijama, E12). */
export function hubVisibleRowCount(sections: ReadonlyArray<HubSection>): number {
  return sections.reduce((total, section) => total + section.data.length, 0);
}

// --- Tekst -----------------------------------------------------------------------

/**
 * Podnaslov zaglavlja: ukupno nepročitano (isti izvor kao bedž taba,
 * `chat.unreadSummary.total`). `null` dok brojač ne stigne → bez podnaslova.
 */
export function hubHeaderSubtitle(total: { unreadCount: number } | null): string | undefined {
  if (total === null) return undefined;
  if (total.unreadCount <= 0) return 'Sve je pročitano';
  if (total.unreadCount > 99) return 'Više od 99 nepročitanih poruka';
  return hubUnreadLabel(total.unreadCount);
}

/** Šta čitač ekrana čita za red: ime, nepročitano, pregled, mesto, vreme. */
export function hubRowAccessibilityLabel(
  channel: Pick<HubChannel, 'unreadCount' | 'mentionCount' | 'notificationLevel'>,
  parts: { name: string; preview: string; time: string; place: string | null },
): string {
  const unread =
    channel.mentionCount > 0
      ? hubMentionLabel(channel.mentionCount)
      : channel.unreadCount > 0
        ? channel.notificationLevel === 'mentions'
          ? 'Ima novih poruka'
          : hubUnreadLabel(channel.unreadCount)
        : null;
  return [parts.name, unread, parts.preview, parts.place, parts.time]
    .filter((part): part is string => part !== null && part.length > 0)
    .join('. ');
}

/** Zaglavlje grupe za čitač ekrana: „Cluck Rush, 5 nepročitanih poruka". */
export function hubGroupAccessibilityLabel(group: Pick<HubGroup, 'title' | 'unreadCount'>): string {
  return group.unreadCount > 0
    ? `${group.title}, ${hubUnreadLabel(group.unreadCount)}`
    : group.title;
}

// --- Radnje dugog pritiska (plan K07 §1.6) -------------------------------------

export type HubRowAction = 'open' | 'markRead' | 'groupSettings' | 'leaveGroup';

/**
 * Radnje u sheet-u dugog pritiska. „Otvori razgovor" je uvek prva (sheet nikad
 * nije prazan, a čitač ekrana ima isti meni za svaki red); „Označi kao
 * pročitano" samo kad ima nepročitanog; lična grupa dodaje „Podešavanja
 * grupe" i „Napusti grupu" (iz ličnog DM-a se ne izlazi, server isto).
 */
export function hubRowActions(
  channel: Pick<HubChannel, 'startupId' | 'kind' | 'unreadCount' | 'mentionCount'>,
): HubRowAction[] {
  const actions: HubRowAction[] = ['open'];
  if (channel.unreadCount > 0 || channel.mentionCount > 0) actions.push('markRead');
  if (channel.startupId === null && channel.kind === 'custom') {
    actions.push('groupSettings', 'leaveGroup');
  }
  return actions;
}

/** Potvrda napuštanja grupe — isti tekst i navodnici kao web (plan K07 §3). */
export function leaveGroupPrompt(groupName: string): { title: string; message: string } {
  return {
    title: `Napustiti grupu „${groupName}“?`,
    message: 'Više nećeš videti nove poruke.',
  };
}

// --- Razgovor ------------------------------------------------------------------

/**
 * Ime startupa ispred podnaslova razgovora — samo kad kanal pripada startupu
 * koji NIJE aktivan (razgovor otvoren iz huba ili push-a). U chatu aktivnog
 * startupa zaglavlje ostaje kakvo je bilo; lični razgovor nema startup.
 */
export function conversationContextLabel(
  channelStartupId: string | null,
  activeStartupId: string | null,
  startupName: string | null | undefined,
): string | null {
  if (channelStartupId === null || channelStartupId === activeStartupId) return null;
  const name = startupName?.trim();
  return name ? name : null;
}
