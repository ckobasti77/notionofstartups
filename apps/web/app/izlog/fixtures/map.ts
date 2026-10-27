import { mapPageCard, type MapCardContent, type MapPageInput } from "@/components/map/map-model";

import { fakeId } from "./ids";
import { IZLOG_NOW } from "./now";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Lokalno podne dana pomereno od sata izloga (kanonska vrednost roka). */
function dueIn(days: number): number {
  const date = new Date(IZLOG_NOW + days * DAY);
  date.setHours(12, 0, 0, 0);
  return date.getTime();
}

export type IzlogMapCard = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  card: MapCardContent;
  /** Tekst za fioku „Pregled". */
  text: string;
};

type Seed = Partial<MapPageInput> & {
  title: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  children?: { count: number; capped: boolean };
};

const SEEDS: Seed[] = [
  {
    title: "Arhitektura sinhronizacije",
    text: "Klijent drži lokalnu kopiju i šalje izmene u paketima. Konflikt rešava revizija stranice, a ne sat uređaja. Otvoreno: kako tretiramo priloge veće od 20 MB.",
    creatorName: "Ana Petrović",
    updatedAt: IZLOG_NOW - 2 * HOUR,
    x: 0,
    y: 0,
    width: 360,
    height: 236,
    children: { count: 3, capped: false },
  },
  {
    title: "Migracija na novu šemu stranica",
    kind: "task",
    taskStatus: "in_progress",
    dueDate: dueIn(1),
    checkpointTotal: 5,
    checkpointCompleted: 2,
    text: "Dodati polja za zaključavanje i Korpu, bez brisanja starih.",
    creatorName: "Marko Ilić",
    updatedAt: IZLOG_NOW - 40 * 60_000,
    x: 424,
    y: 0,
  },
  {
    title: "Pregled bezbednosti API-ja",
    kind: "task",
    taskStatus: "blocked",
    dueDate: dueIn(-2),
    text: "Čeka pristup produkcionim logovima.",
    creatorName: "Jelena Kovač",
    updatedAt: IZLOG_NOW - DAY,
    x: 776,
    y: 0,
  },
  {
    title: "Odluke sa sastanka 21. oktobra",
    text: "Mapa ostaje opcioni prikaz. Liste su podrazumevane. Telefon dobija isti izgled kartica kroz WebView.",
    creatorName: "Jovan Milojević",
    updatedAt: IZLOG_NOW - 3 * DAY,
    x: 1128,
    y: 0,
  },
  {
    title: "Plan izdanja za četvrti kvartal",
    kind: "table",
    text: "",
    creatorName: "Ana Petrović",
    updatedAt: IZLOG_NOW - 5 * HOUR,
    x: 0,
    y: 300,
  },
  {
    title: "Dijagram baze",
    kind: "file",
    fileCategory: "image",
    text: "",
    creatorName: "Stefan Jovanović",
    updatedAt: IZLOG_NOW - 6 * DAY,
    x: 352,
    y: 300,
  },
  {
    title: "Push obaveštenja na Androidu",
    kind: "task",
    taskStatus: "next",
    dueDate: dueIn(5),
    checkpointTotal: 3,
    checkpointCompleted: 0,
    text: "Kanal po vrsti obaveštenja, zvuk iz postojećeg kataloga.",
    creatorName: "Marko Ilić",
    updatedAt: IZLOG_NOW - 9 * HOUR,
    x: 704,
    y: 300,
  },
  {
    title: "Ideje za brže učitavanje",
    text: "Lenje učitavanje Mape, manji paket editora, keš za avatare.",
    creatorName: "Jelena Kovač",
    updatedAt: IZLOG_NOW - 2 * DAY,
    x: 1056,
    y: 300,
    children: { count: 9, capped: true },
  },
  {
    title: "Testovi za Korpu",
    kind: "task",
    taskStatus: "done",
    dueDate: dueIn(-1),
    checkpointTotal: 4,
    checkpointCompleted: 4,
    text: "",
    creatorName: "Stefan Jovanović",
    updatedAt: IZLOG_NOW - DAY - 2 * HOUR,
    x: 0,
    y: 600,
  },
  {
    title: "Uputstvo za nove članove tima",
    text: "Kako se prijaviti, gde su pristupi i ko odobrava troškove. Menja samo autor dok je zaključano.",
    isLocked: true,
    creatorName: "Jovan Milojević",
    updatedAt: IZLOG_NOW - 12 * DAY,
    x: 352,
    y: 600,
  },
  {
    title: "Izvoz zadataka u Excel",
    kind: "task",
    taskStatus: "backlog",
    text: "",
    creatorName: "Ana Petrović",
    updatedAt: IZLOG_NOW - 4 * DAY,
    x: 704,
    y: 600,
  },
  {
    title: "Beleške sa intervjua korisnika",
    text: "Pet razgovora: svi traže brže pravljenje zadatka sa telefona, dvoje pominje glasovne beleške.",
    creatorName: "Jelena Kovač",
    updatedAt: IZLOG_NOW - 7 * HOUR,
    x: 1056,
    y: 600,
    children: { count: 4, capped: false },
  },
];

export const IZLOG_MAP_CARDS: IzlogMapCard[] = SEEDS.map((seed, index) => {
  const input: MapPageInput = {
    title: seed.title,
    text: seed.text ?? "",
    kind: seed.kind ?? "note",
    taskStatus: seed.taskStatus ?? null,
    dueDate: seed.dueDate ?? null,
    checkpointTotal: seed.checkpointTotal ?? 0,
    checkpointCompleted: seed.checkpointCompleted ?? 0,
    fileCategory: seed.fileCategory ?? null,
    updatedAt: seed.updatedAt ?? IZLOG_NOW,
    isLocked: seed.isLocked ?? false,
    creatorName: seed.creatorName ?? null,
  };
  return {
    id: fakeId("pages", index + 1),
    x: seed.x,
    y: seed.y,
    width: seed.width ?? 288,
    height: seed.height ?? 196,
    card: mapPageCard(input, IZLOG_NOW, seed.children ?? null),
    text: input.text,
  };
});

/** Veze (puna linija = veza na Mapi). */
export const IZLOG_MAP_EDGES: Array<{ source: number; target: number }> = [
  { source: 0, target: 1 },
  { source: 1, target: 2 },
  { source: 0, target: 4 },
  { source: 6, target: 7 },
  { source: 8, target: 9 },
];
