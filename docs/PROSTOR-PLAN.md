# PROSTOR — startup kao zajednički radni prostor tima (noćni run, 25.10.2026.)

> Izvor istine za ceo run. Svaki korak ga čita pre rada. Tehničke planove koraci pišu u
> `docs/prostor/planovi/<ID>.md` (K01 backend, K07 ekrani); ovaj fajl se ne prepisuje.
> Odluke donete tokom noći idu u sekcije koraka u `docs/PROSTOR-PROGRESS.md` (red **ODLUKE:**), ne ovde.

## 0. Šta pravimo, u jednoj rečenici

Unutrašnjost svakog startupa postaje **zajednički, miran radni prostor**: tim uređuje sve uz istoriju izmena i korpu (bez glasanja i odobrenja), dokumenti, zadaci i ideje su liste i table (kanvas je opcioni prikaz „Mapa"), početna startupa je Komandni centar, a lične misli prelaze u „Ja".

**Stanje danas** (revizija 25.10, ocena 18/40):
- **Model vlasništva „Oblasti v2"** (`docs/areas-system-blueprint.md`): svaka oblast i stranica je kanvas direktne dece; naslov, sadržaj i pomeranje kartica menja samo autor (`page.createdByProfileId === profile._id` u `pages.ts`, `areasV2.ts`, `canvases.ts`, `pageFiles.ts`, `pageTables.ts`); ugnežđavanje pod tuđu stavku traži odobrenje autora roditelja (`pageNestingRequests`, `nestingRequests`); brisanje tuđeg sadržaja je **jednoglasno glasanje celog tima** (`deletionRequests` + `deletionBallots`, jedan PROTIV zatvara); opis oblasti (`areaBodies`) menja samo kreator startupa; ostali dodaju potpisane priloge (`contentContributions`) koje autor moderira; „Raniji zajednički sadržaj je zaključan" (telo sa `attribution: legacy_neutral` niko ne može da menja).
- **Ideje:** glasa i menja „osnovni status" samo autor (`ideas.vote`: „Samo autor ideje može promeniti njen osnovni status."); autor automatski daje „za"; konverzija traži više „za" nego „protiv".
- **Navigacija weba** (`workspace-sidebar.tsx`): 9 stavki (Početna, Poruke, Moje misli, Ideje, Odobrenja, Komandni centar, Moji zadaci, Aktivnost, Puls) + Pretraži + Obaveštenja + stablo oblasti u **drugom skrolu** sa ručkom za razvlačenje; Početna i Komandni centar se preklapaju. **Telefon:** „Više" ima ~15 stavki (Odobrenja, Moji zadaci, Svi zadaci, Puls, Ideje, Misli, Aktivnost, …).
- **Vizuelno:** nadnaslovi (eyebrow) iznad svakog naslova, kartica u kartici, sjaj i ukrasi, marketinške rečenice u radnom UI-ju, engleski nazivi podrazumevanih oblasti (`AREA_DEFINITIONS`: „Dev notes", „Marketing notes", „Sales notes", „Other notes").
- **Puls** pravi obaveštenje `puls_ready` svakog ponedeljka (cron u `crons.ts`); Aktivnost i Puls su zasebni ekrani koje niko ne otvara.

**Posle runa:**
- Svaki član menja svaki dokument, zadatak, oblast i ideju; svaka izmena sadržaja ostaje u **Istoriji izmena** (ko, kada, šta; „Vrati ovu verziju"); autor ili admin može da **zaključa** stranicu.
- Brisanje ide u **Korpu** (svako briše, svako vraća). Nema glasanja ni odobrenja; premeštanje i ugnežđavanje je slobodno.
- Potpisani prilozi postaju **Komentari** sa @pominjanjem.
- Početna startupa = **Komandni centar** (Za tebe, trijaža sa „Zastarelo" i „Sredi rokove", Čeka tebe, Nedavne izmene, Puls, Tim).
- Oblast ima **Pregled · Zadaci · Dokumenti · Mapa**; stranica je dokument tima; kanvas je samo opcioni prikaz „Mapa".
- **Ideje** su tabla po fazama (Predlog → Razmatra se → Odobreno → Postalo zadatak; Odbijeno), tim glasa.
- „Moje misli" → **Beleške** u „Ja" (iz svih startupa + lične), sa „Pošalji u startup".
- Isti DNK (tamno, indigo, tonovi startupa), ali mirnije; srpski nazivi svuda; telefon za brze stvari.

## 1. Odluke (Jovan, 25.10.2026.)

| # | Odluka |
|---|---|
| O1 | **Tim uređuje sve** (dokumenti, zadaci, oblasti, ideje) uz **istoriju** „ko je šta promenio", **korpu** i opciono **zaključavanje stranice**. |
| O2 | **Ukida se glasanje o brisanju i odobravanje ugnežđavanja** — umesto njih korpa i istorija. |
| O3 | **Kanvas = opcioni prikaz „Mapa"** u oblastima i Idejama. Podrazumevano lista / tabela / tabla. U zadacima i beleškama nema kanvasa. |
| O4 | **Potpisani prilozi postaju komentari**; dokument menjaju svi. |
| O5 | **Početna i Komandni centar se spajaju** u jednu početnu startupa. |
| O6 | **Moje misli prelaze u „Ja"** (iz svih startupa), sa „Pošalji u startup". |
| O7 | **Ideje: lista i tabla** sa tokom Predlog → Razmatra se → Odobreno → Postalo zadatak; glasanje tima je signal, ne odluka. |
| O8 | **DNK ostaje** (tamno, indigo, tonovi startupa), ali mirnije: sadržaj na prvom mestu. |
| O9 | **Telefon je za brze stvari** (pregled, završavanje, komentari, brzi unos); kanvas i dugo pisanje su prvo za web. |
| O10 | Reset lozinke linkom je dogovoren, ali **nije u ovom runu**: traži provajdera e-pošte i ključ i menja auth — radi se uz nadzor. |
| O11 | Kao u LICNO: Opus 5.5 za planove i teške korake, Sonnet 5.5 za prolaze; Sonnet i Haiku kao radnici u koracima. Fable se ne koristi. |
| O12 | Ništa ne izlazi sa mašine: lokalna grana `prostor-run`, bez push-a i deploy-a. Jovan sam pokreće run. |

Pitanja bez odgovora iz razgovora (fiksne ili slobodne oblasti; gde tim priča; kako se koriste tabele i fajlovi) rešena su konzervativno: oblasti ostaju slobodne kao danas, chat startupa ostaje, tabele i fajlovi rade kao danas u novom okviru stranice (P19–P21).

**Predlozi (Claude, čekaju potvrdu)** — run ih sledi, izveštaj ih ponovo navodi:

| # | Predlog | Zašto | Gde se menja |
|---|---|---|---|
| P1 | **Uloge bez nove tabele.** Član startupa menja naslov, sadržaj i osobine svake stranice, zadatka, oblasti i ideje; premešta i ugnežđava; briše u Korpu i vraća iz nje; komentariše i glasa. **Autor stranice** još zaključava i otključava svoju stranicu. **Vlasnik startupa** (`startups.createdByProfileId`) i **admin** (`profiles.role === "admin"`) zaključavaju bilo koju stranicu, menjaju fazu bilo koje ideje i sklanjaju bilo koji komentar. Na **zaključanoj** stranici naslov, sadržaj, osobine, premeštanje i brisanje rade samo za autora, vlasnika i admina; ostali čitaju i komentarišu. Komentar menja i briše samo njegov autor. Misli/Beleške ostaju **privatne**. | O1 sa najmanje novih pojmova; jedna funkcija dozvola umesto 40 poređenja `createdByProfileId`. | nov `packages/backend/convex/lib/permissions.ts`; svi moduli iz §3.1 |
| P2 | **Istorija izmena** = nova tabela `contentRevisions`: snimak naslova i sadržaja **posle** izmene, za stranice, opis oblasti i ideje. Pre prve izmene u novom modelu upisuje se **bazna** revizija (zatečeno stanje). Izmene istog autora na istoj stavci u roku od **10 min** se spajaju u jednu reviziju. „Vrati ovu verziju" pravi NOVU reviziju — ništa se ne briše. U ovom runu nema obrezivanja starih revizija. Osobine zadatka (status, rok, izvršioci, prioritet) idu u Aktivnost, ne u Istoriju. U UI-ju se zove **„Istorija izmena"** (ne meša se sa postojećom lokalnom „Istorijom radnji" = poništi/ponovi). | „Ko je šta promenio" i vraćanje, uz malo prostora i bez nepovratnih radnji. | schema, `pages.ts`, `areasV2.ts`, `ideas.ts`, nov `history.ts` |
| P3 | **Korpa.** Brisanje = arhiviranje + novo opciono polje `archivedByProfileId` + oznaka poteza za podstranice obrisane zajedno. Korpa startupa prikazuje obrisane stranice (sa brojem podstranica), ideje i priloge, najnovije prvo, „Obrisao/la X · pre N dana". **Svaki član vraća.** Vraćena stranica ide na staro mesto; ako je roditelj i dalje obrisan, na vrh svoje oblasti (uz poruku). **Trajno brisanje i automatsko čišćenje posle 30 dana NE postoje u ovom runu** (nepovratne radnje se ne puštaju bez nadzora) i Korpa ne obećava rok dok čišćenje ne postoji. Odeljak **„Oporavljeno"** (`recoveredContent`) seli se iz Odobrenja u Korpu. | O1/O2 bez rizika gubitka podataka; „30 dana" je posle runa uz nadzor. | `pages.ts`, `areasV2.ts`, `ideas.ts`, `pageFiles.ts`, nov `trash.ts` |
| P4 | **Slobodno premeštanje i gašenje starih tokova.** Svaki član premešta i ugnežđava bilo šta (provere ciklusa, dubine i iste oblasti ostaju). Novi zahtevi za ugnežđavanje i glasanja se više ne prave. Tabele zahteva ostaju netaknute (istorija). Interna mutacija `closeLegacyRequests` (otvorene zahteve i glasanja označava `cancelled`) se piše i testira, ali se **NE pokreće** — Jovan je pušta posle deploy-a ako želi. Stare javne funkcije ostaju sa istim potpisom (stari klijenti): `requestDeletion` sada direktno šalje u Korpu, `requestNesting` direktno premešta (kad P1 dozvoljava); `voteOnDeletion`, `withdrawDeletion`, `resolveNesting`, `approveNesting`, `rejectNesting`, `withdrawNesting` ne rade ništa štetno i vraćaju jasnu poruku. | O2; deploy backenda pre klijenata ne sme da obori stari web ni staru aplikaciju. | `collaboration.ts`, `areasV2.ts`, `ideas.ts`, `pages.ts`, `canvases.ts`, `inbox.ts` |
| P5 | **Komentari = `contentContributions`** (bez nove tabele). Novi komentari su odmah vidljivi (bez moderacije). Postojeći prilozi „na čekanju" i „odobreni" prikazuju se kao komentari; „odbijeni" ostaju vidljivi samo autoru i vlasniku stavke, kao danas. Tela stranica i ideja (`sourceKind: page_body \| idea_original`) **nisu komentari** i nikad se ne prikazuju u listi komentara. Komentar: tekst sa @pominjanjem (klijent šalje listu `mentionProfileIds`, server zadržava samo aktivne članove tog startupa), izmena i brisanje svog. Obaveštenja: `comment_mention` (pomenutom) i `comment_added` (autoru stavke i izvršiocima zadatka, bez autora komentara i bez duplikata sa pominjanjem) — mapirana na **postojeće** kanale i zvuke. | O4 bez migracije; postojeći tekst tima ostaje vidljiv. | `collaboration.ts`, `lib/validators.ts`, `lib/notifications.ts`, `lib/notificationChannels.ts` (samo mapiranje), `lib/notificationSettingsCatalog.ts` |
| P6 | **Ideje.** Novo opciono polje `stage`: `predlog \| razmatra_se \| odobreno \| odbijeno` (bez polja = `predlog`). „Postalo zadatak" se izvodi iz `convertedPageId` (nije vrednost u bazi). **Svi članovi glasaju** za/protiv (signal). Fazu menjaju autor ideje, vlasnik startupa i admin; „Pretvori u zadatak/belešku" — isti krug, kad je faza „Odobreno" (stari uslov „više za nego protiv" se ukida). Tekst ideje menja svaki član, uz Istoriju (O1). Postojeći glasovi ostaju glasovi (autorov „protiv" se NE tumači kao „Odbijeno"). | O7; odluku donosi neko ko odgovara, tim daje signal. | schema, `ideas.ts` |
| P7 | **Beleške u „Ja".** `thoughtNodes.startupId` i `thoughtEdges.startupId` → `Id<"startups"> \| null` (samo širenje); `null` = lična beleška van startupa. Ekran **Beleške** (web `?view=me-notes`, telefon iz zaglavlja Danas) prikazuje moje misli iz svih **aktivnih** startupa + lične, filter po startupu, brzi unos (lična), izmenu, ugnežđene kao uvučene, i **„Pošalji u startup"** (postojeća konverzija u ideju ili stranicu, u izabrani startup gde sam aktivan član). Stari kanvas misli ostaje kao **„Mapa"** kad je izabran jedan startup (ruta `thoughts` radi i dalje, samo nije u meniju); lične beleške nemaju mapu. | O6 bez gubitka rasporeda i veza koje već postoje. | schema, `thoughts.ts`, web `components/me/notes/`, telefon `misli.tsx` |
| P8 | **Početna startupa = Komandni centar.** `?view=home` vodi na `today`. Blokovi: **Za tebe** (moji otvoreni zadaci u ovom startupu: prekoračeno, danas, u toku), **Trijaža** tima, **Čeka tebe** (P22), **Nedavne izmene** (Aktivnost, 8–10 stavki + „Sva aktivnost"), **Puls nedelje** (kartica + „Otvori Puls"), **Tim** (opterećenje). Aktivnost i Puls ostaju kao ekrani, otvaraju se iz kartica. | O5. | web `command-center-view.tsx`, `home-view.tsx`; telefon `components/komandni-centar/` |
| P9 | **Puls bez obaveštenja.** Nedeljni cron `nedeljni puls` (`puls_ready`) se uklanja iz `crons.ts`; Puls se vidi kao kartica. Postojeća obaveštenja ostaju kakva jesu; tip `puls_ready` ostaje u validatoru. | Obaveštenje koje niko ne otvara je buka. | `crons.ts`, `puls.ts` |
| P10 | **„Sredi rokove" i „Zastarelo".** U Trijaži, kad postoji prekoračeno, dugme „Sredi rokove" otvara listu prekoračenih sa izborom po zadatku ili za sve izabrane: Danas · Sutra · Sledeće nedelje · Bez roka · Završi — jedna mutacija `tasks.bulkReschedule` (≤ 50 zadataka, vraća prethodne vrednosti za „Poništi"). **„Zastarelo"** = rok prošao pre više od **14 dana** (konstanta u shared); takvi zadaci su u zasebnoj, skupljenoj grupi ispod „Gori". | Zatrpan Komandni centar (stari rokovi) se sređuje u 10 sekundi. | `tasks.ts`, shared `startup-tasks.ts` / `today.ts` |
| P11 | **Navigacija startupa na webu** (jedan skrol, bez ručke za razvlačenje): **Komandni centar · Zadaci · Ideje · Poruke**, pa **Dokumenti** (stablo oblasti i stranica, skraćeno sa „Prikaži još"), a dole **Korpa** i **Podešavanja startupa**. Uklanja se iz menija: Početna, Moje misli, Odobrenja, Aktivnost, Puls i Obaveštenja (Inbox je u „Ja"). **Zadaci** (`?view=tasks`) = svi zadaci tima (lista/tabla, filter Svi · Moji · osoba, podrazumevano Svi). Stari linkovi: `home`→`today`, `my-tasks`→`tasks` sa filterom Moji, `approvals`→`trash`. `thoughts` ostaje (Mapa beleški jednog startupa, P7). | Pet stvari koje tim stvarno koristi, bez dupliranja. | `types.ts`, `workspace-route.ts` (+ test), `workspace-sidebar.tsx`, `workspace-shell.tsx` |
| P12 | **Oblast:** zaglavlje (naziv menja svaki član) + kartice **Pregled · Zadaci · Dokumenti · Mapa**. Pregled = opis oblasti (dokument tima sa Istorijom) + nedavne izmene u oblasti + komentari oblasti; Zadaci = zadaci oblasti (isti red zadatka kao svuda); Dokumenti = stranice oblasti kao stablo/tabela (naslov, vrsta, poslednja izmena, ko); Mapa = kanvas oblasti. Podrazumevano **Pregled**; poslednji izbor se pamti po oblasti (lokalno). | O3: sadržaj pre prostora; mapa je izbor. | web `area-view.tsx`; telefon ekran oblasti |
| P13 | **Stranica (beleška, tabela, fajl) = dokument tima:** naslov i sadržaj (menja svako, osim zaključane), bočna kolona (autor, poslednja izmena „Ime · pre 5 min", zaključano, Povezano), **podstranice kao lista**, **Komentari** ispod, **Istorija izmena** u fioci. Nema kanvasa na stranici; stranica koja ima podstranice nudi link „Prikaži na mapi" (postojeći kanvas stranice). | O3, O4. | web `page-workspace-view.tsx`, `page-editor-view.tsx` |
| P14 | **Zadatak na celu stranu** = isti raspored kao panel zadatka iz LICNO (`apps/web/components/me/task-panel/`): naslov, čipovi (status, prioritet, rok, izvršioci), koraci, instrukcije, Povezano, Komentari, Istorija izmena (instrukcije). Panel i puna strana dele komponente. Zadatak nema mapu. | Jedan model zadatka svuda. | web `page-editor-view.tsx` (zadatak), `me/task-panel/` |
| P15 | **Mapa (redizajn kanvasa):** pravougaone kartice čitljive na 100 % (naslov, vrsta, 2–3 reda sadržaja, ko i kad), točkić **skroluje stranicu** dok se ne klikne u mapu (zum sa Ctrl/⌘ + točkić ili dugmićima), prevlačenje na karticu = ugnežđavanje odmah sa „Poništi", bez kružnih/orbitalnih ukrasa kao podrazumevanih. **Embed protokol za telefon** (`postMessage` poruke iz `docs/mobile/00-PLAN.md` §5.2) se NE menja. | O3, O8; mapa koja se čita, a ne ukrašava. | `area-canvas-view.tsx`, `components/workspace/canvases/` |
| P16 | **Ideje:** podrazumevano **tabla po fazama** (Predlog · Razmatra se · Odobreno · Postalo zadatak; Odbijeno kao skupljena kolona), pa **lista** (ideja, autor, glasovi, faza, komentari, starost); **Mapa** = postojeći kanvas ideja kao opcija. Detalj ideje: tekst (menja svako), Za/Protiv, faza (autor/vlasnik/admin), komentari, „Pretvori u zadatak/belešku", Istorija izmena. | O7. | `ideas-view.tsx`, `ideas-canvas-view.tsx`, telefon `ideje.tsx`, `ideja/[id].tsx` |
| P17 | **Smirivanje (isti DNK):** bez nadnaslova iznad naslova ekrana, bez kartice u kartici, bez sjaja i gradijenata kao ukrasa, jedna tipografska skala (naslov ekrana · naslov sekcije · telo · meta), bez marketinških rečenica u radnom UI-ju, tonovi startupa samo kao identitet (čip, pločica), indigo samo za primarnu radnju, izbor i fokus. Novi startupi dobijaju oblasti **Razvoj · Marketing · Prodaja · Ostalo** (isti ključevi `dev/marketing/sales/other`; postojeći podaci se ne diraju). Pravila se zapisuju u `docs/prostor/DIZAJN-SMIRENJE.md` (dodatak na `docs/licno/DIZAJN-DNK.md`). | O8. | primitivi weba i telefona, `lib/validators.ts` `AREA_DEFINITIONS` |
| P18 | **Telefon:** tabovi ostaju (Danas · Prostor · Poruke · Inbox · Više). **Prostor = početna startupa:** Komandni centar (isti blokovi, sažeto) + redovi **Zadaci · Dokumenti · Ideje · Kanali · Korpa**. **Više = samo nalog i administracija** (moj profil, obaveštenja i zvuci, tema, članovi tima, pozivnice/administracija/lozinke za admina, istorija radnji, odjava). **Beleške:** ikonica u zaglavlju Danas + „Beleška" u brzom unosu. Mapa na telefonu = postojeći WebView (pregled i navigacija; „Uredi raspored" ostaje), nigde nije podrazumevana. Stare rute (`odobrenja`, `aktivnost`, `puls`, `misli`, …) i dalje rade zbog deep linkova; `odobrenja` vodi u Korpu. | O9. | `(tabs)/prostor.tsx`, `vise.tsx`, `danas.tsx`, nove rute |
| P19 | **Tabele i fajlovi:** sadržaj i ponašanje ostaju, dobijaju okvir stranice (P13) i dozvole iz P1 (svaki član menja strukturu tabele i priloge). Uklanjanje priloga ide u Korpu umesto današnjeg trajnog brisanja (`pageFiles.remove` danas briše i fajl iz storage-a). | O1 bez nepovratnog brisanja. | `pageTables.ts`, `pageFiles.ts`, web `tables/`, `files/` |
| P20 | **Chat startupa ostaje** (Poruke u meniju startupa, Kanali u Prostoru); globalni hub u „Ja" ostaje kao posle LICNO. | Nije bilo odgovora; ništa se ne gubi. | — |
| P21 | **Pretraga** ostaje po startupu (⌘K), uči nove rute; obrisano se ne vraća u rezultatima. Globalna pretraga nije u ovom runu. | Obim. | `search-dialog.tsx`, telefon `pretraga.tsx` |
| P22 | **„Čeka tebe"** = ideje u fazi „Razmatra se" za koje nisi glasao (iz svih startupa u Inbox-u „Ja", iz tog startupa u Komandnom centru). Stare stavke (glasanja o brisanju, zahtevi za ugnežđavanje) se više ne prikazuju. | Jedina stvar koja posle O2 stvarno čeka člana. | `inbox.ts`, web/telefon Inbox, Komandni centar |
| P23 | **Istovremeno uređivanje:** oznaka **„<Ime> uređuje"** (prisustvo na stranici, TTL 45 s, isti obrazac kao `chatPresence`: klijent šalje otkucaje, upit ne čita sat) i dijalog pri konfliktu revizije: **„Učitaj najnoviju"** ili **„Prepiši"** (tvoja verzija ide preko, prethodna ostaje u Istoriji izmena). Bez spajanja teksta u realnom vremenu. | Bez nove infrastrukture; ništa se ne gubi tiho. | nov `presence` (tabela `pagePresence`), web i telefon editor |
| P24 | **Aktivnost:** nove radnje u uniji `activities.action` (samo širenje), npr. `page_restored`, `page_locked`, `page_unlocked`, `revision_restored`, `idea_stage_changed`, `idea_archived`, `idea_restored`, `comment_created` — prikazane srpskim rečenicama u „Nedavnim izmenama" (formatiranje u shared). | „Ko je šta uradio" bez novih ekrana. | schema, `lib/activity.ts`, shared |
| P25 | **Kompatibilnost:** backend se deploy-uje pre klijenata. Objekat `permissions` zadržava sva postojeća polja (nova se samo dodaju; `canRequestDeletion` ostaje i vraća `false`), stare funkcije zadržavaju potpis, `returns` validatori se samo šire. | Stari web i stara aplikacija rade sa novim backendom. | svi moduli |

## 2. Obim

**Radimo:**
1. **Backend (Convex):** dozvole (P1), Istorija izmena (P2), zaključavanje i prisustvo (P23), Korpa (P3), slobodno premeštanje i gašenje glasanja i odobrenja (P4), komentari i pominjanja (P5), ideje sa fazama i glasanjem tima (P6, P22), beleške van startupa (P7), podaci Komandnog centra, Puls bez obaveštenja, „Sredi rokove" (P8–P10), aktivnost (P24). Testovi uz svaki modul, uključujući negativne authz slučajeve (nečlan, uklonjen član, arhiviran profil, drugi startup, tuđa beleška).
2. **Shared (`packages/shared`):** faze ideja (nazivi, redosled, izvedena faza), „Zastarelo", formatiranje aktivnosti i revizija, pomoćne funkcije pominjanja — čiste funkcije sa testovima.
3. **Web:** smirivanje, navigacija startupa i rute, Korpa, Komandni centar 2.0, oblast (4 kartice), stranica i zadatak kao dokument tima (komentari, Istorija izmena, zaključavanje, prisustvo, konflikt), Mapa, Ideje, Beleške u „Ja", Podešavanja startupa, tekst i jezik, ekrani u izlogu.
4. **Telefon:** Prostor kao početna startupa, Više samo nalog/admin, Korpa, stranica i zadatak, oblast, Ideje, Beleške, Komandni centar 2.0 — paritet sa webom.
5. **Završno:** smirivanje i pokret kroz sve startup ekrane, stanja, širine, teme, pristupačnost, revizija dozvola i privatnosti, izveštaj.

**Ne diramo:**
- Lični nivo „Ja" iz LICNO, osim: nova stavka **Beleške**, nove stavke u **Čeka tebe** (P22) i njihov prikaz u Inbox-u i Moj dan.
- Auth (prijava, pozivnice, lozinke, `convex/auth.ts`, `auth.config.ts`); reset lozinke (O10).
- Unutrašnjost editora (`apps/mobile/editor-web/`, Tiptap ekstenzije), **embed protokol kanvasa** (poruke telefon ↔ WebView), ID-jeve kanala i zvukova obaveštenja (novi tipovi se samo mapiraju na postojeće kanale), AI provajdere, `next.config.ts`, `apps/mobile/app.json`, `eas.json`, verzije postojećih paketa.
- Trajno brisanje, automatsko čišćenje korpe, pokretanje migracija nad podacima (pišu se i testiraju, ne puštaju se).
- Chat (osim linkova ka novim rutama), globalnu pretragu, sistem pokreta (koristi se, ne prepravlja).
- Produkciju, deploy, push.

## 3. Model saradnje — backend

### 3.1 Dozvole (P1)
Jedan modul `packages/backend/convex/lib/permissions.ts` (tačan API određuje K01), na primer:

```ts
type Actor = { profile: Doc<"profiles">; startup: Doc<"startups"> };
isStartupManager(actor)                 // admin ili vlasnik startupa
canEditPage(actor, page)                // član; ako je zaključana: autor | vlasnik | admin
canLockPage(actor, page)                // autor | vlasnik | admin
canArchive(actor, page) / canRestore    // isto kao canEditPage / član
canEditIdea(actor, idea), canSetIdeaStage(actor, idea), canConvertIdea(actor, idea)
canEditComment(actor, comment), canRemoveComment(actor, comment)
pagePermissions(actor, page)            // objekat `permissions` za klijente (P25)
```

Mesta koja danas porede `createdByProfileId` / `ownerProfileId` i moraju da pređu na ovaj modul (K01 pravi potpun spisak sa redovima): `pages.ts` (get → `permissions`, update, move, archive, entries), `areasV2.ts` (getCanvas → `canMove/canResize/canEdit`, updateAreaBody, updatePage, archivePage, movePages, resizePage, resetPageSize, connect/disconnect, relacije, requestNesting/approve/reject/withdraw, detachPage, movePage), `canvases.ts` (stari API kanvasa oblasti), `pageFiles.ts` (`assertOwner`, `canManage`), `pageTables.ts` (`canEditStructure`), `taskCheckpoints.ts`, `taskCheckpointCanvasEdges.ts`, `tasks.ts` (`updateMetadata`), `ideas.ts` (update, updateLayout, vote, connect, convertToPage, archive, restoreOwn), `collaboration.ts` (contributions, deletion, nesting, detachIdea). **Misli** (`thoughts.ts`) ostaju strogo vlasničke.

### 3.2 Istorija izmena (P2)
Skica tabele (konačan oblik i indekse određuje K01):

```ts
contentRevisions: defineTable({
  startupId: v.id("startups"),
  targetKind: v.union(v.literal("page"), v.literal("area"), v.literal("idea")),
  targetKey: v.string(),                       // isti obrazac kao contributionTargetKey
  kind: v.union(v.literal("baseline"), v.literal("edit"), v.literal("restore")),
  authorProfileId: v.union(v.id("profiles"), v.null()), // null = zatečeno bez autora
  title: v.union(v.string(), v.null()),
  content: v.string(),
  restoredFromId: v.optional(v.id("contentRevisions")),
  createdAt: v.number(),
  updatedAt: v.number(),                       // pomera se pri spajanju (10 min)
}).index("by_targetKey_and_updatedAt", ["targetKey", "updatedAt"])
```

- Upisuju je `pages.update`, `areasV2.updatePage`, `areasV2.updateAreaBody`, `ideas.update` (i svaka druga putanja koja menja naslov/sadržaj — K01 nabraja).
- Spajanje: ako je poslednja revizija iste stavke od istog autora i `now - updatedAt < 10 min`, ona se ažurira (mutacija sme da čita sat; upit ne sme).
- Upiti: `history.list` (paginirano, bez sadržaja, sa autorom), `history.get` (jedna revizija sa sadržajem), mutacija `history.restore` (proverava `canEditPage`/`canEditIdea`, pravi `restore` reviziju, podiže `revision` stranice, beleži aktivnost).
- Veličina sadržaja poštuje postojeće granice (`cleanPageContent`, limiti iz `lib/validators.ts`); dokument ostaje ispod 1 MB.

### 3.3 Zaključavanje, prisustvo, konflikt (P1, P23)
- `pages`: nova opciona polja `lockedAt?: number | null`, `lockedByProfileId?: Id<"profiles"> | null`; mutacije `pages.lock` / `pages.unlock` (ili jedna `setLocked`).
- `pagePresence`: `{ startupId, pageId, profileId, updatedAt }`; mutacije `heartbeat` / `leave`, upit `listForPage` vraća redove sa `updatedAt`, a klijent sam odbacuje starije od TTL-a (45 s, otkucaj na 15 s — isti brojevi kao `CHAT_PRESENCE_TTL_MS`/`CHAT_PRESENCE_REFRESH_MS`). Upit ne čita sat.
- Konflikt: `pages.update` već baca `KONFLIKT_IZMENA` kad `expectedRevision` ne odgovara; klijent prikazuje dijalog (P23). „Prepiši" = ponovni poziv sa najnovijom revizijom; prethodno stanje je već u Istoriji izmena.
- Mirror telo: stranice danas čuvaju telo i kao `contentContributions` sa `sourceKind: "page_body"` (atribucija). Novi `pages.update` piše `pageBodies` za svakog dozvoljenog člana; K01 odlučuje da li se mirror i dalje ažurira (stari klijenti ga čitaju u `permissions.canEditBody`) — **„zaključan zajednički sadržaj" (`legacy_neutral`) se otključava** za sve članove.

### 3.4 Korpa (P3, P19)
- `pages`, `ideaNodes`, `pageFiles`: novo opciono polje `archivedByProfileId`; za podstranice obrisane istim potezom oznaka (npr. `archivedWithPageId`) da „Vrati" vrati isto stablo — ne više, ne manje.
- `trash.list({ startupId, kind?, paginationOpts })` — samo članovi, najnovije obrisano prvo, kroz indeks (nov indeks dozvoljen).
- `trash.restore({ kind, id })` — svaki član; stranica: proverava roditelja i oblast, vraća podstranice istog poteza, podiže `treeRevision`/`revision` gde treba, beleži aktivnost.
- `pageFiles.remove` → meko brisanje (fajl ostaje u storage-u) za sve; stari `prune` se ne dira.
- **Bez trajnog brisanja** u ovom runu.

### 3.5 Premeštanje, ugnežđavanje i stari tokovi (P4)
- `pages.move`, `areasV2.movePage`, `areasV2.movePages`, `areasV2.requestNesting`, `ideas.updatePositions`, `collaboration.requestNesting`, `nesting-drop` putanje: direktno premeštanje za svakog člana (osim zaključanih stavki), uz postojeće provere ciklusa i dubine.
- `collaboration.overview`, `areasV2.listNestingInbox`, `inbox.pending` više ne vraćaju otvorene zahteve kao radnje (`inbox.pending` vraća nove stavke iz P22; stare varijante ostaju u `returns` validatoru zbog starih klijenata, ali se ne emituju).
- `closeLegacyRequests` (internal, paketno, idempotentno) — napisano i testirano, **ne pokreće se**.

### 3.6 Komentari (P5)
- Lista komentara za cilj (`page`, `idea`, `area`, `task_checkpoint` po postojećem `targetKind`) isključuje `sourceKind: page_body | idea_original` i `archivedAt != null`.
- `addComment`/`updateComment`/`removeComment` (ili postojeće `addContribution`/`updateContribution`/`deleteOwnContribution` sa novim pravilima — K01 bira, uz P25). Nov opcioni `mentionProfileIds?: Id<"profiles">[]` na redu, ≤ 20.
- `moderateContribution` ostaje (stari klijenti), ali novi UI ga ne koristi.
- Broj komentara po stranici/ideji za liste i kartice (denormalizovano opciono polje ili ograničeno brojanje — K01 bira, uz granicu čitanja).
- Format sadržaja ostaje kao postojeći prilozi (`cleanPageContent`); prikaz pominjanja odlučuje K01/K07.

### 3.7 Ideje (P6, P22)
- `ideaNodes`: opciona polja `stage`, `stageChangedAt`, `stageChangedByProfileId`; indeks za „Čeka tebe" (npr. `["startupId", "stage", "archivedAt"]`).
- `ideas.vote`: svaki član (uklanja se provera autora), obaveštenje `idea_voted` autoru kad glasa neko drugi (kao danas).
- `ideas.setStage`: autor | vlasnik | admin; aktivnost `idea_stage_changed`.
- `ideas.convertToPage`: autor | vlasnik | admin i faza `odobreno`.
- `ideas.list` vraća i `stage`, `myVote`, brojeve glasova, broj komentara (već vraća glasove).
- `inbox.pending`: nova varijanta `idea_vote` (ideja, startup, autor, broj glasova).

### 3.8 Beleške u „Ja" (P7)
- `thoughtNodes.startupId`, `thoughtEdges.startupId` → `| null`. `thoughtCanvases` ostaje vezan za startup (mapa postoji samo po startupu).
- Novi upiti/mutacije: lista mojih beleški kroz sve aktivne startupe + lične (nov indeks po vlasniku), pravljenje lične beleške, „Pošalji u startup" (postojeće `convertToIdeas`/`convertToPages` prihvataju i ličnu belešku i ciljni startup gde je vlasnik aktivan član).
- Pretraga misli (`search.ideasAndThoughts`, `search_thoughts` indeks) i dalje filtrira po `ownerProfileId`; lične beleške se ne pojavljuju u pretrazi startupa.

### 3.9 Komandni centar, Puls, rokovi, aktivnost (P8–P10, P24)
- Podaci za blokove: postojeći `tasks.commandCenter`, `startups.listMembers`, `activity.listForStartup`, `puls.getWeekly` + po potrebi jedan zbirni upit (K01 odlučuje; svaki blok mora da radi i ako drugi padne).
- `tasks.bulkReschedule({ startupId, taskIds (≤ 50), dueDate: number | null, complete?: boolean })` → vraća prethodne vrednosti za „Poništi".
- `crons.ts`: uklanja se `nedeljni puls`; `sendWeeklyPulsNotifications` se briše ili ostaje nepozvan (K01), testovi se usklađuju.

### 3.10 Šema — samo širenje
Dozvoljeno: nova tabela, nov indeks, novo opciono polje, `X` → `X | null`, nova vrednost u uniji. Zabranjeno: brisanje polja, tabele ili vrednosti iz unije, sužavanje tipa, migracija koja menja postojeće podatke u runu. Svaka izmena šeme se proverava na DEV deploymentu (`npx convex dev --once`). Očekivane izmene: `contentRevisions`, `pagePresence`, polja zaključavanja i korpe na `pages`, `archivedByProfileId` na `ideaNodes` i `pageFiles`, faze na `ideaNodes`, `mentionProfileIds` na `contentContributions`, `startupId | null` u `thoughtNodes`/`thoughtEdges`, nove vrednosti u `notificationTypeValidator` (`comment_mention`, `comment_added`), po potrebi u `notificationTargetTypeValidator`, i u `activities.action`/`targetType`.

### 3.11 Zamke (poznato unapred)
- Dozvole su razbacane po ~10 modula (§3.1); jedna zaboravljena provera ostavlja dugme koje „ne radi". `getCanvas` vraća `canMove/canResize/canEdit` po kartici — UI se oslanja na njih.
- Tela stranica i ideja žive i kao prilozi (`page_body`, `idea_original`) — ne smeju u listu komentara, a „zaključan zajednički sadržaj" mora da se otključa.
- `inbox.pending` hrani „Čeka tebe" u Inbox-u i u Moj dan (LICNO) — promena oblika stavki dira oba ekrana na oba klijenta.
- Testovi koji danas proveravaju STARO pravilo (npr. „član ne može da menja tuđu stranicu", „brisanje traži glasanje", „samo autor glasa") menjaju se namerno — pravilo je u `rules.md`.
- Upiti ne čitaju sat (TTL prisustva, „pre N dana", „Zastarelo" računa klijent).
- `returns` validator mora nabrojati svako vraćeno polje (`pages.validator.test.ts` obrazac).
- Web trijaža (Gori/Danas/Ova nedelja/Kasnije) i telefonska (Prekoračeno/Danas/Sledeće/Blokirano) se razlikuju još od LICNO (IZUZETAK); „Zastarelo" ide u obe kroz istu shared funkciju.
- `api.x.y` je Proxy (nova referenca na svaki pristup) — ne stavljati u zavisnosti kuka.

## 4. Informaciona arhitektura i ekrani

### 4.1 Web — startup
```
+ traka Ja/startupi + meni startupa ----------+ sadrzaj --------------------------------+
|  Ja               | [logo] Cluck Rush  v    |                                        |
|  * Cluck Rush     | Pretrazi (Ctrl/Cmd+K)   |  Komandni centar                       |
|  o Scan Me        |                         |  Za tebe | Trijaza | Ceka tebe         |
|  ...              | > Komandni centar       |  Nedavne izmene | Puls | Tim           |
|  +                |   Zadaci                |                                        |
|                   |   Ideje                 |                                        |
|                   |   Poruke                |                                        |
|                   | DOKUMENTI          [+]  |                                        |
|                   |   > Razvoj              |                                        |
|                   |   > Marketing           |                                        |
|                   |     Prikazi jos...      |                                        |
|                   | ----------------------  |                                        |
|                   |   Korpa   Podesavanja   |                                        |
+-------------------+-------------------------+----------------------------------------+
```
(Skica rasporeda. Ikone su lucide, bez emodžija; tekst u UI-ju ima dijakritike.)

| Ekran | Ruta | Šta je na njemu |
|---|---|---|
| Komandni centar | `?view=today` | P8, P10, P22 |
| Zadaci | `?view=tasks` (+ filter) | lista/tabla svih zadataka tima, filter Svi · Moji · osoba, status |
| Ideje | `?view=ideas` | tabla po fazama · lista · Mapa (P16) |
| Poruke | `?view=chat` | postojeći chat startupa |
| Oblast | `?view=area&areaId=` | Pregled · Zadaci · Dokumenti · Mapa (P12) |
| Stranica | `?view=page&pageId=` | dokument tima (P13) ili zadatak (P14) |
| Korpa | `?view=trash` | P3 + Oporavljeno |
| Podešavanja startupa | dijalog ili `?view=settings` (K07) | opšte (ime, opis, logo), oblasti, tim/pozivnice, lozinke (admin) |
| Aktivnost, Puls | `?view=activity`, `?view=puls` | ostaju; ulaz iz Komandnog centra |
| Mapa beleški | `?view=thoughts` | stari kanvas misli; ulaz iz Beleški |
| Beleške („Ja") | `?view=me-notes` | P7 |

### 4.2 Telefon
- **Danas** (lični, LICNO) — zaglavlje dobija ikonicu **Beleške**; brzi unos dobija „Beleška".
- **Prostor** — početna startupa: Komandni centar (Za tebe, Trijaža sa „Sredi rokove", Čeka tebe, Nedavne izmene, Puls, Tim) i redovi **Zadaci · Dokumenti · Ideje · Kanali · Korpa**. Dokumenti → lista oblasti → oblast (Pregled · Zadaci · Dokumenti; „Mapa" otvara postojeći WebView).
- **Poruke**, **Inbox** — kao posle LICNO; Inbox „Čeka tebe" prikazuje `idea_vote`.
- **Više** — samo nalog i administracija (P18).
- Stranica i zadatak (`stranica/[id]`, `zadatak/[id]`): čitanje i izmena (dugo pisanje je moguće, ali web je prvi), komentari, Istorija izmena (pregled + vraćanje), oznaka zaključano, „<Ime> uređuje", konflikt.

### 4.3 Šta se gasi u UI-ju
Ekran **Odobrenja** (web `approvals-view.tsx`, telefon `odobrenja.tsx` → Korpa), dijalozi glasanja o brisanju, „Zahtev za ugnežđavanje" i njegove poruke, moderacija priloga, **Početna** (`home-view.tsx`), dok briefinga i potpisanih priloga oblasti (`area-briefing-dock.tsx`, `area-signed-contributions.tsx` → Pregled i Komentari), stavke Moje misli/Odobrenja/Aktivnost/Puls/Obaveštenja u meniju startupa, segment „Oblasti" kao jedini ulaz u sadržaj na telefonu. Fajl se briše tek kad ga ništa ne uvozi i kad je njegova korisna funkcija preneta (ODLUKA u progress-u).

## 5. Vizuelni jezik i pokret
- Osnova je `docs/licno/DIZAJN-DNK.md` (tokeni, tipografija, razmaci, tonovi startupa, pokret). K07 piše `docs/prostor/DIZAJN-SMIRENJE.md`: šta se uklanja (P17), tipografska skala sa tačnim veličinama, gustina, ritam, pravila za liste/table/kartice, prazna stanja bez ilustracija i marketinga.
- Brojevi pokreta samo iz `packages/shared/src/motion.ts`; web kroz `apps/web/lib/motion/` i `components/motion/`, telefon kroz `apps/mobile/src/theme/motion.ts` i `components/motion/`. Mirnije: bez ulaznih animacija na gustim listama osim prve pojave ekrana, Flip samo za premeštanje (tabla ideja, trijaža), bez ukrasnog pokreta. Smanjen pokret: samo neprozirnost.
- Taste podešavanja za ovaj run: **DESIGN_VARIANCE 3, MOTION_INTENSITY 5, VISUAL_DENSITY 6** (radni alat, gust, miran).

## 6. Tehnika i granice
- **Nov kod:** backend `packages/backend/convex/{history,trash,presence}.ts` + `lib/permissions.ts` (imena potvrđuje K01); shared `packages/shared/src/{idea-stages,stale,activity-format,mentions,…}.ts` (K01); web `apps/web/components/workspace/…` (startup ekrani), `apps/web/components/me/notes/` (Beleške), zajedničke komponente komentara i istorije u `apps/web/components/collab/`; telefon `apps/mobile/src/components/{collab,korpa,oblast,…}/` i rute u `apps/mobile/src/app/(app)/`.
- **Paketi:** na telefonu nijedan nov native paket. Na webu nov paket samo uz ODLUKU (licenca MIT/Apache, veličina). GSAP pluginovi iz postojećeg `gsap` paketa su dozvoljeni.
- **Performanse:** svaki upit sa `take` granicom kroz indeks; Komandni centar ne sme da pravi više od jednog upita po bloku; Korpa, Istorija i komentari su paginirani; K23 meri najgora čitanja (scenario 6 startupa × 200 zadataka × 50 ideja × 100 revizija).
- **Pristupačnost, jezik, teme, telefon:** srpski latinicom, „ti" oblik, kratko; obe teme; tastatura i fokus na webu; dodir ≥ 44 pt na telefonu; prazno, učitavanje i greška stanje za svaki prikaz podataka.
- **Izlog:** svaki web korak koji menja UI dodaje svoje ekrane u `/izlog` (prezentacione komponente + fixture, bez `useQuery`), npr. `korpa`, `komandni-centar`, `oblast`, `stranica`, `zadatak-strana`, `istorija-izmena`, `komentari`, `mapa`, `ideje`, `beleske`, `podesavanja-startupa`, `ljuska-startup`.
- **Ne dirati:** §2 „Ne diramo".

## 7. Koraci
Tačne vrednosti modela, efforta, režima, sesije i vremena su u `.nocni-run/prostor/steps.json`. Prompt svakog koraka je u `.nocni-run/prostor/prompts/<ID>.md`.

| ID | Naslov | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| K01 | Arhitektura novog modela saradnje (plan) | Opus | max | plan | nova |
| K02 | Backend: dozvole tima, Istorija izmena, zaključavanje, prisustvo | Opus | xhigh | goal | ista (K01) |
| K03 | Backend: Korpa, vraćanje, slobodno premeštanje, gašenje glasanja i odobrenja | Opus | xhigh | goal | nova |
| K04 | Backend: komentari i pominjanja | Sonnet | xhigh | goal | nova |
| K05 | Backend: ideje (faze, glasanje tima, Čeka tebe) i beleške van startupa | Opus | xhigh | goal | nova |
| K06 | Backend: Komandni centar, Puls bez obaveštenja, Sredi rokove, aktivnost | Sonnet | xhigh | goal | nova |
| K07 | Plan ekrana, navigacije i smirivanja, web i telefon (plan) | Opus | xhigh | plan | nova |
| K08 | Web: temelj (smirivanje, navigacija startupa, rute, Korpa) | Opus | xhigh | goal | ista (K07) |
| K09 | Telefon: temelj (Prostor kao početna, Više, Korpa) | Opus | xhigh | goal | nova |
| K10 | Web: stranica kao dokument tima (komentari, istorija, zaključavanje, konflikt) | Opus | xhigh | goal | nova |
| K11 | Web: zadatak na celu stranu | Sonnet | xhigh | goal | nova |
| K12 | Telefon: stranica i zadatak | Sonnet | xhigh | goal | nova |
| K13 | Web: oblast (Pregled, Zadaci, Dokumenti, Mapa) | Opus | xhigh | goal | nova |
| K14 | Telefon: oblast i dokumenti | Sonnet | high | goal | nova |
| K15 | Web: Mapa, redizajn kanvasa | Opus | xhigh | goal | nova |
| K16 | Web: Ideje (tabla, lista, faze, glasanje) i Čeka tebe | Opus | xhigh | goal | nova |
| K17 | Telefon: Ideje i Čeka tebe | Sonnet | high | goal | nova |
| K18 | Beleške u Ja: web i telefon | Sonnet | xhigh | goal | nova |
| K19 | Komandni centar 2.0: web i telefon | Sonnet | xhigh | goal | nova |
| K20 | Podešavanja startupa, tekst i jezik | Sonnet | high | goal | nova |
| K21 | Smirivanje i pokret kroz sve startup ekrane | Opus | xhigh | goal | nova |
| K22 | Završni prolaz: stanja, širine, teme, pristupačnost | Sonnet | high | goal | nova |
| K23 | Revizija: dozvole i privatnost, regresije, performanse, paritet | Opus | max | goal | nova |
| K24 | Završni izveštaj | Opus | high | auto | nova |

Parovi web → telefon: K08↔K09 (temelj, Korpa), K10/K11↔K12 (stranica, zadatak), K13↔K14 (oblast), K16↔K17 (Ideje); K18 i K19 rade oba klijenta. K15 je samo web (telefon dobija novu Mapu kroz isti embed — IZUZETAK po prirodi).

## 8. Kraj runa
- `docs/PROSTOR-REPORT.md`: šta je urađeno, šta nije, BLOKADE, predlozi P1–P25 i ODLUKE koje traže stav, šta Jovan ručno proverava (posebno dozvole sa dva naloga), redosled deploy-a (Convex → web → telefon JS), opcioni `closeLegacyRequests` posle deploy-a, šta je ostalo za nadzirani rad (trajno brisanje i čišćenje korpe posle 30 dana, reset lozinke).
- Završni snimci glavnih površina u `docs/prostor/snimci/K24-*.png` (390 i 1440, obe teme).
- Grana `prostor-run` sa jednim commitom po koraku; ništa pushovano ni deploy-ovano.
