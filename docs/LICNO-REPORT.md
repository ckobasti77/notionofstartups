# LICNO — završni izveštaj (noćni run, 24.–25.10.2026.)

Grana: `licno-run` (lokalno, bez push-a i deploy-a). Plan: `docs/LICNO-PLAN.md`. Dnevnik koraka sa svim ODLUKAMA: `docs/LICNO-PROGRESS.md`. Planovi: `docs/licno/planovi/K01.md`, `K07.md`. Dizajn: `docs/licno/DIZAJN-DNK.md`.

## 0. Ukratko

- Svih 22 koraka je završeno. Postoji lični nivo „Ja": **Moj dan**, **Moji zadaci** (svi startupi + lično), **lični zadaci**, **Inbox** (svi startupi + „Čeka tebe") i **Poruke** (lični DM i grupe + kanali svih startupa) — na webu i na telefonu.
- Web se otvara na Moj dan. Levo je traka „Ja" + startupi. Telefon ima tabove Danas · Prostor · Poruke · Inbox · Više; Komandni centar startupa je u Prostoru.
- Zadaci u startupu su brži: radnje u redu, panel zadatka, brzo pravljenje (naslov + Enter), srpski birač datuma umesto `mm/dd/yyyy`.
- Pokret: jedan rečnik u `packages/shared/src/motion.ts`; web kroz GSAP, telefon kroz Reanimated; „smanji pokret" svuda daje samo pretapanje.
- Backend se samo širi (2 nove tabele, 5 novih indeksa, `startupId` → `| null` u 6 tabela). Nijedan nov native paket; jedan nov web paket (`@radix-ui/react-popover`, MIT). Nijedna nova env varijabla.
- Glavna otvorena odluka: **N1/P6** — lični DM i `listPeople` ne poštuju granicu startupa (vidi §4).

## 1. Kako da pregledaš granu

```
git log --oneline main..licno-run          # 22 commita koraka + start
git diff --stat main...licno-run           # 668 fajlova, +73 142 / −6 490
git diff --stat --ignore-cr-at-eol main...licno-run   # bez šuma CRLF→LF (2 fajla)
```

Lokalno (iz korena repoa):
1. `npx convex dev` — DEV deployment (šema i funkcije su na DEV-u već potvrđene kroz `--once`).
2. `npm run dev` — web na `http://localhost:3000` (ako je port zauzet, Next ispiše drugi).
3. Izlog bez prijave: `http://localhost:3000/izlog?ekran=<ime>&tema=tamna|svetla&varijanta=<v>`. Ekrani: `pokret`, `ljuska`, `moj-dan`, `brzi-unos`, `isplaniraj`, `moji-zadaci`, `panel-zadatka`, `birac-datuma`, `inbox`, `poruke`, `zadaci-startup`. U produkciji je `/izlog` 404 + `noindex`.
4. Telefon: postojeći dev build + Metro (`npm run start --workspace @devotion/mobile`, tj. `expo start`, ili kako inače pokrećeš). Nove komponente su u Više → Dizajn katalog.

## 2. Šta je urađeno, po oblasti

| Oblast | Šta | Koraci | Snimci |
|---|---|---|---|
| Ja / traka | Web: traka 72 px („Ja" + pločice startupa sa tonom iz imena + „+"), indikator klizi, meni „Ja", rute `me-today/me-tasks/me-inbox/me-chat`, bedž „Ja" (P14), meni-sheet ispod `lg`, prečice i dijalog `?`. Telefon: 5 tabova, globalni bedževi, tačka nepročitanog u biraču startupa. | K08, K09, K21 | `K22-ljuska-ja-*`, `K08-ljuska-*` |
| Moj dan | Jedna pretplata `myDay.overview`; sekcije Prekoračeno · Danas · Planirano · U toku · Uskoro · Blokirano · Završeno danas; prekidač „Po startupu"; prsten napretka; „Isplaniraj dan" (Preneto od ranije + predlozi); kvačica sa zadržavanjem reda i „Poništi"; desna kolona (Inbox, Poruke, Čeka tebe) na webu, sažeti čipovi na telefonu. | K04, K10, K12 | `K22-moj-dan-*`, `K10-moj-dan-*`, `K10-isplaniraj-*` |
| Moji zadaci | `tasks.listEverywhere` + lični; filteri (startup/„Lično", status, prioritet, rok), pretraga bez dijakritika, grupisanje (Startup/Rok/Status/Prioritet), radnje u redu, prečice `j k x Enter d p t /` (web), swipe i dugi pritisak (telefon). | K04, K11, K13 | `K22-moji-zadaci-*`, `K11-*` |
| Lični zadaci | Tabela `personalTasks`: pravljenje, izmena, završavanje, arhiva sa „Poništi", „Prebaci u startup" (pravi `task` stranicu kroz postojeći put). Vidi ih samo vlasnik. | K04, K11, K13 | `K22-panel-zadatka-*` (startup), `K11-panel-zadatka-licni-*` |
| Panel zadatka | Drawer (web) / sheet (telefon): čipovi Status/Prioritet/Rok/Izvršioci, zaključani čipovi sa razlogom, koraci, instrukcije/beleška, „Dodaj u Moj dan", „Otvori u startupu" / „Puni prikaz". | K11, K13, K17, K18 | `K22-panel-zadatka-*` |
| Brzi unos | Web `q` svuda + dugme; telefon FAB. Odredište Lično ili startup + oblast (pamti se), čipovi roka (Danas · Sutra · Vikend · Sledeće nedelje · Datum…), „Dodaj i u Moj dan". | K10, K12, K18 | `K22-brzi-unos-*`, `K10-brzi-unos-*` |
| Birač datuma | Srpski kalendar (ponedeljak prvi), čipovi, vrednost u lokalno podne; `type="date"` više ne postoji u `apps/web`. | K11, K13, K17, K18 | `K11-birac-datuma-*` |
| Inbox | Sve / Nepročitano / Čeka tebe, čipovi startupa i „Lično", grupe po danima, „Označi sve", klik prebacuje u startup cilja; telefon swipe = pročitano. | K05, K14 | `K22-inbox-*`, `K14-inbox-*` |
| Poruke | Hub: „Lično" pa startupi; lični DM, lične grupe (do 50), podešavanja grupe sa „Poništi", napuštanje; kanali svih startupa u mestu; `@` u ličnom razgovoru nudi samo članove; push za ličnu poruku vodi u razgovor bez promene startupa. Chat startupa ostaje (web `view=chat`, telefon Prostor → Kanali). | K06, K15, K16 | `K22-poruke-*`, `K15-poruke-*` |
| Zadaci u startupu | Komandni centar i Moji zadaci u startupu (lista, tabla na webu) sa istim redom, radnjama i panelom; „Nova stranica → Zadatak" = naslov + Enter + čipovi; detalj zadatka sa čipovima umesto formi; izvršilac menja status. | K17, K18 | `K22-komandni-centar-*`, `K17-zadaci-startup-*` |
| Pokret | Rečnik (press/quick/base/slow + springovi snappy/smooth/gentle/bouncy), GSAP `CustomEase` iz spring krive, Flip, dijalozi/sheet/meniji/toast/stablo na istom rečniku; telefon `SwipeRow`, `AnimatedCheck`, `NumberRoll`, `ProgressRing`, `TabIcon`, layout preseti. | K02, K03, K09, K19 | `K03-pokret-*`, `K19-*` |
| Telefon (opšte) | Svi ekrani iznad na telefonu sa istim shared modelima (E4); haptika, swipe, dugi pritisak, traka „Poništi"; virtualizovane duge liste; Dizajn katalog. Bez snimaka (Expo se u runu ne pokreće). | K09, K12, K13, K14, K16, K18, K21 | — (Dizajn katalog na uređaju) |
| Završni prolaz i revizija | ~80 nalaza stanja/širina/tema/a11y (K20); revizija regresija, bezbednosti, performansi i pariteta (K21): bundle −53 kB gz, CI lint, testovi poklapanja šeme. | K20, K21 | `K20-*` |

Zajednički kod (`packages/shared/src/`): `dates`, `calendar`, `my-day`, `my-day-plan`, `my-tasks`, `task-row`, `task-sort`, `task-filters`, `quick-add`, `task-create`, `startup-tasks`, `inbox`, `chat-hub`, `motion`, `startup-chip`, `today` — isti rezultat na webu i telefonu.

Snimci: `docs/licno/snimci/` — 199 PNG ukupno, od toga 16 završnih `K22-*` (8 površina × 2; svaka površina ima 1440 i 390 i obe teme kroz par).

## 3. Šta nije urađeno ili je delimično

- **Telefon nema snimke** — pravilo runa (bez Expo/Metro/emulatora). Provera je `tsc`, vitest i `rn-review`; vizuelno gledaš u Dizajn katalogu.
- **Ništa nije provereno sa pravim podacima ni prijavom.** Izlog radi na fixture podacima; pregledač u runu nije mogao do Convex cloud-a (DNS). Vidi §7.
- **Brzi unos na telefonu iz startupa** pravi zadatak kroz kratak oblik (bez statusa, drugih izvršilaca, instrukcija). Pun oblik je u Prostor → oblast → „+". IZUZETAK K18/K21 #8.
- **Trijaža Komandnog centra** se razlikuje: web „Gori / Danas / Ova nedelja / Kasnije", telefon „Prekoračeno / Danas / Sledeće / Blokirano" (zatečeno; usklađivanje particije je funkcionalna izmena). K20.
- **Tabla (board)** u startupu postoji samo na webu; telefon ima listu po statusu + swipe. IZUZETAK K18.
- **„N otv." po startupu** u biraču startupa na telefonu nije dodato (tražilo bi pretplatu na `myDay.overview` u svakom zaglavlju). K21 #16.
- **Refaktori odloženi** (K21 BLOKADE niske ozbiljnosti): `useRowActions` za tri web kontejnera (#9), ostatak deljenja logike u shared (#10), jedna konstanta za pauze predaje sheet-a (#23), testovi za optimističke helpere u kukama (#26).
- **Stari ekrani na telefonu** (ideje, misli, odobrenja, članovi, kanali startupa…) i dalje imaju stari stagger 30 ms / 180 ms. K19 ODLUKA, K21 #24.
- **Lična pretraga poruka** bez `channelId` može biti nepotpuna (nijedan klijent je danas ne zove). K06.
- **Nije provereno na uređaju:** doskrolavanje polja koraka iznad tastature u panelu, kalendar na ekranu ≤ 320 dp, dva sestrinska `Modal`-a na iPhone-u (K13/K18).

## 4. BLOKADE — traže Jovana

| # | Šta | Zašto čeka tebe | Korak |
|---|---|---|---|
| B1 | **N1 / P6:** lični DM, lične grupe i `chat.listPeople` prelaze granicu startupa. Profil uklonjen iz svih startupa (ali ne arhiviran) i dalje vidi sve aktivne ljude i može da im piše. | P6 kaže „instanca je jedan tim" — to je predlog na potvrdu. Ako želiš granicu, ograniči `openPersonalDm`/`createPersonalGroup`/`listPeople` na ljude sa zajedničkim startupom. Do tada: offboarding = **arhiviranje profila**, ne samo uklanjanje iz startupa. | K06, K21 #7 |
| B2 | `.nocni-run/` je u gitu (106 fajlova). Lint ga od K21 ignoriše. | Ostaviti ili skinuti pre merge-a u `main`. | K21 |
| B3 | Pre produkcijskog deploy-a proveri broj redova u `taskAssignees` i `notifications` (dashboard). | Novi indeksi se pune pri deploy-u; preko ~100 000 redova → `staged: true` i dva deploy-a (plan K01 §11). | K04, K05 |
| B4 | Postojeći bag u podsetnicima rokova (`notifications.ts` `remindDueTasks`): „sutra" = `now + 24h`, pa na dan kraja/početka letnjeg vremena jedan sat daje pogrešan dan. | Van obima runa (postojeća funkcija). Predlog: `shiftDayKey(todayKey, 1)` iz `lib/day_key.ts`. | K04 |
| B5 | Brisanje poruke ne briše prilog iz storage-a; član uklonjen iz timskog `custom` kanala zadržava nepročitano. | Zatečeno; menja ponašanje chata startupa. | K21 #25 |

## 5. ODLUKE koje traže stav vlasnika

Predlozi iz plana (run ih je sledio):

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| P1 | Rute `?view=me-today|me-tasks|me-inbox|me-chat`; bez `view` → Moj dan (i `/?startupId=X` bez `view`) | `apps/web/components/workspace/{types,workspace-route}.ts` | K08 |
| P2 | Startup „Danas" se zove **Komandni centar** | sidebar, header, Prostor | K08, K09 |
| P3 | Lični zadaci = `personalTasks` (bez izvršilaca, brisanje = arhiva, ≤ 500 otvorenih) | `convex/personalTasks.ts` | K04 |
| P4 | Plan dana = `myDayEntries`; „Preneto od ranije" 7 dana, ne prenosi se samo; ≤ 50 stavki | `convex/myDay.ts` | K04 |
| P5 | Moj dan grupisan po vremenu, prekidač „Po startupu" | `packages/shared/src/my-day.ts` | K02 |
| P6 | Globalni chat: `startupId: null` = lični razgovor; DM sa bilo kim aktivnim; grupa ≤ 50 | `schema.ts`, `chat.ts` | K06 — **vidi B1** |
| P7 | Inbox iz svih startupa + „Čeka tebe", bez novih obaveštenja | `convex/inbox.ts` | K05, K14 |
| P8 | Brzi unos: `q` / FAB, podrazumevano Lično, pamti oblast, „Dodaj i u Moj dan" | web/telefon `components/me/` | K10, K12 |
| P9 | Srpski datumi, sopstveni birač, rok u lokalno podne | shared `dates.ts`/`calendar.ts`, `ui/date-picker.tsx`, `date-picker-sheet.tsx` | K02, K11, K13 |
| P10 | Jedan rečnik pokreta, GSAP na webu, Reanimated na telefonu, bez `@gsap/react` | shared `motion.ts`, `apps/web/lib/motion/`, `apps/mobile/src/theme/motion.ts` | K02, K03, K09, K19 |
| P11 | Lucide, bez emodžija, bez novih fontova, boje samo kroz tokene | `globals.css`, `tokens.ts` | svi |
| P12 | Nijedan native paket; web paket samo uz ODLUKU | — | svi |
| P13 | Izlog `/izlog` (samo dev) + Dizajn katalog na telefonu | `apps/web/app/izlog/` | K03 |
| P14 | Bedž „Ja" = nepročitana obaveštenja + nepročitane poruke (chat obaveštenja se broje dvaput) | traka, tab bar | K08, K09 |
| P15 | Komandni centar na telefonu u Prostoru (segment) | `prostor.tsx` | K09 |
| P16 | Per-startup Moji zadaci i chat ostaju | sidebar | K08 |

ODLUKE iz koraka koje menjaju ponašanje ili izgled (potpun spisak je u `docs/LICNO-PROGRESS.md`, red **ODLUKE:** svakog koraka):

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| D1 | „Vikend" u nedelju = sledeća subota; „Sledeće nedelje" u nedelju = sutra | shared `dates.ts` | K02 |
| D2 | Numerički datum `dd.mm.gggg.` sa vodećom nulom | shared `dates.ts` | K02 |
| D3 | Prednost sekcija: Prekoračeno > Blokirano > Uskoro | shared `my-day.ts` | K02 |
| D4 | 8 tonova startupa (boja čipa iz imena) u obe teme | `globals.css`, `tokens.ts` | K03 |
| D5 | Iscrtavanje kvačice 160 ms, precrt 240 ms (plan je tražio 180/200; brojevi samo iz shared) | `apps/web/components/motion/` | K03 |
| D6 | Tuđ/nedostupan startup zadatak u planu → „Zadatak nije pronađen." (ne otkriva postojanje) | `convex/myDay.ts` | K04 |
| D7 | Plan je idempotentan; `reorder` prima delimičnu listu; brzi unos odbijen kad je dan pun (50) | `convex/myDay.ts`, `personalTasks.ts` | K04 |
| D8 | „Označi sve" bez startupa čisti i obaveštenja iz napuštenih startupa | `convex/inbox.ts` | K05 |
| D9 | Hub prikazuje i startupe bez kanala (klijent ih krije); `unreadSummary.total` ne broji napuštene startupe | `convex/chat.ts` | K06 |
| D10 | „Poništi" izmene grupe vraća i arhivirane članove | `convex/chat.ts` | K06 |
| D11 | `pushState` samo pri ulasku u startup iz „Ja" (između startupa `replaceState` kao pre) | `workspace-shell.tsx` | K08 |
| D12 | Identitet startupa = čip sa tonom umesto `StartupLogo` sa indigo podlogom | traka, meni startupa | K08 |
| D13 | `q` otvara Brzi unos svuda (u startupu je taj startup unapred izabran) | `lib/shortcuts/registry.ts` | K10 |
| D14 | Tačka prioriteta samo za Visok/Hitno | web i telefon `task-row` | K09, K10 |
| D15 | Blok desne kolone Moj dan se tiho skriva kad upit padne | `my-day-side.tsx` | K10 |
| D16 | Nov paket `@radix-ui/react-popover@1.1.23` (MIT, 2,8 kB gz); lockfile ručno dopisan (38 redova) | `apps/web/package.json`, `package-lock.json` | K11 |
| D17 | Brojač „Filteri (n)" broji kategorije; početno grupisanje „Startup", ne pamti se | shared `task-filters.ts` | K11 |
| D18 | Panel u produkciji ne razlikuje „obrisan" od prekida veze (treba `ConvexError` sa kodom u `pages.get`) | `task-panel-states.tsx` | K11 |
| D19 | Telefon: „Poništi" je traka (8 s), potvrde bez toasta su haptika + najava; radnje sa „Poništi" zatvaraju panel | `lib/undo.ts`, `task-panel-sheet.tsx` | K12, K13 |
| D20 | Kalendar u istom sheet-u umesto drugog `Modal`-a (iOS) | `date-picker-sheet.tsx`, `quick-add-sheet.tsx` | K12 |
| D21 | „Označi sve" isključeno u „Čeka tebe"; obaveštenje bez cilja se samo označi | shared `inbox.ts` | K14 |
| D22 | „Označi kao pročitano" u hubu samo na telefonu (web već označava otvaranjem) | `hub-actions-sheet.tsx` | K15, K16 |
| D23 | Telefon `razgovor/[id]` čita kanal kroz `chat.getChannel` za sve opsege; chat startupa je stack „Kanali" | `razgovor/[id].tsx`, `kanali.tsx` | K16 |
| D24 | Brzo pravljenje zadatka: podrazumevani izvršilac **ja**; detalj se ne otvara sam (toast „Otvori") | `create-page-dialog.tsx`, `page-create-sheet.tsx` | K17, K18 |
| D25 | Izvršilac koji nije kreator menja status iz detalja i table (kroz `tasks.updateMetadata`) | `page-editor-view.tsx`, `tasks-view.tsx` | K17 |
| D26 | Tap na zadatak u startupu otvara panel; puna stranica je „Puni prikaz" | web i telefon | K17, K18 |
| D27 | Obrisani stari telefonski fajlovi `danas/{task-card,task-actions-sheet,quick-add-sheet}.tsx` | `apps/mobile/src/components/danas/` | K18 |
| D28 | Izlaz menija/Select/tooltipa je odmah (ulaz animiran) | `ui/{dropdown-menu,select,tooltip}.tsx` | K19 |
| D29 | Tabela ideja prešla na `border-separate` (izgled isti, Flip radi) | `ideas-view.tsx` | K19 |
| D30 | Kolone Mojih zadataka tek od `xl` (1280); 1024–1279 dvoredno | `my-tasks-view.tsx` | K20 |
| D31 | „Sad si na zadatku." / „Više nisi na zadatku." umesto „Priključio/la si se" | web i telefon | K20 |
| D32 | Zatamnjenje `bg-black/50` ostaje bez tokena | `ui/dialog`, `Drawer`, `MotionDialog` | K20 |
| D33 | `createNotification` bez startupa van chata baca grešku | `lib/notifications.ts` | K21 |
| D34 | Shared `"sideEffects": false`, `TooltipProvider` izdvojen (prvo učitavanje bez GSAP-a) | `packages/shared/package.json`, `ui/tooltip-provider.tsx` | K21 |
| D35 | Nazivi: „Moji zadaci" (3 ekrana) + „Svi zadaci" na telefonu; „Poruke" (web) / „Kanali" (telefon) za chat startupa | više mesta | K21 #30 |

## 6. Šema, paketi, env i deploy — tačan redosled

Ništa od ovoga nije rađeno u runu.

**Izmene šeme (samo širenje, bez migracija):**
- Nova tabela `personalTasks` — indeksi `by_profile_status_archived_sort`, `by_profile_status_archived_completed`.
- Nova tabela `myDayEntries` — indeksi `by_profile_day_position`, `by_profile_ref`.
- `taskAssignees` — nov indeks `by_profile_status_active_updated`.
- `notifications` — `startupId` → `Id<"startups"> | null`; novi indeksi `by_recipient_and_createdAt`, `by_recipient_and_readAt`.
- `chatChannels`, `chatMessages`, `chatMembers`, `chatReads`, `chatPresence` — `startupId` → `Id<"startups"> | null`.
- Postojeći indeksi i podaci nisu dirani. Šema i funkcije su prošle `npx convex dev --once` na DEV-u.

**Paketi:** web `@radix-ui/react-popover@1.1.23` (MIT). Shared `package.json` dobija `"sideEffects": false`. Telefon: nijedan nov paket, `apps/mobile/package.json` nije menjan. Verzije postojećih paketa nisu menjane.

**Redosled:**
1. Proveri broj redova `taskAssignees` i `notifications` (B3). Pa `npx convex deploy` (Convex šema + funkcije). Mora prvi: novi web i telefon zovu nove funkcije, a stari klijenti rade sa novim backendom.
2. Merge `licno-run` u `main` i push → Vercel deploy weba (uključuje novi `public/sw.js` za lični push). Pre merge-a odluči B2. `npm ci` povlači popover.
3. Telefon: samo JS izmene — preko postojećeg kanala ažuriranja ili novog dev builda kao i do sada. Nema native izmena (`app.json`, `eas.json`, native paketi netaknuti), pa nov native build nije potreban.
4. Env varijable: nijedna nova (ni Convex, ni Vercel, ni Expo).

Prelazni period (K21 #27): stari telefon na novom backendu pokazuje „Razgovor nije pronađen" za lični push; stari service worker otvara `view=chat`. Zato redosled 1 → 2 → 3 i brz update telefona.

## 7. Šta ručno proveravaš (po važnosti)

1. **Prijavljen web sa pravim podacima iz 6 startupa:** `/` otvara Moj dan; brojevi u traci i meniju „Ja" odgovaraju stvarnom stanju; klik na pločicu startupa → Komandni centar, Nazad → Moj dan; stari link `?view=today&startupId=…` radi.
2. **Moj dan i plan dana:** kvačica (red ostane ~0,7 s pa pređe u „Završeno danas", „Poništi"), „Sun" dodaje u Planirano, „Isplaniraj dan" (+, Vrati, Skloni), rok kroz birač; isto na telefonu (swipe desno/levo, dugi pritisak).
3. **Lični DM i grupa između dva naloga:** „Nova poruka" i „Nova grupa", poruka, prilog, `@` (nudi samo članove), „Podešavanja grupe" + „Poništi", napuštanje sa drugog naloga. Odluči B1.
4. **Push za ličnu poruku na telefonu:** otvara taj razgovor i ne menja aktivan startup; na webu klik vodi na `me-chat`.
5. **Chat startupa i dalje radi:** web `?view=chat&startupId=…`, telefon Prostor → Kanali; obaveštenja startupa kao pre.
6. **Brzi unos:** `q` iz Moj dan i iz startupa, Lično i startup + oblast, „Dodaj i u Moj dan", zapamćeno odredište; telefon FAB.
7. **„Prebaci u startup":** lični zadatak → startup + oblast → toast „Otvori"; zadatak je tvoj, sa rokom i prioritetom.
8. **Inbox klik u drugi startup:** obaveštenje iz drugog startupa prebacuje opseg i otvara stranicu/chat/odobrenja; „Čeka tebe" → Glasaj.
9. **Brzo pravljenje zadatka u startupu:** „Nova stranica → Zadatak", naslov + Enter; ti si izvršilac, oblast se pamti; zadatak gde nisi kreator ima zaključane čipove sa razlogom.
10. **„Smanji pokret" u sistemu** (Windows: Podešavanja → Pristupačnost → Vizuelni efekti; iOS/Android: Reduce motion / Ukloni animacije): sve samo pretapanje, ništa ne klizi.
11. **Telefon, uređaj:** panel → „Dodaj korak…" sa tastaturom; kalendar na malom ekranu; iPhone: kalendar u sheet-u, „Otvori" iz radnji (panel posle zatvaranja sheet-a), VoiceOver escape; Komandni centar i „Svi zadaci" (virtualizovane liste, „Učitaj još", selidba reda).
12. **Svetla tema:** Ideje (glasovi, „Odobreno"), kvačice koraka, prekidač u Brzom unosu.
13. **Web 1024–1279 px:** Moji zadaci dvoredni (D30).
14. Izlog bez prijave: `/izlog?ekran=pokret`, `moj-dan`, `moji-zadaci`, `poruke`, `zadaci-startup` — osećaj pokreta.

## 8. Brojevi

**Testovi (vitest):** pre runa 52 fajla / 451 test → posle runa 101 fajl / 1 031 test (+580). Svaki backend modul ima negativne authz slučajeve (tuđ id, napušten/arhiviran startup, ne-član razgovora).

| Posle koraka | Fajlova / testova |
|---|---|
| pre runa | 52 / 451 |
| K02 | 57 / 526 |
| K06 (backend gotov) | 67 / 671 |
| K12 | 86 / 873 |
| K16 | 92 / 960 |
| K21 | 101 / 1 031 |
| K22 (završno) | 101 / 1 031 |

**Web bundle** (prvo učitavanje `/`, iz K21): 787,8 kB / **245,8 kB gz** (pre K21 popravke 928,6 / 298,7 kB gz). Lenjo: ljuska 76,6 kB gz, Moj dan 7,2 kB gz. Lični prikazi idu kroz `next/dynamic`.

**Najgora čitanja upita** (K21, scenario 6 startupa × 200 zadataka × 50 kanala):

| Upit | Tipično | Teorijski max |
|---|---|---|
| `myDay.overview` | ~580 (najgore ~1 041) | ~1 110 |
| `tasks.listEverywhere` (all) | 601 | ~870 |
| `inbox.feed` (50) | 78 | 181 |
| `inbox.unreadCounts` | 313 | 381 |
| `chat.listConversations` | ~900 | ~5 800 |

Sve kroz indekse, sa granicama, daleko ispod Convex granice (32 000). `chat.listConversations` i najgori `overview` prelaze cilj „~600" iz plana — prihvaćeno.

## 9. Rezultat provera (K22, završno)

Pušteno 25.10.2026. posle K22 snimaka i gašenja dev servera, iz korena repoa, redom. Dnevnik: `.nocni-run/licno/tmp/k22/provere.log`.

| Provera | Komanda | Rezultat |
|---|---|---|
| tsc backend | `npx tsc -p packages/backend/convex/tsconfig.json --noEmit` | prošlo (exit 0) |
| tsc web | `npx tsc -p apps/web/tsconfig.json --noEmit` | prošlo (exit 0) |
| tsc telefon | `node .nocni-run/licno/alati/expo-rute.cjs && npx tsc -p apps/mobile/tsconfig.json --noEmit` | prošlo (exit 0) |
| lint (pravilo runa) | `npx eslint --ignore-pattern ".nocni-run/**" --ignore-pattern ".playwright-mcp/**"` | prošlo, 0 grešaka (telefon linter ne pokriva — provera je `tsc`) |
| lint (kao CI) | `npx eslint` | prošlo, 0 grešaka |
| vitest | `npx vitest run --no-file-parallelism` | prošlo: 101 fajl / 1 031 test |
| codegen | `npx convex codegen` | prošlo; `_generated` bez izmene |
| build | `npm run build` | prošlo; `/izlog` statičan (404 u produkciji, iz K03/K21) |

Polazno stanje (`.nocni-run/licno/baseline.txt`): sve provere su prolazile i pre runa; nijedna nije pala ni sada. Kod u K22 nije menjan.

## 10. Zatečeno (nije od runa, nađeno usput, nije menjano)

- `notifications.ts` `remindDueTasks`: „sutra" = `now + 24h` — pogrešan dan jedan sat na DST dane (B4). Test `notifications.test.ts` zbog toga pada samo 25.10. između 00:00 i 01:00.
- `chat.deleteMessage` ne briše prilog iz storage-a; član uklonjen iz timskog `custom` kanala zadržava nepročitano (B5).
- `taskAssignees.listForTasks` baca iznad 300 id-jeva; Komandni centar ih može imati do 600 (web pada u granicu greške prikaza; telefon šalje najviše 300).
- `task-table-view.tsx` i web `assignee-picker.tsx` su mrtvi i na `main`; `formatDueDate`, `dueDateInDays`, `AllTasksTask` ostali bez poziva (K21 #22).
- `ideas-view.tsx`: palete boje kartice i zeleno dugme sa `text-white`; `aria-expanded`, `<h4>` u `<button>`; `rgba()` senke u `workspace-shell`, `create-page-dialog`, `task-table-view`.
- `PulseBar`: upozorenje hidracije uz „smanji pokret" (Framer `useReducedMotion` server vs klijent) — vidi se samo u izlogu.
- Stari `DeadlineBadge` („D-3") pored novog `DueChip` u nedirnutim prikazima.
- Telefon: `${boja}22` hex-alfa idiom; tab labele 11 px; `opacity: 0.4` za onemogućeno u `ui/row.tsx`; `puls.tsx` bez aktivnog startupa ostaje na skeletonu; dva sestrinska `Modal`-a u `page-create-sheet` (izvršioci, link u belešci); `LoadingSwap` ne najavljuje učitavanje; „Sastav dana" i paginirana Aktivnost postoje samo na telefonu.
- Web chat na 390 px: trake radnji poruke se vide stalno i preklapaju vreme.
- Imena segmenata chata startupa: web Opšte/Kanali/Diskusije/Direktne, telefon Kanali/Direktne/Praćeno.
- `page-editor-view.tsx` i `command-center-view.tsx` su prešli CRLF → LF (šum u diff-u; koristi `--ignore-cr-at-eol`).
- `tw-animate-css` ostaje uvezen samo zbog nekorišćenog `ui/accordion`.

**Čišćenje u K22:** zaostalih `docs/licno/snimci/page-*.yml` (Playwright stabla stranica) nije bilo — provereno pre završnih provera, nijedan fajl osim PNG-ova nije ostao u folderu (raniji koraci su ih premestili u `.nocni-run/licno/tmp/k*/mcp/`).
