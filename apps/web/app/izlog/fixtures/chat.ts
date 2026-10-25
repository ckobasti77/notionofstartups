/**
 * Fixture podaci Poruka (K15): hub (lično + kanali startupa), poruke za
 * otvorene razgovore, članovi i ljudi za dijaloge. Nikad ne idu na server.
 */
import type { HubPersonModel } from "@/components/me/chat/people-dialogs";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatChannel, ChatMember, ChatMessage } from "@/lib/chat";

import { fakeId } from "./ids";
import { IZLOG_PROFILE, IZLOG_STARTUPS } from "./me";
import { IZLOG_NOW } from "./now";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Lokalno vreme izloga: `danas(9, 41)` = subota 24.10. 09:41, `pre(2, 18)` = pre dva dana u 18:00. */
const danas = (hour: number, minute = 0) => new Date(`2026-10-24T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).getTime();
const pre = (days: number, hour: number, minute = 0) => danas(hour, minute) - days * DAY;

type Person = { _id: Id<"profiles">; displayName: string; avatarUrl: string | null };

function person(n: number, displayName: string): Person {
  return { _id: fakeId("profiles", n), displayName, avatarUrl: null };
}

export const IZLOG_ME: Person = { _id: IZLOG_PROFILE._id, displayName: IZLOG_PROFILE.displayName, avatarUrl: null };
const milica = person(2, "Milica Jovanović");
const nikola = person(3, "Nikola Petrović");
const ana = person(4, "Ana Ilić");
const stefan = person(5, "Stefan Marković");
const jelena = person(6, "Jelena Nikolić");
const luka = person(7, "Luka Đorđević");
const teodora = person(8, "Teodora Pavlović");

const cluck = IZLOG_STARTUPS[0];
const enigma = IZLOG_STARTUPS[3];
const scan = IZLOG_STARTUPS[4];
const nauci = IZLOG_STARTUPS[5];
const mini = (startup: (typeof IZLOG_STARTUPS)[number]) => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl });
const areaId = (startup: (typeof IZLOG_STARTUPS)[number], key: string) =>
  startup.areas.find((area) => area.key === key)?._id ?? null;

let channelCounter = 0;
function channel(partial: Partial<ChatChannel> & Pick<ChatChannel, "kind" | "lastMessageAt">): ChatChannel {
  channelCounter += 1;
  return {
    _id: fakeId("chatChannels", channelCounter),
    _creationTime: IZLOG_NOW - 30 * DAY,
    startupId: null,
    areaId: null,
    anchorType: null,
    anchorId: null,
    dmKey: null,
    name: "",
    isPrivate: true,
    lastMessagePreview: "",
    lastMessageAuthorId: null,
    messageCount: 12,
    createdByProfileId: IZLOG_ME._id,
    archivedAt: null,
    createdAt: IZLOG_NOW - 30 * DAY,
    unreadCount: 0,
    mentionCount: 0,
    notificationLevel: "all",
    lastMessageAuthor: null,
    otherParticipant: null,
    ...partial,
  };
}

// --- Lično -------------------------------------------------------------------

export const DM_MILICA = channel({
  kind: "dm",
  otherParticipant: milica,
  lastMessageAt: danas(9, 41),
  lastMessagePreview: "Može, šaljem ti draft do podne.",
  lastMessageAuthor: milica,
  lastMessageAuthorId: milica._id,
  unreadCount: 2,
});

export const GROUP_VIKEND = channel({
  kind: "custom",
  name: "Vikend plan",
  lastMessageAt: pre(1, 21, 10),
  lastMessagePreview: "@Jovan Milojević ti voziš u subotu?",
  lastMessageAuthor: nikola,
  lastMessageAuthorId: nikola._id,
  unreadCount: 3,
  mentionCount: 1,
});

const DM_LUKA = channel({
  kind: "dm",
  otherParticipant: luka,
  lastMessageAt: pre(3, 17, 5),
  lastMessagePreview: "Hvala, vidimo se u utorak.",
  lastMessageAuthor: IZLOG_ME,
  lastMessageAuthorId: IZLOG_ME._id,
});

const GROUP_KNJIGE = channel({
  kind: "custom",
  name: "Knjige i kursevi",
  lastMessageAt: pre(6, 11, 30),
  lastMessagePreview: "Dodala sam link za kurs o prodaji.",
  lastMessageAuthor: jelena,
  lastMessageAuthorId: jelena._id,
});

// --- Startupi ------------------------------------------------------------------

const CLUCK_OPSTE = channel({
  kind: "startup",
  name: "Opšte",
  startupId: cluck._id,
  isPrivate: false,
  lastMessageAt: danas(10, 2),
  lastMessagePreview: "Novi letak je spreman za štampu.",
  lastMessageAuthor: stefan,
  lastMessageAuthorId: stefan._id,
  unreadCount: 3,
});

export const CLUCK_MARKETING = channel({
  kind: "area",
  name: "Marketing",
  startupId: cluck._id,
  areaId: areaId(cluck, "marketing"),
  isPrivate: false,
  lastMessageAt: danas(9, 15),
  lastMessagePreview: "Kampanja za vikend kreće u petak.",
  lastMessageAuthor: ana,
  lastMessageAuthorId: ana._id,
  unreadCount: 2,
});

const CLUCK_DM_ANA = channel({
  kind: "dm",
  startupId: cluck._id,
  otherParticipant: ana,
  lastMessageAt: pre(1, 16, 40),
  lastMessagePreview: "Poslala sam ti budžet.",
  lastMessageAuthor: ana,
  lastMessageAuthorId: ana._id,
});

const SCAN_OPSTE = channel({
  kind: "startup",
  name: "Opšte",
  startupId: scan._id,
  isPrivate: false,
  lastMessageAt: danas(8, 50),
  lastMessagePreview: "Demo za investitore je pomeren na sredu.",
  lastMessageAuthor: teodora,
  lastMessageAuthorId: teodora._id,
});

const SCAN_DEV = channel({
  kind: "area",
  name: "Dev",
  startupId: scan._id,
  areaId: areaId(scan, "dev"),
  isPrivate: false,
  lastMessageAt: pre(1, 14, 20),
  lastMessagePreview: "Build 1.4 je na TestFlight-u.",
  lastMessageAuthor: luka,
  lastMessageAuthorId: luka._id,
  unreadCount: 1,
  notificationLevel: "mentions",
});

const ENIGMA_THREAD = channel({
  kind: "thread",
  name: "Ponuda za klijenta",
  startupId: enigma._id,
  anchorType: "page",
  anchorId: fakeId("pages", 900),
  lastMessageAt: pre(2, 12, 0),
  lastMessagePreview: "Spustio sam cenu za 10 %.",
  lastMessageAuthor: nikola,
  lastMessageAuthorId: nikola._id,
});

const NAUCI_OPSTE = channel({
  kind: "startup",
  name: "Opšte",
  startupId: nauci._id,
  isPrivate: false,
  lastMessageAt: pre(4, 10, 0),
  lastMessagePreview: "Snimili smo prvu lekciju.",
  lastMessageAuthor: jelena,
  lastMessageAuthorId: jelena._id,
});

const startupGroup = (startup: (typeof IZLOG_STARTUPS)[number], channels: ChatChannel[]) => ({
  startup: mini(startup),
  unreadCount: channels.reduce((sum, item) => sum + item.unreadCount, 0),
  mentionCount: channels.reduce((sum, item) => sum + item.mentionCount, 0),
  channels,
});

/** Odgovor `chat.listConversations` (redosled servera). */
export const IZLOG_HUB = {
  personal: [DM_MILICA, GROUP_VIKEND, DM_LUKA, GROUP_KNJIGE],
  startups: [
    startupGroup(cluck, [CLUCK_OPSTE, CLUCK_MARKETING, CLUCK_DM_ANA]),
    startupGroup(scan, [SCAN_OPSTE, SCAN_DEV]),
    startupGroup(enigma, [ENIGMA_THREAD]),
    startupGroup(nauci, [NAUCI_OPSTE]),
    startupGroup(IZLOG_STARTUPS[1], []),
    startupGroup(IZLOG_STARTUPS[2], []),
  ],
  capped: false,
};

/** Hub bez ijednog razgovora (startupi postoje, kanala nema). */
export const IZLOG_HUB_EMPTY = {
  personal: [],
  startups: IZLOG_STARTUPS.map((startup) => startupGroup(startup, [])),
  capped: false,
};

// --- Poruke ----------------------------------------------------------------------

let messageCounter = 0;
function message(
  target: ChatChannel,
  author: Person | null,
  createdAt: number,
  body: string,
  partial: Partial<ChatMessage> = {},
): ChatMessage {
  messageCounter += 1;
  return {
    _id: fakeId("chatMessages", messageCounter),
    _creationTime: createdAt,
    channelId: target._id,
    startupId: target.startupId,
    authorProfileId: author?._id ?? null,
    body,
    mentions: [],
    kind: author === null ? "system" : "text",
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    voiceDurationMs: null,
    replyToMessageId: null,
    editedAt: null,
    deletedAt: null,
    createdAt,
    deleted: false,
    author,
    reactions: [],
    attachmentUrl: null,
    ...partial,
  };
}

const milicaDraft = message(DM_MILICA, milica, danas(9, 12), "Jesi li stigao da pogledaš tekst za sajt?");
/** Poruke ličnog DM-a, najnovija PRVA (kao `chat.messages`). */
export const MESSAGES_DM_MILICA: ChatMessage[] = [
  message(DM_MILICA, milica, danas(9, 41), "Može, šaljem ti draft do podne."),
  message(DM_MILICA, milica, danas(9, 40), "Važi, onda ga skraćujem na dve rečenice."),
  message(DM_MILICA, IZLOG_ME, danas(9, 31), "Prvi pasus je odličan. Drugi bih skratio, previše je tehnički.", {
    replyToMessageId: milicaDraft._id,
    reactions: [{ emoji: "👍", count: 1, mine: false }],
  }),
  message(DM_MILICA, IZLOG_ME, danas(9, 30), "Jesam, evo sad."),
  milicaDraft,
  message(DM_MILICA, milica, pre(1, 18, 4), "Hvala za juče, sastanak je bio baš koristan.", {
    reactions: [{ emoji: "🙏", count: 1, mine: true }],
  }),
];

/** Poruke lične grupe (sa sistemskom porukom o pravljenju). */
export const MESSAGES_GROUP_VIKEND: ChatMessage[] = [
  message(GROUP_VIKEND, nikola, pre(1, 21, 10), "@Jovan Milojević ti voziš u subotu?", { mentions: [IZLOG_ME._id] }),
  message(GROUP_VIKEND, teodora, pre(1, 21, 2), "Ja nosim roštilj i ugalj."),
  message(GROUP_VIKEND, ana, pre(1, 20, 55), "Polazak u 10 ispred kancelarije?", {
    reactions: [{ emoji: "✅", count: 2, mine: false }],
  }),
  message(GROUP_VIKEND, null, pre(2, 9, 0), "Jovan Milojević je napravio/la grupu"),
];

/** Poruke kanala oblasti u startupu. */
export const MESSAGES_CLUCK_MARKETING: ChatMessage[] = [
  message(CLUCK_MARKETING, ana, danas(9, 15), "Kampanja za vikend kreće u petak."),
  message(CLUCK_MARKETING, stefan, danas(9, 2), "@Jovan Milojević treba nam tvoje odobrenje za budžet do četvrtka.", {
    mentions: [IZLOG_ME._id],
  }),
  message(CLUCK_MARKETING, IZLOG_ME, pre(1, 17, 20), "Super, hajde da probamo dve verzije oglasa.", {
    reactions: [{ emoji: "🔥", count: 2, mine: false }],
  }),
  message(CLUCK_MARKETING, ana, pre(1, 17, 5), "Prvi rezultati sa Instagrama: 3,2 % klikova."),
];

export const IZLOG_MESSAGES: Record<string, ChatMessage[]> = {
  [DM_MILICA._id]: MESSAGES_DM_MILICA,
  [GROUP_VIKEND._id]: MESSAGES_GROUP_VIKEND,
  [CLUCK_MARKETING._id]: MESSAGES_CLUCK_MARKETING,
};

// --- Članovi i ljudi -------------------------------------------------------------

const asMember = (item: Person): ChatMember => ({ profile: item });

/** Članovi po razgovoru (lični: članovi razgovora; startup: tim). */
export const IZLOG_MEMBERS: Record<string, ChatMember[]> = {
  [DM_MILICA._id]: [IZLOG_ME, milica].map(asMember),
  [GROUP_VIKEND._id]: [IZLOG_ME, nikola, ana, teodora].map(asMember),
};
export const IZLOG_TEAM: ChatMember[] = [IZLOG_ME, milica, nikola, ana, stefan, jelena, luka, teodora].map(asMember);

const shared: Record<string, string[]> = {
  [milica._id]: ["Cluck Rush", "Scan Me"],
  [nikola._id]: ["Enigma IT"],
  [ana._id]: ["Cluck Rush"],
  [stefan._id]: ["Cluck Rush", "Nauči AI"],
  [jelena._id]: ["Nauči AI"],
  [luka._id]: ["Scan Me"],
  [teodora._id]: [],
};

/** Odgovor `chat.listPeople` (bez mene, po imenu). */
export const IZLOG_PEOPLE: HubPersonModel[] = [ana, jelena, luka, milica, nikola, stefan, teodora].map((item) => ({
  ...item,
  sharedStartupNames: shared[item._id] ?? [],
}));

export const IZLOG_GROUP_MEMBER_IDS = [nikola._id, ana._id, teodora._id];
