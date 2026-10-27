/**
 * Fixture stranice kao dokumenta tima (PROSTOR K10): članovi za @, podstranice,
 * „Povezano", komentari u obliku `comments.list` i revizije u obliku
 * `history.list/get`. Nikad ne idu na server.
 */
import { serializeComment } from "@devotion/shared";

import type { CommentItem } from "@/components/collab/comment-list";
import type { MentionMember } from "@/components/collab/comment-composer";
import type { RevisionDetail, RevisionSummary } from "@/components/collab/revision-history";
import type { PageRelationCandidate, PageRelationItem } from "@/components/workspace/page-relations";
import { subpageMeta } from "@/components/workspace/page/page-document-model";
import type { SubpageRow } from "@/components/workspace/page/subpages-list";

import { fakeId } from "./ids";
import { IZLOG_NOW } from "./now";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const IZLOG_DOC_PEOPLE = {
  jovan: { _id: fakeId("profiles", 1), displayName: "Jovan Milojević", avatarUrl: null },
  ana: { _id: fakeId("profiles", 2), displayName: "Ana Petrović", avatarUrl: null },
  marko: { _id: fakeId("profiles", 3), displayName: "Marko Ilić", avatarUrl: null },
  lena: { _id: fakeId("profiles", 4), displayName: "Lena Kostić", avatarUrl: null },
  djordje: { _id: fakeId("profiles", 5), displayName: "Đorđe Antić", avatarUrl: null },
} as const;

const { jovan, ana, marko, lena, djordje } = IZLOG_DOC_PEOPLE;

/** Gledalac izloga je Jovan (član, nije autor stranice). */
export const IZLOG_DOC_SELF = jovan._id;

export const IZLOG_DOC_MEMBERS: MentionMember[] = [jovan, ana, marko, lena, djordje].map((person) => ({
  profileId: person._id,
  displayName: person.displayName,
  avatarUrl: person.avatarUrl,
}));

export const IZLOG_DOC_TITLE = "Endpointi za plaćanje";

export const IZLOG_DOC_CONTENT = `
<h2>Šta pravimo</h2>
<p>Tri endpointa za naplatu porudžbine: kreiranje naplate, potvrda i povraćaj. Provajder šalje webhook posle svake promene statusa.</p>
<ul>
  <li><p><code>POST /naplata</code> — pravi naplatu i vraća link za plaćanje</p></li>
  <li><p><code>POST /naplata/potvrda</code> — prima webhook i menja status porudžbine</p></li>
  <li><p><code>POST /naplata/povracaj</code> — delimičan ili pun povraćaj</p></li>
</ul>
<h2>Otvorena pitanja</h2>
<p>Limit po kartici za prvi mesec i koliko dugo čuvamo neuspele pokušaje.</p>
`.trim();

export const IZLOG_DOC_CRUMBS = {
  areaLabel: "Razvoj",
  ancestors: [{ id: fakeId("pages", 801), title: "Lansiranje" }],
};

export const IZLOG_DOC_META = {
  authorName: ana.displayName,
  editorName: marko.displayName,
  updatedAt: IZLOG_NOW - 5 * MIN,
};

export const IZLOG_DOC_SUBPAGES: SubpageRow[] = [
  { id: fakeId("pages", 811), title: "Webhook tok", kind: "note", editor: ana.displayName, ago: 2 * DAY, locked: false },
  { id: fakeId("pages", 812), title: "Testiraj povraćaj u sandboxu", kind: "task", editor: marko.displayName, ago: DAY, locked: false },
  { id: fakeId("pages", 813), title: "Cene provizija po kartici", kind: "table", editor: lena.displayName, ago: 2 * HOUR, locked: true },
].map(({ editor, ago, ...row }) => ({
  ...row,
  kind: row.kind as SubpageRow["kind"],
  meta: subpageMeta({ kind: row.kind as SubpageRow["kind"], editorName: editor, updatedAt: IZLOG_NOW - ago }, IZLOG_NOW),
}));

export const IZLOG_DOC_RELATIONS: PageRelationItem[] = [
  { id: fakeId("pageRelations", 1), pageId: fakeId("pages", 821), title: "Plan lansiranja", kind: "note", areaLabel: null, canDelete: true, canRequestDeletion: false },
  { id: fakeId("pageRelations", 2), pageId: fakeId("pages", 822), title: "Uslovi korišćenja", kind: "file", areaLabel: "Prodaja", canDelete: true, canRequestDeletion: false },
];

export const IZLOG_DOC_CANDIDATES: PageRelationCandidate[] = [
  { pageId: fakeId("pages", 831), title: "Specifikacija API v1", kind: "note", areaLabel: null },
  { pageId: fakeId("pages", 832), title: "Kampanja za otvaranje", kind: "note", areaLabel: "Marketing" },
];

export function comment(input: {
  n: number;
  author: (typeof IZLOG_DOC_PEOPLE)[keyof typeof IZLOG_DOC_PEOPLE] | null;
  text: string;
  mentions?: Array<(typeof IZLOG_DOC_PEOPLE)[keyof typeof IZLOG_DOC_PEOPLE]>;
  ago: number;
  edited?: boolean;
  origin?: CommentItem["origin"];
  rejected?: boolean;
}): CommentItem {
  const mentions = input.mentions ?? [];
  const content = serializeComment(
    input.text,
    mentions.map((person) => ({ profileId: person._id, displayName: person.displayName })),
  ).content;
  const own = input.author?._id === IZLOG_DOC_SELF;
  return {
    _id: fakeId("contentContributions", input.n),
    targetKind: "page",
    targetId: fakeId("pages", 800),
    content,
    mentions: [...mentions],
    author: input.author,
    origin: input.origin ?? "comment",
    moderationStatus: input.rejected ? "rejected" : "approved",
    createdAt: IZLOG_NOW - input.ago,
    updatedAt: IZLOG_NOW - input.ago,
    edited: input.edited ?? false,
    permissions: { canEdit: own, canRemove: own },
  };
}

export const IZLOG_COMMENTS: CommentItem[] = [
  comment({
    n: 1,
    author: null,
    origin: "legacy_shared",
    text: "Dogovor sa sastanka: prvo kartice, pa tek onda pouzeće.",
    ago: 6 * DAY,
  }),
  comment({
    n: 2,
    author: ana,
    text: "Proveri sa @Marko Ilić limit za prvi mesec — provajder traži potvrdu do petka.",
    mentions: [marko],
    ago: HOUR,
    edited: true,
  }),
  comment({ n: 3, author: marko, text: "Limit je 2.000 € dnevno. Upisujem u tabelu provizija.", ago: 40 * MIN }),
  comment({
    n: 4,
    author: jovan,
    text: "Super. Povraćaj neka ostane ručni dok ne vidimo koliko ih ima.\nWebhook potvrde testiram danas.",
    ago: 4 * MIN,
  }),
];

function revision(input: {
  n: number;
  kind: RevisionSummary["kind"];
  author: (typeof IZLOG_DOC_PEOPLE)[keyof typeof IZLOG_DOC_PEOPLE] | null;
  ago: number;
  excerpt: string;
  canRestore?: boolean;
}): RevisionSummary {
  return {
    _id: fakeId("contentRevisions", input.n),
    kind: input.kind,
    author: input.author,
    title: IZLOG_DOC_TITLE,
    excerpt: input.excerpt,
    contentLength: input.excerpt.length * 3,
    restoredFromId: input.kind === "restore" ? fakeId("contentRevisions", 5) : null,
    createdAt: IZLOG_NOW - input.ago,
    updatedAt: IZLOG_NOW - input.ago,
    canRestore: input.canRestore ?? true,
  };
}

export const IZLOG_REVISIONS: RevisionSummary[] = [
  revision({ n: 1, kind: "edit", author: marko, ago: 5 * MIN, excerpt: "Šta pravimo Tri endpointa za naplatu porudžbine: kreiranje naplate, potvrda i povraćaj. Provajder šalje webhook posle svake promene statusa." }),
  revision({ n: 2, kind: "restore", author: ana, ago: 2 * HOUR, excerpt: "Šta pravimo Dva endpointa za naplatu: kreiranje naplate i potvrda. Povraćaj kasnije." }),
  revision({ n: 3, kind: "edit", author: lena, ago: DAY + HOUR, excerpt: "Šta pravimo Tri endpointa za naplatu porudžbine. Otvorena pitanja: limit po kartici." }),
  revision({ n: 4, kind: "edit", author: ana, ago: DAY + 3 * HOUR, excerpt: "Šta pravimo Dva endpointa za naplatu: kreiranje naplate i potvrda. Povraćaj kasnije." }),
  revision({ n: 5, kind: "baseline", author: null, ago: 9 * DAY, excerpt: "Naplata — beleške sa sastanka. Kartice prvo, pouzeće posle." }),
];

export const IZLOG_REVISIONS_LOCKED: RevisionSummary[] = IZLOG_REVISIONS.map((item) => ({ ...item, canRestore: false }));

export function revisionDetail(summary: RevisionSummary): RevisionDetail {
  return {
    ...summary,
    content: IZLOG_DOC_CONTENT.replace("Tri endpointa", "Dva endpointa").replace(
      /<li><p><code>POST \/naplata\/povracaj<\/code>[^<]*<\/p><\/li>/,
      "",
    ),
    instructions: null,
    targetKind: "page",
    targetId: fakeId("pages", 800),
    previousRevisionId: null,
  };
}

export const IZLOG_TABLE = {
  columns: ["Kartica", "Provizija", "Limit dnevno"],
  rows: [
    ["Visa", "1,4 %", "2.000 €"],
    ["Mastercard", "1,4 %", "2.000 €"],
    ["Dina", "0,9 %", "1.000 €"],
    ["Amex", "2,9 %", "500 €"],
  ],
};

export const IZLOG_FILES = [
  { name: "Ugovor sa provajderom.pdf", meta: "PDF · 1,2 MB · Ana Petrović" },
  { name: "Tok naplate.png", meta: "Slika · 340 KB · Marko Ilić" },
  { name: "Cenovnik 2026.xlsx", meta: "Tabela · 48 KB · Lena Kostić" },
];
