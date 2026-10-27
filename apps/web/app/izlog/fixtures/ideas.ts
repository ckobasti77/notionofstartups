/**
 * Fixture Ideja (PROSTOR K16): ideje Cluck Rush-a kroz sve faze, sa glasovima
 * tima, komentarima i dozvolama kako ih računa `ideas.list`. Gledalac je Jovan:
 * u varijanti „vlasnik" menja fazu svake ideje (vlasnik startupa), u varijanti
 * „član" samo glasa i komentariše. Nikad ne ide na server.
 */
import type { CommentItem } from "@/components/collab/comment-list";
import type { IdeaModel, IdeaPermissions } from "@/components/workspace/ideas/ideas-model";
import type { Id } from "@/convex/_generated/dataModel";

import { fakeId } from "./ids";
import { IZLOG_STARTUPS } from "./me";
import { IZLOG_NOW } from "./now";
import { comment, IZLOG_DOC_PEOPLE } from "./page-document";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const { jovan, ana, marko, lena, djordje } = IZLOG_DOC_PEOPLE;

export const IZLOG_IDEAS_STARTUP = IZLOG_STARTUPS[0];

type Person = (typeof IZLOG_DOC_PEOPLE)[keyof typeof IZLOG_DOC_PEOPLE];

function idea(input: {
  n: number;
  title: string;
  text: string;
  author: Person;
  daysAgo: number;
  stage: IdeaModel["stage"];
  up: number;
  down: number;
  myVote?: IdeaModel["myVote"];
  comments?: number;
  movedDaysAgo?: number;
}): IdeaModel {
  const converted = input.stage === "postalo_zadatak";
  return {
    _id: fakeId("ideaNodes", input.n),
    title: input.title,
    text: input.text,
    color: "violet",
    createdAt: IZLOG_NOW - input.daysAgo * DAY,
    stage: input.stage,
    storedStage: input.stage === "postalo_zadatak" ? "odobreno" : input.stage,
    stageChangedAt: input.movedDaysAgo === undefined ? null : IZLOG_NOW - input.movedDaysAgo * DAY,
    convertedPageId: converted ? (fakeId("pages", 700 + input.n) as Id<"pages">) : null,
    upvotes: input.up,
    downvotes: input.down,
    myVote: input.myVote ?? null,
    commentCount: input.comments ?? 0,
    commentCountCapped: false,
    author: { displayName: input.author.displayName, avatarUrl: null },
    // Dozvole po gledaocu određuje `withViewer` ispod.
    permissions: {
      canEdit: true,
      canVote: !converted,
      canSetStage: false,
      canConvert: false,
      canArchive: true,
      canComment: true,
    },
  };
}

const BASE: IdeaModel[] = [
  idea({ n: 1, title: "Program preporuka za stalne mušterije", text: "Svaka preporuka donosi besplatan meni posle treće porudžbine. Merimo kroz kod u aplikaciji.", author: ana, daysAgo: 3, stage: "razmatra_se", up: 3, down: 1, comments: 4, movedDaysAgo: 1 }),
  idea({ n: 2, title: "Ručak za firme u blizini", text: "Paket za 10+ obroka sa dostavom do 12h, plaćanje fakturom.", author: marko, daysAgo: 6, stage: "razmatra_se", up: 2, down: 0, myVote: "up", comments: 2 }),
  idea({ n: 3, title: "Kiosk za samostalno poručivanje", text: "Tablet na pultu za gužve petkom i subotom; kasa ostaje za plaćanje.", author: lena, daysAgo: 9, stage: "predlog", up: 1, down: 2, comments: 1 }),
  idea({ n: 4, title: "Ljuti sos kao zaseban proizvod", text: "Flašica od 200 ml na kasi i u dostavi.", author: djordje, daysAgo: 1, stage: "predlog", up: 4, down: 0, myVote: "up" }),
  idea({ n: 5, title: "Noćna smena vikendom", text: "Rad do 3h petkom i subotom, samo dostava.", author: jovan, daysAgo: 14, stage: "predlog", up: 1, down: 1 }),
  idea({ n: 6, title: "Cenovnik 2027", text: "Nove cene od januara: +6% na menije, kombo ostaje isti.", author: ana, daysAgo: 12, stage: "odobreno", up: 5, down: 0, comments: 6, movedDaysAgo: 2 }),
  idea({ n: 7, title: "Nalepnice za ambalažu", text: "Logo i QR za ocenu na svakoj kutiji.", author: marko, daysAgo: 20, stage: "postalo_zadatak", up: 4, down: 0, comments: 3, movedDaysAgo: 8 }),
  idea({ n: 8, title: "Saradnja sa teretanom", text: "Proteinski meni uz popust za članove.", author: lena, daysAgo: 25, stage: "odbijeno", up: 1, down: 3, comments: 2, movedDaysAgo: 10 }),
  idea({ n: 9, title: "Tiktok izazov sa ljutim krilcima", text: "Snimak sa gostima, nagrada je besplatan obrok.", author: djordje, daysAgo: 30, stage: "odbijeno", up: 0, down: 4, movedDaysAgo: 20 }),
];

/** Dozvole kako ih server računa za gledaoca: vlasnik startupa menja fazu svake ideje. */
function withViewer(ideas: IdeaModel[], viewer: "vlasnik" | "clan"): IdeaModel[] {
  return ideas.map((item) => {
    const converted = item.convertedPageId !== null;
    const responsible = viewer === "vlasnik" || item.author?.displayName === jovan.displayName;
    const permissions: IdeaPermissions = {
      ...item.permissions,
      canSetStage: responsible && !converted,
      canConvert: responsible && !converted && item.stage === "odobreno",
    };
    return { ...item, permissions };
  });
}

export const IZLOG_IDEAS_OWNER = withViewer(BASE, "vlasnik");
export const IZLOG_IDEAS_MEMBER = withViewer(BASE, "clan");

/** Detalj: „Program preporuka" u fazi „Razmatra se". */
export const IZLOG_IDEA_DETAIL_ID = BASE[0]!._id;

export const IZLOG_IDEA_COMMENTS: CommentItem[] = [
  comment({ n: 41, author: marko, text: "Kod u aplikaciji već imamo za popuste, može da se iskoristi.", ago: 2 * DAY }),
  comment({ n: 42, author: lena, text: "@Ana Petrović koliko bi koštao besplatan meni mesečno?", mentions: [ana], ago: 1 * DAY }),
  comment({ n: 43, author: ana, text: "Procena je oko 40 menija mesečno, isplati se ako dovede bar 15 novih mušterija.", ago: 20 * HOUR, edited: true }),
  comment({ n: 44, author: jovan, text: "Probajmo mesec dana u jednom lokalu pa odlučimo.", ago: 3 * HOUR }),
].map((item) => ({ ...item, targetKind: "idea" as const, targetId: IZLOG_IDEA_DETAIL_ID }));
