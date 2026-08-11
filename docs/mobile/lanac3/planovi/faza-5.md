# Faza 5 — plan: Ideje, vraćanje obrisanog, chat (A4 + A6 + A7 + A8)

> Planiranje samo. Nijedan fajl sa kodom nije menjan u ovom koraku. Cilj faze:
> **ništa se ne gubi zauvek — svaka arhivirana stvar se može vratiti, na svakom
> ekranu, istim obrascem.**

Struktura: (1) šta je zatečeno + ispravke netačnih pretpostavki prompta,
(2) izmene u redosledu — svaka sa fajlom/razlogom, prstom-na-ekranu
ekvivalencijom, rizikom i dokazom u istom bloku, (3) tabela fajlova,
(4) šta NEĆE biti urađeno (Z redovi doslovno), (5) redosled provere.

**Ne dira se:** `packages/backend/convex/**` (nula izmena — sve funkcije
postoje), `apps/web/**` (uključujući embed — vidi 1.2), `apps/mobile/package.json`
(nema novih biblioteka → `NATIVE-BUILD.md` se ne otvara). **Nema novih ruta**
u `src/app/` — sve novo su komponente → typed-routes regeneracija NIJE potrebna.

---

## 1. Šta sam pročitao i zatekao

Pročitano: `PARITET.md` (A4/A6/A7/A8 + Z), `ZA-POPRAVKU.md` (Z1–Z5, §5),
`00-PLAN.md` §5.2, plan Faze 4; backend `ideas.ts`, `collaboration.ts`,
`taskCheckpoints.ts`, `taskCheckpointCanvasEdges.ts`, `chat.ts` (archiveChannel),
`notifications.ts` (latest); web `ideas-view.tsx`, `ideas-canvas-view.tsx`,
`workspace-item-dialog.tsx`, `workspace-history.tsx`, `conversation-pane.tsx`,
`task-checkpoint-list.tsx`, `idea-discussion-dialog.tsx`, `notifications-panel.tsx`;
mobilni `ideje.tsx`, `ideja/[id].tsx`, `idea-node-sheet.tsx`,
`contribution-thread.tsx`, `zadatak/task-checkpoint-list.tsx`, `zadatak/[id].tsx`,
`stranica/[id].tsx`, `misli.tsx`, `misao/[id].tsx`, `thought-actions-sheet.tsx`,
`thought-edge-sheet.tsx`, `thought-node-sheet.tsx`, `thought-undo-bar.tsx`,
`lib/thought-undo.ts`, `lib/thought-layout.ts`, `canvas/[kind]/[id].tsx`,
`canvas-rail.tsx`, `razgovor/[id].tsx`, `conversation-header.tsx`, `chat.tsx`,
`odobrenja.tsx`, `lib/chat.ts`.

### 1.1 Merenje pariteta (grep metod iz PARITET.md, izmereno sada)

Web 160 · mobilni 142 · **razlika 31** (prompt kaže „oko 28" — merenje je merodavno).
Od 31, ova faza pokriva **19**; preostalih 12 nije u fazi (8× `areasV2` canvas
layout, `activity.listForStartup` — obrnut paritet, ZA-POPRAVKU §5.8 — i 3 već
upisana Z izuzetka: `resolveRoute`, `pageFiles.prune`, `myDeviceCount`).

Plan daje **14 novih native mesta poziva** i **5 novih Z redova** →
posle faze grep razlika = **17**, od čega je 8 dokumentovanih izuzetaka.
Stavki „ni urađeno ni zapisano" ostaje **9** — bolje od traženog „oko 12".
Svih 19 stavki faze biće ili urađeno ili u Z — nijedna otvorena.

### 1.2 Otkrića koja ISPRAVLJAJU tekst prompta/PARITET.md — pročitaj pre kucanja

1. **„ideas.updateLayout/resetLayoutSize/updatePositions/saveViewport idu kroz
   WebView — proveri da rade" je NETAČNO.** Provereno grep-om: embed
   (`apps/web/app/embed/**`) zove SAMO čitanja — `ideas.list`,
   `thoughts.listNodes/listEdges`, `areasV2.getAreaCanvasByArea/getPageCanvasByPage`,
   plus `pages.get`/`areasV2.updatePage` u note embedu. **Nijednu ideas mutaciju.**
   Embed kanvas je namerno read-only (memorija: „read-only via CSS kills";
   00-PLAN §5.2: mobilni kanvas je pregled, ne layout uređivanje). „Provera da
   rade kroz WebView" bi pala. Rešenje NIJE pisanje mutacija u embed (to bi bilo
   i „pisanje ponovo" i zabranjeno diranje weba) nego **A1 presedan za misli**:
   iste 4 funkcije (`moveNodes`≈`updatePositions`, `updateNodeLayout`≈`updateLayout`,
   `resetNodeLayoutSize`≈`resetLayoutSize`, `saveViewport`) su u A1 urađene
   NATIVE — „Sredi raspored" na listi + preseti „Veličina oblačića" u akcionom
   sheet-u. Ideje dobijaju identičan par (koraci 2.6 i 2.8). Preseti su na webu
   doslovno ISTI za misli i ideje (`workspace-item-dialog.tsx:23-30`,
   compact 264×196 / standard 360×280 / large 520×420 — već preslikani u
   `apps/mobile/src/lib/thought-layout.ts:13-18`).
2. **Strana koja ODOBRAVA ugnježdavanje ideja već postoji na mobilnom** —
   `odobrenja.tsx:136` zove `collaboration.resolveNesting`. Fali samo strana
   koja ŠALJE zahtev (`requestNesting`) i izvlačenje (`detachIdea`).
3. **`taskCheckpoints.archiveOwn` je već na mobilnom**
   (`zadatak/task-checkpoint-list.tsx:66`, poziv `:133`) — fali samo `restoreOwn`.
4. **Backend je PROJEKTOVAN za traku „Poništi":** sve tri archive mutacije
   vraćaju `undoUntil = now + 8000` (`ideas.ts:1121`, `taskCheckpoints.ts:381`,
   `collaboration.ts:778`). Server tvrdo sprovodi 8s prozor za checkpoint
   (`taskCheckpoints.ts:395-397`) i doprinos (`collaboration.ts:800-802`);
   za ideju ne sprovodi rok, ali odbija vraćanje ako je arhiviranje izdvojilo
   tuđe izmene u „Oporavljeno" (`ideas.ts` restoreOwn: „Ideja sa izdvojenim
   tuđim izmenama ne može se vratiti Undo akcijom."). Web zato undo nudi SAMO
   kad je `recoveredId === null` (`ideas-canvas-view.tsx:609-633`) — mobilni
   mora isto.
5. **Web „undo" je svuda isti oblik:** sonner toast 8s sa akcijom Undo
   (checkpoint: `task-checkpoint-list.tsx:686-698`, „Checkpoint je obrisan.";
   doprinos: `idea-discussion-dialog.tsx:311-323`, „Tekst je obrisan.";
   ideja: `ideas-canvas-view.tsx:617-633`, „Ideja je obrisana."). Mobilni
   ekvivalent već postoji za misli: `thought-undo-bar.tsx` + `lib/thought-undo.ts`
   (traka 8s + ✕, modul-store preživljava `router.back()`). Obrazac se
   GENERALIZUJE, ne izmišlja.
6. **`notifications.latest` je isključivo web infrastruktura:** jedini pozivalac
   je `useNotificationToasts` (`notifications-panel.tsx:413-463`, montiran u
   `workspace-shell.tsx:658`) — in-app toast za obaveštenje stiglo dok je app
   otvoren. Backend komentar to i kaže (`notifications.ts:125`: „služi samo
   detekciji novih obaveštenja za toast"). Mobilni tu ulogu već pokriva OS
   banerom (expo-notifications, kanali po tipu), tab bedžom (`unreadCount`) i
   punim ekranom `obavestenja.tsx` (`notifications.list`). → **Z, ne kod** (2.10).
7. **Checkpoint canvas funkcije (A8) su čist layout kanvasa:**
   `saveCanvasPlacement`/`resetCanvasSize` pomeraju/dimenzionišu oblačić na
   page kanvasu (`taskCheckpoints.ts:412-518`), `taskCheckpointCanvasEdges.connect/
   disconnect` crtaju vizuelne strelice u koordinatnom prostoru kanvasa
   (mogu spajati i checkpoint↔stranicu). STVARNA zavisnost koraka („čeka
   prethodni") je već native (`setChainedToPrevious`/`setAllChained`,
   `task-checkpoint-list.tsx:67-68`), a glasanje o brisanju tuđe canvas veze
   već radi (`odobrenja.tsx:48`, `task_checkpoint_edge: 'Veza checkpointa'`).
   → **Z, ne kod** (2.10) — „ne pravi neupotrebljivo".
8. **`odobrenja.tsx:43` već ima `idea_edge: 'Veza ideja'`** — glasanje o
   brisanju tuđe veze ideja ima gotov prikaz; koraku 2.5 treba samo
   `requestDeletion` poziv.
9. **Chat:** `razgovor/[id].tsx` već čita profil (`:59`,
   `profiles.getCurrent` → `profile.role === 'admin'` se već koristi na `:146`)
   i kanal sa `kind` poljem (`:62`, iz `listChannels`). `ConversationHeader`
   već ima ⋮ meni-sheet sa sekcijom „Obaveštenja" (`conversation-header.tsx:
   138-169`) — red „Arhiviraj razgovor" ide TU, ne u nov UI.
10. **Šta se NE gradi ponovo:** `Sheet`, `Row`, `IconButton`, `EmptyState`,
    skeletoni, `haptics`, `accessErrorMessage`, `useListRefresh`,
    `CandidateList` obrazac pickera (`thought-actions-sheet.tsx:406-484`),
    `tidyGridPosition` (`lib/thought-layout.ts:52-59`), preseti veličine
    (`lib/thought-layout.ts:13-38`) — sve postoji i ponovo se koristi.

### 1.3 Već urađeno — proveri i čekiraj bez koda

- **A6: `thoughts.restoreNodes`/`restoreEdges`** — već `[x]` u PARITET-u
  (A1, `thought-undo-bar.tsx:44-45`). Korak 2.1 ih SELI u generičku traku;
  posle migracije ažurirati dokazne putanje u PARITET A1/A6 redovima
  (novi fajl `components/undo-bar.tsx` + `lib/undo.ts`).

---

## 2. Izmene, u redosledu

### 2.1 Generička traka „Poništi" — temelj A6 (JEDAN obrazac)

**Fajlovi:** NOVI `apps/mobile/src/lib/undo.ts` i
`apps/mobile/src/components/undo-bar.tsx`; BRIŠU SE `lib/thought-undo.ts` i
`components/misli/thought-undo-bar.tsx`; ažuriraju se svi njihovi potrošači.

**Zašto.** A6 traži JEDAN ujednačen obrazac. Postojeći za misli je tačan
(modul-store + `useSyncExternalStore`, traka 8s + ✕, preživljava `router.back()`)
ali je tipski zaključan na misli. Generalizacija = isti kod, širi union.

**Izmena — `lib/undo.ts`:** kopija `thought-undo.ts` (isti store mehanizam,
isti doc-komentar duh) sa:

```ts
export type UndoAction =
  | { kind: 'thoughts'; nodeIds: Id<'thoughtNodes'>[]; edgeIds: Id<'thoughtEdges'>[] }
  | { kind: 'idea'; startupId: Id<'startups'>; ideaId: Id<'ideaNodes'> }
  | { kind: 'ideaEdge'; startupId: Id<'startups'>; nodeAId: Id<'ideaNodes'>; nodeBId: Id<'ideaNodes'> }
  | { kind: 'checkpoint'; checkpointId: Id<'taskCheckpoints'> }
  | { kind: 'contribution'; contributionId: Id<'contentContributions'> };
export type UndoEntry = { label: string; action: UndoAction; undoUntil?: number; key: number };
// pushUndo({ label, action, undoUntil? }) · clearUndo() · useUndo()
```

**Izmena — `components/undo-bar.tsx`:** kopija `thought-undo-bar.tsx`
(ISTI vizuel: absolute traka, `insets.bottom + 16 + bottomOffset`, label 2 reda,
„Poništi" + ✕, `busyRef`+`busy` dvostruka brava, `accessibilityLiveRegion`,
najava „Vraćeno.", reset na promenu startupa, greška = Alert + traka OSTAJE),
uz dve izmene:
1. Tajmer: `const ttl = entry.undoUntil ? Math.max(1_000, entry.undoUntil - Date.now()) : 8_000;`
   (server prozor je merodavan kad postoji; pod 1s ne skidamo da traka ne
   blesne-i-nestane).
2. `restore()` grana po `action.kind` sa 5 mutacija deklarisanih u traci:
   - `thoughts`: `thoughts.restoreNodes` PA `thoughts.restoreEdges` — redosled
     je ugovor backenda (komentar preneti iz `thought-undo-bar.tsx:35-37`);
   - `idea`: `ideas.restoreOwn({ startupId, ideaId })`;
   - `ideaEdge`: `ideas.connect({ startupId, nodeAId, nodeBId })` — `connect`
     na postojećem `pairKey` OŽIVLJAVA arhiviranu vezu i ČUVA joj label
     (`ideas.ts:727-737`), pa je ovo tačan inverz za `disconnect`;
   - `checkpoint`: `taskCheckpoints.restoreOwn({ checkpointId })`;
   - `contribution`: `collaboration.restoreOwnContribution({ contributionId })`.

**Migracija potrošača (tsc hvata svaki propust):**
- push mesta misli → `pushUndo({ label, action: { kind: 'thoughts', nodeIds, edgeIds } })`:
  `thought-actions-sheet.tsx:178`, `thought-node-sheet.tsx:122`,
  `thought-edge-sheet.tsx:93`.
- mount mesta: `misli.tsx:299` (`bottomOffset={72}` ostaje),
  `misao/[id].tsx:342`, `canvas/[kind]/[id].tsx:415` — na kanvasu mount
  IZVUĆI iz `isThoughts` grane u zajednički deo (pored `CanvasRail` mounta,
  `:355-360`), `bottomOffset={60}` ostaje: ideje arhivirane sa detalja moraju
  imati traku i kad se korisnik vrati na ideas kanvas.
- NOVI mountovi: `ideje.tsx`, `ideja/[id].tsx`, `zadatak/[id].tsx`,
  `stranica/[id].tsx` — `<UndoBar />` kao poslednje dete korenskog `View`
  (bez offseta; nijedan od ta 4 ekrana nema FAB).

**Prst na ekranu.** Nepromenjen za misli (regresija zabranjena). Za novo:
posle svakog arhiviranja iz 2.2–2.4 dole se pojavi ista traka „Poništi" na
8 sekundi, sa ✕.

**Šta može da pukne + fallback.**
- Propušten import posle brisanja starih fajlova → `tsc --noEmit` pada; ne
  ostavljati aliase, brisanje je namerno (jedan obrazac = jedan fajl).
- `ideas.restoreOwn` nema serverski rok → tap u 7.9s uvek prolazi; checkpoint/
  doprinos na granici mogu dobiti „Vreme za Undo je isteklo." (RTT) — Alert
  prikazuje serversku poruku, traka ostaje; to je isto ponašanje kao web.
- `restoreOwn` za checkpoint može pasti na `MAX_TASK_CHECKPOINTS` ako je neko
  u međuvremenu dopunio zadatak — serverska poruka u Alert, ništa ne radimo.
- Traka preko tastature: isti odnos kao postojeća (misao/misli je već montiraju
  uz kompozere) — ne uvoditi nov KeyboardAvoiding sloj.

**Dokaz.** Emulator: arhiviraj misao sa liste → traka radi kao pre (regresija);
`grep -rn "thought-undo" apps/mobile/src` = 0 pogodaka. Ostali dokazi u 2.2–2.4.

---

### 2.2 A6: undo za checkpoint (`taskCheckpoints.restoreOwn`)

**Fajl:** `apps/mobile/src/components/zadatak/task-checkpoint-list.tsx`

**Izmena.** U `remove()` (`:116-141`), grana `archiveOwn`: uhvati rezultat i
posle uspeha (uz postojeći `haptics.success()`):

```ts
const result = await archiveOwn({ checkpointId: item._id });
pushUndo({
  label: 'Checkpoint je obrisan.',
  action: { kind: 'checkpoint', checkpointId: result.checkpointId },
  undoUntil: result.undoUntil,
});
```

(Tekst = web toast, `task-checkpoint-list.tsx:688` na webu.) Grana
`requestDeletion` se NE dira (zahtev se povlači u Odobrenjima, nije undo slučaj).

**Prst na ekranu.** Detalj zadatka → korpica na svom checkpointu → potvrda →
red nestane → traka „Poništi" dole 8s → tap → red se vrati sa istim stanjem
završenosti (server samo skida `archivedAt`).

**Šta može da pukne.** Vraćeni checkpoint se vraća na SVOJ ordinal (server ne
menja `position`) — lista je reaktivna, nema klijentske pretpostavke. Undo
posle 8s nemoguć (traka se sama skloni pre isteka serverskog roka).

**Dokaz.** Emulator + Convex dashboard: `taskCheckpoints` red dobije
`archivedAt`, pa posle „Poništi" opet `null`. Projekcija na kartici zadatka
(brojač koraka) se vrati na staro na OBA klijenta.

---

### 2.3 A6: undo za doprinos (`collaboration.restoreOwnContribution`)

**Fajl:** `apps/mobile/src/components/ideja/contribution-thread.tsx`

**Izmena.** U `remove()` (`:116-151`), grana `deleteOwn` (`:136`): uhvati
rezultat i posle uspeha:

```ts
const result = await deleteOwn({ contributionId });
pushUndo({
  label: 'Tekst je obrisan.',
  action: { kind: 'contribution', contributionId: result.contributionId },
  undoUntil: result.undoUntil,
});
```

(Tekst = web, `idea-discussion-dialog.tsx:313`.) Pošto je `ContributionThread`
deljen, ovo istim potezom pokriva diskusiju ideje (`ideja/[id].tsx:248`) i
„Doprinose" na stranici i zadatku (`page-contributions-section.tsx` →
`stranica/[id].tsx:144`, `zadatak/[id].tsx:293`) — traka je montirana na sva
tri ekrana u 2.1.

**Prst na ekranu.** Obriši svoj tekst u bilo kojoj niti → traka → „Poništi" →
tekst se vrati na isto mesto (redosled po `createdAt`, server ga ne menja).

**Šta može da pukne.** Ništa novo — ista mutacija koju web zove; `busyId`
brava u niti već postoji, a traka ima svoju.

**Dokaz.** Emulator: sva TRI mesta (ideja, beleška, zadatak) — obriši → vrati;
drugi profil vidi nestanak i povratak realtime. Dashboard:
`contentContributions.archivedAt` ide na broj pa nazad na `null`.

---

### 2.4 A6+A4: undo za ideju (`ideas.restoreOwn`)

**Fajl:** `apps/mobile/src/app/(app)/ideja/[id].tsx` (logika prelazi u novi
sheet u 2.5 — svejedno gde stoji, pravilo je isto)

**Izmena.** U direktnoj grani brisanja (`confirmDelete`, `:139-147`): uhvati
rezultat `ideas.archive` i:

```ts
const result = await archiveIdea({ startupId, ideaId });
if (result.recoveredId !== null) {
  Alert.alert('Obrisano', 'Ideja je obrisana, a tuđe izmene su sačuvane u „Oporavljeno".');
} else {
  pushUndo({
    label: 'Ideja je obrisana.',
    action: { kind: 'idea', startupId, ideaId: result.ideaId },
    undoUntil: result.undoUntil,
  });
}
router.back();
```

**Uslov `recoveredId === null` je obavezan** — web radi identično
(`ideas-canvas-view.tsx:609-618`): server ODBIJA undo kad postoji
„Oporavljeno", pa bi traka bez uslova nudila dugme koje garantovano pada.
`pushUndo` ide PRE `router.back()` — traka preživi navigaciju (modul-store)
i pojavi se na listi/kanvasu ispod.

**Prst na ekranu.** Detalj ideje → „Obriši ideju" → potvrda → nazad na listu
(ili kanvas, odakle god si došao) → traka „Poništi" → ideja se vrati u listu,
na kanvas i u pretragu, sa svim svojim glasovima i doprinosima (server vraća
i autorove doprinose, `ideas.ts` restoreOwn).

**Šta može da pukne.** Ako je došao dubokim linkom pa `router.back()` nema
istoriju — postojeće ponašanje ekrana, ne diramo; traka će se pojaviti na
sledećem ekranu koji je montira.

**Dokaz.** Emulator: (a) svoja ideja bez tuđih doprinosa → obriši → traka →
vrati → vidljiva na listi + kanvasu (WebView, `ideas.list` je reaktivan);
(b) drugi profil doda doprinos na moju ideju → obrišem je → NEMA trake, Alert
o „Oporavljeno"; dashboard: `recoveredContent` red postoji, doprinos
prekačen na `targetKind: "recovered"`.

---

### 2.5 A4: akcioni sheet ideje + veze (connect / disconnect / updateEdgeLabel / requestNesting / detachIdea)

**Fajlovi:** NOVI `apps/mobile/src/components/ideja/idea-actions-sheet.tsx`,
NOVI `apps/mobile/src/components/ideja/idea-edge-sheet.tsx`,
NOVI `apps/mobile/src/components/ideja/idea-edges-section.tsx`;
izmene: `ideja/[id].tsx`, `ideje.tsx`.

**Zašto ovako.** Uzor je `thought-actions-sheet.tsx` — JEDAN `Sheet` sa
`view` stanjem (`'menu' | 'connect' | 'nest' | 'size'`), bez ugnježdenih
modala (obrazloženje `:46-54` tamo). Web gestove (drag handle→handle za vezu,
drop-na-karticu za gnježdenje: `ideas-canvas-view.tsx:927`, `:950-1012`)
telefon prevodi u pickere — ista tabela prevoda kao A1.

**`idea-actions-sheet.tsx`** — propovi: `open`, `idea` (node iz `ideas.list`),
`nodes`, `edges`, `currentProfileId`, `startupId`, `onClose`,
`onEdit?: () => void` (red vidljiv samo kad postoji), `onConvert: () => void`,
`onArchived?: () => void`. Redovi menija, redom:
- **„Izmeni ideju"** (`idea.canEdit && onEdit`) → `onEdit()` — postojeći edit
  sheet ostaje u `ideja/[id].tsx:280-331`, ne seli se.
- **„Poveži sa idejom…"** → `view: 'connect'`. Picker po uzoru na
  `CandidateList` (bez pretrage, „prigušeno + subtitle" za nevažeće):
  kandidati = svi `nodes` osim same ideje; već povezani (po `edges` pairKey
  raščlanjeno na `nodeAId/nodeBId`) prigušeni sa subtitle „Već povezana";
  ako ideja NIJE moja, tuđe kartice prigušene sa subtitle „Veza traži tvoju
  karticu" (server: bar jedna strana mora biti moja, `ideas.ts:711-716`).
  Tap → `ideas.connect({ startupId, nodeAId: idea._id, nodeBId })` →
  haptika + Alert „Ideje su povezane." (tekst = web toast `:433`; Alert jer
  lista ne prikazuje veze) → `close()`.
- **„Ugnjezdi u…"** (`idea.canEdit` — server: samo svoju karticu,
  `collaboration.ts:1158-1160`) → `view: 'nest'`. Kandidati = svi osim sebe
  (cikluse hvata server, isto kao web dijalog `ideas-view.tsx:965-971`);
  trenutni roditelj prigušen („Trenutna grupa"). Tap →
  `collaboration.requestNesting({ startupId, childIdeaId: idea._id, parentIdeaId })`;
  po `result.status`: `'approved'` → Alert „Ugnježdeno", „Ideja je ugnježdena.";
  `'pending'` → Alert „Čeka odobrenje", „Predlog ugnježdenja je odmah vidljiv
  timu — vlasnik kartice ga odobrava u Odobrenjima." (tekstovi = web toastovi
  `ideas-view.tsx:993-997`).
- **„Izdvoji iz grupe"** (`idea.canDetach` — server pravila u
  `collaboration.ts:1311-1399`: pokriva i povlačenje/odbijanje predloga) →
  `collaboration.detachIdea({ startupId, ideaId })` → Alert „Ideja je
  izvučena iz grupe." Bez potvrde — povratno (nest ponovo), kao web.
- **„Veličina oblačića"** (`idea.canResize`) → `view: 'size'` — vidi 2.6.
- **„Pretvori u stranicu"** (`idea.isApproved && !idea.convertedPageId` —
  ista vidljivost kao web `ideas-view.tsx:666`) → `onConvert()` — vidi 2.7.
- **„Obriši ideju" / „Zatraži brisanje"** — postojeća logika `confirmDelete`
  se SELI iz ekrana u sheet (obrazac `page-actions-sheet.archiveOrRequest` iz
  Faze 4), sa undo push-om iz 2.4; `onArchived` na detalju radi
  `router.back()`, na listi ništa.
`busyId` brava + `disabled` + `ActivityIndicator` u `value` slotu — prepisati
`runAction` obrazac iz `thought-actions-sheet.tsx:133-148`.

**`idea-edges-section.tsx`** — sekcija „Veze" na detalju ideje, montira se u
`ideja/[id].tsx` između kartice i „Diskusija" (`:242`). Podaci su VEĆ u
pretplati ekrana (`data.edges`): filtriraj ivice koje dodiruju ovu ideju,
red = naslov druge strane + label veze kao subtitle (kroz `Row`), prazno
stanje se NE prikazuje (nema sekcije bez veza — kao misao detalj). Tap →
`idea-edge-sheet`.

**`idea-edge-sheet.tsx`** — uzor `thought-edge-sheet.tsx`: naslov „Veza",
`Input` za naziv (vidljiv samo `edge.canEdit`; placeholder „Opciono objasni
kako su dve ideje povezane."), „Sačuvaj" → `ideas.updateEdgeLabel({ startupId,
edgeId, label })` (prazan string = uklanjanje naziva, server `cleanOptionalText`);
red **„Prekini vezu"**: `edge.canDeleteDirectly` → `ideas.disconnect({ startupId,
edgeId })` + `pushUndo({ label: 'Veza je uklonjena.', action: { kind: 'ideaEdge',
startupId, nodeAId: edge.nodeAId, nodeBId: edge.nodeBId } })` (bez `undoUntil` —
server ne meri rok za vezu); inače „Zatraži brisanje" →
`collaboration.requestDeletion({ target: { kind: 'idea_edge', id: edge._id } })`
+ Alert „Poslato", „Glasanje o brisanju veze je pokrenuto." — prikaz glasanja
već postoji (`odobrenja.tsx:43`, `idea_edge: 'Veza ideja'`).

**Ožičenje:**
- `ideja/[id].tsx`: „…" dugme u zaglavlju POSTAJE bezuslovno (`:204` gejt se
  briše — „Poveži" ima svaki član) i otvara `IdeaActionsSheet`; postojeći
  inline meni-sheet (`:252-278`) se briše; `confirmDelete` (`:125-157`) se
  briše (seli u sheet). Edit sheet i `saveEdit` ostaju.
- `ideje.tsx`: long-press na `IdeaRow` (`Pressable`, `:168`) otvara isti sheet
  (obrazac liste misli, `misli.tsx:238-241`); `accessibilityActions` za
  long-press po uzoru na postojeće liste. Mount sheet-a + convert sheet-a iz
  2.7 na oba ekrana.

**Prst na ekranu.** Umesto web gesta „prevuci ručicu od kartice do kartice":
detalj ili long-press na listi → „Poveži sa idejom…" → tap na cilj. Umesto
„spusti karticu na karticu": „Ugnjezdi u…" → tap na roditelja → tuđi vlasnik
odobri u Odobrenjima (taj ekran već radi). Veza se imenuje/prekida iz sekcije
„Veze" na detalju.

**Šta može da pukne + fallback.**
- `connect` na već povezan par vrati postojeći `_id` bez greške (server
  no-op) — prigušivanje u pickeru to čini nedostižnim, ali i da promakne,
  ništa se ne kvari.
- Ciklus pri gnježdenju → serverska poruka u Alert (ne filtriramo cikluse
  klijentski — ni web ne radi).
- `disconnect` tuđe veze je serverski TIH no-op (`ideas.ts:759-772` nema
  throw) — zato red „Prekini vezu" POSTOJI samo za `canDeleteDirectly`;
  tuđa veza ide isključivo kroz `requestDeletion` granu. Ne oslanjati se na
  server da javi grešku.
- Veza se na listi/detalju vidi tek posle sledećeg `ideas.list` push-a —
  reaktivno, bez ručnog refresh-a; ako se u testu ne pojavi, proveriti da je
  `edges` prop stvarno iz iste pretplate.

**Dokaz.** Emulator, dva profila: (1) poveži svoju sa tuđom idejom → red u
„Veze" + ivica na kanvasu (WebView) + `ideaEdges` red u dashboardu;
(2) imenuj vezu → label na kanvasu se promeni uživo; (3) prekini svoju vezu →
traka „Poništi" → veza se vrati SA istim label-om (dashboard: isti `_id`,
`archivedAt` opet `null`); (4) tuđa veza → „Zatraži brisanje" → kartica
„Veza ideja" u Odobrenjima drugog profila; (5) ugnjezdi svoju ideju u tuđu →
pending + kartica u Odobrenjima vlasnika → odobri → kanvas prikaže ugnježdeno;
u SVOJU → odmah ugnježdeno; (6) „Izdvoji" → kartica opet top-level.

---

### 2.6 A4: veličina kartice (`ideas.updateLayout` / `resetLayoutSize`)

**Fajl:** `idea-actions-sheet.tsx` (view `'size'` iz 2.5)

**Izmena.** Prepisati `size` view iz `thought-actions-sheet.tsx:339-398`:
tri reda iz `THOUGHT_SIZE_PRESETS` + „Automatska". Uvoz preseta i detekcije
IZ `lib/thought-layout.ts` (`:13-38`) uz komentar da su vrednosti web-ov
deljeni `ITEM_SIZE_DIMENSIONS` (isti za misli i ideje) — NE praviti dupli
modul. Tap na preset → `ideas.updateLayout({ startupId, ideaId, x: idea.x,
y: idea.y, width, height })` (server traži i x/y — šalju se postojeći sa
node-a, isto kao web `ideas-view.tsx:284-290`); „Automatska" →
`ideas.resetLayoutSize({ startupId, ideaId })`. Aktivni preset: prag kao web
(`width >= 480 → large, >= 330 → standard`) — to već radi
`activeThoughtSizePreset`.

**Prst na ekranu.** Umesto drag-resize ručice na webu: sheet → „Veličina
oblačića" → Kompaktan/Standard/Velik/Automatska. Promena se vidi na kanvasu
(reaktivno kroz `ideas.list` koju embed čita).

**Šta može da pukne.** Ideja sa NEREŠENIM predlogom gnježdenja ima
projektovan (relativan) `x/y` u `ideas.list` — `updateLayout` bi ga upisao
kao apsolutni. **Identično ponašanje ima web** (ista projekcija, isti poziv)
— preslikavamo web, ne „popravljamo" bez backend izmene; slučaj je redak
(svoja kartica sa pending predlogom ka tuđoj + promena veličine u tom
prozoru). Zabeležiti u ZA-POPRAVKU ako se u testu stvarno vidi skok.

**Dokaz.** Emulator: postavi „Velik" → kartica na kanvasu naraste; dashboard
`ideaNodes.width/height = 520/420`; „Automatska" → polja obrisana
(`undefined`), kartica na difolt veličini. Tuđa ideja: red se ne prikazuje
(`canResize` false).

---

### 2.7 A4: konverzija ideje (`ideas.convertToPage`)

**Fajlovi:** NOV `apps/mobile/src/components/ideja/idea-convert-sheet.tsx`;
izmene `ideja/[id].tsx` (mount + red stanja), `ideje.tsx` (mount).

**Zašto ovako.** Web dijalog (`ideas-view.tsx:862-941`) traži SAMO vrstu
(task/note) i oblast — bez naslova/statusa/izvršioca (opciona polja mutacije
web ne šalje). Mobilni sheet je zato mali; uzor toka je
`thought-conversion-sheet.tsx` (sheet JE potvrda, busy lock, Alert na guard).

**`idea-convert-sheet.tsx`** — propovi `{ open, idea, startupId, onClose }`:
- pregled ideje (naslov/tekst, kao „Odobrena Ideja" blok na webu);
- izbor vrste: dva reda/čipa „Zadatak" / „Beleška" (podrazumevano zadatak,
  kao web `targetKind` default);
- izbor oblasti: čipovi po uzoru na `quick-add-sheet.tsx` (`areas` iz
  `useQuery(api.startups.get, { startupId })` unutar sheet-a — isti izvor kao
  `danas.tsx:85`; podrazumevano prva oblast);
- CTA „Pretvori" → `ideas.convertToPage({ startupId, ideaId, areaId, kind })`
  → haptika + `onClose()` + **direktna navigacija** na rezultat (kao web
  `onOpenPage`): `kind === 'task'` → `/zadatak/[id]`, inače `/stranica/[id]`.

**Stanje posle konverzije na detalju** (`ideja/[id].tsx`): kad
`idea.convertedPageId !== null`, u kartici ideje red „Pretvorena u stranicu →"
(`Row`, tap vodi na stranicu/zadatak — `pages.get` na cilju sam kaže vrstu;
jednostavnije: `router.push('/stranica/[id]')`, koja `task` već preusmerava
na `/zadatak/[id]` — provereno u `stranica/[id].tsx` doc-komentaru `:32`).
Red „Pretvori u stranicu" u sheet-u tada NESTAJE — **obavezno**, jer server
NE čuva od dvostruke konverzije (nema `convertedPageId` provere u
`convertToPage` — dupli tap bi napravio dve stranice; vidljivost po
`!convertedPageId` + `busyId` brava to sprečavaju, isto kao web).

**Prst na ekranu.** Ideja skupi glasove („za" > „protiv") → detalj → „…" →
„Pretvori u stranicu" → vrsta + oblast → „Pretvori" → otvara se nova
stranica/zadatak. Ideja ostaje u listi, obeležena kao pretvorena, sa linkom.

**Šta može da pukne + fallback.**
- Ideja nije odobrena → red je sakriven (kao web); ako server ipak odbije
  (glasovi se promenili između render-a i tapa) — serverska poruka („Ideja
  mora imati više odobrenja…") u Alert.
- Konverzija u punu oblast → serverska poruka o limitu kartica kanvasa u
  Alert; ništa ne pišemo.
- Navigacija posle konverzije na stranicu koja „još nije stigla" u pretplate —
  `stranica/[id]`/`zadatak/[id]` imaju skeleton + ErrorBoundary; `pages.get`
  je direktan upit pa nema trke.

**Dokaz.** Emulator: glasaj „za" svojom idejom sa dva profila → pretvori u
ZADATAK u oblast „Dev" → aterira na detalj zadatka; dashboard: nov `pages`
red (kind task), `pageEntries` red sa autorom IDEJE (ne konvertera — server
tako piše, `ideas.ts:973-991`), `ideaNodes.convertedPageId` postavljen;
detalj ideje sada ima red „Pretvorena u stranicu", a sheet više nema
„Pretvori". Ponovi za BELEŠKU. Web vidi istu stranicu na kanvasu oblasti.

---

### 2.8 A4: „Sredi raspored" na listi ideja (`ideas.updatePositions` + `saveViewport`)

**Fajl:** `apps/mobile/src/app/(app)/ideje.tsx`

**Izmena.** Preslikati misli obrazac 1:1 (`misli.tsx:118-169`, dugme
`:185-196`): `Wand2` `IconButton` u zaglavlju pored postojećeg canvas dugmeta,
vidljiv kad `nodes.length > 1`; potvrda `Alert('Srediti raspored?', …)`;
ciljevi = SAMO top-level (`node.parentIdeaId === undefined` — projektovani
roditelj, pa su i kartice sa vidljivim predlogom gnježdenja isključene, čime
se izbegava i grana `updatePositions` koja bi umesto kartice pomerala
PREDLOG, `ideas.ts:506-515`), sečeno na 50 (`MAX_BULK`, kao misli);
pozicije iz `tidyGridPosition` (`lib/thought-layout.ts:52-59` — ista mreža,
kartice su iste veličine); poziv:

```ts
await updatePositions({ startupId, updates: targets.map((n, i) => ({ id: n._id, ...tidyGridPosition(i, targets.length) })) });
await saveViewport({ startupId, x: 0, y: 0, zoom: ideas.canvasState.zoom });
```

`canvasState` je VEĆ u pretplati ekrana (`ideas.list` ga vraća,
`ideas.ts:276-283` + `?? {x:0,y:0,zoom:1}`) — za razliku od misli NE treba
poseban `getCanvas` upit. `tidyBusy` brava + spinner na dugmetu, uspeh/greška
Alert — sve kao misli.

**Prst na ekranu.** Umesto ručnog prevlačenja karata po kanvasu (desktop
posao): jedan tap sredi top-level kartice u mrežu u pozitivnom kvadrantu;
sledeće otvaranje kanvasa počinje od sređenog prizora sa sačuvanim zumom.

**Šta može da pukne.** Već otvoren WebView kanvas ne „skače" (viewport se
čita pri bootstrap-u — isto svesno ponašanje kao misli, ZA-POPRAVKU §5.5).
Preko 50 top-level ideja → sređuje se prvih 50 uz Alert napomenu (tekst kao
misli `truncated` varijanta).

**Dokaz.** Emulator: razbacaj 3+ ideja na kanvasu (web ili WebView), vrati se
na listu → „Sredi raspored" → potvrda → otvori kanvas: mreža 320×260 od
(80,80), zum nepromenjen; dashboard: `ideaNodes.x/y` pozitivni,
`ideaCanvases` red za moj profil ažuriran.

---

### 2.9 A7: arhiviranje kanala (`chat.archiveChannel`)

**Fajlovi:** `apps/mobile/src/components/chat/conversation-header.tsx`,
`apps/mobile/src/app/(app)/razgovor/[id].tsx`

**Zašto ovde.** Header VEĆ drži ⋮ meni-sheet kanala sa mutacijom
(`setNotificationLevel`, `:81`, sheet `:150-169`) — arhiviranje je još jedan
red istog menija, tačno gde ga web drži (`conversation-pane.tsx:179-181`).

**Izmena — `conversation-header.tsx`:** novi propovi `canArchive: boolean` i
`onArchived: () => void` (oba OBAVEZNA — `tsc` tera pozivaoce da odluče).
Ispod sekcije „Obaveštenja", kad `canArchive`: separator + `Row`
„Arhiviraj razgovor" (ikona `Archive`, destruktivna boja teksta kao
„Obriši" redovi drugde) → `haptics.warning()` + `Alert.alert('Arhivirati
razgovor?', `„${channelDisplayName(channel)}" se sklanja sa liste za ceo
tim.`, [Otkaži, Arhiviraj (destructive)])` → `chat.archiveChannel({
channelId: channel._id })` → `haptics.success()` + zatvori sheet +
`onArchived()`. `busy` brava na redu. (Potvrda = web `window.confirm`
`conversation-pane.tsx:97`; ishod = web `onOpenList()` `:101`.)

**Izmena — `razgovor/[id].tsx`:** na mount headera (`:128-133`) dodati
`canArchive={profile.role === 'admin' && channel.kind !== 'startup'}`
(klijentski ogleda serverski gejt `chat.ts:1583-1591`; oba podatka ekran
VEĆ ima — `:59`, `:62`) i `onArchived={() => router.back()}`.

**Prst na ekranu.** Admin u kanalu → ⋮ → „Arhiviraj razgovor" → potvrda sa
imenom kanala → vraćen na listu, kanal nestao (za ceo tim — `listChannels`
filtrira arhivirane). Ne-admin i „Opšte": reda nema.

**Šta može da pukne + fallback.**
- Ne-admin dobije red zbog zastarelog `profile` — nemoguće (query je
  reaktivan), a i da se desi, server vraća „Potreban je administratorski
  pristup." u Alert kroz postojeći catch obrazac.
- Korisnik koji je U razgovoru kad ga admin arhivira: `channel` iz
  `listChannels` postane `null` → ekran već ima granu „razgovor ne postoji"
  (`:106-117`) — proveriti na ekranu, ne menjati unapred.

**Dokaz.** Emulator (admin nalog): arhiviraj custom kanal → lista bez njega
na mobilnom I na webu; dashboard: `chatChannels.archivedAt` postavljen.
Ne-admin nalog: ⋮ meni ima samo „Obaveštenja". Kanal „Opšte" (kind
`startup`): nema reda ni za admina. DM: admin IMA red (server dozvoljava —
isto kao web `canArchive` uslov).

---

### 2.10 Z redovi — `notifications.latest` + ceo A8 (bez koda)

Obrazloženja u 1.2 (tačke 6 i 7). Radnja: dodati redove u PARITET.md sekciju
Z (tačan tekst u delu 4), čekirati A7 drugu stavku i sve A8 stavke sa
referencom na Z.

---

### 2.11 PARITET.md — čekiranje (isti commit kao kod)

Uz svaki `[x]` fajl:linija dokaz (tačne linije upisuje izvršilac posle
implementacije):

- **A4:** `convertToPage` → `idea-convert-sheet.tsx` (mutacija + poziv);
  `requestNesting`+`detachIdea` → `idea-actions-sheet.tsx`; `connect` →
  `idea-actions-sheet.tsx` (picker), `disconnect`+`updateEdgeLabel` →
  `idea-edge-sheet.tsx`; `restoreOwn` → `undo-bar.tsx` + push u
  `idea-actions-sheet.tsx`; `updateLayout`/`resetLayoutSize` →
  `idea-actions-sheet.tsx` (size view); `updatePositions`/`saveViewport` →
  `ideje.tsx`. Uz poslednju stavku dopisati napomenu: „NE kroz WebView —
  embed je read-only (zove samo ideas.list); urađeno native po A1 presedanu,
  vidi plan faze 5 §1.2."
- **A6:** tri stavke + „Ujednačen obrazac" red → `lib/undo.ts` +
  `components/undo-bar.tsx` + push mesta (2.2/2.3/2.4); u A1/A6 redovima za
  misli ažurirati stare putanje (`thought-undo-bar.tsx` → `undo-bar.tsx`).
- **A7:** `archiveChannel` → `conversation-header.tsx`; `notifications.latest`
  → `[x]` sa „IZUZETAK, vidi Z".
- **A8:** sve tri stavke → `[x]` sa „IZUZETAK, vidi Z".

---

## 3. Fajlovi koji se diraju (pregled)

| Fajl | Vrsta izmene |
|---|---|
| `apps/mobile/src/lib/undo.ts` | NOV (2.1) |
| `apps/mobile/src/components/undo-bar.tsx` | NOV (2.1) |
| `apps/mobile/src/lib/thought-undo.ts` | BRIŠE SE (2.1) |
| `apps/mobile/src/components/misli/thought-undo-bar.tsx` | BRIŠE SE (2.1) |
| `apps/mobile/src/components/misli/thought-actions-sheet.tsx` | izmena importa/push (2.1) |
| `apps/mobile/src/components/canvas/thought-node-sheet.tsx` | izmena importa/push (2.1) |
| `apps/mobile/src/components/misli/thought-edge-sheet.tsx` | izmena importa/push (2.1) |
| `apps/mobile/src/app/(app)/misli.tsx` | izmena mounta (2.1) |
| `apps/mobile/src/app/(app)/misao/[id].tsx` | izmena mounta (2.1) |
| `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` | mount van isThoughts grane (2.1) |
| `apps/mobile/src/components/zadatak/task-checkpoint-list.tsx` | push undo (2.2) |
| `apps/mobile/src/components/ideja/contribution-thread.tsx` | push undo (2.3) |
| `apps/mobile/src/app/(app)/zadatak/[id].tsx` | mount trake (2.1) |
| `apps/mobile/src/app/(app)/stranica/[id].tsx` | mount trake (2.1) |
| `apps/mobile/src/components/ideja/idea-actions-sheet.tsx` | NOV (2.5/2.6) |
| `apps/mobile/src/components/ideja/idea-edge-sheet.tsx` | NOV (2.5) |
| `apps/mobile/src/components/ideja/idea-edges-section.tsx` | NOV (2.5) |
| `apps/mobile/src/components/ideja/idea-convert-sheet.tsx` | NOV (2.7) |
| `apps/mobile/src/app/(app)/ideja/[id].tsx` | sheet umesto inline menija, sekcija Veze, undo, converted red (2.4/2.5/2.7) |
| `apps/mobile/src/app/(app)/ideje.tsx` | long-press, Sredi raspored, mountovi (2.5/2.8) |
| `apps/mobile/src/components/chat/conversation-header.tsx` | red Arhiviraj (2.9) |
| `apps/mobile/src/app/(app)/razgovor/[id].tsx` | novi propovi (2.9) |
| `docs/mobile/PARITET.md` | čekiranje + 5 Z redova (2.10/2.11) |

`packages/backend/convex/**` — nula izmena. `apps/web/**` — nula izmena.
`apps/mobile/package.json` — nula izmena.

---

## 4. Šta NEĆU raditi (ide u PARITET.md sekciju Z, doslovno)

```
| `notifications.latest` | Postoji isključivo kao izvor za web in-app toast (`useNotificationToasts`, notifications-panel.tsx — jedini pozivalac u celom webu; backend komentar: „služi samo detekciji novih obaveštenja za toast"). Na telefonu tu ulogu već igraju OS push baner (expo-notifications, kanal/zvuk po tipu), bedž na tabu (unreadCount) i pun ekran „Obaveštenja" (notifications.list). Drugi, in-app toast sloj bi dupliralo OS baner. |
| `taskCheckpoints.saveCanvasPlacement` | Prevlačenje/dimenzionisanje checkpoint oblačića na page kanvasu — čisto uređivanje layouta kanvasa. Mobilni kanvas je pregled (00-PLAN §5.2), embed je read-only; native unos koordinata bez direktne manipulacije = neupotrebljivo. Semantika checkpointa (tekst, završenost, lančanje, brisanje, doprinosi, glasanja) je već native na detalju zadatka. Ista kategorija kao areasV2.movePages/resizePage, koji takođe (svesno) nisu na telefonu. |
| `taskCheckpoints.resetCanvasSize` | Isto — reset dimenzija oblačića na kanvasu; veličina se na telefonu ni ne postavlja. |
| `taskCheckpointCanvasEdges.connect` | Vizuelne strelice toka na page kanvasu (spajaju i checkpoint↔stranicu), imaju smisao samo u koordinatnom prostoru kanvasa. Stvarna zavisnost koraka je native kroz `setChainedToPrevious`/`setAllChained` (task-checkpoint-list.tsx). Crtanje dijagrama je posao za veliki ekran. |
| `taskCheckpointCanvasEdges.disconnect` | Isto; uz to glasanje o brisanju tuđe canvas veze već radi na mobilnom (odobrenja.tsx, `task_checkpoint_edge`), pa tim tokovima ništa ne fali. |
```

Svesne granice VAN Z tabele (nisu PARITET stavke):

- **Undo se NE dodaje za `connect`/`requestNesting`/`updateEdgeLabel`/
  `updateLayout`** — web ih ima u Ctrl+Z stacku (`workspace-history`), ali A6
  pokriva vraćanje ARHIVIRANOG; ove radnje imaju direktan inverz dostupan iz
  istog UI (disconnect / izdvoji / preimenuj / druga veličina). Pun undo/redo
  stack na telefonu je zaseban posao.
- **`ideas.connect` se ne izlaže sa kanvas multi-selekcije** („Poveži (2)" na
  rail-u) — picker u sheet-u pokriva ishod; širenje rail protokola je van
  minimuma i dodaje površinu za greške u mostu.
- **Checkpoint nit doprinosa (`{kind:'task_checkpoint'}`) se ne montira** —
  postojeće stanje (union član postoji, mount ne); nije stavka ove faze i
  traži odluku o mestu na već gustom detalju zadatka (kao ZA-POPRAVKU §5.7).
- **`pendingDeletionRequest` bedž na detalju ideje** (ideja pod glasanjem) se
  ne dodaje — nije stavka faze; postojeće ponašanje.
- **Kanvas za ideje ne dobija `onOpenDetail`** prečicu (sheet → pun ekran već
  ide kroz „Diskusija" red) — postojeće ponašanje, van faze.

---

## 5. Redosled provere (posle svake stavke, ne samo na kraju)

1. `cd apps/mobile && npx tsc --noEmit` — nula grešaka posle SVAKE stavke
   (`expo lint` je pokvaren u ovom projektu — memorija; typed-routes regen
   NIJE potreban jer nema novih ruta).
2. Emulator: konkretan dokaz naveden u svakoj stavci 2.1–2.9; za 2.1 obavezno
   i REGRESIJA misli (arhiviraj misao → traka radi kao pre).
3. Convex dashboard uz svaki dokaz koji to traži (2.2 `taskCheckpoints`,
   2.3 `contentContributions`, 2.4 `recoveredContent`, 2.5 `ideaEdges`,
   2.6 `ideaNodes.width/height`, 2.7 `pages`+`pageEntries`+`convertedPageId`,
   2.8 `ideaNodes.x/y`+`ideaCanvases`, 2.9 `chatChannels.archivedAt`).
4. Metro konzola tokom prolaska: nula crvenih grešaka, nula upozorenja koja
   se ponavljaju; Convex dashboard logovi: nijedan `Server Error`.
5. Posle koda: `rn-review` agent na izmenjenim ekranima (ideja/ideje/zadatak/
   stranica/razgovor) i `parity-check` agent za A4/A6/A7/A8 — konvencija
   lanca iz Faze 4.
6. Na kraju: PARITET.md čekiranje po 2.11 u ISTOM commitu sa kodom; ponovo
   izmeriti grep razliku (očekivano 17) i upisati u IZVESTAJ.md ako skripta
   traži.
