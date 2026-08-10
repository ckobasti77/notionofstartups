# Faza 4 — plan: Zadaci i stranica (A3 + A5)

> Planiranje samo. Nijedan fajl sa kodom nije menjan u ovom koraku. Cilj faze:
> **vidiš sve zadatke startupa sa filterima, stranicu možeš arhivirati, i uvek
> znaš gde si u stablu.**

Ovaj fajl ima 5 delova: (1) šta je zatečeno, (2) izmene u redosledu — svaka sa
fajlom/razlogom, prstom-na-ekranu ekvivalencijom, rizikom i dokazom u istom
bloku (spojeno radi čitljivosti — tražene tačke 2/3/4/6 su sve prisutne po
stavci), (3) tabela fajlova koji se diraju, (4) šta NEĆE biti urađeno (za
sekciju Z), (5) redosled komandi za proveru.

`apps/mobile/package.json` se NE dira — nema nove biblioteke, sve se gradi od
postojećih komponenti. `NATIVE-BUILD.md` se ne otvara.

---

## 1. Šta sam zatekao

### 1.1 PARITET.md — tačno stanje pre ove faze

- **A3 (Zadaci — pregled celog startupa): sve 4 stavke `[ ]`.** Ništa urađeno.
- **A5 (page-actions-sheet.tsx):**
  - `areasV2.archivePage` — `[ ]`
  - `pages.getBreadcrumbs` — **`[x]` VEĆ GOTOVO.** Rešeno u Fazi UX (E12),
    `apps/mobile/src/components/breadcrumbs-eyebrow.tsx`, montiran na
    `stranica/[id].tsx:78-83` i (pretpostavka po E8 tekstu) na
    `zadatak/[id].tsx`. **Ne diram, ne pravim ponovo.**
  - `pages.addEntry` — `[ ]`
  - `areasV2.createPage` (ujednačavanje sa `pages.create`) — `[ ]`
  - `pageFiles.prune` — `[ ]`

Dakle stvarni posao ove faze je 4 stavke iz A3 + 4 stavke iz A5 (breadcrumbs
se preskače, već piše `[x]`).

### 1.2 Otkrića koja ISPRAVLJAJU tekst PARITET.md/prompta — pročitaj pre kucanja

PARITET.md-ov opis A3 kaže „Web ima i `tasks-view.tsx` + `task-table-view.tsx`
nad `tasks.listForStartup`." To je netačno u jednom delu:

- `apps/web/components/workspace/tasks-view.tsx` (`TasksView`) **JE
  montiran** — `workspace-shell.tsx:860`. Zove `tasks.listForStartup` sa
  `{ startupId, assigneeProfileId: profile._id }` (SAMO moji zadaci), naslov
  „Moji zadaci", tabovi Lista/Tabla (kanban po statusu, brojač po koloni).
- `apps/web/components/workspace/task-table-view.tsx` (`TaskTableView`,
  filter traka status/prioritet/izvršilac/rok, tabela sa expand redom) **NIJE
  montiran nigde** (`grep -r TaskTableView apps/web` pogađa samo sopstvenu
  definiciju). Mrtav kod. I zove `pages.listChildren`, ne
  `tasks.listForStartup` — dakle ni da je montiran ne bi bio dokaz za ovu
  stavku.
- Ni jedan od ta dva prikaza ne pokriva „SVI zadaci startupa, svi izvršioci,
  bez pretpostavljenog filtera" — to doslovno ne postoji na webu kao gotov
  ekran. Gradi se NOVO, vodeći se ponašanjem oba (filter set iz mrtvog
  `task-table-view.tsx`, grupisanje-sa-brojačem iz živog kanban-a u
  `tasks-view.tsx`), a upit (`tasks.listForStartup` bez `assigneeProfileId`)
  već vraća tačno to.

Dve dodatne zamke nađene u backendu, obe bitne da se ne pogodi pogrešna
funkcija:

- `packages/backend/convex/pages.ts:619` ima **`pages.archive`** — stariji
  duplikat `areasV2.archivePage` (ista `archivePageWithV2Sidecars`, samo bez
  `startupId` provere). Web NE koristi ovaj — koristi
  `areasV2.archivePage` (`page-editor-view.tsx:143`). Zadatak i sam traži baš
  `areasV2.archivePage`. **Ne diraj `pages.archive`, ne zovi ga.**
- `pages.ts:681` (`updateEntry`) i `pages.ts:717` (`deleteEntry`) postoje, ali
  **web ih ne zove.** Za izmenu/brisanje potpisanog unosa web koristi opšte
  `collaboration.updateContribution` / `collaboration.deleteOwnContribution`
  (`page-editor-view.tsx:1681-1682`) — koje već interno prepoznaju
  `sourceKind === "page_entry"` i ogledaju izmenu u `pageEntries`
  (`collaboration.ts:668-673`, potvrđeno čitanjem). Brisanje NE ogleda (samo
  `deleteEntry`/`pages.ts:717` to radi) — to je postojeća asimetrija NA WEBU,
  ne nešto što ja pravim. Mobilni prati TAČNO ono što web stvarno zove, ne
  ono što bi „bilo doslednije".

### 1.3 Zatečeno u `packages/backend/convex` (ništa se ne menja, samo se koristi)

| Funkcija | Fajl:linija | Bitno za plan |
|---|---|---|
| `areasV2.createPage` | `areasV2.ts:1958` | args: `rootPageId` (ne `parentPageId`!), vraća `{ pageId, nestingStatus, requestId }`. Kad je ciljni roditelj tuđ → pravi `pageNestingRequests` zahtev umesto tvrdog pada. |
| `areasV2.updatePage` | `areasV2.ts:2082` | Traži `expectedRevision`; `assertOwnedPage` — **samo kreator**, bez izuzetka za izvršioca (za razliku od `tasks.updateMetadata`). |
| `areasV2.archivePage` | `areasV2.ts:2318` | `{ startupId, pageId }` → `null`. `assertOwnedPage` — samo kreator. |
| `pages.get` permissions | `pages.ts:75-83`, popunjeno `pages.ts:205-228` | `canDeleteDirectly: createdByProfileId === profile._id`, `canRequestDeletion: !canDeleteDirectly` — VEĆ stiže u svaki `pages.get` odgovor, mobilni ga već tipizuje (`PageActionsSheet`'s `PageDetails`). Ne treba nova logika na klijentu za ownership. |
| `collaboration.requestDeletion` | `collaboration.ts:811` | `{ target: {kind, id} }`. `target.kind === "page"` je **već implementiran** put razrešenja (`collaboration.ts:410-422`). Mobilni ga već zove za `contribution`/`recovered` (vidi `odobrenja.tsx:141`, `contribution-thread.tsx:63`) — ista funkcija, nov `kind`. |
| `pages.addEntry` | `pages.ts:633` | `{ pageId, content }` → upisuje `pageEntries` I ogleda u `contentContributions` (`sourceKind: "page_entry"`). Nema `kind`-ograničenje (radi za belešku/zadatak/tabelu/prilog podjednako). |
| `collaboration.listContributionsPaginated` | (potvrđeno pozivom u `page-editor-view.tsx:1676`) | Već čita `target.kind: "page"` — ovo je READ put, ne treba nova funkcija. |
| `collaboration.updateContribution`/`deleteOwnContribution`/`restoreOwnContribution` | `collaboration.ts:638,752,782` | Rade generički nad `contentContributions._id`, bez obzira ko je izvor. Update već ogleda u `pageEntries`; delete ne (vidi 1.2 — to je postojeće stanje, ne diram). |
| `pageFiles.prune` | `pageFiles.ts:355` | Radi SAMO za `page.kind === "note"`, briše redove van `keepFileIds` starije od grejs perioda. Zahteva da editor ume da UBACI prilog u telo beleške — mobilni tentap editor to **ne ume** (ZA-POPRAVKU §2/§5.1, gejt otvoren). Nema poziva → Z izuzetak, ne kod. |
| `tasks.listForStartup` | `tasks.ts:44` | args: `startupId`, `status?`, `assigneeProfileId?`, `dueStart?/dueEnd?`, `paginationOpts`. **Ako i `dueStart/dueEnd` I (`status` ili `assigneeProfileId`) budu postavljeni istovremeno — baca grešku** (`tasks.ts:77-81`). Vraća `pageSummaryValidator` (ima `revision`). |
| `tasks.updateMetadata` | `tasks.ts:276` | **Namerno se NE koristi u A3.** Dozvoljava izvršiocu da menja status (širi model, za Danas). Web-ov ekvivalentni prikaz (i `tasks-view.tsx`'s `KanbanCard` i mrtvi `task-table-view.tsx`) koristi `areasV2.updatePage` sa `canEdit = createdByProfileId === profile._id`, BEZ izuzetka za izvršioca. A3 prati taj (stroži) model — dosledno webu, ne dosledno Danas ekranu (koji ostaje netaknut). |

### 1.4 Zatečeno na mobilnom (fajl:linija, ponovna upotreba bez izmene gde je moguće)

- `apps/mobile/src/components/canvas/page-create-sheet.tsx:89` — `const create
  = useMutation(api.pages.create)`; poziv na `:139-157` šalje
  `parentPageId`. Montiran 4 puta: `canvas/[kind]/[id].tsx:420` (area, uvek
  `parentPageId=null`), `canvas/[kind]/[id].tsx:430` (page, `parentPageId=
  parentPage._id` — MOŽE biti tuđa stranica), `prostor.tsx:260` (Nivo 2,
  `parentPageId=null`), `subpages-section.tsx:172` (`parentPageId=pageId` —
  MOŽE biti tuđa stranica). Dva od četiri mesta stvarno dodiruju kvar
  (tvrdi pad umesto zahteva za odobrenje).
- `apps/mobile/src/components/stranica/page-actions-sheet.tsx` — meni ima
  Premesti/Ugnježdi/Izdvoji/Poveži (`:198-230`), `runAction` helper
  (`:106-121`), `detach()` (`:160-183`) je uzor za potvrdni dijalog +
  `busyId` bravu koji ću pratiti za novi red.
- `apps/mobile/src/app/(app)/stranica/[id].tsx` — `PageActionsSheet` montiran
  `:102-107` (bez `onArchived`), `PageContent` (`:112-166`) redosled:
  `SubpagesSection` → `RelationsSection` → `DiscussionLink` → kind-specific
  telo.
- `apps/mobile/src/app/(app)/zadatak/[id].tsx` — `PageActionsSheet` montiran
  `:319-324` (isti oblik, bez `onArchived`).
- `apps/mobile/src/components/ideja/contribution-thread.tsx` — `target:
  {kind:'idea'|'task_checkpoint'; id}` (`:47-49`), `submit()` (`:77-92`) zove
  `collaboration.addContribution`. Sve ostalo (list/edit/delete/moderate,
  `:94-162`) već je `target`-oblik-agnostično.
- `apps/mobile/src/app/(app)/ideja/[id].tsx:242-248` — uzor za mount:
  obična `Text accessibilityRole="header"` + opis + `<ContributionThread
  target=... canAdd />`, BEZ sklapanja. Isti oblik primenjujem za stranicu.
- `apps/mobile/src/app/(app)/odobrenja.tsx:41-51` (`TARGET_KIND_LABEL`) već
  ima `page: 'Stranica'` — znači da zahtev za brisanje stranice VEĆ ima
  mesto gde se glasa (segment „Čeka", generičko `requestsForVote` iz
  `collaboration.overview`). Ne treba nova UI za glasanje.
- `apps/mobile/src/app/(app)/(tabs)/danas.tsx` — koristi ISKLJUČIVO
  `tasks.commandCenter` (`:84`), segmenti `'overview'|'mine'` (oba nad
  ISTIM commandCenter skupom, klijentski filtrirano, `:115-123`) — ovo NIJE
  A3 (nema `done`, cap po statusu, nema filter sheet, grupisano po roku ne
  po statusu). **Ne diram `danas.tsx` — A3 je nov, dodatni ekran.**
- `apps/mobile/src/components/danas/task-card.tsx` — `TaskCard` je već
  potpuno prop-driven (`task, areaLabel, assignees, now, canDone, onDone,
  onOpen, onMenu, onQuickStatus`) — ne zna niti mu je bitno koja mutacija
  stoji iza `onDone`/`onMenu`. **Strukturno kompatibilan** sa
  `tasks.listForStartup` rezultatom (obe zovu `summarizePage` →
  `pageSummaryValidator`). Ponovo upotrebljiv BEZ IZMENE.
- `apps/mobile/src/components/danas/task-actions-sheet.tsx` — `TaskActionsSheet`
  je TAKOĐE potpuno prop-driven (`onStatus, onPriority, onDue, onJoinLeave,
  onSetAssignees, canChangeStatus, canEditAll` — sve spolja). **Ponovo
  upotrebljiv BEZ IZMENE**, samo se u A3 kači na `areasV2.updatePage`
  umesto na `tasks.updateMetadata`.
- `apps/mobile/src/lib/task-meta.ts:48` — `TASK_STATUS_ORDER` (5 statusa,
  isti redosled kao web `boardStatuses`). `:22-27` `TASK_PRIORITY_META`.
- `apps/mobile/src/lib/deadline.ts` — `classifyDeadline`/`dueDayDiff` čisti
  primitivi, ponovo upotrebljivi za klijentski „Rok" filter u A3 (vidi 2.5).
- `apps/mobile/src/components/ui/section-header.tsx` — `SectionHeader` već
  prima `count` (prikazuje `Pill`) i `collapsible` — tačno šta treba za
  „grupisano po statusu, broj u zaglavlju".
- `apps/mobile/src/app/(app)/(tabs)/vise.tsx:53-60` — `MENU` niz, prva grupa;
  `ListTodo` ikonica već uvezena drugde u projektu (`page-create-sheet.tsx`),
  slobodna za ovaj meni.

### 1.5 Zaključak — šta NIJE potrebno graditi

`TaskCard`, `TaskActionsSheet`, `SectionHeader`, `QuickAddFab`/`QuickAddSheet`,
`OptionChip`, `useListRefresh`, `accessErrorMessage`, `Row` — sve postoji i
ponovo se koristi bez izmene. A3 je u suštini NOVO EKRANSKO OŽIČENJE nad
postojećim gradivnim blokovima, ne nova UI biblioteka.

---

## 2. Izmene, u redosledu

### 2.1 `areasV2.createPage` — ujednači sa `pages.create`

**Fajl:** `apps/mobile/src/components/canvas/page-create-sheet.tsx`

**Zašto ovde i ovako.** Jedina STVARNA razlika u ponašanju (canvas placement
je već ujednačen — `page_creation.ts:268-280` — `insertWorkspacePage` sam zove
`getAvailableCanvasPosition` za oba puta) jeste: `pages.create` tvrdo baca
grešku ako je ciljni roditelj tuđa stranica
(`page_creation.ts` → `requirePageParent` + eksplicitna provera u
`pages.ts` create handleru), dok `areasV2.createPage` u tom slučaju napravi
stranicu u korenu oblasti i pošalje `pageNestingRequests` zahtev
(`areasV2.ts:1992-2073`). To je dostupno na DVA od četiri mesta gde je sheet
montiran (`canvas/[kind]/[id].tsx:430`, `subpages-section.tsx:172` — oba
prosleđuju stvarnu roditeljsku stranicu, koja može biti tuđa).

**Izmena:**
1. `:89` `useMutation(api.pages.create)` → `useMutation(api.areasV2.createPage)`.
2. U `submit()` (`:139-157`), preimenuj ključ u pozivu: `parentPageId` →
   `rootPageId: parentPageId` (prop komponente `parentPageId` OSTAJE
   neizmenjen — menja se samo ime argumenta ka mutaciji).
3. Uhvati rezultat: `const result = await create({...})` (bilo je samo
   `await create({...})`).
4. Posle `haptics.success()`, PRE `reset()`: ako je `result.nestingStatus
   === 'pending'`, prikaži `Alert.alert('Čeka odobrenje', \`„${cleanTitle}"
   je kreirana u korenu oblasti i čeka odobrenje autora ciljne stranice.\`)`
   — ista poruka kao web toast (`create-page-dialog.tsx:85-87`), samo kao
   Alert (mobilni nema toast sistem).

**`danas.tsx:237,294-297` i `quick-add-sheet.tsx` NE diram** — tamo je
`parentPageId` UVEK `null` (kucano, ne prosleđeno), pa je ponašanje već
100% identično `areasV2.createPage`-u za taj poziv; menjanje bez razlike u
ishodu bi bilo nepotrebno diranje ispravnog koda.

**Prst na ekranu.** Korisnik otvara „Podstranice" sekciju na TUĐOJ stranici
(ili canvas rail na TUĐOJ stranici) → „Nova podstranica" → unese naslov →
„Dodaj". Ranije: crvena greška „Za ugnježđavanje u tuđu stranicu potrebno je
odobrenje njenog autora." i ništa se ne desi. Sada: stranica se napravi (u
korenu oblasti), Alert objasni da čeka odobrenje, i zahtev se pojavi autoru
ciljne stranice u „Odobrenja" (već postojeći generički prikaz —
`nestingInbox.incoming`, `odobrenja.tsx:204-224`).

**Šta može da pukne.** TypeScriptće SAM uhvatiti zaboravljen destructuring
(`result.pageId` ne postoji ako se ne uhvati povratna vrednost) — `tsc
--noEmit` mora proći na nulu pre nego što se ovo smatra gotovim. Ako
`rootPageId` ostane pod starim imenom `parentPageId` u pozivu, Convex će
odbiti nepoznat/nedostajući argument (build-time greška preko generisanih
tipova, ne runtime iznenađenje).

**Dokaz.** Emulator: iz Prostora otvori TUĐU stranicu (npr. drugi test
profil je vlasnik), „Podstranice" → „Nova podstranica" → napravi belešku.
Očekuj: Alert „Čeka odobrenje…", nova stranica vidljiva u korenu oblasti
(ne ugnježđena), i u „Odobrenja" (drugog naloga, kao vlasnika ciljne
stranice) se pojavljuje zahtev. Uporedi sa istom radnjom na webu (isti
naziv toast poruke, isti krajnji ishod). Upiši u PARITET.md: fajl + linija
gde je `rootPageId` sada u pozivu.

---

### 2.2 `areasV2.archivePage` + `collaboration.requestDeletion` — brisanje stranice

**Fajlovi:**
`apps/mobile/src/components/stranica/page-actions-sheet.tsx` (glavna izmena),
`apps/mobile/src/app/(app)/stranica/[id].tsx` (novi prop),
`apps/mobile/src/app/(app)/zadatak/[id].tsx` (novi prop — `PageActionsSheet`
je DELJEN između ova dva ekrana, `assertOwnedPage`/`archivePage` ne zavise
od `kind`, pa se ovo tiče i zadatka, ne samo beleške).

**Zašto ovako.** Web (`page-editor-view.tsx:484-519`, pročitano u celosti)
grana na `page.permissions.canDeleteDirectly` (POLJE koje `pages.get` VEĆ
vraća, `pages.ts:226-227` — nema potrebe za klijentskom ownership logikom):
- vlasnik → potvrda → `areasV2.archivePage({startupId, pageId})` → uspeh
  navigira nazad (`onArchived()`).
- nevlasnik → BEZ potvrde (zahtev je povratan, može se povući u
  „Odobrenja") → `collaboration.requestDeletion({target:{kind:'page',
  id}})`.

**Izmena u `page-actions-sheet.tsx`:**
1. Dodaj `Trash2` u lucide-react-native import (`:1-9`).
2. Dodaj u props tip komponente (`:49-63`): `onArchived: () => void`
   (OBAVEZAN, ne opcioni — namerno, da `tsc` sam otkrije ako neki pozivalac
   zaboravi da ga doda).
3. Dodaj dve mutacije pored postojeće četiri (`:76-79`): `const archivePage
   = useMutation(api.areasV2.archivePage);` `const requestDeletion =
   useMutation(api.collaboration.requestDeletion);`
4. Nova funkcija (uzor: `detach()`, `:160-183`, ista `busyId` brava i Alert
   stil):
   ```
   const archiveOrRequest = () => {
     if (busyId !== null) return;
     if (!page.permissions.canDeleteDirectly) {
       haptics.tap();
       setBusyId('archive');
       void requestDeletion({ target: { kind: 'page', id: page._id } })
         .then(() => {
           haptics.success();
           close();
           Alert.alert('Poslato', 'Glasanje o brisanju je pokrenuto.');
         })
         .catch((error: unknown) => {
           haptics.error();
           Alert.alert('Greška', accessErrorMessage(error, 'Zahtev nije poslat.'));
         })
         .finally(() => setBusyId(null));
       return;
     }
     haptics.warning();
     Alert.alert(
       'Obrisati stranicu?',
       'Podstranice će biti izvučene nivo iznad.',
       [
         { text: 'Otkaži', style: 'cancel' },
         {
           text: 'Obriši',
           style: 'destructive',
           onPress: () => {
             setBusyId('archive');
             void archivePage({ startupId: page.startupId, pageId: page._id })
               .then(() => { haptics.success(); onArchived(); })
               .catch((error: unknown) => {
                 haptics.error();
                 Alert.alert('Greška', accessErrorMessage(error, 'Stranica nije arhivirana.'));
               })
               .finally(() => setBusyId(null));
           },
         },
       ],
     );
   };
   ```
   (`accessErrorMessage` uvezi iz `@/lib/errors` — nije trenutno uvezen u
   ovom fajlu, proveri pre dodavanja duplog importa.)
5. Novi red u meni listi (`:198-230`), POSLE „Poveži sa…": `title="Obriši"`,
   `subtitle` = `page.permissions.canDeleteDirectly ? 'Arhivira stranicu; podstranice idu nivo iznad' : 'Traži jednoglasno glasanje tima'`,
   `onPress={archiveOrRequest}`, `disabled={busyId !== null}`,
   `showChevron={false}`, `icon={<Trash2 size={20}
   color={colors.mutedForeground} />}` (NEUTRALNA boja — prati postojeći
   obrazac, `Scissors`/`FolderInput`/`FolderOutput`/`Link2` su SVI
   `mutedForeground`; crvena je rezervisana za `Alert` dugme, ne za ikonicu
   u listi — ne izmišljaj novu konvenciju), `value={busyId === 'archive' ?
   <ActivityIndicator color={colors.primary} /> : undefined}`.

**Izmena u `stranica/[id].tsx` (`:102-107`) i `zadatak/[id].tsx` (`:319-324`):**
dodaj `onArchived={() => router.back()}` na `<PageActionsSheet>`.
(`router` je već u opsegu u oba fajla.)

**Prst na ekranu.** „…" u zaglavlju stranice/zadatka → „Obriši". Ako si
vlasnik: potvrda „Obrisati stranicu? Podstranice će biti izvučene nivo
iznad." → „Obriši" → ekran se vraća nazad, stranica nestaje iz stabla. Ako
nisi vlasnik: odmah se šalje zahtev, Alert „Poslato", i u tab „Više" →
„Odobrenja" (vlasnik stranice) vidi karticu „Brisanje · Stranica" (postojeći
generički prikaz, `TARGET_KIND_LABEL.page`).

**Šta može da pukne i fallback.**
- **Zaboravljen `onArchived` na jednom od dva mount-a.** `tsc --noEmit` puca
  odmah (obavezan prop) — to je NAMERNO, ne popravljaj tako što ćeš prop
  učiniti opcionim.
- **Trka: navigacija nazad vs. reaktivni `pages.get` koji posle arhiviranja
  počinje da baca (stranica više nije „vidljiva").** Isti rizik postoji i na
  webu (identičan redosled: mutacija → `onArchived()`). `router.back()` se
  zove SINHRONO odmah po uspehu mutacije (mikrotask), pre nego što
  Convex reaktivnost stigne nazad sa novim (bacajućim) rezultatom upita —
  očekivano da navigacija pobedi. Ako se na uređaju ipak vidi bljesak
  `ErrorBoundary` ekrana pre povratka: to je poznat, postojeći obrazac (isti
  kao web), NE juri se popravka u ovom koraku — zapiši zapažanje u
  `ZA-POPRAVKU.md` ako se stvarno vidi, ne prepravljaj arhitekturu navigacije.
- **`PageActionsSheet` je DELJEN.** Ako se izmeni samo u jednom od dva
  mount-fajla, drugi ekran (zadatak ILI stranica) ostaje bez rada dugmeta —
  proveri OBA na uređaju, ne samo jedan.

**Dokaz.** Emulator, DVA profila u istom startupu. Profil A pravi belešku,
profil B otvara istu belešku → „…" → „Obriši" → Alert „Poslato" → profil A
(vlasnik) u „Odobrenja" vidi zahtev, glasa ZA → beleška nestaje kod oba.
Ponovi za zadatak (`zadatak/[id].tsx`) da se potvrdi da je isti red dostupan
i tamo. Zatim: profil A pravi drugu belešku i SAM je briše (izravno,
`canDeleteDirectly`) → potvrda → beleška nestaje odmah, bez glasanja. Upiši u
PARITET.md fajl:linija za sve izmenjene tačke.

---

### 2.3 `pages.addEntry` — sekcija „Doprinosi" na stranici

**Fajlovi:**
`apps/mobile/src/components/ideja/contribution-thread.tsx` (proširenje tipa),
`apps/mobile/src/components/stranica/page-contributions-section.tsx` (NOV,
tanak wrapper), `apps/mobile/src/app/(app)/stranica/[id].tsx` (mount),
`apps/mobile/src/app/(app)/zadatak/[id].tsx` (mount).

**Zašto ovako.** `ContributionThread` (`contribution-thread.tsx`) je već
generička komponenta nad `target`-om — čita/uređuje/briše/moderira već radi
za bilo koji `contentContributions` red BEZ IZMENE (potvrđeno: `collaboration.
listContributionsPaginated`/`updateContribution`/`deleteOwnContribution`/
`requestDeletion` su sve već target-oblik-agnostične). **Jedino** što je
specifično za `pages.addEntry` je KREIRANJE novog unosa — to ide kroz drugu
mutaciju od `collaboration.addContribution` jer `pages.addEntry` upisuje i u
`pageEntries` tabelu (za poziciju/redosled), ne samo u
`contentContributions`.

**Izmena u `contribution-thread.tsx`:**
1. Proširi `target` tip (`:47-49`):
   ```
   target:
     | { kind: 'idea'; id: Id<'ideaNodes'> }
     | { kind: 'task_checkpoint'; id: Id<'taskCheckpoints'> }
     | { kind: 'page'; id: Id<'pages'> };
   ```
2. Dodaj mutaciju pored postojeće `addContribution` (`:60`): `const
   addPageEntry = useMutation(api.pages.addEntry);`
3. U `submit()` (`:77-92`), grananje PRE poziva:
   ```
   if (target.kind === 'page') {
     await addPageEntry({ pageId: target.id, content });
   } else {
     await addContribution({ target, content });
   }
   ```
   **VAŽNO — nemoj preskočiti ovo grananje.** `collaboration.addContribution`
   možda formalno ne baca grešku na `target.kind:'page'` (tip mete se ne
   proverava strogo na klijentu), ali NE upisuje `pageEntries` red — sadržaj
   bi se prividno pojavio u niti, ali bi tiho odstupio od modela podataka
   koji web stvarno piše. Mora ići kroz `pages.addEntry`.
4. Ništa drugo u fajlu se ne menja — `item.canEdit`/`canDeleteDirectly`/
   `canRequestDeletion`/`canModerate` već stižu generički iz
   `listContributionsPaginated`, a `target.kind === 'idea'` gejt na
   odobri/odbij dugmadima (`:264`) već ispravno sakriva te akcije za `page`
   (i za `task_checkpoint`, već tako radi).

**Nov fajl `page-contributions-section.tsx`** (uzor: mount u
`ideja/[id].tsx:242-248` — obična `Text accessibilityRole="header"` + opis +
nit, BEZ sklapanja, isti stil):
```tsx
import { StyleSheet, Text, View } from 'react-native';
import { ContributionThread } from '@/components/ideja/contribution-thread';
import type { Id } from '@/convex/_generated/dataModel';
import { useThemeColors } from '@/theme/theme-provider';
// tačne vrednosti fontSize/fontWeight/gap prepiši iz ideja/[id].tsx stilova
// sectionTitle/meta da vizuelno budu ista sekcija na oba ekrana

export function PageContributionsSection({ pageId }: { pageId: Id<'pages'> }) {
  const colors = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
        Doprinosi
      </Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        Potpisan tekst članova tima uz ovu stranicu.
      </Text>
      <ContributionThread target={{ kind: 'page', id: pageId }} canAdd />
    </View>
  );
}
// styles: wrap { gap, paddingHorizontal — isti kao susedne sekcije na ekranu },
// title/meta kopiraj iz ideja/[id].tsx (sectionTitle/meta klase)
```
`canAdd` je UVEK `true` — `pages.addEntry` traži samo `requireStartupMember`,
bez vlasničke provere (isto kao za ideje).

**Mount:** `stranica/[id].tsx`'s `PageContent` (`:112-166`) — dodaj
`<PageContributionsSection pageId={page._id} />` POSLE `<DiscussionLink
.../>` (`:141`), PRE `<View style={styles.kindContent}>` (`:142`). Isto u
`zadatak/[id].tsx` — nađi ekvivalentnu poziciju (posle `DiscussionLink`,
pre/posle `InstructionsSection` — proveri postojeći redosled sekcija u tom
fajlu i ubaci dosledno, isto mesto u toku čitanja kao na stranici).

**Prst na ekranu.** Otvori bilo koju stranicu ili zadatak → skroluj ispod
diskusije → sekcija „Doprinosi" → „Dodaj tekst" → upiši → „Objavi". Tekst se
pojavljuje sa tvojim imenom i vremenom, uređiv/brisiv (isto dugmad kao kod
ideja). Drugi član tima vidi isti tekst realtime.

**Šta može da pukne.** Ako se zaboravi grananje u `submit()` i sve ide kroz
`addContribution`, ništa vidljivo ne puca odmah (nit i dalje prikazuje
tekst) — bag je TIH i vidi se samo poređenjem sa modelom podataka. Zato
dokaz MORA proveriti da red u `pageEntries` stvarno postoji (Convex
dashboard, ne samo ekran) — vidi test ispod.

**Dokaz.** Na ekranu: dodaj tekst u „Doprinosi" na stranici i na zadatku,
oba realtime vidljiva sa drugog naloga. U Convex dashboard-u (`npx convex
dashboard` ili web UI) proveri da je u `pageEntries` tabeli nastao nov red
sa tim `pageId` — ne samo u `contentContributions`. Zatim izmeni svoj tekst
(dugme olovka) i proveri da se i `pageEntries.content` promenio (dokaz da
`collaboration.updateContribution`-ovo ogledanje radi kako je pročitano u
`collaboration.ts:668-673`).

---

### 2.4 `pageFiles.prune` — bez koda, upis u Z

Nema call site za dodati. `pageFiles.prune` čisti priloge UMETNUTE U TELO
beleške (node-view fajlovi u rich-text sadržaju) i radi samo za `kind ===
"note"` (`pageFiles.ts:360-362`). Mobilni tentap editor ne ume da ubaci
prilog u telo beleške — to je otvoren gejt (ZA-POPRAVKU §2 „merni gejt" i
§5.1 „Beleška sa prilogom... READ-ONLY"). Bez te mogućnosti ne postoji način
da mobilni klijent NAPRAVI osiroteli prilog u telu beleške, pa nema šta da
se čisti. `FilesPanel` (za `kind:"file"` stranice) je potpuno odvojen
mehanizam i ne dodiruje `prune` ni na webu.

**Radnja:** dodaj red u PARITET.md sekciju Z (tačan tekst u delu 4 ovog
plana), ČEKIRAJ stavku u A5 sa referencom na taj Z red — ne ostavljaj je
kao otvorenu `[ ]` kad je razlog dokumentovan i validan.

---

### 2.5 Nov ekran: „Svi zadaci" (A3)

**Fajlovi (svi novi, osim `vise.tsx` i `lib/tasks.ts`):**
- `apps/mobile/src/app/(app)/zadaci.tsx` — ekran
- `apps/mobile/src/components/zadaci/tasks-filter-sheet.tsx` — filter sheet
- `apps/mobile/src/lib/tasks.ts` — dodaj tip
- `apps/mobile/src/app/(app)/(tabs)/vise.tsx` — nova stavka menija

#### 2.5.1 `lib/tasks.ts` — nov tip

Dodaj pored postojećih (`:9-11` uzor):
```ts
/** Jedan zadatak iz tasks.listForStartup (isti oblik kao CommandCenterTask —
 * oba idu kroz pageSummaryValidator — ali odvojen tip da se ne meša izvor. */
export type AllTasksTask =
  FunctionReturnType<typeof api.tasks.listForStartup>['page'][number];
```

#### 2.5.2 Upit i filteri — hibridni model (NAMERNA odluka, ne pojednostavljuj)

`tasks.listForStartup` prima `status`/`assigneeProfileId` server-side, ali
NEMA `priority` argument uopšte, i `dueStart/dueEnd` se NE SME kombinovati sa
`status`/`assigneeProfileId` (server baca, `tasks.ts:77-81`).

Zato:
- **Status + Izvršilac → server-side**, kao `usePaginatedQuery(api.tasks.
  listForStartup, { startupId, ...(status !== 'all' ? {status} : {}),
  ...(assignee !== 'all' && assignee !== 'unassigned' ? {assigneeProfileId:
  assignee} : {}) }, {initialNumItems: 50})`. „Nedodeljeno" NE ide kroz
  `assigneeProfileId` (taj filter u upitu znači „ima ovog izvršioca", ne
  „nema nijednog") — filtriraj „Nedodeljeno" KLIJENTSKI nad već učitanom
  stranicom (treba lista izvršilaca po zadatku — vidi niže).
- **Prioritet + Rok → klijentski**, `useMemo` nad `results` (nema server
  podrške za prioritet; rok bi tražio kršenje exclusivity pravila da ide
  server-side pored statusa/izvršioca). Rok kao TRI preseta (Danas/Mimo
  roka/Predstojeći), logika 1:1 sa `task-table-view.tsx`'s `isToday`/
  `dueFilter` (mrtav kod, ali logika je tačna) — koristi POSTOJEĆE
  `classifyDeadline`/`dueDayDiff` iz `@/lib/deadline.ts`, ne piši novu
  funkciju.
- **NIKAD ne šalji `dueStart`/`dueEnd` u ovaj upit** — to je namerno
  izbegnuto da se zaobiđe exclusivity ograničenje, ne previd. Ako neko
  kasnije doda server-side rok filter, mora ili da isključi status/izvršioca
  u UI-ju kad je rok aktivan, ili da ostane klijentski. Ne menjaj ovo bez tog
  razmišljanja.
- **Izvršioci po zadatku** za prikaz na kartici i za „Nedodeljeno" filter:
  isti obrazac kao `danas.tsx:94-99` — `useQuery(api.taskAssignees.
  listForTasks, {startupId, taskPageIds: results.map(t => t._id)})`, jedna
  pretplata za sve redove.

**Grupisanje.** Ako je status filter `'all'`: grupiši `results` (posle
klijentskih prioritet/rok filtera) po `taskStatus` u 5 sekcija po
`TASK_STATUS_ORDER` (`backlog→next→in_progress→blocked→done`), svaka kroz
`<SectionHeader title={TASK_STATUS_META[s].label} count={grupa.length} />`
(već podržava brojač — ne pravi novi bedž). Ako je status filter NA
konkretnoj vrednosti, sve stavke već dele taj status — NE pravi 4 prazne
sekcije + 1 punu; prikaži ravnu listu sa jednim summary redom na vrhu („N
zadataka", isti obrazac kao `tasks-view.tsx:86-88`). Bez sklapanja sekcija u
prvoj verziji — `SectionHeader` to podržava (`collapsible` prop) ako se
kasnije proceni da lista predugo skroluje, ali to NIJE deo ovog zahteva.

#### 2.5.3 Kartica i brzo uređivanje — ponovna upotreba, ne nova komponenta

- Karticu daje **`TaskCard`** nepromenjen (`components/danas/task-card.tsx`)
  — prima `AllTasksTask` bez cast-a (isti oblik kao `CommandCenterTask`).
- `canDone` (prosleđeno u `TaskCard`) = `task.createdByProfileId === myId`
  (KREATOR SAMO — različito od Danas gde je i izvršilac dovoljan; ovo prati
  `areasV2.updatePage`-ov `assertOwnedPage`, ne `tasks.updateMetadata`).
- `onDone` → poziva `areasV2.updatePage({startupId, pageId: task._id,
  expectedRevision: task.revision, taskStatus: 'done'})` direktno (bez
  sheeta, brzi put — isto UX obećanje kao Danas, druga mutacija ispod).
- `onMenu` (svajp levo) i `onQuickStatus` (long-press) → oba otvaraju
  **`TaskActionsSheet`** (`components/danas/task-actions-sheet.tsx`)
  nepromenjen, sa `statusOnly` `true` za `onQuickStatus` / `false` za
  `onMenu` (isti obrazac kao `danas.tsx:261-264`'s `openMenu`). Prosledi
  `canChangeStatus={canEditAll}` (JEDNAKO — nema izuzetka za izvršioca u
  ovom ekranu) i `canEditAll = task.createdByProfileId === myId`.
  Sheet-ove `onStatus`/`onPriority`/`onDue`/`onSetAssignees` callback-e
  poveži na `areasV2.updatePage` (ne `tasks.updateMetadata`):
  ```ts
  const updateTaskPage = useMutation(api.areasV2.updatePage);
  const [busyTaskId, setBusyTaskId] = useState<Id<'pages'> | null>(null);

  const patchTask = (task: AllTasksTask, patch: Record<string, unknown>) => {
    if (busyTaskId !== null || !activeStartupId) return;
    setBusyTaskId(task._id);
    haptics.tap();
    void updateTaskPage({
      startupId: activeStartupId,
      pageId: task._id,
      expectedRevision: task.revision,
      ...patch,
    })
      .then(() => haptics.success())
      .catch((error: unknown) => {
        haptics.error();
        Alert.alert('Greška', accessErrorMessage(error, 'Zadatak nije ažuriran.'));
      })
      .finally(() => setBusyTaskId(null));
  };
  ```
  `task.revision` se čita SVEŽE iz trenutno renderovanog reda (reaktivan
  upit) — nema potrebe za `useRef`/queue kao na webu, jer `busyTaskId`
  brava već sprečava DUPLI poziv nad ISTIM redom dok je u letu (dugme/red
  je `disabled` dok traje). `onJoinLeave` NE prosleđuj granu za
  „priključi se sam" — u ovom ekranu je uvek `canEditAll` (nema
  self-assign izuzetak), pa se `AssigneePickerList` grana uvek koristi.
- Tap (`onOpen`) → `router.push({pathname:'/zadatak/[id]', params:{id:
  task._id}})` — svi rezultati su `kind:'task'` po definiciji upita.

#### 2.5.4 Filter sheet

Nov fajl `components/zadaci/tasks-filter-sheet.tsx`, uzor `page-create-sheet.
tsx`'s `Section`+`OptionChip` red (`:263-306` stil) — NE `Row` primitivi
(čipovi su druga UI klasa od redova liste, isto kao u `TaskActionsSheet`;
pravilo „svaki novi red kroz row.tsx" se odnosi na redove LISTE, ne na
selekcione čipove — ne forsiraj čipove u `Row`).

Sadržaj (4 sekcije, svaka `OptionChip` red):
- **Status**: „Svi" + `TASK_STATUS_ORDER` (5).
- **Prioritet**: „Svi" + `TASK_PRIORITY_ORDER` (4).
- **Izvršilac**: „Svi" + „Nedodeljeno" + `members.map(m => m.profile.
  displayName)`.
- **Rok**: „Svi" / „Danas" / „Mimo roka" / „Predstojeći".

Primena je **odmah po tapu** (bez „Primeni" dugmeta) — isti obrazac kao
`WorkloadStrip` filter u Danas (`danas.tsx` `memberFilter` menja se odmah,
bez draft-stanja). Dugme „Očisti filtere" na dnu (vidljivo samo kad je bar
jedan filter aktivan). Zatvaranje sheeta je samo „Zatvori" — lista ispod je
već ažurna dok je sheet otvoren.

U `zadaci.tsx` zaglavlju: `IconButton` (uzor `stranica/[id].tsx:87-89`,
`SlidersHorizontal` ikonica) koji otvara sheet; ako je bar 1 filter aktivan,
`Badge` (uzor `vise.tsx:182`) sa brojem aktivnih dimenzija na dugmetu.

#### 2.5.5 Stanja ekrana

- **Učitavanje**: `SkeletonTaskCard` (već postoji, `@/components/ui/
  skeletons`, korišćen u `danas.tsx`) × 4-5, bez sekcijskih zaglavlja.
- **Prazno (startup nema nijedan zadatak)**: `EmptyState` „Nema zadataka" +
  akcija „Novi zadatak" (otvara `QuickAddSheet`, vidi niže).
- **Prazno (filteri ne pogađaju ništa, ali zadataka ima)**: `EmptyState`
  „Nijedan zadatak ne odgovara filterima" + dugme „Očisti filtere" — ISTI
  tekst kao mrtvi `task-table-view.tsx:222-228` (dobra formulacija, samo
  kod nije bio dostupan).
- **Greška**: `export function ErrorBoundary({error, retry})` (obavezno,
  isti obrazac kao SVAKI drugi ekran pročitan u ovoj fazi — `odobrenja.tsx:
  633-652`, `vise.tsx:263-280`, `stranica/[id].tsx:211-230`).
- **Kreiranje**: `QuickAddFab` + `QuickAddSheet` (oba nepromenjena,
  `components/danas/quick-add-fab.tsx` + `quick-add-sheet.tsx`), `onCreate`
  poveži na `useMutation(api.pages.create)` sa `parentPageId: null` — ISTI
  poziv kao `danas.tsx:294-297` (uvek top-level, nema razlike prema
  `areasV2.createPage` za ovaj slučaj — vidi 2.1 obrazloženje). Ne kači na
  `areasV2.createPage` ovde SAMO zato što je 2.1 to uradio drugde — tamo
  gde nema stvarne razlike u ponašanju, ne menjaj radni kod.

#### 2.5.6 Meni ulaz

`vise.tsx` `MENU` niz (`:53-60`), ubaci POSLE stavke „Odobrenja" (indeks 1):
```ts
{ icon: ListTodo, label: 'Svi zadaci', route: '/zadaci' },
```
`ListTodo` dodaj u postojeći `lucide-react-native` import (`:3-22`).

**OBAVEZNO POSLE kreiranja `zadaci.tsx`:** regeneriši typed routes
(`expo start --offline`, sačekaj ~8s da ispiše da je Metro krenuo, pa
prekini) — bez ovoga `route: '/zadaci'` i `router.push('/zadaci')` ne
prolaze `tsc` (dokumentovana zamka, `docs/mobile/` memorija ove faze).

**Prst na ekranu.** Tab „Više" → „Svi zadaci" → vidiš SVE zadatke startupa
(uključujući „Gotovo", za razliku od „Danas") grupisane po statusu sa
brojem u zaglavlju svake grupe. Ikonica filtera u zaglavlju → sheet →
biraš npr. „Hitno" prioritet → lista se odmah suzi, bedž „1" se pojavi na
dugmetu filtera. Long-press na karticu → brzi status meni; svajp desno →
odmah „Gotovo" (samo ako si kreator). Tap na karticu → detalj zadatka.

**Šta može da pukne i fallback.**
- **Kombinovanje server-side statusa/izvršioca sa klijentskim
  prioritetom/rokom može posle promene filtera prikazati „malo" rezultata
  jer je učitana samo jedna stranica (50) paginiranog upita.** Očekivano,
  isti obrazac kao mrtvi web kod — prazno stanje MORA da kaže „promeni
  filtere ili učitaj još", ne samo „nema zadataka" (vidi 2.5.5).
- **`expectedRevision` konflikt** (`KONFLIKT_IZMENA` greška sa servera) ako
  je zadatak izmenjen na drugom uređaju baš dok se meni otvarao — `Alert`
  sa `accessErrorMessage` prikazuje tu poruku direktno (server je autoritet,
  ne treba poseban tekst) — korisnik ponovo otvori sheet, upit je već svež.
- **Zaboravljena `expo start --offline` regeneracija** → `tsc` javlja da
  `/zadaci` nije validna ruta. Prva stvar za proveru ako build padne na
  novom fajlu.
- **`TASK_STATUS_ORDER` uključuje `done`, ali ako se neko poduzme da filtrira
  „samo otvoreno" podrazumevano (kopirajući Danas-ov instinkt) — to je
  POGREŠNO za ovaj ekran.** Cela poenta A3 je da `done` bude vidljivo (Danas
  ga nema). Podrazumevani filter je „Svi" na sve četiri dimenzije.

**Dokaz.** Emulator: napravi 5+ zadataka razičith statusa/prioriteta/
izvršilaca/rokova (neki „Gotovo"). Otvori „Svi zadaci" → prebroj karte po
sekciji naspram broja u zaglavlju (moraju se poklapati) → primeni svaki od
4 filtera pojedinačno i u kombinaciji (npr. Status=„U toku" + Izvršilac=
„Ja") → uporedi rezultat sa ručnim prebrojavanjem u Convex dashboard-u.
Promeni status kartice iz long-press menija, potvrdi da UI i baza (
`taskStatus` polje) odražavaju izmenu i da SE NE MOŽE promeniti tuđi
zadatak (dugmad `disabled`, `canChangeStatus`/`canEditAll` false za tuđe).

---

## 3. Fajlovi koji se diraju (pregled)

| Fajl | Vrsta izmene |
|---|---|
| `apps/mobile/src/components/canvas/page-create-sheet.tsx` | izmena (2.1) |
| `apps/mobile/src/components/stranica/page-actions-sheet.tsx` | izmena (2.2) |
| `apps/mobile/src/app/(app)/stranica/[id].tsx` | izmena (2.2 prop, 2.3 mount) |
| `apps/mobile/src/app/(app)/zadatak/[id].tsx` | izmena (2.2 prop, 2.3 mount) |
| `apps/mobile/src/components/ideja/contribution-thread.tsx` | izmena (2.3) |
| `apps/mobile/src/components/stranica/page-contributions-section.tsx` | NOV (2.3) |
| `apps/mobile/src/lib/tasks.ts` | izmena, dodat tip (2.5.1) |
| `apps/mobile/src/app/(app)/zadaci.tsx` | NOV (2.5) |
| `apps/mobile/src/components/zadaci/tasks-filter-sheet.tsx` | NOV (2.5.4) |
| `apps/mobile/src/app/(app)/(tabs)/vise.tsx` | izmena, nova stavka (2.5.6) |
| `docs/mobile/PARITET.md` | čekiranje + Z red (posle koda, isti commit) |

`packages/backend/convex/**` — **nula izmena**, potvrđeno u svakoj stavci
gore da postojeće funkcije pokrivaju sve. `apps/mobile/package.json` — nula
izmena, sve ponovo koristi postojeće biblioteke.

---

## 4. Šta NEĆU raditi (za PARITET.md sekciju Z)

```
| `pageFiles.prune` | Čisti osirotele priloge UMETNUTE U TELO beleške preko node-view mehanizma; mobilni tentap editor ne ume da ubaci prilog u telo (ZA-POPRAVKU §2/§5.1, gejt i dalje otvoren) — nema koda koji na mobilnom može da napravi taj osiroteli red, pa nema šta da se čisti. Zatvara se zajedno sa proširenjem tentap bundle-a. |
```

Dodatno, van formalne Z tabele (nisu PARITET stavke, ali su svesne granice
ovog koraka — zapiši u odgovarajući deo `ZA-POPRAVKU.md` ako se pri
implementaciji pokaže da nešto od ovoga stvarno smeta):

- **Ne prati se `NoteEditor`-ovo živo „dirty/saving" stanje pre arhiviranja**
  (web to radi, `page-editor-view.tsx:486-502`). Zahtevalo bi provlačenje
  save-state-a iz `NoteEditor` u `PageActionsSheet` kroz roditeljski ekran —
  arhitekturna izmena van obima ovog zahteva. Najgori ishod: propušteni
  autosave na već arhiviranoj stranici tiho ne uspe (Convex mutacija je
  atomarna, ne ostavlja polovičan zapis) — ne gubitak podataka, samo
  neuspešan poslednji čuvani takt.
- **`pages.updateEntry`/`pages.deleteEntry` se ne koriste** — web ih ne
  koristi za živi UI (koristi generičke `collaboration.updateContribution`/
  `deleteOwnContribution`), mobilni prati isti, stvarno pušteni put, ne
  teoretski čistiji.
- **Asimetrija u `collaboration.deleteOwnContribution`** (ne ogleda brisanje
  u `pageEntries`, za razliku od `updateContribution` koje ogleda izmenu) —
  postojeće stanje na WEBU, ne nova greška ovog koraka. Ne popravljati bez
  eksplicitnog zahteva (menjanje backend ponašanja van obima).
- **`collaboration.restoreOwnContribution` (undo posle brisanja doprinosa)
  se NE dodaje ovde** — to je PARITET.md stavka A6, van A3/A5. Postojeći
  `ContributionThread` obrazac (potvrdi PRE brisanja, bez post-hoc undo) se
  nasleđuje nepromenjen za `page` target — dosledno, ne propust.
- **Nema slobodne tekstualne pretrage u filter sheetu** — zahtev eksplicitno
  traži samo status/prioritet/izvršilac/rok; `tasks.listForStartup` nema
  server-side pretragu, a klijentska pretraga nad delimično učitanom
  paginiranom listom bi bila neprecizna dovoljno da zavede.
- **Sekcije statusa u „Svi zadaci" se ne sklapaju** (iako `SectionHeader` to
  podržava) — zahtev traži grupisanje i brojač, ne sklapanje; dodavanje
  sklapanja bez potrebe je nezatražena funkcija.
- **`danas.tsx` se ne dira** — „Pregled" segment tamo ostaje kakav jeste
  (deadline-grupisan, samo otvoreni, capped). A3 je dodatni ekran, ne
  zamena; diranje `danas.tsx` bez potrebe rizikuje već verifikovane E1–E13
  popravke.

---

## 5. Redosled provere (posle svake stavke iz dela 2, ne samo na kraju)

1. `cd apps/mobile && npx tsc --noEmit` — nula grešaka posle SVAKE stavke iz
   dela 2, ne samo na kraju (`expo lint` je poznato pokvaren u ovom projektu
   — ne oslanjaj se na njega, dokumentovano u memoriji ovog projekta).
2. Emulator/uređaj: konkretan test naveden u svakoj stavci 2.1–2.5.
3. Convex dashboard: za 2.3 (Doprinosi), proveri `pageEntries` tabelu
   direktno, ne samo ekran.
4. Metro konzola: nula crvenih grešaka, nula upozorenja koja se ponavljaju
   tokom prolaska kroz nove ekrane.
5. Na kraju cele faze: `docs/mobile/PARITET.md` — čekiraj sve 4 A3 stavke i
   preostale 3 A5 stavke (`createPage`, `archivePage`, `addEntry`, `prune`
   kao Z), svaka sa fajl:linija dokazom u istom commit-u kao kod.

---

## 6. Odstupanja od plana (upisano tokom implementacije)

Sve prijavio `rn-review` agent (posle koda, pre commit-a) osim gde je drugačije
naznačeno. Svako odstupanje je popravljeno u istom koraku, ne ostavljeno za
sledeću fazu.

1. **`onJoinLeave` u `zadaci.tsx` NIJE no-op, suprotno §2.5.3.** Plan je tvrdio
   da se u ovom ekranu „uvek koristi `AssigneePickerList` grana" pa
   `onJoinLeave` navodno nikad ne okida. To je netačno: `TaskActionsSheet`
   grana na `canEditAll` NEZAVISNO od `statusOnly`/`canChangeStatus` — kad
   ne-kreator otvori PUN meni (svajp levo, ne long-press), `canEditAll` je
   `false` i sheet prikazuje red „Priključi se / napusti", ne
   `AssigneePickerList`. No-op bi tu bio VIDLJIVO mrtvo dugme. Implementirano
   je sa stvarnim `taskAssignees.join`/`leave` (isti obrazac kao
   `danas.tsx`/`zadatak/[id].tsx`), `zadaci.tsx` (`applyJoinLeave`).
2. **Tip `patch` u `patchTask` je `Partial<{taskStatus, taskPriority, dueDate,
   assigneeProfileIds}>`, ne `Record<string, unknown>` kako je pisalo u §2.5.3
   pseudokodu.** `Record<string, unknown>` spread u strogo tipiziran
   `areasV2.updatePage` poziv ne prolazi `tsc` (polja bi imala tip `unknown`
   umesto stvarnog tipa). Otkriveno pri pisanju koda, ne od agenta.
3. **FAB u `zadaci.tsx` je generički `@/components/ui/fab` sa
   `style={{bottom: insets.bottom + 16}}`, ne `QuickAddFab` kako je pisalo u
   §2.5.5.** `QuickAddFab` nema `style`/insets prop (zakucana pozicija,
   dizajnirana za TAB ekrane gde tab bar već rezerviše safe area).
   `zadaci.tsx` je STACK ekran (kao `misli.tsx`/`ideje.tsx`, koji iz istog
   razloga koriste generički `FAB`) — bez insets-a bi dugme sedelo na samoj
   ivici ekrana kod telefona sa home-indicator gestom (safe area pravilo).
4. **`page-contributions-section.tsx` dobila ograničenu visinu + interni
   skrol + lokalni `KeyboardAvoidingView`, čega NIJE bilo u §2.3 kodu.**
   `rn-review` nalaz: na `stranica/[id].tsx` je roditelj OBIČAN `View`
   (`content: {flex:1}`, ne `ScrollView` — editor/tabela/fajl ispod sami
   skroluju), pa bi duža nit doprinosa gurnula editor van ekrana BEZ ikakvog
   skrola do njega. Popravka kopira `SubpagesSection`-ov već uspostavljen
   obrazac (`ScrollView` sa `maxHeight: windowHeight*0.42`,
   `nestedScrollEnabled`) + lokalni `KeyboardAvoidingView` (isti
   `Platform.OS==='ios'?'padding':undefined` obrazac kao `ideja/[id].tsx`
   kompozer) da tastatura ne prekrije kompozer. Sused NoteEditor-u (ne
   roditelj), pa ne dira njegov `use-keyboard-inset.ts` tok.
5. **`meta` stil u `page-contributions-section.tsx` je `text.body` (16px), ne
   `text.meta` (13px)** kako je pisalo u §2.3 „title/meta kopiraj iz
   `ideja/[id].tsx`". Rečenica „Potpisan tekst članova tima…" je pun opisni
   tekst (isto kao `RelationsSection`-ovo prazno stanje, koje iz istog
   razloga koristi `text.body`), ne meta-oznaka (vreme/bedž) — `ideja/[id]
   .tsx`-ov `meta` stil se tamo koristi za „Autor: X" atribuciju, drugačiju
   ulogu. Ispod praga od 16px iz pravila faze.
6. **Dodat `busyTaskId` bravu u `zadaci.tsx`** (`patchTask`/`applyJoinLeave`),
   kog plan pseudokod nije imao. Bez nje bi brz dupli svajp/tap na ISTU
   karticu mogao poslati dve mutacije nad istim (možda već zastarelim)
   `revision`-om — pravilo faze traži „busy lock" na svakoj mutaciji za SVAKI
   nov ekran. (Sestrinski `danas.tsx`/`zadatak/[id].tsx` to nemaju za brze
   akcije, ali to je postojeće stanje van obima ove izmene, ne uzor koji treba
   ponoviti na novom ekranu.)
7. **`parity-check` agent (druga verifikaciona runda) našao je tri dodatna
   sitna problema, sva tri popravljena u istom koraku:**
   - `page-actions-sheet.tsx`-ov direktni brisanje-granа je zvao samo
     `onArchived()` (→ `router.back()`), ne i `close()`. Ako `router.back()`
     nema istoriju (deep link na `stranica/[id]`/`zadatak/[id]`), sheet bi
     ostao otvoren nad upravo arhiviranom (sad bacajućom) stranicom. Popravka:
     `close()` PRE `onArchived()`, isti redosled kao `requestDeletion` grana
     koja je to već radila ispravno.
   - `page-create-sheet.tsx`-ov doc-komentar je i dalje pisao `pages.create`
     posle §2.1 izmene mutacije na `areasV2.createPage` — ažurirano.
   - `zadaci.tsx`-ov `taskIds` (izveden iz `usePaginatedQuery`-jevog
     AKUMULIRANOG `results`) nije imao gornju granicu — posle dovoljno
     „Učitaj još" (server strana pušta do `MAX_TASK_PAGE_SIZE=100` po
     stranici) prešao bi backend-ov `taskAssignees.listForTasks` limit od 300
     id-jeva, koji TVRDO baca (`taskAssignees.ts:110-114`) i srušio ceo ekran
     u `ErrorBoundary`. Popravka: `results.slice(0, 300)` pre slanja upita —
     zadaci iznad granice ostaju bez prikazanih izvršilaca na kartici
     (degradacija, ne pad); konstanta i objašnjenje u `zadaci.tsx` uz uvoz
     `TaskPatch` tipa.
