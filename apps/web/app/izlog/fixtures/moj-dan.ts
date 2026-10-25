/**
 * Fixture podaci za Moj dan, Brzi unos i Isplaniraj dan (K10). Sat je
 * `IZLOG_NOW` (subota 24.10.2026. 09:30). Nikad ne idu na server.
 */
import type { MyDayOverviewData } from "@/components/me/my-day/my-day-model";
import type { SideChat, SideInbox, SidePending } from "@/components/me/my-day/side-model";

import { fakeId } from "./ids";
import { IZLOG_STARTUPS } from "./me";
import { IZLOG_NOW, oktobar } from "./now";

type OverviewTask = MyDayOverviewData["tasks"][number];
type OverviewPersonal = MyDayOverviewData["personal"][number];

const S = (index: number) => IZLOG_STARTUPS[index];
const at = (day: number, hhmm: string) => new Date(`2026-10-${String(day).padStart(2, "0")}T${hhmm}:00`).getTime();

function task(n: number, startupIndex: number, title: string, area: string | null, partial: Partial<OverviewTask> = {}): OverviewTask {
  return {
    _id: fakeId("pages", 100 + n),
    title,
    taskStatus: "next",
    taskPriority: "medium",
    dueDate: null,
    completedAt: null,
    createdAt: oktobar(1) + n,
    isCreator: n % 3 === 0,
    isAssignee: true,
    startup: { _id: S(startupIndex)._id, name: S(startupIndex).name },
    area: area ? { label: area } : null,
    ...partial,
  };
}

function personal(n: number, title: string, partial: Partial<OverviewPersonal> = {}): OverviewPersonal {
  return {
    _id: fakeId("personalTasks", 100 + n),
    title,
    status: "open",
    priority: null,
    dueDate: null,
    completedAt: null,
    createdAt: oktobar(10) + n,
    ...partial,
  };
}

const ref = (kind: "task" | "personal", item: { _id: string }) => `${kind}:${item._id}`;

// Običan dan: 2 kasni, 3 danas, 2 planirano, 1 u toku, 4 uskoro, 1 blokirano, 3 završeno.
const T = {
  ugovor: task(1, 0, "Ugovor sa dobavljačem piletine", "Sales", { dueDate: oktobar(22), taskPriority: "high" }),
  reel: task(2, 0, "Snimi reel za novi meni", "Marketing", { dueDate: oktobar(24), isCreator: true }),
  landing: task(3, 4, "Landing za QR menije", "Marketing", { dueDate: oktobar(24), taskPriority: "urgent" }),
  ponudaNina: task(10, 1, "Pripremi ponudu za Ninu Ilić", "Sales", { dueDate: oktobar(24) }),
  onboarding: task(11, 5, "Napiši onboarding mejl za polaznike", "Marketing", { isCreator: false, isAssignee: false }),
  kupatilo: task(4, 1, "Ponuda za renoviranje kupatila", "Sales", { taskStatus: "in_progress" }),
  predavaci: task(5, 2, "Raspored predavača za novembar", "Ostalo", { dueDate: oktobar(28) }),
  lekcija: task(6, 5, "Skripta za lekciju 4: prompt inženjering", "Dev", { dueDate: oktobar(27), isCreator: true }),
  wolt: task(9, 0, "Odgovori na recenzije sa Wolta", "Marketing", { dueDate: oktobar(26) }),
  staging: task(7, 3, "Popravi prijavu na staging serveru", "Dev", { taskStatus: "blocked", dueDate: oktobar(29) }),
  hosting: task(8, 4, "Faktura za hosting", "Ostalo", { taskStatus: "done", dueDate: oktobar(24), completedAt: at(24, "08:40") }),
  milica: task(12, 2, "Odgovori Milici na mejl o ceni kursa", "Sales", { taskStatus: "done", completedAt: at(24, "09:20") }),
  // Bez sekcije danas — samo predlozi i „Preneto od ranije".
  konkurencija: task(13, 0, "Istraži konkurenciju u Nišu", "Sales", { taskStatus: "backlog", taskPriority: "high" }),
  newsletter: task(14, 2, "Pripremi sadržaj za newsletter", "Marketing"),
  dostava: task(15, 0, "Analiza cena dostave", "Sales", { taskStatus: "backlog", taskPriority: "urgent" }),
  enigmaLanding: task(16, 3, "Nova landing stranica za Enigmu", "Dev"),
};

const P = {
  struja: personal(1, "Platiti račun za struju", { dueDate: oktobar(23) }),
  budzet: personal(2, "Pregledati Q4 budžet", { priority: "high" }),
  racunovodja: personal(3, "Pozvati računovođu", { status: "done", dueDate: oktobar(24), completedAt: at(24, "09:05") }),
  auto: personal(5, "Servis auta", { dueDate: oktobar(29) }),
  poklon: personal(6, "Kupiti poklon za Teodoru"),
  sto: personal(7, "Rezerviši sto za petak"),
  domen: personal(8, "Obnovi registraciju domena"),
};

const STARTUPS = IZLOG_STARTUPS.map((startup) => ({ _id: startup._id, name: startup.name, logoUrl: startup.logoUrl }));

function entry(n: number, dayKey: string, refKey: string, position: number) {
  return { _id: fakeId("myDayEntries", n), dayKey, refKey, position };
}

export const IZLOG_DAY_OBICAN: MyDayOverviewData = {
  tasks: Object.values(T),
  personal: Object.values(P),
  entries: [
    entry(1, "2026-10-24", ref("personal", P.budzet), 1024),
    entry(2, "2026-10-24", ref("task", T.onboarding), 2048),
  ],
  history: [
    entry(11, "2026-10-23", ref("task", T.konkurencija), 1024),
    entry(12, "2026-10-22", ref("task", T.newsletter), 1024),
    entry(13, "2026-10-21", ref("personal", P.poklon), 1024),
  ],
  startups: STARTUPS,
  capped: { tasks: false, personal: false, history: false },
};

export const IZLOG_DAY_PRAZAN: MyDayOverviewData = {
  tasks: [],
  personal: [],
  entries: [],
  history: [],
  startups: STARTUPS,
  capped: { tasks: false, personal: false, history: false },
};

/** Isplaniraj dan bez predloga: sve što bi se predložilo je već u planu ili gotovo. */
export const IZLOG_DAY_BEZ_PREDLOGA: MyDayOverviewData = {
  ...IZLOG_DAY_PRAZAN,
  tasks: [T.reel, T.kupatilo],
  personal: [P.budzet],
  entries: [entry(1, "2026-10-24", ref("personal", P.budzet), 1024)],
};

const LONG_TITLES = [
  "Pregovori sa novim dobavljačem pakovanja — uslovi plaćanja, rokovi isporuke i kazne za kašnjenje",
  "Kampanja za Black Friday na Instagramu i TikToku",
  "Migracija baze na novu verziju bez prekida rada",
  "Plan obuke za nove instruktore u Novom Sadu i Kragujevcu",
  "Popis opreme u magacinu",
  "Ponuda za održavanje zgrade na Vračaru",
  "Revizija ugovora sa partnerima",
  "Testiranje plaćanja karticom u aplikaciji",
];

/** Pretrpan dan: 40 stavki kroz 6 startupa, dugi naslovi, odsečeno. */
export const IZLOG_DAY_PRETRPAN: MyDayOverviewData = (() => {
  const tasks: OverviewTask[] = [];
  const statuses: Array<OverviewTask["taskStatus"]> = ["next", "in_progress", "blocked", "backlog", "next"];
  const dues = [oktobar(20), oktobar(22), oktobar(24), oktobar(24), oktobar(25), oktobar(27), oktobar(30), null];
  for (let n = 0; n < 34; n += 1) {
    const due = dues[n % dues.length];
    tasks.push(
      task(200 + n, n % 6, `${LONG_TITLES[n % LONG_TITLES.length]} (${n + 1})`, ["Dev", "Marketing", "Sales", "Ostalo"][n % 4], {
        taskStatus: n % 11 === 0 ? "done" : statuses[n % statuses.length],
        completedAt: n % 11 === 0 ? at(24, "08:00") + n * 60_000 : null,
        dueDate: due === null && statuses[n % statuses.length] === "next" ? oktobar(26) : due,
        taskPriority: (["urgent", "high", "medium", "low"] as const)[n % 4],
      }),
    );
  }
  const personalTasks = Array.from({ length: 6 }, (_, n) =>
    personal(200 + n, `Lična obaveza broj ${n + 1}: ${LONG_TITLES[(n + 3) % LONG_TITLES.length]}`, {
      dueDate: n % 2 === 0 ? oktobar(24) : oktobar(23),
    }),
  );
  return {
    tasks,
    personal: personalTasks,
    entries: [],
    history: [],
    startups: STARTUPS,
    capped: { tasks: true, personal: false, history: false },
  };
})();

export const IZLOG_SIDE_INBOX: SideInbox = {
  unread: 12,
  capped: false,
  items: [
    { id: "n1", title: "Milica Jovanović ti je dodelila „Snimi reel za novi meni“", startup: STARTUPS[0], createdAt: at(24, "08:12") },
    { id: "n2", title: "Nikola Petrović: „Pogledaj ponudu pre ručka“", startup: null, createdAt: at(24, "07:55") },
    { id: "n3", title: "Glasanje o brisanju: „Stari logo“", startup: STARTUPS[4], createdAt: at(23, "18:30") },
  ],
};

export const IZLOG_SIDE_CHAT: SideChat = {
  total: 4,
  personal: 3,
  byStartup: [{ startup: STARTUPS[0], unread: 1 }],
};

export const IZLOG_SIDE_PENDING: SidePending = {
  items: [
    { key: "vote:1", title: "Glasanje o brisanju: „Stari logo“", startup: STARTUPS[4] },
    { key: "page_nesting:1", title: "Ana Ilić predlaže da „Cenovnik 2027“ pređe pod „Prodaja“", startup: STARTUPS[2] },
  ],
  truncated: false,
};

/** Startupi sa oblastima za brzi unos. */
export const QUICK_ADD_STARTUPS = IZLOG_STARTUPS.map((startup) => ({
  _id: startup._id,
  name: startup.name,
  logoUrl: startup.logoUrl,
  areas: startup.areas.map((area) => ({ _id: area._id, label: area.label })),
}));

export { IZLOG_NOW };
