/** Fixture podaci za ekran `pokret` (K03). */

export type DemoTask = {
  id: string;
  title: string;
  startup: string;
  area: string;
  due: string;
  done: boolean;
};

export const DEMO_STARTUPS: ReadonlyArray<{ name: string; open: number }> = [
  { name: "Cluck Rush", open: 4 },
  { name: "Silly Handyman", open: 2 },
  { name: "Beauty Masterclass", open: 7 },
  { name: "Enigma IT", open: 3 },
  { name: "Scan Me", open: 1 },
  { name: "Nauči AI", open: 5 },
];

export const DEMO_TASKS: ReadonlyArray<DemoTask> = [
  { id: "z1", title: "Pošalji ponudu pekari Kifla", startup: "Enigma IT", area: "Sales", due: "danas", done: false },
  { id: "z2", title: "Snimi reel za novi meni", startup: "Cluck Rush", area: "Marketing", due: "sutra", done: false },
  { id: "z3", title: "Popravi QR kodove za stolove 4–9", startup: "Scan Me", area: "Dev", due: "kasni 2 d", done: false },
  { id: "z4", title: "Odgovori polaznicama iz drugog termina", startup: "Beauty Masterclass", area: "Ostalo", due: "pet 30. okt", done: false },
  { id: "z5", title: "Uporedi cene alata kod dva dobavljača", startup: "Silly Handyman", area: "Sales", due: "pon 2. nov", done: true },
];

export const DEMO_ENTER_ROWS: ReadonlyArray<{ id: string; title: string; meta: string }> = [
  { id: "u1", title: "Prekoračeno", meta: "2 zadatka" },
  { id: "u2", title: "Danas", meta: "5 zadataka" },
  { id: "u3", title: "Planirano", meta: "3 zadatka" },
  { id: "u4", title: "U toku", meta: "2 zadatka" },
  { id: "u5", title: "Uskoro", meta: "6 zadataka" },
  { id: "u6", title: "Blokirano", meta: "1 zadatak" },
  { id: "u7", title: "Završeno danas", meta: "4 zadatka" },
];

export const DEMO_BLOCKED: ReadonlyArray<{ id: string; title: string; reason: string }> = [
  { id: "b1", title: "Ugovor sa kurirskom službom", reason: "Čeka potpis vlasnika" },
  { id: "b2", title: "Objava kursa na sajtu", reason: "Fale fotografije sa snimanja" },
  { id: "b3", title: "Migracija baze na novi server", reason: "Čeka pristup od hostinga" },
];

export const DEMO_CHECKPOINTS: ReadonlyArray<{ id: string; title: string; done: boolean }> = [
  { id: "k1", title: "Spisak jela sa novim cenama", done: true },
  { id: "k2", title: "Scenario od 20 sekundi", done: false },
  { id: "k3", title: "Snimanje u petak pre otvaranja", done: false },
];
