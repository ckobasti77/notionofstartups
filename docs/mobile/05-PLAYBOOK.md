# Playbook — promptovi, modeli, režimi

> Korak po korak, od Faze 1 do gotove aplikacije. Za svaki korak: **koji model**,
> **koji effort**, **koji režim**, i **tačan prompt** za copy-paste.
>
> **Verzija 2** — prepisano posle Faze 0. Izmene u odnosu na prvu verziju:
> web paritet je sada obavezan, testiranje ide na Androidu, `/goal` mehanika
> ispravljena, putanje usklađene sa stvarnim repoom.

---

## ⚠️ Pravilo koje gazi sve ostalo

> **Jedan backend, dva klijenta. Ništa novo ne postoji samo na jednom.**

Od Faze 1 nadalje, svaka funkcija koja se može napraviti i na webu — **pravi se i
na webu**. Chat, obaveštenja, sve. Convex funkcija se piše jednom i troši dvaput.

Korak nije završen dok ne radi na oba mesta. Ako nešto tehnički ne može na web
(custom zvuci, haptika, widget), to se **izričito zapisuje** kao izuzetak, ne
prećutno preskače.

Praktično, svaka faza ima tri grupe koraka:

| Grupa | Šta | Gde |
|---|---|---|
| **Z** — Zajedničko | Schema, Convex funkcije, testovi, migracije | `packages/backend/` |
| **M** — Mobilni | React Native ekrani | `apps/mobile/src/` |
| **W** — Web | Next.js prikazi | `apps/web/` |

---

## Trenutno stanje

| | |
|---|---|
| Monorepo | `apps/web` · `apps/mobile` · `packages/backend` ✅ |
| Faza 0 | Gotova — tokeni, navigacija, auth, pet tabova ✅ |
| Mobilne rute | `apps/mobile/src/app/` (**ne** `app/`) |
| Testiranje | **Android** — dev build, besplatno |
| iOS | Odloženo. Traži $99/god, odluka za kasnije |
| Web rute | Client-side, `WorkspaceRoute` u `apps/web/components/workspace/types.ts` |

---

# DEO A — Model, effort, režim

## A0. Profil „bez štednje" — ovo koristi

```
/model          → izaberi Opus 4.8 iz liste (NE kucaj `opus`, taj alias vodi na Opus 5)
/effort xhigh
```

To je 90% koraka. `xhigh` ostaje uključen kroz celu sesiju.

**`max` samo ovde:**

| Korak | Zašto |
|---|---|
| 1.1 Chat schema | Skupo za menjanje kasnije |
| 1.9 Kanali i zvuci | **Nepovratno** na Androidu |
| 3.2 Editor prototip | Najteži tehnički deo |
| Bilo šta zaglavljeno posle 2 pokušaja | Očigledno |

> **`max` svuda te čini sporijim, ne bržim.** Na mehaničkom poslu misli minut i
> po duže za isti rezultat.

**`ultrathink`** je nešto drugo — reč u samom promptu, jednokratno dublje
razmišljanje, ne menja podešavanje sesije.

## A1. Režimi (`Shift+Tab` ciklus)

```
Manual  →  Accept Edits  →  Plan
```

| Režim | Kada |
|---|---|
| **Plan** | Pre svakog koraka koji dira više fajlova |
| **Accept Edits** | Kad je plan odobren i samo se izvršava |
| **Manual** | Kad prvi put diraš nešto osetljivo |

## A2. `/goal` — pazi na mehaniku

**`/goal` odmah kreće da radi, sa samim uslovom kao zadatkom. Nema drugog
prompta posle njega.**

Zato: detaljan zadatak ide u fajl, a goal ga referencira.

```
/goal Uradi sve iz docs/mobile/zadaci/1-3-testovi.md. Gotovo je kad je SVE ispod
tačno i pokazano u transkriptu:
1. `npm run check` izvršen, kod 0.
2. `npx vitest run packages/backend/convex/chat.test.ts` izvršen, svi prolaze,
   nijedan skipped.
...
Popravljaj i pokreći ponovo dok ne prođe. NE spuštaj kriterijum i ne menjaj
provere da bi prošle.
```

Ograničenja:

- Uslov ide do **4000 znakova** — zato zadatak u fajl
- Evaluator sudi **samo po transkriptu** — piši „izvršeno i izlaz pokazan", ne „radi"
- **Ne kucaj `/clear` dok je goal aktivan** — briše ga
- Prekid: `Ctrl+C` ili `/goal clear`

| ✅ Dokazivo | ❌ Nedokazivo |
|---|---|
| `npm run check izlazi sa kodom 0` | `kod je čist` |
| `svih 6 testova prolazi, ispis priložen` | `pokriveni su ivični slučajevi` |
| `git diff --stat pokazan` | `nije ništa pokvareno` |

## A3. Higijena

| Komanda | Kada |
|---|---|
| `/context` | Na svakih sat vremena |
| `/compact` | Preko ~70%, a još si u istom koraku |
| `/clear` | **Između koraka.** Nov korak = nova sesija |
| `Esc` `Esc` → `/rewind` | Kad nešto pukne |

**Najvažnije pravilo:** `/clear` između koraka iz Dela C.

---

# DEO B — Priprema (jednom)

## B1. Dopuni `CLAUDE.md`

```
/model Opus 4.8 · /effort xhigh · Accept Edits
```

> Pročitaj `docs/mobile/00-PLAN.md` i `05-PLAYBOOK.md`. Dopuni `CLAUDE.md`
> sekcijom „Mobilna aplikacija i web paritet", maksimum 20 redova:
>
> - Monorepo: `apps/web`, `apps/mobile`, `packages/backend`
> - Backend je deljen — Convex funkcija se piše jednom, troši dvaput
> - **Svaka nova funkcija od Faze 1 nadalje mora da postoji i na webu i na
>   mobilnom.** Izuzeci se izričito zapisuju, ne prećutno preskaču
> - Mobilne rute su u `apps/mobile/src/app/`
> - Detaljni planovi u `docs/mobile/`
>
> Dodaj `@docs/mobile/00-PLAN.md` import.

## B2. Pravila po tipu fajla

> Napravi tri fajla u `.claude/rules/`:
>
> `mobile.md` sa `paths: ["apps/mobile/**"]` — NativeWind, expo-router,
> `npx expo install` umesto `npm install`, dodirna meta 44pt, tekst min 16px,
> obavezan safe area, `react-native-reanimated` umesto Framer Motion, nikad
> web API-ji (`window`, `document`, `localStorage`).
>
> `web.md` sa `paths: ["apps/web/**"]` — postojeće shadcn/Radix konvencije,
> `WorkspaceRoute` model rutiranja, Tailwind v4 tokeni iz `globals.css`.
>
> `convex.md` sa `paths: ["packages/backend/**"]` — pre pisanja pročitaj
> `convex/_generated/ai/guidelines.md`, svaka funkcija ima `returns` validator,
> pristup uvek kroz `requireStartupMember`, `.withIndex()` umesto `.filter()`.

## B3. Subagenti

### ⚠️ Za Convex već imaš bolje — ne pravi svoj

U `.claude/skills/` je instaliran Convex plugin sa 40-ak skillova. Ne pravi
`convex-review` subagenta — koristi njih:

| Umesto | Koristi | Kada |
|---|---|---|
| pregled sheme | `/convex-design` | Z1.1, Z1B.1 |
| pregled koda | `/convex-reviewer` | posle svake backend izmene |
| **provera dozvola** | `/convex-authz` | **Z1B.3 — obavezno** |
| indeksi, N+1 | `/convex-performance-audit` | Z1.2, Z1B.3 |
| migracije | `/convex-migrate` | Z1.4 |
| testovi | `/convex-test` | Z1.3 |
| pred deploy | `/convex-deploy-guard` | kraj svake faze |

Gde god u Delu C piše `@convex-review`, čitaj kao `/convex-reviewer`
(ili `/convex-authz` kad je reč o dozvolama).

### Tri subagenta koja stvarno treba da napraviš

Ovih nema nigde — napravi ih u `.claude/agents/`.

**`rn-review.md`**

```markdown
---
description: Pregleda React Native ekrane — dodirne mete, safe area, tastatura, prazna stanja. Koristi posle svakog mobilnog ekrana.
model: sonnet
effort: high
tools: [Read, Grep, Glob]
---
Proveri: dodirne mete 44x44pt · safe area gore i dole ·
`KeyboardAvoidingView` gde ima unosa · prazno/učitavanje/greška — sva tri ·
tekst min 16px · `accessibilityLabel` na ikonicama · nema web API-ja.
Vrati nalaze sa brojem linije. Ne menjaj kod.
```

**`web-review.md`**

```markdown
---
description: Pregleda Next.js prikaze — pristupačnost, stanja, konzistentnost sa postojećim workspace komponentama. Koristi posle svakog web prikaza.
model: sonnet
effort: high
tools: [Read, Grep, Glob]
---
Proveri: prati li postojeće obrasce iz `apps/web/components/workspace/` ·
tastaturna navigacija i fokus · prazno/učitavanje/greška — sva tri ·
kontrast i `aria-*` · koristi tokene iz `globals.css`, ne hardkodovane boje ·
radi li u svetloj i tamnoj temi.
Vrati nalaze sa brojem linije. Ne menjaj kod.
```

**`parity-check.md`** ⚠️ najvažniji

```markdown
---
description: Proverava da li funkcija postoji i na webu i na mobilnom. Koristi na kraju svake faze.
model: opus
effort: high
tools: [Read, Grep, Glob]
---
Uporedi `apps/web` i `apps/mobile` za zadatu funkciju.

Za svaku Convex funkciju koju jedan klijent zove a drugi ne — prijavi.
Za svaku radnju koju korisnik može na jednom a ne na drugom — prijavi.

Za svaki nalaz reci jedno od:
- PROPUST — može se napraviti, samo nije
- IZUZETAK — tehnički nemoguće (navedi zašto)

Vrati tabelu. Ne menjaj kod.
```

---

# DEO C — Faze

Format:

```
▸ Model · Effort · Režim
  Prompt
```

Posle svakog koraka: `/clear`.

---

# KORAK 0 — Preimenovanje u Devotion

> Uradi ovo **pre** Faze 1. Što više koda napišeš, to je preimenovanje skuplje.

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Aplikacija se zove **Devotion**. Preimenuj je svuda u kodu.
>
> Napravi plan koji pokriva najmanje:
>
> - `apps/mobile/app.json` — `name`, `slug`, `scheme`, `ios.bundleIdentifier`,
>   `android.package`. Predloži mi identifikator pre nego što upišeš.
> - `apps/web` — naslov u `app/layout.tsx`, metadata, `manifest`, favicon tekst
> - Imena paketa: `@notion-clone/web` → `@devotion/web`,
>   `@notion-clone/backend` → `@devotion/backend`, `mobile` → `@devotion/mobile`.
>   Svi `package.json` fajlovi plus svaka `import` referenca.
> - Root `package.json` — `name`
> - `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**`
> - Sve korisniku vidljive niske u UI-ju gde piše staro ime
>
> Posle izmene pokreni `npm install` (imena workspace paketa su se promenila),
> pa `npm run check`.
>
> Napravi grane pre nego što kreneš.

**Šta moraš ručno, van koda:**

| Stavka | Kako |
|---|---|
| Ime foldera i git remote | Ti, ručno — ne diraj dok si usred posla |
| Convex deployment | Ne može da se preimenuje; ime ostaje, nije vidljivo korisnicima |
| Vercel projekat | Settings → General → Project Name |

---

# FAZA 1 — Chat i obaveštenja (3–4 nedelje)

> Chat je jedina stvar koju desktop nema. Zato ide prvi — i zato ide **na oba
> klijenta odjednom**.

## Z1.1 — Chat schema ⚠️

```
/clear · Opus 4.8 · effort max · Plan mode
```

> Pročitaj `docs/mobile/04-CHAT.md` u celosti, pa
> `packages/backend/convex/schema.ts`.
>
> Napravi plan za dodavanje pet chat tabela. Pre plana proveri da li se
> predloženi indeksi zaista poklapaju sa upitima iz sekcije 8 dokumenta, i da li
> denormalizacija u `chatChannels` pokriva listu razgovora bez N+1 čitanja.
>
> Imaj u vidu da će iste funkcije koristiti i web i mobilni klijent — ako neki
> deo sheme to otežava, reci sad.
>
> Obrati posebnu pažnju na tri stvari iz dokumenta:
> - `kind: "startup"` — opšti kanal, tačno jedan po startupu, implicitno
>   članstvo, ne može da se napusti ni arhivira (sekcija 5b)
> - `kind: "agent"` — priprema za AI agenta, vidi `docs/mobile/06-AGENT.md`
> - `sourceMessageId` polje na `pages`, `ideaNodes` i `thoughtNodes` — veza
>   nazad ka poruci iz koje je entitet nastao (sekcija 5c)
>
> Ako nađeš grešku ili propust u dokumentu — reci mi umesto da ga slepo slediš.
> Dokument je nacrt, ne zakon.

Posle: `@convex-review proveri nove chat tabele i indekse`

## Z1.2 — Chat backend

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/04-CHAT.md` sekcije 3–8.
>
> Implementiraj `packages/backend/convex/chat.ts`: upiti `listChannels`,
> `messages`, `channelForAnchor`, `unreadSummary`, `listDirectMessages`,
> `listFollowedThreads`; mutacije `sendMessage`, `sendToAnchor`,
> `markChannelRead`, `openDirectMessage`, `toggleReaction`, `editMessage`,
> `deleteMessage`, `setNotificationLevel`.
>
> Kritično: `requireChannelAccess` iz sekcije 3, lazy kreiranje threada iz
> sekcije 4, inkrementalni unread iz sekcije 5. Ne izmišljaj drugi model
> dozvola — sve ide kroz postojeći `requireStartupMember`.
>
> Funkcije moraju biti klijent-neutralne. Bez pretpostavki o platformi.

## Z1.3 — Testovi

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

Prvo napiši zadatak u fajl:

> Napravi `docs/mobile/zadaci/1-3-testovi.md` sa specifikacijom testova za chat,
> po uzoru na postojeće `tasks.test.ts` i `notifications.test.ts`. Pokrij:
> član ne može da čita tuđi DM · thread nasleđuje dozvole od zadatka ·
> unread se ne povećava autoru · `markChannelRead` nulira oba brojača ·
> `openDirectMessage` vraća isti kanal bez obzira ko zove prvi ·
> lazy thread se pravi tek pri prvoj poruci · `dedupeKey` sprečava dupli push.

Pa pokreni petlju:

```
/goal Uradi sve iz docs/mobile/zadaci/1-3-testovi.md. Gotovo je kad je SVE ispod tačno i pokazano u transkriptu:
1. `npx vitest run packages/backend/convex/chat.test.ts` izvršen, svi testovi prolaze, nijedan nije skipped ni todo.
2. `npm run check` izvršen iz roota, izlazi sa kodom 0.
3. Svih sedam scenarija iz specifikacije ima svoj test.
4. `git status` pokazan i čist.
Popravljaj i pokreći ponovo dok ne prođe. NE menjaj test da bi prošao — popravi implementaciju. Ako te blokira nešto što ne možeš sam, upiši BLOKADA u docs/mobile/zadaci/1-3-izvestaj.md, commit-uj, i tek onda je uslov ispunjen.
```

## Z1.4 — Migracija kanala

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/04-CHAT.md` sekciju 9 i postojeće migracije u
> `packages/backend/convex/migrations.ts`.
>
> Napiši migraciju koja za svaki aktivan startup pravi kanal po oblasti i
> `chatReads` red za svakog člana. Idempotentna — ponovno pokretanje ne pravi
> duplikate. Bez sistemskih poruka dobrodošlice.

## W1.5 — Web: chat prikaz ⚠️ novo

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `apps/web/components/workspace/types.ts`, `workspace-route.ts`,
> `workspace-shell.tsx` i `workspace-sidebar.tsx` da razumeš kako web rutiranje
> i prikazi rade.
>
> Napravi plan za chat na webu:
>
> 1. Dodaj `{ kind: "chat"; channelId?: Id<"chatChannels"> }` u `WorkspaceRoute`
> 2. Proširi `readWorkspaceRouteCandidate` i `workspaceRouteHref` za `view=chat`
> 3. Stavku „Chat" u `workspace-sidebar.tsx` sa unread badge-om
> 4. `chat-view.tsx` — dvokolonski raspored: lista kanala levo, razgovor desno
> 5. Poruke, reakcije, odgovori, pominjanja, prilozi
>
> Prati postojeće obrasce — isti shadcn primitivi, isti tokeni, ista logika
> praznih stanja kao ostali prikazi. Neka izgleda kao deo aplikacije, ne kao
> nakalemljen chat.

Posle: `@web-review pregledaj chat-view`

## W1.6 — Web: threadovi na entitetima

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Poveži chat threadove sa entitetima na webu.
>
> U `page-editor-view.tsx` i `page-workspace-view.tsx` dodaj panel „Diskusija"
> koji zove `chat.channelForAnchor` i, ako kanala nema, prvom porukom ga pravi
> preko `sendToAnchor`.
>
> Isto za ideje u `ideas-view.tsx` i `idea-discussion-dialog.tsx` — ako već
> postoji diskusija na idejama, razmisli da li da se zameni chat threadom ili
> ostavi paralelno. Reci mi šta predlažeš pre nego što uradiš.

## M1.7 — Mobilni: lista razgovora

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 6.
>
> Napravi Chat tab u `apps/mobile/src/app/(app)/(tabs)/chat.tsx`: tri segmenta
> (Kanali / Direktne / Praćeno), lista sa poslednjom porukom, vremenom i unread
> badge-om. Podaci iz `chat.listChannels` i `chat.listDirectMessages`.

## M1.8 — Mobilni: ekran razgovora

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 6 i `04-CHAT.md` sekciju 7.
>
> Napravi ekran razgovora: obrnuta `FlatList`, mehurići grupisani po autoru,
> separatori po danu, `usePaginatedQuery` sa učitavanjem pri skrolu **nagore**,
> optimistički unos, svajp desno za odgovor, long-press za reakcije.
>
> Za threadove header nosi kontekst entiteta i vodi na njega.
>
> Pazi na tastaturu — unos mora da ostane vidljiv.

Posle: `@rn-review pregledaj ekran razgovora`

## Z1.8b — Pretvaranje poruke u entitet ⚠️ novo

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/04-CHAT.md` sekciju 5c.
>
> Implementiraj `chat.convertMessage` — poruka postaje zadatak, ideja, misao ili
> beleška.
>
> **Kritično: konverzija ide kroz postojeće putanje kreiranja**
> (`pages.create`, `ideas.create`, `thoughts.create`), ne kroz nov kod. Time
> validacija, dozvole, aktivnost i obaveštenja rade automatski. Ako primetiš da
> neka putanja ne prima potrebne argumente, reci mi pre nego što je zaobiđeš.
>
> Uključi: prenos priloga, izvođenje naslova iz prvog reda, sistemsku poruku sa
> linkom u kanalu, `sourceMessageId` na kreiranom entitetu, i mogućnost da se
> ista poruka pretvori više puta.
>
> **Web:** kontekstni meni na poruci → „Pretvori u…". Iskoristi postojeći
> obrazac iz `thought-conversion-dialog.tsx` i `thought-destination-picker.tsx`.
>
> **Mobilni:** long-press → isti izbor kroz bottom sheet.

## Z1.9 — Expo push infrastruktura

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/03-NOTIFIKACIJE.md` sekciju 2, pa
> `packages/backend/convex/push.ts`, `pushSubscriptions.ts` i
> `lib/notifications.ts`.
>
> Napravi plan za `expoPushTokens` tabelu i `expoPush.ts` akciju, i za granu u
> `createNotification` koja šalje i na Expo pored postojećeg web push-a.
>
> **Web push mora da nastavi da radi netaknut** — isti korisnik može imati i
> desktop browser i telefon, i obe dostave moraju da rade paralelno.
>
> Dodaj nove tipove `chat_message`, `chat_mention`, `chat_dm` u
> `notificationTypeValidator` i `chat` u `notificationTargetTypeValidator`.

## M1.10 — Kanali i zvuci ⚠️ NEPOVRATNO

```
/clear · Opus 4.8 · effort max · Plan mode
```

> Pročitaj `docs/mobile/03-NOTIFIKACIJE.md` sekcije 3, 4 i 5.
>
> ⚠️ Android zaključava zvuk za notification channel pri kreiranju. Nepovratno
> za postojeće instalacije.
>
> Napravi plan za: konstantu `CHANNEL_VERSION`, katalog od sedam kanala sa
> verzionisanim ID-jevima, kreiranje pri pokretanju, brisanje starih verzija,
> upis `channelVersion` u `expoPushTokens`, i `expo-notifications` config plugin
> u `app.json`.
>
> Pre plana preispitaj katalog iz sekcije 3 — je li sedam kanala prava
> granularnost i je li mapiranje 13 tipova na 7 kanala smisleno. Reci ako bi
> nešto promenio.
>
> **Izuzetak za web:** custom zvuci ne postoje ni u jednom browseru. Zapiši to u
> plan kao izričit izuzetak, ne prećuti.

Zvučne fajlove praviš ti — sekcija 6 ima `ffmpeg` komande i opis karaktera.

## Z1.11 — Rutiranje na tap, oba klijenta

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Obaveštenje mora da otvori tačan ekran na oba klijenta.
>
> **Mobilni:** `data.targetType` → ekran, uključujući cold start iz zatvorene
> aplikacije. Tipovi: `page`, `ideas`, `approvals`, `puls`, `chat`.
>
> **Web:** proširi `notifications-panel.tsx` novim tipovima (`chat_message`,
> `chat_mention`, `chat_dm`) sa ikonama, i rutiranje za `targetType === "chat"`
> na novu `view=chat` rutu. Service worker koji obrađuje web push takođe mora
> da zna za `chat` cilj.

## Z1.12 — Podešavanja obaveštenja, oba klijenta

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Pročitaj `docs/mobile/03-NOTIFIKACIJE.md` sekciju 7.
>
> **Mobilni:** ekran „Obaveštenja i zvuci" — prekidači po tipu, dugme za probu
> zvuka, tihi sati, link ka sistemskim podešavanjima preko `Linking.openSettings()`.
>
> **Web:** isti prekidači po tipu i tihi sati u `profile-dialog.tsx` ili novom
> dijalogu. Bez probe zvuka — to je izuzetak, zapiši ga.
>
> Podešavanja se čuvaju **po profilu, ne po uređaju**, da isključen tip važi
> svuda. Tihi sati se primenjuju na serveru, u `expoPush.ts` i `push.ts`.

## ✅ Kraj Faze 1

```
@parity-check uporedi chat i obaveštenja između apps/web i apps/mobile
```

Pa checklist iz `03-NOTIFIKACIJE.md` sekcije 9, na **fizičkom Android uređaju**.

---

# FAZA 1B — AI agent (2,5 nedelje)

> Ide odmah posle chata jer živi u njemu. Zavisi samo od backenda, koji je već
> ceo tu. Pun opis u `docs/mobile/06-AGENT.md`.

## Z1B.1 — Registar modela

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/06-AGENT.md` sekciju 3.
>
> Napravi `aiProviders` tabelu i mutacije za dodavanje, izmenu, brisanje i
> postavljanje podrazumevanog modela. Samo admin (`requireAdmin`).
>
> ⚠️ **Disciplina oko ključa je najvažniji deo ovog koraka.** Polje `apiKey` sme
> da se čita isključivo iz `internalQuery` / `internalAction`. Nijedan javni
> upit ne sme da ga vrati. UI vidi samo `label`, `model`, `keySuffix`, `enabled`
> i `lastError`. Izmena ključa je „unesi nov", nikad „prikaži postojeći".
>
> Proveri moj predlog sheme — ako vidiš način da ključ procuri, reci.

Posle: `@convex-review proveri aiProviders — posebno da apiKey ne izlazi ni iz jedne javne funkcije`

## Z1B.2 — OpenAI-kompatibilan klijent

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/06-AGENT.md` sekciju 3.
>
> Napiši **jedan** adapter za OpenAI-kompatibilan `/chat/completions` sa tool
> calling-om. Groq, OpenRouter, DeepSeek, Mistral, Google preko compat
> endpointa — svi su samo `baseUrl` + `model` + `apiKey`. Ne piši više adaptera.
>
> Dodaj akciju „Testiraj vezu" koja šalje jedan trivijalan poziv **sa jednim
> alatom** i proverava da li model ume tool calling. Model koji ne ume odbij
> odmah, sa jasnom porukom.

## Z1B.3 — Alati za čitanje

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/06-AGENT.md` sekcije 2 i 4.
>
> Napravi `packages/backend/convex/agentTools.ts` sa alatima za čitanje iz
> tabele u sekciji 4.
>
> ⚠️ **Svaki alat prima `asProfileId` i izvršava se sa dozvolama tog korisnika,
> nikad kao superkorisnik.** Deljen je ključ za model, ne pristup podacima.
> Ako negde ne možeš da postigneš tu izolaciju kroz postojeće `require*`
> pomoćnike, stani i reci mi — ne zaobilazi.
>
> Kreni od pet: `listMyTasks`, `listTeamTasks`, `listOverdue`,
> `listMyThoughts`, `searchPages`. Ostale posle.

Posle: `@convex-review proveri da nijedan alat ne čita van dozvola pozivaoca`

## Z1B.4 — Petlja agenta

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/06-AGENT.md` sekciju 5.
>
> Napravi `packages/backend/convex/agent.ts` — akcija koja vodi razgovor:
> poziv modelu, izvršavanje traženih alata, vraćanje rezultata, dok model ne
> prestane da traži alate.
>
> Obavezna ograničenja: `MAX_TOOL_ROUNDS = 6`, `MAX_TOOL_CALLS_PER_ROUND = 4`.
> Bez njih jedan loš upit potroši dnevni limit.
>
> Obradi i greške provajdera — rate limit, istekao ključ, model ne postoji —
> tako da korisnik dobije razumljivu poruku, a `lastError` se upiše u
> `aiProviders`.

## Z1B.5 — Agent u chatu, oba klijenta

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/06-AGENT.md` sekcije 1 i 8.
>
> Napravi `kind: "agent"` kanal — po korisniku jedan, privatan, stoji na dnu
> liste razgovora sa 🤖 ikonom.
>
> **Web i mobilni oba.** Isti tok, isti odgovori, razlikuje se samo prikaz.
>
> Dodaj indikator „agent razmišlja" dok petlja radi, i prikaži koje je alate
> zvao — korisnik treba da vidi odakle mu odgovor, ne samo rezultat.

## Z1B.6 — `@agent` u običnim kanalima

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Pominjanje `@agent` u bilo kom kanalu poziva agenta da odgovori **u tom
> kanalu**, tako da tim vidi odgovor.
>
> Agent i dalje čita sa dozvolama onoga ko ga je pomenuo — ne onoga ko čita
> kanal. Ako odgovor sadrži nešto što neko u kanalu ne sme da vidi, to je
> curenje. Predloži mi kako da to rešimo pre nego što implementiraš.

## Z1B.7 — Alati za pisanje + potvrda

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/06-AGENT.md` sekciju 4, deo „Faza B" i „Potvrda pre
> pisanja".
>
> Dodaj alate za pisanje. **Svaki mora da ide kroz postojeću mutaciju** —
> `createTask` zove `pages.create` sa `kind: "task"`, istu funkciju koju zove i
> dugme u UI. Bez drugih vrata u sistem.
>
> Svaka izmena traži potvrdu u chatu pre izvršenja: prikaz šta će se napraviti,
> pa `[Napravi] [Izmeni] [Otkaži]`. Čitanje bez potvrde, pisanje nikad.
>
> Oba klijenta — bottom sheet na mobilnom, dijalog na webu.

## Z1B.8 — Podešavanja AI, oba klijenta

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Ekran / dijalog „AI" sa listom modela, dugmetom „Dodaj model", izborom
> podrazumevanog i prikazom poslednje greške.
>
> Forma po sekciji 3 dokumenta: naziv, provajder iz padajućeg spiska (popunjava
> `baseUrl`), model, API ključ, „Testiraj vezu".
>
> Vidljivo samo adminu.

## ✅ Kraj Faze 1B

```
@parity-check uporedi agenta između apps/web i apps/mobile
```

Probaj stvarna pitanja: „koji su mi hitni zadaci", „šta je prekoračilo rok",
„pročitaj mi poslednju misao", „koji hitni zadaci su dodeljeni drugima".

---

# FAZA 2 — Zadaci na mobilnom (2 nedelje)

> Web ovo već ima. Ovde nema W koraka — samo se mobilni izjednačava.

## M2.1 — Danas

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 4 i
> `apps/web/components/workspace/command-center-view.tsx`.
>
> Napravi tab Danas: segmenti Pregled / Moji zadaci, grupisanje po
> prekoračeno / danas / sledeće / blokirano, kartice sa svajp gestovima
> (desno = done sa haptikom, levo = meni).
>
> Bez kanbana — svajp lista.

## M2.2 — Detalj zadatka

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.2.
>
> Ekran detalja zadatka: status, prioritet, rok, izvršioci (max 10),
> instrukcije, checkpointi sa progresom (max 100), i link na chat thread.
> Checkpoint tap = odmah toggle + haptika, bez dugmeta za čuvanje.

## M2.3 — Puls i aktivnost

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Mobilne verzije `puls-view.tsx` i `activity-view.tsx`, sa navigacijom kroz
> nedelje.

---

# FAZA 3 — Stranice na mobilnom (3 nedelje)

## M3.1 — Stablo i lista

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 5. Tab Prostor: nivo oblasti, pa
> lista stranica sa ikonom po `kind`, pa ugnježdene sa breadcrumb-om. Nazad
> koristi `pageBackRoute` logiku iz `workspace-route.ts`.

## M3.2 — Editor ⚠️ najteži korak

```
/clear · Opus 4.8 · effort max · Plan mode
```

> Pročitaj `docs/mobile/00-PLAN.md` sekciju 5.1 i
> `apps/web/components/rich-text-editor.tsx` u celosti.
>
> Napravi plan za mobilni editor preko `@10play/tentap-editor`: kako se
> postojeće Tiptap ekstenzije pakuju u web bundle za WebView, kako ide bridge u
> oba smera, i kako se zadržava autosave sa `revision` konflikt-zaštitom iz
> `pages.ts`.
>
> **Prvo minimalan prototip** samo sa bold/italic/liste, da izmerimo performanse
> pre nego što uložimo u pun editor. Ne kreni na kompletnu implementaciju odmah.

## M3.3 — Tabele i prilozi

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.4 i `convex/pageTables.ts`,
> `pageFiles.ts`. Pregled tabele sa zamrznutom prvom kolonom, editovanje ćelije
> kroz bottom sheet, upload priloga iz galerije i kamere.

## M3.4 — Pretraga

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> `convex/search.ts` → mobilni ekran pretrage preko celog ekrana, rezultati
> grupisani po tipu.

---

# FAZA 4 — Odobrenja i canvasi (2 nedelje)

## M4.1 — Odobrenja

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `apps/web/components/workspace/approvals-view.tsx` i
> `convex/collaboration.ts`. Mobilni ekran odobrenja: deletion ballots, nesting
> requests, glasanje. Ovo je ekran gde je mobilni bolji od desktopa — glasa se u
> pokretu, neka bude brz i jasan.

## W4.2 — Web: embed rute za canvas

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Pročitaj `docs/mobile/00-PLAN.md` sekciju 5.2 i postojeće preview rute u
> `apps/web/app/canvas-preview/`, `codex-ideas-preview/`,
> `codex-thought-flow-preview/`.
>
> Napravi plan za `/embed/canvas/[kind]/[id]`: bez sidebara i chrome-a,
> autentikacija tokenom, touch-friendly kontrole, `postMessage` protokol iz
> dokumenta.
>
> Ovo je web rad koji služi mobilnom — ali embed rute mogu biti korisne i za
> deljenje canvasa. Reci ako vidiš tu priliku.

## M4.3 — Mobilni canvas

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.3. Full-screen ekran: native
> header, `react-native-webview` u sredini, native akcioni rail. Tap na node
> otvara native bottom sheet.
>
> Pazi na sudar gestova: WebView uzima pan i zoom, native zadržava swipe-back.

## M4.4 — Ideje i admin

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Ekran Ideje (lista + glasanje native, canvas kroz WebView iz 4.3) i admin
> ekrani: članovi (`startups.listMembers`) i pozivnice (`invites.ts`), vidljivi
> samo za `role === "admin"`.

## ✅ Kraj Faze 4

```
@parity-check uporedi sve funkcije između apps/web i apps/mobile
```

Ovde bi lista propusta trebalo da bude prazna, osim izričitih izuzetaka.

---

# FAZA 5 — Nove mogućnosti (2 nedelje)

> Ovde se web paritet **procenjuje po stavci**. Neke stvari browser može, neke
> ne. Svaka odluka se zapisuje.

| Stavka | Mobilni | Web | Napomena |
|---|---|---|---|
| Glasovna beleška → ideja | ✅ | ✅ | Browser ima `MediaRecorder` |
| Kamera → prilog | ✅ | ⚠️ | Web: upload fajla + `getUserMedia` |
| Deljenje iz drugih aplikacija | ✅ | ❌ | Share Target traži PWA instalaciju |
| Home screen widget | ✅ | ❌ | Nema web ekvivalent |
| Biometrija kao brava | ✅ | ❌ | Izuzetak |
| Haptika | ✅ | ❌ | Izuzetak |

Svaka stavka je zaseban korak sa `/clear` između:

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

> Glasovna beleška: `expo-av` snimanje na mobilnom, `MediaRecorder` na webu.
> Upload u Convex storage, transkript, pa kreiranje `ideaNodes` zapisa.
> **Backend deo mora biti zajednički** — jedna Convex akcija za oba klijenta.

> Kamera: `expo-camera` na mobilnom → prilog na stranici ili nova stranica.
> Na webu upload fajla u isti tok. Zajednička mutacija.

> Widget sa današnjim zadacima. Native kod (Glance na Androidu) — objasni mi
> obim posla pre nego što kreneš. Izuzetak za web, zapiši ga.

> Haptika: `expo-haptics` na završetku zadatka, slanju poruke, svajpu.
> Izuzetak za web.

---

# FAZA 6 — Distribucija timu (1 nedelja)

> Nema App Store-a, nema Play Store-a. Interna aplikacija.

## 6.1 — Grafika

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Napravi plan za grafičke resurse: ikona u svim veličinama, adaptivna ikona za
> Android, splash, **monohromatska bela ikona za obaveštenja**. Reci mi tačne
> dimenzije i šta moram sam da nacrtam.
>
> I promeni `com.PROMENI.notionclone` u `app.json` u pravi bundle identifier —
> pitaj me koji pre nego što upišeš. Isto za `PROMENI.example.com` u
> `associatedDomains` i `intentFilters`.

## 6.2 — Provera pred puštanje

```
/clear · Opus 4.8 · effort max · Plan mode
```

> Pročitaj sve iz `docs/mobile/`. Prođi kroz `apps/mobile` i `apps/web` i
> napravi izveštaj:
>
> - šta iz planiranog nije implementirano
> - gde nedostaju prazna stanja ili obrada grešaka
> - gde nema `accessibilityLabel`
> - gde bi aplikacija pukla bez mreže
> - **koje funkcije postoje na jednom klijentu a ne na drugom**
>
> Ne popravljaj — samo prijavi, sortirano po ozbiljnosti.

## 6.3 — Build i distribucija

```
/clear · Opus 4.8 · effort xhigh · Accept Edits
```

> Vodi me kroz `eas build --profile preview --platform android`, i objasni kako
> tim instalira APK sa linka. Reci mi šta ja kucam, a šta ti radiš.
>
> Napiši i `docs/mobile/DISTRIBUCIJA.md` — kratko uputstvo za članove tima:
> kako da instaliraju, kako da dozvole instalaciju iz nepoznatog izvora, kako da
> uključe obaveštenja, i šta da rade kad stigne nova verzija.

---

# DEO D — Kad zapne

| Situacija | Šta uraditi |
|---|---|
| Isti bag dva puta nepopravljen | `/clear`, `effort max`, opiši bag **od nule** bez istorije pokušaja |
| Claude menja fajlove koje nisi tražio | Manual mode, suzi prompt na jedan fajl |
| Odgovori postali plitki | `/context` — verovatno preko 70%. `/compact` ili `/clear` |
| Nešto puklo posle izmene | `Esc` `Esc` → `/rewind` |
| Ne razumeš zašto ne radi | `ultrathink: ` + opis |
| Veliki refaktor, hoćeš da komentarišeš plan po delovima | `/ultraplan <opis>` |
| „Radi dok ne prođe" | Zadatak u fajl, pa `/goal <merljiv uslov>` |
| Zaboravio si da li nešto ima na webu | `@parity-check <funkcija>` |

---

# DEO E — Svaki dan

```bash
# Terminal 1
npx convex dev

# Terminal 2 — mobilni
cd apps/mobile && npx expo start --dev-client

# Terminal 3 — web
npm run dev

# Terminal 4
claude
```

U sesiji: `/model` → Opus 4.8, `/effort xhigh`.

Posle svakog koraka:

1. `@convex-review` ako je diran backend
2. `@rn-review` ako je diran mobilni ekran
3. `@web-review` ako je diran web prikaz
4. `npm run check`
5. Test na **fizičkom Android telefonu** — ne samo na emulatoru
6. Test na webu
7. Commit
8. `/clear`

Na kraju svake faze: `@parity-check`.

---

# Rezime

| Tip posla | Effort | Režim |
|---|---|---|
| Schema, nepovratne odluke | `max` | Plan |
| Backend funkcije | `xhigh` | Plan |
| Nov ekran ili prikaz | `xhigh` | Plan / Accept Edits |
| Testovi | `xhigh` | Accept Edits + `/goal` |
| Mehanički posao | `high` | Accept Edits |
| Zaglavljeno posle 2 pokušaja | `max` | Manual |

Model je **Opus 4.8** svuda. Izaberi ga iz `/model` liste — alias `opus` vodi na
Opus 5.
