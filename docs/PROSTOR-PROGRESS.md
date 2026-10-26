# PROSTOR — napredak

Noćni run PROSTOR. Plan: `docs/PROSTOR-PLAN.md`. Pravila: `.nocni-run/prostor/rules.md`. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA).

Polazno stanje: grana `prostor-run` pravi se iz `main` posle merge-a LICNO runa (`b735a39`, lični nivo „Ja" je u produkciji). Pre K01 runner beleži koje provere i testovi već padaju (`.nocni-run/prostor/baseline.txt`).

## K01 - Arhitektura novog modela saradnje (plan)   (2026-10-26 16:18)
**Plan korak.** Plan je upisan u `docs/prostor/planovi/K01.md`. Kod nije menjan.

## K02 — Backend: dozvole tima, Istorija izmena, zaključavanje, prisustvo   (2026-10-26 16:52)
**Fajlovi:**
- Novi (backend): `packages/backend/convex/lib/permissions.ts`, `lib/history.ts`, `lib/page_content.ts`, `lib/pagePresence.ts`, `history.ts`, `presence.ts`; testovi `lib/permissions.test.ts`, `pages.collaboration.test.ts`.
- Menjani (backend): `schema.ts`, `lib/validators.ts`, `lib/pages.ts`, `lib/activity.ts`, `activity.ts`, `lib/my_scope.ts`, `pages.ts`, `areasV2.ts`, `tasks.ts`, `taskCheckpoints.ts`, `taskAssignees.ts`, `ideas.ts`, `canvases.ts`, `pageFiles.ts`, `pageTables.ts`, `_generated/api.d.ts` (codegen).
- Shared: nov `packages/shared/src/revisions.ts` + `revisions.test.ts`; menjani `task-row.ts`, `startup-tasks.ts`, `my-day.ts`, `index.ts`.
- Testovi menjani zbog pravila: vidi red ispod (backend 9 fajlova, shared 2, klijentski modeli 4).

**Šta je urađeno:** Sve odluke „ko sme šta" iz matrice K01 koje pripadaju K02 sada prolaze kroz čiste funkcije u `lib/permissions.ts` (`canEditPage`, `canChangeTaskStatus`, `canLockPage`, `canLayoutOnMap`, `canEditArea`, `canEditIdea`, `pagePermissions`, `assertCanEditPage`, `isLockedForViewer` …); otključanu stranicu, zadatak, opis oblasti i ideju menja svaki aktivan član, zaključanu samo autor, vlasnik startupa i admin, a izvršilac zaključanog zadatka i dalje menja status i završava korake (D5). Dodato je zaključavanje (`pages.lock`/`pages.unlock`, idempotentno, aktivnosti `page_locked`/`page_unlocked`, greške `ConvexError` sa kodom `ZAKLJUCANO`/`NEMA_DOZVOLU`). Istorija izmena: tabela `contentRevisions`, jedno mesto pisanja sadržaja stranice (`lib/page_content.ts › writePageContent`) za `pages.update`, `areasV2.updatePage`, `tasks.updateMetadata` (instrukcije) i `history.restore`; bazna revizija „Zatečeno stanje" pri prvoj izmeni (autor poznat samo ako je `revision === 0`), spajanje izmena istog autora u 10 min, „Vrati ovu verziju" uvek pravi NOVU reviziju i aktivnost `revision_restored`; pokriveni i opis oblasti i ideje. Zabrana „Raniji zajednički sadržaj je zaključan" je uklonjena — `legacy_neutral` tekst menja svaki član, a zatečeno stanje ostaje kao bazna revizija bez autora. Prisustvo: `pagePresence` + `presence.heartbeat/leave/listForPage` (upit ne čita sat; `PAGE_PRESENCE_TTL_MS = 45_000`, `PAGE_PRESENCE_REFRESH_MS = 15_000`, `isPresenceFresh` u `lib/pagePresence.ts`, obrazac `CHAT_PRESENCE_*`). `permissions` objekat u `pages.get` ima stara polja po novim vrednostima + `canArchive`, `canChangeStatus`, `canLock`, `canUnlock`, `canComment`, `canRestoreRevision`, `isLocked` (+ `lockedBy` uz stranicu); kartice Mape dobijaju `canEdit`/`isLocked`, a `pageFiles.list`/`pageTables.getMeta`/`taskCheckpoints.listForTask`/`taskAssignees` zastavice prate R2/R3. Shared `taskPermissions` je ogledalo novog pravila (`lockedForViewer`), pa web i telefon iz istog koda dobijaju iste dozvole redova.

**ODLUKE:**
- Odluke K01 (prepis iz plana, važe za ceo run):
  - D1 Brisanje stranice šalje u Korpu celu granu (koren + aktivni potomci, ≤ 250).
  - D2 Korpa prikazuje samo obrisano posle K03; ranije arhivirano ostaje nevidljivo.
  - D3 Brisanje stranice/ideje ne dira veze, relacije, raspored, prozore Mape, priloge, komentare, glasove; ne pravi se „Oporavljeno".
  - D4 Zaključavanje štiti stranicu i spisak njene direktne dece; ne štiti komentare, veze/relacije, raspored na Mapi, „sebe dodaj/skini".
  - D5 Izvršilac zaključanog zadatka menja status i završava korake.
  - D6 Brisanje ili selidba u drugu oblast grane sa zaključanom stranicom traži pravo nad svakom zaključanom stranicom grane.
  - D7 Admin ima moći samo gde je aktivan član.
  - D8 `pageFiles.remove/prune`, `pageTables.removeRow/importRows(replace)` postaju meki; `removeColumn` ne briše vrednosti; blob ostaje.
  - D9 `requestDeletion` odmah šalje u Korpu i upisuje rešen zapis; `voteOnDeletion`, `approveNesting`, `resolveNesting` → `STARI_TOK`; `withdraw*`/`rejectNesting` samo zatvaraju stari zahtev.
  - D10 „Pošalji u startup" = `thoughts.convertToIdeas`; `convertToPages` ostaje isključen.
  - D11 Mirror tela ostaje (samo autorov red; nov samo za prazno telo); izvor istine su `pageBodies`/`ideaNodes.text`; zabrana „Raniji zajednički sadržaj je zaključan" se briše.
  - D12 Greške koje UI prepoznaje su `ConvexError({ code, message, … })`; konflikt zadržava prefiks `KONFLIKT_IZMENA:`.
  - D13 `comment_mention` → kanal `mention`, `comment_added` → `channel`; nov cilj `area`; cilj `ideas` nosi `ideaId`.
  - D14 „Sredi rokove" bez obaveštenja; jedna aktivnost `tasks_rescheduled`.
  - D15 Puls kartica koristi postojeći `puls.getWeekly`.
  - D16 `inbox.pending` vraća `idea_vote` samo uz `include: ["idea_vote"]`.
  - D17 Glasa svaki član za nearhiviranu, nepretvorenu ideju; posle konverzije faza se ne menja.
  - D18 Komentar se u novom UI-ju prikazuje samo kroz shared `parseCommentSegments`, nikad kao HTML.
  - D19 „Nedavne izmene u oblasti" = `pages.recentForArea`, bez novog polja u `activities`.
  - D20 Raspored kartica na Mapi, veze i relacije: svaki član, i na zaključanoj.
- K02-1 Raspored na Mapi (D20: `areasV2.movePages/resizePage/resetPageSize`, `canvases` move/resize/reset, `ideas.updateLayout/resetLayoutSize`, raspored koraka) i R2 za priloge (`generateUploadUrl`/`attach`/`reorder`/`rename`) i tabele (struktura i ćelije, `importRows` append) urađeni su već u K02, iako ih je K01 stavio u K03: K02 traži `permissions` u `pageFiles.list`/`pageTables` po novom pravilu, a zastavica koja kaže „smeš" uz mutaciju koja odbija bila bi laž. Meka brisanja (`pageFiles.remove/prune`, `pageTables.removeRow/removeColumn/importRows replace`) ostaju autorska do K03 (D8).
- K02-2 Veze i relacije, premeštanje/ugnežđavanje, brisanje stranica i ideja, zahtevi i glasanja ostaju po starom pravilu do K03; zato `assertOwnedPage` (areasV2) i `assertOwner`/`assertStructureOwner` (pageFiles/pageTables, samo za brisanja) još postoje. `pages.get › canDeleteDirectly` već računa R7 (`canArchivePage`); tuđu stranicu stari putevi brisanja i dalje odbijaju dok ih K03 ne prebaci na Korpu.
- K02-3 Status otključanog zadatka menja svaki član (R3); „sebe dodaj/skini" je dozvoljeno i na zaključanom (D4), tuđi izvršioci na zaključanom → `ZAKLJUCANO`.
- K02-4 `history.restore` vraća `{ changed, revisionId, targetRevision }` (K01: bez `changed`): vraćanje verzije identične trenutnom stanju ne pravi reviziju (`changed: false`, `revisionId: null`). `expectedRevision` je u validatoru `v.optional` (kao u planu), ali je za stranicu i opis oblasti obavezan u radu (bez njega jasna greška), za ideju se ignoriše.
- K02-5 Nov upit `areasV2.getAreaBody({ startupId, areaId })` (K01 §10.1) — opis oblasti sa revizijom, poslednjim urednikom i `permissions { canEdit, canComment }`.
- K02-6 Liste bez `Actor`-a (`lib/my_scope › toTaskItem`) koriste `isManagerProfile` + `isLockedForViewer` iz `lib/permissions.ts`; vlasnik/admin se čita samo za zaključane zadatke (dva čitanja, malo redova).
- K02-7 Shared `PERMISSION_REASONS` zadržava stare ključeve (`status`, `priority`, `due`, `instructions`, `checkpoints`, `assignees`) zbog starih buildova (P25), ali sa tekstovima zaključavanja; novi ključevi `locked`, `lockedStatus`. `canJoinTask` = zadatak ∧ dozvola izvršilaca ∧ `isAssignee === false` (nudi se i kreatoru koji nije izvršilac).
- K02-8 `activity.ts` validatori se izvode iz šeme (`schema.tables.activities.validator.fields.action/targetType`), `lib/activity.ts` tipovi iz `Doc<"activities">` — nova radnja više ne može da obori `activity.listPaginated`.
- K02-9 Nov red `areaBodies` i dalje upisuje `ownerProfileId` = kreator startupa (polje je obavezno u šemi); dozvolu ne određuje.

**Novi paketi:** nema

**Šema:** (samo širenje, potvrđeno na DEV kroz `npx convex dev --once`)
- nove tabele `contentRevisions` (indeks `by_targetKey_and_updatedAt`) i `pagePresence` (indeks `by_pageId_and_profileId`);
- `pages.lockedAt` `v.optional(v.union(v.number(), v.null()))`, `pages.lockedByProfileId` `v.optional(v.union(v.id("profiles"), v.null()))`;
- `activities.action` + `page_locked`, `page_unlocked`, `revision_restored`; `activities.targetType` + `area`;
- validatori: `pageDocumentValidator` + lock polja, `pageSummaryValidator` + `lockedAt`, `taskItemValidator` + `isLocked`, `lockedForViewer` (sve opciono — P25).

**Testovi:** novi `lib/permissions.test.ts` (matrica R2–R17 × član/autor/vlasnik/admin × zaključano, drugi startup, `isManagerProfile`, `isLockedForViewer`) i `pages.collaboration.test.ts` (uloge × izmena uz nečlana, uklonjenog člana, arhiviran profil i drugi startup; opis oblasti; misli ostaju vlasničke; zaključavanje i kodovi grešaka; kartica zaključane stranice; zaključan zadatak — izvršilac status da, rok ne, `lockedForViewer` po gledaocu; bazna revizija, spajanje 10 min, nov autor; restore pravi NOVU reviziju + konflikt + aktivnost; zaključana istorija i negativni pristupi; `numItems` 51; instrukcije i opis oblasti u istoriji; prisustvo uz `editing` bez R2 = false i negativne slučajeve); shared `revisions.test.ts`.

**Testovi menjani zbog novog pravila:**
- `packages/backend/convex/pages.security.test.ts › nepotpisan raniji sadržaj ne može naknadno da prisvoji kreator`: `canEditBody` false, update odbijen → „…menja svaki član, a zatečeno stanje ostaje u Istoriji" (član menja, bazna revizija bez autora).
- `pages.security.test.ts › samo autor pomera svoju vidljivu karticu na kanvasu oblasti`: `canMove: false`, „samo svoje kartice" → „svaki član pomera…" (`canMove: true`, pomeranje prolazi; scope ostaje).
- `areasV2.test.ts › layout i edge autorizacija su vlasnički i tenant-scope ostaje zatvoren`: pozicija/veličina tuđe kartice odbijena → prolazi (D20); veze ostaju vlasničke do K03.
- `collaboration.test.ts › tim može pomerati tuđu ideju, ali samo autor menja sadržaj i veličinu`: „samo svoju ideju"/„samo svoje kartice" → član menja tekst (ide u Istoriju) i veličinu.
- `tasks.test.ts › kreator menja task metadata, a null vrednosti ih čiste` (deo): član odbijen za status („Status menja kreator…") → odbijen samo na zaključanom („zaključana").
- `tasks.test.ts › dodeljena osoba menja status, ali ne i ostale podatke` → „zaključan zadatak: izvršilac menja status, ali ne i ostale podatke" (pojedinačne poruke „…menja samo kreator zadatka." → „zaključana"; posle otključavanja sve prolazi).
- `tasks.test.ts › dodeljen zadatak: član ne menja tuđe učešće, ali se sam priključuje` → „zaključan zadatak: …" („…menja njegov kreator" → „zaključana").
- `taskAssignees.test.ts › svaki član sam sebe dodaje i skida, tuđe učešće menja kreator` → „…tuđe učešće na zaključanom menja samo autor, vlasnik i admin".
- `taskAssignees.test.ts › spisak menja samo kreator i staje na gornjoj granici` → „spisak menja svaki član, zaključan samo autor, vlasnik i admin".
- `taskAssignees.test.ts › svaki izvršilac menja status i štiklira checkpointe` → „…i na zaključanom zadatku" (neizvršilac odbijen samo na zaključanom).
- `taskCheckpoints.test.ts › pet checkpointa je live, nezavisno od revision-a editora i uz uloge`: neizvršilac `canEdit/canToggle: false`, `canRequestDeletion: true` → `true/true`, `canRequestDeletion: false`; na zaključanom `canEdit: false`; raspored koraka svaki član.
- `taskCheckpoints.test.ts › prvi korak ne može biti vezan i lanac menja samo autor` → „…a lanac zaključanog zadatka menja samo autor" (otključan: izvršilac menja lanac).
- `pageFiles.test.ts › istekla ili tuđa dozvola ne prolazi`: „samo njegov autor" → „Dozvola za slanje fajla nije ispravna".
- `pageFiles.test.ts › tuđi oblačić ne prima fajlove, ali ih član vidi` → „član dodaje fajlove u tuđi oblačić, osim kad je zaključan".
- `pageTables.test.ts › strukturu menja autor, ćelije menja svaki član` → „strukturu i ćelije menja svaki član, zaključanu tabelu samo autor".
- `myDay.test.ts › …ključevi taskItem` (deo): lista polja + `isLocked`, `lockedForViewer`.
- `packages/shared/src/task-row.test.ts › izvršilac menja samo status…` → „nezaključan zadatak: svaki član sme sve" + „zaključan: izvršilac menja samo status…"; `› planiran tuđi zadatak…` → „zaključan tuđi zadatak…" (`PERMISSION_REASONS.status` → `lockedStatus`); `› bez dozvole za status…` → „…(zaključan)…" (otključan → poziv `tasks.updateMetadata`); `dueCall`/`priorityCall` odbijanja → uz `lockedForViewer: true`.
- `packages/shared/src/startup-tasks.test.ts › kreator sme sve` → „kreator sme sve, i na zaključanom" (`canJoinTask` kreatoru koji nije izvršilac: false → true); + „nezaključan zadatak: svaki član sme sve, menadžer i zaključan"; `› izvršilac menja samo status…`, `› član koji nije ni kreator ni izvršilac…`, `› izvršioci još nisu učitani…` → isti slučajevi uz `lockedAt: 1`.
- `apps/mobile/src/components/komandni-centar/startup-task-model.test.ts › dozvole: kreator sve, izvršilac samo status, ostali zaključano sa razlogom` → „dozvole: otključan svako sve; zaključan — …"; `› dok se izvršioci ne učitaju…` → „zaključan: dok se izvršioci ne učitaju…".
- `apps/mobile/src/components/me/row-actions.test.ts › tuđ zadatak u planu: završavanje zabranjeno sa razlogom…` → „zaključan tuđ zadatak u planu: …" (razlog „Status menja kreator zadatka ili osoba kojoj je dodeljen." → `PERMISSION_REASONS.lockedStatus`); `› bez dozvole swipe i dalje bira radnju…`: red bez dozvole = zaključan tuđ zadatak.
- `apps/mobile/src/components/me/my-day/my-day-model.test.ts › dozvola za kvačicu (shared dozvole): lično uvek, startup samo kreator ili izvršilac` → „…startup osim zaključanog tuđeg".
- `apps/web/components/workspace/startup-tasks/command-center-model.test.ts › trijaža po zonama i redovi sa oblašću, planom i dozvolama` (deo): tuđ otključan zadatak `status.allowed` false → true (zabrana proverena na zaključanim); `› dok se izvršioci učitavaju, niko osim kreatora ne menja status` → „zaključan: dok se izvršioci učitavaju…".

**Paritet:** K02 je backend + shared, bez ekrana. Oba klijenta troše isti backend i isti shared `taskPermissions`/`rowFromStartupTask`, pa redovi zadataka (Moj dan, Moji zadaci, Komandni centar) na webu i telefonu odmah dobijaju novo pravilo identično. Zaključavanje, Istorija izmena i prisustvo još nemaju UI ni na jednom klijentu — ekrane planira K07 i grade kasniji koraci (oba klijenta). Nema IZUZETKA.

**Rezultat provere:** tsc backend ✓, tsc web ✓, expo-rute + tsc mobile ✓, eslint ✓ (0 grešaka, 0 upozorenja), vitest ✓ — 104 fajla, 1063 testa prošlo. `npx convex codegen` ✓ (bez promene `api.d.ts`), `npx convex dev --once` ✓ (DEV, „Convex functions ready!“).

**Za Jovana ujutru:**
- Pravila su se promenila u backendu: otključanu stranicu/zadatak/opis oblasti/ideju sada menja svaki član. Postojeći ekrani na webu i telefonu ponegde još sami računaju „samo autor" (npr. `apps/web/components/workspace/page-tree.tsx`, `task-table-view.tsx`, `area-view.tsx`, `apps/mobile/src/components/ideja/idea-actions-sheet.tsx`) i do svojih koraka (K08+) mogu da sakriju radnju koju backend sada dozvoljava — ništa se ne lomi, samo je UI strožiji od servera.
- Šema je proširena samo na DEV (`npx convex dev --once`); produkcija nije dirana. Nijedna migracija nije potrebna (sva nova polja su opciona).
- Brisanje, premeštanje, veze i glasanja su i dalje po starom pravilu — to radi K03.
