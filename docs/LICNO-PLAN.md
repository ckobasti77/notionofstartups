# LICNO — lični nivo „Ja": Moj dan, svi zadaci, Inbox, Poruke, bolji zadaci i pokret kao na telefonu (noćni run, 24.10.2026.)

> Izvor istine za ceo run. Svaki korak ga čita pre rada. Tehničke planove koraci pišu u
> `docs/licno/planovi/<ID>.md`; ovaj fajl se ne prepisuje. Odluke donete tokom noći idu u
> sekcije koraka u `docs/LICNO-PROGRESS.md` (red **ODLUKE:**), ne ovde.

## 0. Šta pravimo, u jednoj rečenici

Devotion dobija **lični nivo „Ja"** iznad startupova — jedno mesto gde Jovan (i svaki član) vidi šta danas radi u **svim** startupima, svoje privatne obaveze, sva obaveštenja i sve razgovore — a zadaci i cela aplikacija dobijaju brži UX i pokret kakav imaju operativni sistemi telefona.

**Stanje danas.** Sve je vezano za izabrani startup: web shell (`apps/web/components/workspace/workspace-shell.tsx`) uvek ima `startup`, rute su `?view=today|my-tasks|chat|…&startupId=…`; mobilni tabovi (Danas, Prostor, Chat, Obaveštenja, Više) čitaju `useActiveStartup()`. Jovan ima 6 startupa (Cluck Rush, Silly Handyman, Beauty Masterclass, Enigma IT, Scan Me, Nauči AI) i da bi znao šta radi danas mora da prođe kroz svaki. Novi zadatak je dijalog „Nova stranica" sa 8 polja i datumom u formatu `mm/dd/yyyy`. Pokret je namerno suzdržan (`apps/mobile/src/theme/motion.ts`, GSAP samo za ulaz prikaza u `WorkspaceStage`).

**Posle runa.** Aplikacija se otvara na **Moj dan**: prekoračeno, danas, planirano, u toku — iz svih startupa i ličnih zadataka, na jednom ekranu. Postoje **Moji zadaci** (svi startupi + lično, filteri, grupisanje, prečice), **Inbox** (obaveštenja iz svih startupa + „Čeka tebe"), **Poruke** (lični DM i grupe + svi kanali svih startupa). Startup ostaje svoj svet (oblasti, ideje, misli, kanali, komandni centar). Zadaci se brže prave i menjaju. Sve se kreće fluidno (spring fizika), na webu kroz GSAP, na telefonu kroz Reanimated, sa istim brojevima.

## 1. Odluke (Jovan, 24.10.2026.)

| # | Odluka |
|---|---|
| O1 | „Ja" je **prvi nivo**. Web: uska traka (rail) levo sa „Ja" + logom svakog startupa (+ dodaj). Telefon: tabovi Danas, Poruke i Inbox postaju **globalni**, startup živi u tabu „Prostor". Aplikacija se otvara na **Moj dan**. |
| O2 | Lične poruke: DM i grupe napravljeni iz globalnog chata su **lični (van startupa)**. Postojeći DM-ovi u startupima **ostaju gde jesu** i u globalnom chatu se vide pod svojim startupom. |
| O3 | **Lični zadaci postoje**: privatne obaveze van startupa (vidi ih samo vlasnik), brzi unos, „Prebaci u startup", i **planiranje dana** — u Moj dan se dodaje bilo koji zadatak iz bilo kog startupa ili lični. |
| O4 | **Pun obim** u jednoj noći (22 koraka, parovi web → telefon). |
| O5 | Chat ostaje i **unutar startupa** (kanali, oblasti, niti, DM u startupu) i dobija **globalni hub**. |
| O6 | Pokret: „ultra lepo animirano, kao na operativnim sistemima telefona". Web kroz **GSAP**; telefon kroz Reanimated (GSAP ne radi u React Native-u). |
| O7 | Koriste se skillovi: design-dna, ui-ux-pro-max, taste (design-taste-frontend), impeccable, GSAP skillovi, motion-design (lista i putanje u `rules.md`). |
| O8 | Aplikacija je za tim od 10–15 ljudi, nije komercijalna sada; kasnije možda jeste — ne praviti odluke koje to zatvaraju, ali ne graditi multi-tenant sada. |
| O9 | Modeli: Opus 5.5 za planove i teške korake, Sonnet 5.5 za sitnije prolaze; Sonnet i Haiku kao radnici (subagenti) u koracima. Fable se ne koristi. |
| O10 | Ništa ne izlazi sa mašine: run radi na lokalnoj grani `licno-run`, bez push-a i deploy-a. |

**Predlozi (Claude, čekaju potvrdu)** — izbori koje sam napravio jer odgovor nije postojao; run ih sledi, a izveštaj ih ponovo navodi:

| # | Predlog | Zašto | Gde se menja |
|---|---|---|---|
| P1 | Web rute ličnog nivoa: `?view=me-today`, `me-tasks`, `me-inbox`, `me-chat` (+ `channelId`). Bez `view` otvara se `me-today`. Startup rute ostaju iste, sa `startupId`. | Kompatibilno sa postojećim `WorkspaceRoute` modelom i starim linkovima. | `apps/web/components/workspace/types.ts`, `workspace-route.ts` |
| P2 | Startup prikaz `today` u UI-ju dobija ime **„Komandni centar"** (meni i naslov), da se ne meša sa „Moj dan". | Dva „Danas" ekrana bi zbunjivala. | sidebar, header, mobilni Prostor |
| P3 | Lični zadaci = nova tabela `personalTasks` (vlasnik, naslov ≤ 200, beleška ≤ 5 000, status open/done, prioritet opciono, rok opciono). Bez izvršilaca, bez deljenja. Brisanje = arhiva (za „Poništi"). | Najmanji model koji pokriva zahtev; ne dira `pages`. | `packages/backend/convex/personalTasks.ts` |
| P4 | Plan dana = tabela `myDayEntries` (profil, `dayKey` `YYYY-MM-DD` po lokalnom danu uređaja, referenca na startup zadatak ILI lični zadatak, pozicija). Nezavršene stavke prethodnih 7 dana nude se kao „Preneto od ranije" (ne prenose se same). | Ritual planiranja kao Things/Sunsama, bez magije. | `packages/backend/convex/myDay.ts` |
| P5 | Moj dan se podrazumevano grupiše **po vremenu**: Prekoračeno · Danas · Planirano · U toku · Uskoro (7 dana) · Blokirano (skupljeno) · Završeno danas (skupljeno). Prekidač „Po startupu". Grupisanje je čista funkcija u `packages/shared` (isti rezultat na webu i telefonu). | Odgovara na „šta danas", a ne „gde". | `packages/shared/src/my-day.ts` |
| P6 | Globalni chat: `startupId` u tabelama `chatChannels`, `chatMessages`, `chatMembers`, `chatReads`, `chatPresence` postaje `Id<"startups"> \| null` (samo širenje, bez migracije podataka). `null` = **lični razgovor**: pristup isključivo eksplicitnim članovima (`chatMembers`). Lični DM sme između bilo koja dva aktivna profila (instanca je jedan tim). Grupa do 50 članova. Ako je potrebno, i `notifications.startupId` postaje `\| null` za lične poruke. | Najmanje novog koda: isti chat sloj radi za oba opsega; stari klijenti nikad ne vide lične kanale jer ih traže po startupu. | `packages/backend/convex/schema.ts`, `chat.ts`, `lib/notifications.ts` |
| P7 | Inbox: jedan feed obaveštenja iz svih startupa + lični chat, filter po startupu, „Označi sve kao pročitano" globalno; sekcija **„Čeka tebe"** (glasanja o brisanju i zahtevi za ugnežđavanje iz svih startupa). Nova obaveštenja se NE uvode. | Pokriva „sve na jednom mestu" bez novih izvora buke. | `packages/backend/convex/inbox.ts` |
| P8 | Brzi unos: web prečica `Q` (van polja za unos) + dugme u traci i u Moj dan; telefon FAB na Danas. Podrazumevano odredište **Lično**; može startup + oblast (pamti se poslednja oblast po startupu, lokalno). Rok čipovi: Danas · Sutra · Vikend · Sledeće nedelje · Datum. Opcija „Dodaj i u Moj dan" (podrazumevano uključeno kad je rok danas). | Unos za 3 sekunde; trijaža kasnije. | web `components/me/`, mobilni `components/me/` |
| P9 | Datumi: srpski format svuda („danas", „sutra", „pon 27. okt", „27.10.2026."). Izvorni `<input type="date">` (`mm/dd/yyyy`) zamenjuje sopstveni birač datuma (popover sa čipovima + kalendar, nedelja počinje ponedeljkom). Rok se i dalje čuva u **lokalno podne** (`fromDateInputValue` obrazac) — ista semantika kao danas. | `mm/dd/yyyy` u srpskoj aplikaciji je greška; semantika roka se ne menja. | shared `dates.ts`, web `components/ui/date-picker.tsx`, mobilni `date-picker-sheet.tsx` |
| P10 | Pokret: jedan rečnik u `packages/shared/src/motion.ts` (trajanja + spring preseti zadati kao `response`/`dampingRatio`, Apple model). Web: GSAP (CustomEase napravljen iz spring krive, Flip za promene rasporeda, timeline za prelaze). Telefon: Reanimated `withSpring` sa istim brojevima. Framer Motion ostaje gde već postoji, ali **isti element ne animiraju dve biblioteke**. Nema `@gsap/react` — koristi se postojeći obrazac `gsap.context()` / `gsap.matchMedia()` u `useLayoutEffect`. | Isti osećaj na obe platforme, bez novog paketa. | shared, `apps/web/lib/motion/`, `apps/mobile/src/theme/motion.ts` |
| P11 | Ikone ostaju **lucide** (pravilo repoa — skillovi koji traže Phosphor se tu ne slušaju), bez emodžija, bez novih fontova (Geist ostaje). Boje samo kroz tokene; nov token se dodaje u OBE teme i na webu i na telefonu. | Pravila repoa pobeđuju savete skillova. | `globals.css`, `apps/mobile/src/theme/tokens.ts` |
| P12 | Telefon: **nijedan nov native paket** (radi sa postojećim dev buildom). Web: novi paket samo uz ODLUKU (MIT/Apache, veličina). GSAP pluginovi (Flip, CustomEase, Draggable, InertiaPlugin) su deo već instaliranog `gsap` paketa — dozvoljeni. | Jovan ne mora da pravi nov build da bi probao. | — |
| P13 | Izlog (showcase) za snimke: web ruta `/izlog` (samo dev: u produkciji `notFound()`, noindex), prezentacione komponente sa fixture podacima, tema kroz `?tema=tamna|svetla`, ekran kroz `?ekran=<ime>`. Telefon: nove komponente se dodaju u postojeći `apps/mobile/src/app/(app)/dizajn-katalog.tsx` za ručnu proveru na uređaju. | Playwright ne može da se prijavi (auth se ne dira). | `apps/web/app/izlog/` |
| P14 | Bedževi: pločica „Ja" = broj nepročitanih obaveštenja (svih) + nepročitanih poruka (svih); pločica startupa = tačka ako u tom startupu ima nepročitanog. Mobilni tabovi Poruke/Inbox nose globalne brojeve. | Jedan broj koji znači „nešto te čeka". | rail, tab bar |
| P15 | Startup „Komandni centar" (tim, opterećenje, trijaža) na telefonu prelazi u tab **Prostor** (prvi red/segment), jer tab Danas postaje lični. | Ništa se ne gubi, samo se seli. | mobilni `prostor.tsx` |
| P16 | Postojeći per-startup prikazi `my-tasks` i `chat` ostaju; u startup meniju „Moji zadaci" ostaje (filtrirano na taj startup), a novi globalni su u „Ja". | Bez lomljenja navika i linkova. | sidebar |

## 2. Obim

**Radimo:**
1. `packages/shared`: datumi i formati (sr), grupisanje za Moj dan, sortiranje zadataka, rečnik pokreta i spring kriva — sve čiste funkcije sa testovima.
2. Backend (Convex): `personalTasks`, `myDayEntries`, „zadaci svuda", globalni Inbox i „Čeka tebe", globalni chat (lični DM i grupe, hub, nepročitano po opsegu), push za lične poruke. Testovi uključujući negativne authz slučajeve.
3. Web: traka „Ja + startupi", lični nivo (Moj dan, Moji zadaci, Inbox, Poruke), brzi unos, plan dana, panel zadatka, birač datuma, prečice, GSAP sistem pokreta, izlog.
4. Telefon: novi tabovi (Danas · Prostor · Poruke · Inbox · Više), isti ekrani i radnje kao web (paritet je pravilo repoa), Reanimated preseti, swipe radnje, haptika.
5. Zadaci unutar startupa: brže pravljenje, kompaktan detalj zadatka (čipovi umesto forme), radnje u listi, srpski datumi, „Dodaj u Moj dan" svuda.
6. Pokret kroz celu aplikaciju, prazna/greška/učitavanje stanja, telefonske širine, teme, pristupačnost, performanse, paritet, revizija, izveštaj.

**Ne diramo:**
- Auth tok (prijava, pozivnice, lozinke, `BOOTSTRAP_ADMIN_CODE`), `convex/auth.ts`, `auth.config.ts`, `http.ts` rute za auth.
- Push infrastrukturu osim podataka koje lične poruke traže: VAPID ključevi, Expo kanali, zvuci i njihovi ID-jevi (`lib/notificationChannels.ts`) ostaju.
- Unutrašnjost editora (tentap bundle `apps/mobile/editor-web/`, Tiptap ekstenzije) i kanvasa (`@xyflow/react` čvorovi, embed protokol) — samo okviri oko njih smeju dobiti pokret.
- AI provajdere, migracije postojećih podataka (nema backfill-a; šema se samo **širi**), crons osim ako plan izričito traži.
- Build/deploy konfiguraciju: `next.config.ts`, `apps/mobile/app.json`, `eas.json`, bundle ID-jevi, verzije paketa (bez upgrade-a), Vercel podešavanja.
- Produkciju: nikakav deploy, nikakve komande nad produkcionom bazom.

## 3. Informaciona arhitektura

### 3.1 Dva nivoa
- **Ja (lični nivo)** — sve što pripada osobi, kroz sve startupe: Moj dan, Moji zadaci (svi), Inbox, Poruke. Podaci se uvek filtriraju na startupe u kojima je osoba aktivan član.
- **Startup** — postojeći svet: Početna, Komandni centar (bivše „Danas"), Moji zadaci (u tom startupu), Chat (kanali tog startupa), Moje misli, Ideje, Odobrenja, Puls, Aktivnost, Oblasti i stranice.

### 3.2 Web
```
+----+----------------------+----------------------------------------------+
| Ja | Moj prostor          |  Moj dan - subota 24. oktobar                |
|----|  > Moj dan       3   |  ...                                         |
| CR |    Moji zadaci       |                                              |
| SH |    Inbox        12   |                                              |
| BM |    Poruke        4   |                                              |
| EI |  -- Startupi --      |                                              |
| SM |  Cluck Rush   2 otv. |                                              |
| NA |  ...                 |                                              |
| +  |                      |                                              |
| o  |  [Jovan v]           |                                              |
+----+----------------------+----------------------------------------------+
 rail  sidebar (po opsegu)    glavni prostor
```
- **Traka (rail)**, ≥ `lg`: širina 72 px. Gore „Ja" (avatar), pa pločice startupa (logo ili inicijal), pa „+" (samo admin), dole tema i profil. Aktivna pločica ima indikator (pilula uz levu ivicu) koji **klizi** na novu pločicu (GSAP Flip, spring `snappy`). Hover: tooltip sa imenom. Tastatura: strelice gore/dole, Enter.
- **Sidebar** prikazuje meni aktivnog opsega. U opsegu „Ja": zaglavlje (avatar, ime, „Moj prostor"), stavke Moj dan, Moji zadaci, Inbox, Poruke, pa kratka lista „Startupi" (ime + broj mojih otvorenih zadataka; klik prelazi u startup). U opsegu startupa: postojeći sadržaj **bez** padajućeg birača startupa (traka ga menja).
- **Ispod `lg`** nema trake: zaglavlje sa menijem; u meni-sheet-u na vrhu je red „Ja" + čipovi startupa (horizontalni skrol), ispod meni aktivnog opsega.
- Promena opsega: sidebar sadržaj se smenjuje (fade + 8 px pomeraj u smeru kretanja kroz traku), glavni prostor dobija prelaz stranice (`gentle`).
- Podrazumevani prikaz bez `view`: `me-today`. Postojeći linkovi sa `view=…&startupId=…` rade kao i pre.
- Klik na stavku iz drugog startupa (npr. zadatak u Moj dan) otvara **panel zadatka** u mestu; „Otvori u startupu" prelazi u taj startup i otvara stavku.

### 3.3 Telefon
Tabovi: **Danas** (Moj dan, globalno) · **Prostor** (startup, sa biračem) · **Poruke** (globalno) · **Inbox** (globalno) · **Više**.
- Danas: veliki naslov sa datumom, prsten napretka, sekcije kao na webu, FAB brzi unos, dugme „Isplaniraj dan", ulaz „Svi zadaci" (stack ekran `moji-zadaci`).
- Prostor: postojeći sadržaj + **Komandni centar** startupa kao prvi segment/red (P15).
- Poruke: hub (Lično gore, pa grupe po startupima), nov DM/grupa, `razgovor/[id]` radi i za lične kanale.
- Inbox: feed iz svih startupa, čipovi startupa, segment „Čeka tebe".
- Više: profil, podešavanja, ostalo kao danas.
- Push otvaranje: lični razgovor ne menja aktivan startup; startup cilj menja aktivan startup kao i danas.

## 4. Model podataka i API (Convex)

Sve funkcije imaju `args` i `returns` validator, pristup kroz `requireProfile` / `requireStartupMember`, upite kroz `.withIndex()`, limite iz `lib/validators.ts`. Upiti ne čitaju sat (`Date.now()` samo u mutacijama) — klijent šalje `now`/`dayKey` kad treba. Tačne potpise i fajlove fiksira plan K01.

### 4.1 Lični zadaci — `personalTasks`
Polja: `profileId`, `title` (≤ 200), `notes` (opciono, ≤ 5 000), `status` (`"open" | "done"`), `priority` (opciono, postojeći `taskPriorityValidator`), `dueDate` (`number | null`, lokalno podne), `sortAt` (rok ili `createdAt`, za indeks), `completedAt`, `archivedAt`, `createdAt`, `updatedAt`.
Indeksi (primer): `by_profile_status_archived_sort` = `profileId, status, archivedAt, sortAt`.
Funkcije: `list` (moji, filter status, limit ≤ 300), `create`, `update`, `setStatus`, `archive`, `restore`, `moveToStartup` (napravi `task` stranicu u izabranom startupu i oblasti kroz POSTOJEĆI put za kreiranje stranice — `lib/page_creation.ts` — sa mnom kao izvršiocem, prenosi rok/prioritet, beleška → instrukcije; arhivira lični zadatak; vraća `pageId`).
Authz: sve isključivo za vlasnika; tuđ id → ista greška kao nepostojeći.
Gornja granica: 500 otvorenih po profilu.

### 4.2 Plan dana — `myDayEntries`
Polja: `profileId`, `dayKey` (`YYYY-MM-DD`), `refKind` (`"task" | "personal"`), `taskPageId` (opciono), `personalTaskId` (opciono), `refKey` (`task:<id>` / `personal:<id>`), `position`, `createdAt`.
Indeksi: `by_profile_day_position`, `by_profile_ref`.
Funkcije: `overview` (JEDNA reaktivna pretplata: moji otvoreni dodeljeni zadaci iz svih startupa sa mini podacima startupa i oblasti, moji otvoreni lični zadaci, završeni danas (po `doneSince` koji šalje klijent), stavke plana za `dayKey` i prethodnih 7 dana), `plan`, `unplan`, `reorder`, `carryOver` (premesti izabrane stare stavke na danas), `clearOld`. Grupisanje u sekcije radi klijent kroz `@devotion/shared` (P5).
Pravila: zadatak u planu mora biti dostupan (član startupa) ili moj lični; isti `refKey` jednom po danu; ≤ 50 stavki po danu; arhivirani/obrisani ciljevi se tiho preskaču pri čitanju.

### 4.3 Zadaci svuda
Novi upit (npr. `tasks.listEverywhere`) za „Moji zadaci": moji dodeljeni zadaci iz svih aktivnih startupa, filter `scope` (`open` / `done` / `all`), opcioni `startupId`, limit ≤ 200, vraća sažetak zadatka + `startup` (id, ime, logoUrl) + `area` (id, label, key). Postojeći `tasks.listMine` ostaje netaknut (koriste ga postojeći ekrani).

### 4.4 Inbox — `inbox.ts`
- Šema: novi indeksi na `notifications`: `by_recipient_and_createdAt` (`recipientProfileId, createdAt`) i `by_recipient_and_readAt` (`recipientProfileId, readAt`). Postojeći indeksi ostaju.
- `feed` (paginirano, najnovije prvo, opcioni `startupId`, opcioni `unreadOnly`, sa mini podacima startupa; lične poruke imaju `startup: null`), `unreadCounts` (`total`, `byStartup`, `personal`, sa granicom kao postojeći `unreadCount`), `markAllRead` (svi opsezi, serijski kroz scheduler kao postojeći `markAllReadBatch`), `pending` („Čeka tebe": glasanja `deletionBallots` sa `vote: "pending"` za mene, `pageNestingRequests` i `nestingRequests` gde sam autor roditelja i status `pending`; svaka stavka sa startupom, naslovom i ciljem).
- Obaveštenje iz startupa u kome više nisam član se ne prikazuje.

### 4.5 Globalni chat
- Širenje `startupId` (P6). Svaki postojeći poziv `requireStartupMember(ctx, channel.startupId)` dobija granu za `null`.
- `requireChannelAccess`: `startupId === null` → samo eksplicitno članstvo (`chatMembers`, `leftAt === null`).
- `channelRecipients`, `insertMessage`, `unreadSummary` (+ `personal`), `messages`, `sendMessage`, `markChannelRead`, `setPresence`, `toggleReaction`, `editMessage`, `deleteMessage`, `setNotificationLevel`, `generateUploadUrl`, `searchMessages`, `channelMembers` — rade za oba opsega.
- Novo: `listConversations` (hub: lični kanali + za svaki moj startup opšti kanal, javni kanali oblasti, moji DM/custom/niti; sortirano po poslednjoj poruci; nepročitano po kanalu; granice kao `CHAT_CHANNELS_CAP`), `openPersonalDm` (`otherProfileId`), `createPersonalGroup` (`name`, `memberProfileIds` ≤ 50), `updatePersonalGroup` (ime/članovi, samo vlasnik), `leavePersonalGroup`, `listPeople` (aktivni profili osim mene; vraća SAMO `_id`, `displayName`, `avatarUrl` i imena zajedničkih startupa — bez e-pošte i uloge).
- Lične poruke prave obaveštenja (`chat_dm` / `chat_message` / `chat_mention`) sa `startupId: null`; K06 dopunjava `inbox.feed` / `unreadCounts.personal` / `markAllRead` za njih; `createNotification` za `null` preskače proveru članstva u startupu (pozivalac je već proverio članstvo u kanalu). Push payload nosi `startupId: null`; web `public/sw.js` i mobilni deep link vode u lični chat.
- Stari klijenti: lične kanale nikad ne vide (traže kanale po startupu); `byStartup` u `unreadSummary` ne sadrži `null`.

### 4.6 Testovi backend-a
`convex-test` po postojećem obrascu (`*.test.ts` pored modula). Obavezni negativni slučajevi: tuđi lični zadatak / plan / razgovor → odbijeno; startup u kome nisam član → ne curi ni u Moj dan, ni u Inbox, ni u hub; arhiviran član ne dobija lične poruke; `moveToStartup` u startup bez članstva → odbijeno.

## 5. Ekrani (sažetak; raspored, stanja i pokret fiksira plan K07)

- **Moj dan** — zaglavlje: dan i datum, kratak pozdrav, prsten napretka (završeno danas / planirano+rok danas), „Isplaniraj dan", red za brzi unos. Sekcije po P5; svaka stavka: kvačica, naslov, čip startupa (logo + ime) ili „Lično", oblast, rok, prioritet; radnje: završi, rok (brzi izbor), dodaj/ukloni iz Moj dan, otvori panel. Desna kolona na širokom ekranu: Inbox ukratko, nepročitane poruke, „Čeka tebe".
- **Isplaniraj dan** — sheet/dijalog: predlozi (rok ove nedelje, hitno/visok prioritet, status „Sledeće", lični otvoreni, preneto od ranije) sa „+"; tastatura.
- **Moji zadaci** — lista (startupi + lično), filteri (startup, status, prioritet, rok), grupisanje (startup / rok / status / prioritet), pretraga, „prikaži završene". Web prečice: `j`/`k` ili strelice, `x` završi, `Enter` panel, `d` rok, `p` prioritet, `t` Moj dan, `/` pretraga, `q` brzi unos, `?` pomoć.
- **Panel zadatka** — desni drawer (web) / sheet (telefon): naslov, čipovi status/prioritet/rok/izvršioci (popover), koraci (postojeća lista checkpointa), instrukcije, „Otvori u startupu", „Dodaj u Moj dan". Dozvole iz `tasks.updateMetadata` se prikazuju kao onemogućen čip sa objašnjenjem, ne kao pasus teksta.
- **Brzi unos** — P8.
- **Inbox** — „Sve / Nepročitano / Čeka tebe", grupisano po danima, čipovi startupa, „Označi sve", veza na podešavanja obaveštenja.
- **Poruke** — dva panela (web) / lista + razgovor (telefon); levo Lično pa startupi (sklopivo), pretraga, „Nova poruka" i „Nova grupa"; desno postojeći razgovor (lista poruka, kompozitor, reakcije, prilozi).
- **Zadaci u startupu** — Komandni centar, Moji zadaci (startup), tabla i tabela dobijaju iste radnje u redu i panel zadatka; „Nova stranica → Zadatak" postaje brz (naslov + Enter, ostalo kao čipovi), datum kroz novi birač.

## 6. Pokret (jezik pokreta)

**Ličnost:** premium i fluidan (iOS osećaj): springovi, bez dugih trajanja, sve je **prekidivo** i kreće od trenutne vrednosti, nijedna animacija ne blokira unos (bez `pointer-events: none` tokom prelaza, bez čekanja da se animacija završi pre sledeće radnje).

**Rečnik (`packages/shared/src/motion.ts`)** — predlog brojeva, K02 ih fiksira i testira:
| Ime | Šta | Vrednost |
|---|---|---|
| `press` | pritisak (scale 0.97) | 90 ms |
| `quick` | mikro povratna informacija | 160 ms |
| `base` | standardni prelaz | 240 ms |
| `slow` | prelaz stranice/opsega | 380 ms |
| `snappy` | spring za UI odgovor | response 0.32 s, dampingRatio 0.86 |
| `smooth` | sheet, drawer, panel | response 0.42 s, dampingRatio 1.0 |
| `gentle` | prelaz stranice/opsega | response 0.50 s, dampingRatio 1.0 |
| `bouncy` | samo trenuci uspeha (kvačica) | response 0.45 s, dampingRatio 0.7 |
| stagger | razmak između stavki liste | 24 ms, najviše 6 stavki, ukupno ≤ 320 ms |

Konverzija: stiffness = (2π / response)², damping = 4π · dampingRatio / response, mass = 1. Za GSAP se iz istog springa uzorkuje kriva i pravi `CustomEase` (trajanje = vreme smirivanja). Za Reanimated se šalje `{ stiffness, damping, mass }`.

**Potpisni trenuci (obe platforme):**
1. **Završi zadatak** — kvačica se puni (`bouncy`) i iscrtava (180 ms), naslov dobija precrt koji prolazi sleva nadesno (200 ms), posle ~600 ms red se skuplja i prelazi u „Završeno" (web Flip / telefon layout tranzicija), toast „Poništi"; telefon: haptika uspeha.
2. **Promena opsega** (Ja ↔ startup) — indikator klizi kroz traku (`snappy`), meni se smenjuje sa pomerajem u smeru kretanja, glavni prostor `gentle`.
3. **Otvaranje panela zadatka** — red se blago „podigne", drawer/sheet ulazi `smooth`, pozadina se zatamni; web: naslov reda Flip-om prelazi u zaglavlje panela.
4. **Brzi unos** — dijalog ulazi iz scale 0.96 (`snappy`); nova stavka „uleti" na svoje mesto u listi (web Flip), telefon: spring ulaz + haptika.
5. **Brojevi** — bedževi i brojači se menjaju „kotrljanjem" cifara; prsten napretka se puni `smooth`.
6. **Swipe na telefonu** — red prati prst 1:1, akcija se otkriva i raste ka pragu, haptički tik na pragu, pušta se sa brzinom (spring ka kraju ili nazad).
7. **Tab bar** (telefon) — ikona izabranog taba kratko „odskoči" (scale 0.9 → 1, `bouncy`).
8. **Liste** — ulaz: fade + 8 px nagore + scale 0.98 → 1 sa stagger-om; promene redosleda/brisanje: Flip (web) / `LinearTransition.springify()` (telefon).

**Smanji pokret** (`prefers-reduced-motion` / `useReducedMotion`): nema pomeranja, skaliranja, Flip-a ni stagger-a — samo promena neprozirnosti ≤ 120 ms. Gest i navigacija ostaju.

**Web arhitektura:** `apps/web/lib/motion/` — registracija pluginova jednom (klijent), `CustomEase` preseti iz shared springova, kuke (`useEnter`, `useFlip`, `usePress`, `useNumberRoll`, `useRailIndicator`), komponente (`MotionStage` za prelaz prikaza, `AnimatedCheck`, `Collapse`, `Drawer` nad Radix Dialog-om). Postojeći `WorkspaceStage` prelazi na novi sistem. Svaki GSAP kod je u klijent komponenti, čisti `gsap.context()` na unmount-u, poštuje `gsap.matchMedia()` za smanjen pokret.
**Telefon arhitektura:** `apps/mobile/src/theme/motion.ts` dobija springove iz shared (postojeći exporti ostaju), `apps/mobile/src/components/motion/` (pressable sa scale-om, animirana kvačica, kotrljanje broja, swipe red, prsten napretka, layout preseti).

## 7. Vizuelni jezik

- Postojeći DNK se zadržava: indigo akcenat (`--primary`), tamna tema je primarna, mreža u pozadini (`.app-canvas`), Geist, kartice sa `desk-surface` senkom, radijusi iz `--radius`. K03 ga zapisuje u `docs/licno/DIZAJN-DNK.md` (tokeni, tipografija, razmaci, radijusi, senke, pokret, potpisni detalji) — svaki UI korak ga čita.
- Novo u ličnom nivou: jedan potpisni detalj (predlog: čip startupa = mala „squircle" pločica sa logom/inicijalom i bojom startupa izvedenom iz imena, ista kao u traci), bez generičkog „AI dashboard" izgleda, bez proizvoljnih gradijenata.
- Kopija: srpski latinica, kratko, „ti" oblik, glagoli na dugmićima („Završi", „Isplaniraj dan", „Prebaci u startup"). Prazna stanja imaju rečenicu + jednu radnju.
- Telefon: dodir ≥ 44 pt, osnovni tekst ≥ 16 px, safe area gore/dole, tastatura ne prekriva unos.

## 8. Tehnika i granice

- **Nov kod ide u:** backend `packages/backend/convex/{personalTasks,myDay,inbox}.ts` (+ izmene `chat.ts`, `tasks.ts`, `schema.ts`, `lib/*`); shared `packages/shared/src/{dates,my-day,task-sort,motion}.ts` (+ testovi, + export iz `index.ts`); web `apps/web/components/me/` (lični nivo), `apps/web/components/motion/` i `apps/web/lib/motion/`, `apps/web/app/izlog/`; telefon `apps/mobile/src/components/me/`, `apps/mobile/src/components/motion/`, ekrani u `apps/mobile/src/app/(app)/`.
- **Prezentacione komponente:** UI se pravi tako da podaci ulaze kroz props; kontejner (koji zove `useQuery`) je tanak. Tako izlog i testovi rade bez prijave.
- **Paketi:** postojeći (`gsap`, `framer-motion`, Radix, `sonner`, `lucide-react`; telefon `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `react-native-svg`). Novi samo uz ODLUKU; na telefonu nijedan native.
- **Performanse:** Moj dan je jedna pretplata; nijedan upit ne čita više od ~600 dokumenata; nema N+1 bez granice; web: lični nivo se učitava lenjo (dynamic import) kao postojeći teški prikazi; GSAP pluginovi se registruju jednom.
- **Pristupačnost:** tastatura i fokus na webu, `aria-*` za ikonice, kontrast AA u obe teme, `prefers-reduced-motion`; telefon `accessibilityLabel`/`accessibilityRole`.
- **Teme:** svaki nov ekran u svetloj i tamnoj temi (web i telefon).
- **Konvencije vs. stvarnost (provereno 24.10.):** `.claude/rules/mobile.md` traži NativeWind `className`, ali stvarni mobilni kod skoro svuda koristi `StyleSheet.create` + tokene (`@/theme/tokens`, `useThemeColors()`) — 137 od 151 `.tsx` fajla; NativeWind samo u 1. Run **sledi stvarni kod**. `AGENTS.md` kaže „GSAP samo za timeline/scroll" — za ovaj run važi O6/P10 (GSAP je glavni web motor za nov pokret).
- **Poznate zamke ovog repoa:** `api.x.y` je Proxy koji na svaki pristup daje NOVU referencu — nikad kao `useMemo`/`useEffect` zavisnost (ključ preko `getFunctionName`); Convex `returns` validator odbija višak polja (vidi `pageDocumentValidator`); vitest pod opterećenjem ume da pada na timeout — provera ide sa `--no-file-parallelism`; nijedan linter ne pokriva `apps/mobile` — pokriva ga `tsc`.

## 9. Koraci

Tačne vrednosti modela, efforta, režima i sesije su u `.nocni-run/licno/steps.json`. Prompt svakog koraka je u `.nocni-run/licno/prompts/<ID>.md`.

| ID | Naslov | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| K01 | Arhitektura ličnog nivoa (plan) | Opus | max | plan | nova |
| K02 | Temelj: zajednički paket (datumi, Moj dan, pokret) | Opus | xhigh | goal | ista (K01) |
| K03 | Temelj weba: dizajn DNK, GSAP pokret, izlog | Opus | xhigh | goal | nova |
| K04 | Backend: lični zadaci, Moj dan, zadaci svuda | Opus | xhigh | goal | nova |
| K05 | Backend: Inbox iz svih startupa | Sonnet | xhigh | goal | nova |
| K06 | Backend: globalni chat (lični DM i grupe) | Opus | xhigh | goal | nova |
| K07 | Plan ekrana i pokreta, web i telefon (plan) | Opus | xhigh | plan | nova |
| K08 | Web: ljuska Ja + startupi, rute | Opus | xhigh | goal | ista (K07) |
| K09 | Telefon: tabovi, pokret, Komandni centar u Prostoru | Opus | xhigh | goal | nova |
| K10 | Web: Moj dan, brzi unos, plan dana | Opus | xhigh | goal | nova |
| K11 | Web: Moji zadaci, panel zadatka, birač datuma | Opus | xhigh | goal | nova |
| K12 | Telefon: Moj dan, brzi unos, plan dana | Opus | xhigh | goal | nova |
| K13 | Telefon: Moji zadaci, panel zadatka, datum | Sonnet | high | goal | nova |
| K14 | Inbox: web i telefon | Sonnet | high | goal | nova |
| K15 | Web: Poruke (globalni chat) | Opus | xhigh | goal | nova |
| K16 | Telefon: Poruke (globalni chat) | Opus | xhigh | goal | nova |
| K17 | Zadaci u startupu: web | Opus | xhigh | goal | nova |
| K18 | Zadaci u startupu: telefon | Sonnet | high | goal | nova |
| K19 | Pokret kroz celu aplikaciju | Opus | xhigh | goal | nova |
| K20 | Završni prolaz: stanja, širine, teme, pristupačnost | Sonnet | high | goal | nova |
| K21 | Revizija: regresije, bezbednost, performanse, paritet | Opus | max | goal | nova |
| K22 | Završni izveštaj | Opus | high | auto | nova |

Redosled je namerno u **parovima web → telefon** (K08↔K09, K10↔K12, K11↔K13, K14, K15↔K16, K17↔K18): ako noć ne stigne do kraja, ono što je urađeno postoji na obe platforme.

## 10. Kraj runa

- `docs/LICNO-REPORT.md`: šta je urađeno, šta nije, BLOKADE, predlozi P1–P16 na potvrdu, šta Jovan ručno proverava (web prijavljen + telefon), tačan redosled deploy-a (Convex šema i funkcije pre weba; telefon JS update), rezultat provera.
- Snimci u `docs/licno/snimci/` (izlog, 390 i 1440 px, obe teme).
- Planovi u `docs/licno/planovi/` (K01, K07).
- `docs/licno/DIZAJN-DNK.md` (K03).
