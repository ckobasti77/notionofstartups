# Faza K6 — Zatvaranje: paritet, nula grešaka, dokumentacija

**Cilj:** razlika pariteta je 7 i svih 7 su obrazloženi izuzeci; `tsc`, `lint` i testovi čisti.

---

## 1. Šta je pročitano i šta je zatečeno

Pročitano: `PARITET.md` (855 linija), `ZA-POPRAVKU.md` (§6, §8, Z1–Z7), `00-PLAN.md` §5.2,
`lanac4/OSNOVA.md`, `lanac4/REZIM.md`, `lanac4/IZVESTAJ.md`, `lanac4/planovi/faza-k4.md`
(Izmene 11–13, §6 T14/T17), `lanac4/planovi/faza-k5.md` (revizija, §6 spisak dugova).

### Već urađeno — IZBAČENO iz plana

| Stavka iz prompta | Izmereno sada | Zaključak |
|---|---|---|
| Razlika pariteta = 7 | komanda `PARITET.md:15–19`: web 161, mobilni 169, **razlika 7** | ✅ ništa se ne dovršava |
| Broj nije pao brisanjem sa weba | web api skup `019239d` → `HEAD`: **160 → 161**, `comm -23 stari novi` **prazan** (jedini prirast `api.adminAuth.adminSetPassword`) | ✅ nije prevara |
| `apps/mobile npx tsc --noEmit` | exit 0 | ✅ |
| `apps/web npx tsc --noEmit` | exit 0 | ✅ |
| `npm test` | 38 fajlova, **327 testova**, exit 0 | ✅ |
| `npm run lint` | exit 0, **0 grešaka, 2 upozorenja** (`areasV2.ts:9`, `chat.ts:1037`) | ⚠️ jedini kod koji se čisti |
| Desktop kanvas — jednosmerni uvoz | ništa van `app/embed/` ne uvozi `canvas-embed`/`embed-node`; embed uvozi samo `components/workspace/canvases/task-checkpoint-layout` (netaknut u lancu) + `lib/*` | ✅ statički čisto |

### Zatečene rupe koje ova faza MORA da zatvori

1. **`PARITET.md` nema sekcije K4 i K5.** Poslednji commit koji ga je dirao je `00a813e` (K3);
   `PARITET.md:790–792` i dalje piše „**Ostaje za K4–K5**", a Z-tabela (`:827–830`) i dalje
   drži četiri checkpoint funkcije kao izuzetke. Prompt traži da u Z ostane **tačno 7**.
2. **`ZA-POPRAVKU.md §8` je i dalje tačan — K4 native ljuska nikad nije povezana.**
   Provereno na disku sada: u `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` postoje samo
   deklaracije — `CheckpointNodeSheet` uvezen (`:29`), `checkpointTarget` (`:145`),
   `expandedTaskId` (`:149`) — i **nijedna se dalje ne koristi** (grep: 0 drugih pogodaka).
   `zadatak/[id].tsx` nema ulaz u kanvas (grep `canvas` → 0 pogodaka).
   Posledica: cela K4 funkcionalnost je sa telefona **nedostupna**.
   → Zbog toga se četiri checkpoint funkcije **ne smeju** izbaciti iz Z dok se ovo ne poveže.
   To je jedini razlog zbog kog K6 uopšte dira kod van backend lint-a.
3. **Embed strana je potpuno spremna** — ništa se tamo ne dodaje. Provereno:
   prijem `{type:"checkpoints"}` `canvas-embed.tsx:288–290`; `CheckpointNodeDetail`
   `:1332`, punjenje `:1848–1874` (`nodeKind:"checkpoint"`, `nodeId`, `taskPageId`,
   `manuallySized`, `edges`); `connected` sa `edgeKind:"checkpoint"` `:1641`, sa
   `"page"` `:1672`; `PageNodeDetail.checkpointTotal` `:1323`/`:1843`.
4. **K5 (ideje i misli u režimu) nije ni započet** — `canvas-embed.tsx:312–314` doslovno
   kaže da handleri nisu dodati; `[id].tsx:268` `supportsEdit = isPageKind`.
   **K6 ga NE radi** (vidi §5) nego ga formalno zapisuje.
5. **T9/T17 (desktop kanvas proveren mišem) otvoren četvrtu fazu zaredom.**

### Okruženje (provereno sada, ne pretpostavljeno)

- `curl http://localhost:3000/embed/canvas/area/proba` → **200** (Z3 čist, port nije otet).
- Metro na `8081` → **200**.
- `adb` NIJE na PATH-u u Git Bash; radi kao
  `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"` → **`emulator-5554 device`**.
- `expo lint` se **ne pokreće** (pokvaren u `apps/mobile`, ceo `src` ignorisan) — provera je `tsc`.

---

## 2. Redosled izmena

Kod prvo (I1–I5), pa kapije, pa dokumentacija (I6–I11) — **sve u istom commit-u**.

### I1 — `packages/backend/convex/areasV2.ts:9`
Obriši **samo** liniju `findAvailableCanvasPosition,` iz uvoza sa vrha (`:6–14`).
Provereno: identifikator se u fajlu pojavljuje **tačno jednom** (sam uvoz).
*Razlog:* jedino zatečeno lint upozorenje; prompt izričito dozvoljava brisanje mrtvog koda.
**Ne diraj `getAvailableCanvasPosition`** — to je druga, korišćena funkcija.

### I2 — `packages/backend/convex/chat.ts:1037`
`const { profile } = await requireStartupMember(ctx, args.startupId);`
→ `await requireStartupMember(ctx, args.startupId);`
*Razlog:* isto upozorenje.
**⚠️ Poziv se OBAVEZNO zadržava** — to je provera pristupa, ne mrtav kod. Briše se samo
destrukturisanje. Ako se obriše cela linija, pretraga chata postaje javna.

### I3 — `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` (Izmena 11 iz `faza-k4.md:441`)
Jedini pravi posao faze. Osam tačaka, svaka mala:

| # | Gde | Šta |
|---|---|---|
| a | tip poruke, uz `edgeId` (`:388`) | dodaj `edgeKind?: string;` |
| b | posle `toggleEdit` | `useEffect` koji na promenu `expandedTaskId` šalje `postToWeb({ type:'checkpoints', taskPageId: expandedTaskId })`; **i** u `onLoadEnd` (uz `mode`, `:654`) ponovi `if (expandedTaskId && !failed)`. Za razliku od `connect`, **ne** poništava se — to je pogled, ne radnja koja čeka tap |
| c | `node:open` (`:398–409`) | pročitaj `(msg.node as {nodeKind?:string}).nodeKind`; `'checkpoint'` → `router.push({pathname:'/zadatak/[id]', params:{id: node.taskPageId}})`; sve ostalo kao sada |
| d | `node:actions` (`:410–414`) | grana po `nodeKind`: `'checkpoint'` → `setCheckpointTarget(msg.node as CheckpointNodeTarget)`, inače `setNodeTarget` |
| e | `connected` (`:415–431`) | `msg.edgeKind === 'checkpoint'` → `pushUndo({kind:'checkpointEdgeConnect', startupId, areaId, rootPageId, edgeId: … as Id<'taskCheckpointCanvasEdges'>})`, label „Korak je povezan."; inače postojeći `pageEdgeConnect`. **Bez ovoga „Poništi" zove `areasV2.disconnectPages` sa `taskCheckpointCanvasEdges` id-jem → serverska greška** |
| f | `applyNodeSize` (`:345–356`) | dodaj treći `setCheckpointTarget((c) => c && c._id === id ? {...c, width, height} : c)`; parametar preimenuj u `nodeId: string` (isti `_id` uslov radi za oba tipa) |
| g | rail (`:575–584`) | izvedi `selectedKind = (selectedNode as {nodeKind?:string} \| null)?.nodeKind`; `selectedPage` traži `!== 'checkpoint'`, nov `selectedCheckpoint` traži `=== 'checkpoint'`; `nodeAction.label` = „Akcije kartice" / „**Akcije koraka**", `onPress` puni odgovarajući target |
| h | `startConnect` (`:276–287`) | generalizuj na `(source: { nodeId: string; title: string })`; pozivalac za karticu prosleđuje `page._id`, za korak **`checkpoint.nodeId`** (NE `_id` — embed čvor koraka ima prefiksiran id, vidi §4 P2); zatvaraju se **oba** sheet-a |
| i | montaža (`:786–795`) | u isti `isPageKind` blok dodaj `<CheckpointNodeSheet checkpoint={checkpointTarget} onClose={…} onStartConnect={…} onApplied={(w,h)=>checkpointTarget && applyNodeSize(checkpointTarget._id, w, h)} />`; `PageNodeSheet` dobija `checkpointsExpanded={expandedTaskId !== null && expandedTaskId === nodeTarget?._id}` i `onToggleCheckpoints={setExpandedTaskId}` |
| j | `Header title` (`:610`) | `isPage && parentPage?.kind === 'task'` → `"Canvas zadatka"`, inače `canvasKindLabel(kind)` |

**Ne dodavati** reset `expandedTaskId` u `toggleEdit`: `faza-k4.md:554` izričito kaže da jednom
razvijeni koraci ostaju vidljivi i posle „Gotovo".

### I4 — `apps/mobile/src/app/(app)/zadatak/[id].tsx` (Izmena 12 iz `faza-k4.md:458`)
U `ScreenHeader.actions` (`:171–177`), **pre** „Akcije zadatka", ista ikonica i ista
formulacija kao na stranici (`stranica/[id].tsx:87–89`):
`<IconButton accessibilityLabel="Canvas zadatka" onPress={openCanvas}><LayoutGrid size={20} …/></IconButton>`,
`openCanvas` = `haptics.tap()` + `router.push({pathname:'/canvas/[kind]/[id]', params:{kind:'page', id: pageId}})`.
Uvezi `LayoutGrid` iz `lucide-react-native` (`:3–11`).
*Razlog:* bez ovoga kanvas zadatka — jedini na kom su koraci vidljivi bez poruke
`checkpoints` — nije dostupan sa telefona. Ruta postoji, nema regeneracije tipova.

### I5 — `apps/web/lib/canvas-node-size.test.ts` (NOV)
Test koji zakiva `PAGE_NODE_SIZE` na (a) brojeve koje je desktop imao inline **pre** lanca
(`git show 019239d:apps/web/components/workspace/canvases/area-flow-node.tsx` — `240/168/720/1000`)
i (b) serverske granice `packages/backend/convex/areasV2.ts:85–88` + podrazumevanu veličinu
`canvasPlacement.ts:4–5` (288 × 196).
*Razlog:* jedini dodir lanca u desktop kod je izvlačenje te četiri konstante
(`area-flow-node.tsx`, 8 linija). Test je trajna brana umesto jednokratne tvrdnje.
Konvencija postoji: `apps/web/lib/*.test.ts`, projekat `web` u `vitest.config.ts`.

### I6 — `docs/mobile/PARITET.md`
1. Nove sekcije **K4** i **K5** posle K3 (`:789`); briše se red „Ostaje za K4–K5" (`:790–792`).
   K4: četiri `[x]` sa fajlom i linijom (posle I3/I4). K5: `[ ]` — **nije urađeno**, sa
   pokazivačem na `ZA-POPRAVKU §9`.
2. **A8** (`:361–365`) — čekiran, dokazne linije iz I3/I4.
3. **Z-tabela** (`:821–833`) — prepisana da sadrži **tačno 7 redova**, sveže obrazloženje
   (§5 ovog plana); četiri checkpoint reda se **brišu**.
4. **B** (`:378–381`) — `npm run lint` čekiran posle I1/I2.
5. Novi **Z-gest** redovi iz `faza-k4.md:546–557` (ručke na oblačiću, tekst/kvačica na
   kanvasu, koraci više zadataka odjednom).
6. Uz `thoughts.moveNodes` (`:111`) napomena: dokaz je `misli.tsx:82` („Sredi raspored"
   sa liste), **ne** potez prstom po kanvasu — to čeka K5.

### I7 — `docs/mobile/ZA-POPRAVKU.md`
- **§6** → REŠENO (I1, I2), sa commit-om.
- **§8** → REŠENO (I3, I4), sa dokazima.
- **§9 NOVO — „K5 nije urađen"**: cilj, spisak već postojećih backend funkcija
  (`faza-k5.md:47–51`), i **zamka apsolutnih vs relativnih koordinata** ugnježdenih
  čvorova (`faza-k5.md:119–127`) — bez nje sledeći agent tiho pokvari poziciju.
- **§10 NOVO — „Desktop kanvas nije proveren mišem"**: uslov (kredencijali), put
  (`faza-k4.md:586` T17 preko `adminAuth:resetAdminPassword`, Z6 — ne gasi mobilnu sesiju),
  i šta ga zamenjuje do tada (I5 + statički dokaz). Prestaje da se tiho prenosi.

### I8 — `docs/mobile/lanac4/REZIM.md` + `docs/mobile/00-PLAN.md` §5.2
Dopuna protokola mosta koju Izmena 13 nikad nije unela:
`native → WebView: {type:"checkpoints", taskPageId}` i `WebView → native: connected.edgeKind`,
`node:*.node.nodeKind`. Bez toga je 00-PLAN §5.2 nepotpuna specifikacija mosta.

### I9 — `docs/mobile/lanac4/IZVESTAJ.md`
K5 unos dopunjen istinom („cilj nije ispunjen; `6668cb4` je popravka repa K4") — traži
`faza-k5.md:112`. K6 unos popunjen.

### I10 — `docs/mobile/lanac4/BRIEF.md` (NOV)
Traži prompt, tačka 4. Po uzoru na `docs/mobile/BRIEF-PARITET.md`: šta je urađeno po fazi
(K1–K6), šta je ostalo (K5, T9, ZA-POPRAVKU §2/§5.x), i **šta čovek mora sam da proveri na
fizičkom telefonu** (iOS: dugi pritisak/`contextmenu` u WKWebView-u, custom zvuci, haptika;
oba: potez na malom uređaju, landscape, čitač ekrana).

### I11 — commit
Jedan commit: kod + čekirani kvadratići + dokazi.

---

## 3. Prst ↔ miš: isti ishod, drugi pokret

Sve što K6 otvara je K4 funkcionalnost — tabela je iz `faza-k4.md:482–494`, ovde skraćena
na ono što ova faza čini **dostupnim**:

| Na webu mišem | Na telefonu prstom | Ista mutacija |
|---|---|---|
| Klik „razvij korake" na kartici zadatka | Režim → dugi pritisak na karticu (ili rail „Akcije kartice") → „**Prikaži korake (N)**" | — (samo prikaz, poruka `checkpoints`) |
| Prevučeš oblačić koraka po platnu | Režim → prst na oblačiću ga vuče (xyflow mu daje `nopan`), prst na pozadini pomera platno; upis na `onNodeDragStop` | `taskCheckpoints.saveCanvasPlacement` |
| Hover toolbar oblačića → `Maximize2`/`Minimize2` | „Akcije koraka" → „Kompaktno" / „Prošireno" (redovi 56pt) | `saveCanvasPlacement` (w,h) |
| Toolbar → vrati veličinu | „Akcije koraka" → „Vrati podrazumevanu veličinu" | `resetCanvasSize` |
| Povučeš nit sa `Handle` tačkice | „Poveži sa…" → traka „Izaberi karticu za vezu" → **tap** na cilj | `taskCheckpointCanvasEdges.connect` |
| Klik na liniju + `Delete` | Imenovana lista suseda u sheet-u → ✕ (44pt) → potvrda | `taskCheckpointCanvasEdges.disconnect` |
| Otvoriš kanvas zadatka iz sidebara | Detalj zadatka → ikonica „**Canvas zadatka**" u zaglavlju | — |
| Klik na oblačić otvara korak | Van režima tap na oblačić → `/zadatak/<taskPageId>` (suština koraka je tamo) | — |
| `Ctrl+Z` | Traka „Poništi" 8 s | inverzni poziv |

---

## 4. Šta može da pukne

**P1 — povlačenje oblačića vs pomeranje platna.** Mehanika je K1-ova (`REZIM.md` §6):
xyflow povlačivom čvoru dodaje `nopan`, pa `d3-zoom` dodir koji je počeo na oblačiću ne vidi.
Nov rizik je **meta**: oblačić je 164 × 110, na zumu 0.5 to je 82 × 55 px.
*Ako pukne:* promašaj = pan, dakle **ništa se ne piše u bazu** — ishod je bezopasan.
Popravka je `[+]` iz rail-a, **ne** smanjivanje `nodeDragThreshold` ispod 5 (drhtaj prsta bi
počeo da piše). Ovo se ne „rešava" u K6 — meri se u T4/T5.

**P2 — pogrešan id u „Poveži sa…" za korak.** Embed čvor koraka nosi **prefiksiran** id
(`taskCheckpointNodeId(_id)`, `canvas-embed.tsx:1849`), a `CheckpointNodeTarget` nosi i `_id`
i `nodeId` (`checkpoint-node-sheet.tsx:24–26`). Ako `startConnect` pošalje `_id`, prsten se
ne pojavi i tap na cilj ne radi ništa — **tiho**, bez greške.
*Ako pukne:* T7 to hvata odmah (prsten mora da se vidi). Fiks je jedna linija (I3.h).

**P3 — „Poništi" nad checkpoint vezom zove pogrešnu mutaciju.** Bez I3.e grana `connected`
gura `pageEdgeConnect`, pa traka zove `areasV2.disconnectPages` sa `taskCheckpointCanvasEdges`
id-jem → serverska greška u licu korisnika. *Test T8 gađa direktno.*

**P4 — `taskCheckpoints.listForTask` baca i ruši embed.** Query baca ako `canvasRootPageId`
nije koren ni roditelj. Guard već postoji u embedu (`visibleTaskId`, `canvas-embed.tsx:1429–1430`)
— K6 ga **ne dira**. Ako ipak pukne, `app/embed/…/error.tsx` hvata, native nudi „Pokušaj
ponovo", a `mode` i `checkpoints` se posle reload-a ponovo šalju (I3.b).

**P5 — Z7 recidiv.** Native sheet iznad WebView-a proguta `touchend`. Kapija se zatvara u
`handleNodeContextMenu` (`canvas-embed.tsx:801–819`), koji je generički za svaki čvor i **ne
menja se**. Ipak se meri (T9) — Z7 je već jednom preživeo fazu neprimećen.

**P6 — brisanje `profile` obori autorizaciju** (I2). Ako se obriše cela linija umesto
destrukturisanja, `chat.search` postaje bez provere članstva. *Provera:* posle I2
`grep -n "requireStartupMember" packages/backend/convex/chat.ts` mora da vrati **isti broj
pogodaka** kao pre.

**P7 — Z1 recidiv.** Nijedan nov **objektni** prop na `<WebView>` (novi prop = nova
referenca = reload). Poruka `checkpoints` ide isključivo kroz `postToWeb`.

**P8 — desktop regresija.** Jedini dodir je I5 (test, ne kod). Ako test padne pri pisanju,
to znači da su se konstante već razišle — tada **ne menjaj test da prođe**, nego prijavi.

---

## 5. Šta NEĆU raditi (ide u sekciju Z fajla `PARITET.md`)

**Sedam funkcija koje ostaju izuzeci** — sveže provereni pozivaoci (grep sada):

| Funkcija | Sveže obrazloženje |
|---|---|
| `activity.listForStartup` | Web `activity-view.tsx:13` zove je sa tvrdim `limit: 50` i bez nastavka. Mobilni ima **stariju rupu popunjenu bolje**: `activity.listPaginated` (`aktivnost.tsx:73`, beskonačan skrol). Zamena je funkcionalno šira, ne uža — obrnut paritet. |
| `areasV2.getCanvas` | Desktop-samo široka pretplata (ceo startup odjednom): `area-canvas-view.tsx:271`, `area-view.tsx:105`, `page-workspace-view.tsx:91`, `workspace-shell.tsx:214`. Mobilni prikazuje tačno jedan scope, pa embed zove **uže** resolvere `getAreaCanvasByArea` (`canvas-embed.tsx:2014`) i `getPageCanvasByPage` (`:2043`). Ista podatkovna potreba, manji upit. |
| `areasV2.getPageCanvasByPage` | **Lažno pozitivan.** Jedini pozivalac u celom webu je `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx:2043` — deljeni kod koji mobilni izvršava kroz WebView (00-PLAN §5.2). Grep ga vidi kao „web-only" jer broji `apps/web/*`, a fajl fizički živi tamo. |
| `areasV2.resolveRoute` | Razrešava web URL u `WorkspaceRoute` (`workspace-shell.tsx:331`, `:637`). Mobilni nema URL-ove — ima expo-router i tipizovane rute; nema šta da razrešava. |
| `notifications.latest` | Jedini pozivalac: `notifications-panel.tsx:426`, izvor za web in-app toast. Na telefonu tu ulogu igraju OS push baner (kanal + zvuk po tipu), bedž na tabu i pun ekran „Obaveštenja" (`notifications.list`). Drugi in-app sloj bi duplirao OS baner. |
| `pageFiles.prune` | Čisti osirotele priloge **umetnute u telo** beleške preko node-view mehanizma (`page-editor-view.tsx:150`). Mobilni tentap editor ne ume da ubaci prilog u telo (ZA-POPRAVKU §2/§5.1, merni gejt i dalje otvoren), pa na telefonu ne postoji kod koji taj osiroteli red može da napravi. Zatvara se zajedno sa proširenjem tentap bundle-a. |
| `pushSubscriptions.myDeviceCount` | Broji **web push** pretplate (`notifications-panel.tsx:341`). Mobilni koristi Expo push — druga tabela (`expoPushTokens`), drugi mehanizam. Ekvivalent postoji na backendu (`expoPushTokens.myDeviceCount`) i čeka na ekranu podešavanja (ZA-POPRAVKU §7). |

**Šta još NEĆU raditi u ovoj fazi:**

- **K5 — ideje i misli u režimu.** To je pun posao faze, ne zatvaranje: handleri u
  `IdeasFlow`/`ThoughtsFlow`, dva nova sheet-a čvora, novi članovi `UndoAction`, i zamka
  apsolutnih vs relativnih koordinata ugnježdenih čvorova (`faza-k5.md:119–127`). Guranje toga
  u zatvaranje bi aktiviralo baš onaj rizik zbog kog lanac postoji. Ide u
  `ZA-POPRAVKU §9` + `PARITET.md` sekcija K5 (nečekirano) + BRIEF „šta je ostalo".
  Razlika pariteta ostaje 7 i sa i bez K5 — te mutacije su odavno prebrojane preko listi
  (`misli.tsx:82`, `ideje.tsx:131`), pa **broj 7 ne sme da se čita kao „sve je urađeno"**.
  BRIEF to mora da kaže doslovno.
- **Ugaone ručke na oblačiću koraka** — 164 × 110; četiri mete od 44pt zauzele bi 43%
  površine i pojele potez pomeranja. Veličina ide presetima iz sheet-a (isti preseti kao
  desktop toolbar). Pravilo lanca: menja se interakcija, ne prst.
- **Tekst/kvačica/brisanje/glasanje o koraku na kanvasu** — suština koraka je već native na
  detalju zadatka; tap van režima vodi tamo. Jedan izvor istine.
- **Koraci više zadataka odjednom** — ni desktop to ne radi (`area-canvas-view.tsx:384`).
- **Backend logika** — dira se isključivo brisanje dva mrtva identifikatora (I1, I2).

---

## 6. Kako se dokazuje (konkretan test, ne tvrdnja)

Emulator `emulator-5554` **radi**, dev server na 3000 **radi** (provereno u §1).
`adb` se zove punom putanjom. Dokazi u `docs/mobile/lanac4/dokazi/` sa prefiksom `k6-`;
log `k6-logovi.txt` (`adb logcat` filtriran na `[canvas]` + Convex funkcije).

| # | Test | Dokaz koji mora da postoji |
|---|---|---|
| **T0** | Okruženje pre svega: `curl -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/area/proba` → `200` (Z3) | red u `k6-logovi.txt` |
| **T1** | I1/I2: `npm run lint` → **0 grešaka, 0 upozorenja**; `grep -c requireStartupMember chat.ts` isti broj kao pre (P6) | ispis pre/posle |
| **T2** | Ulaz: detalj zadatka → „Canvas zadatka" otvara kanvas, zaglavlje kaže „Canvas zadatka", oblačići u orbiti | `k6-ulaz.png`, `k6-kanvas.png` |
| **T3** | Prikaz sa kanvasa oblasti: sheet kartice zadatka → „Prikaži korake (N)" → orbit; „Sakrij korake" ih uklanja (T14 iz K4) | `k6-prikazi.png`, `k6-sakrij.png` |
| **T4** | Potez: u režimu prevuci korak — prati prst, po otpuštanju **tačno jedan** `taskCheckpoints:saveCanvasPlacement` | `k6-pre.png` → `k6-posle.png` + odsečak loga |
| **T5** | Platno (P1): u režimu prevuci **pozadinu** — svi oblačići idu zajedno, u logu **nema** `saveCanvasPlacement` | `k6-pan.png` + odsečak loga |
| **T6** | Veličina + uslovni inverz: korak koji nikad nije dimenzionisan → „Prošireno" → „Poništi" → u logu `saveCanvasPlacement(x,y)` **pa** `resetCanvasSize` | `k6-velicina.png`, log sa oba poziva |
| **T7** | Veza (P2): „Poveži sa…" → **prsten oko izvora se vidi** → tap na drugi oblačić → linija; **jedan** `taskCheckpointCanvasEdges:connect` | `k6-veza-pre.png` → `k6-veza-posle.png` + log |
| **T8** | „Poništi" veze (P3): odmah posle T7 → u logu `taskCheckpointCanvasEdges:disconnect`, **nijedan** `areasV2:disconnectPages`, nula Alert-a | odsečak loga + `k6-undo-veza.png` |
| **T9** | Z7 (P5): dugi pritisak na oblačić → sheet → izmena veličine iz sheet-a se **vidi** u WebView-u bez reload-a | `k6-z7.png` |
| **T10** | Van režima: tap na oblačić otvara `/zadatak/<taskPageId>` (ne `/stranica/<checkpointId>`) | `k6-tap-zadatak.png` |
| **T11** | Preživljavanje reload-a: režim + razvijeni koraci → „Pokušaj ponovo" → koraci i dalje vidljivi (I3.b) | `k6-retry.png` |
| **T12** | Dodirne mete **izmerene na uređaju** (`adb shell uiautomator dump`): redovi sheet-a ≥ 56 dp, ✕ i „Canvas zadatka" ≥ 44 dp | `k6-mete.txt` |
| **T13** | Baza: `npx convex data taskCheckpointCanvasPlacements` i `taskCheckpointCanvasEdges` pre/posle T4 i T7 | `k6-baza.txt` |
| **T14** | Desktop (I5): `npm test` — nov `canvas-node-size.test.ts` prolazi; `git status --short -- apps/web/components/ apps/web/app/ packages/backend/convex/{areasV2,chat}.ts` pokazuje **samo** dva backend fajla iz I1/I2 i nula fajlova u `components/` | ispis |
| **T15** | Kapije: mobilni `tsc` · web `tsc` · `npm run lint` (0/0) · `npm test` · `npm run build` | ispis |
| **T16** | Paritet posle svega: komanda `PARITET.md:15–19` → i dalje **7**, i to isti spisak (I3/I4 ne uvode nove `api.*` reference) | ispis |
| **T17** | Z-tabela ima **tačno 7 redova** i svaki od 7 iz T16 se u njoj nalazi (uparivanje, ne odokativno) | ispis |

**T18 (uslovno) — desktop mišem.** Odradi **samo ako** `npx convex run adminAuth:resetAdminPassword` prođe
za `jovanm028@gmail.com` (Z6: taj CLI put **ne** gasi sesije, pa mobilna preživi):
prijavi se na `localhost:3000`, otvori isti kanvas, prevuci karticu mišem i `Ctrl+Z`.
**Nova lozinka se OBAVEZNO upisuje u izveštaj.** Ako `resetAdminPassword` ne postoji ili
padne — **ne vraćaj ga i ne izmišljaj drugi put**; zapiši razlog i ostavi T18 otvorenim u
`ZA-POPRAVKU §10`. Do tada ne-regresija desktopa stoji na T14 (test + prazan diff).

---

## 7. Definicija „gotovo" za K6

1. `npm run lint` → **0 grešaka, 0 upozorenja**; ostale tri kapije zelene.
2. Sa telefona se korak **prikaže, pomeri, dimenzioniše, poveže i raskine**, svaka radnja sa
   „Poništi" koji radi (T3–T9), i sve to je **dostupno** iz detalja zadatka (T2).
3. `PARITET.md` ima sekcije K4 (čekirano, sa fajlom i linijom) i K5 (nečekirano, sa razlogom);
   A8 čekiran; B lint čekiran.
4. Z-tabela ima **tačno 7 redova**, isti spisak koji komanda vraća (T16 = T17).
5. `ZA-POPRAVKU` §6 i §8 zatvoreni; §9 (K5) i §10 (desktop mišem) otvoreni sa uslovom.
6. `BRIEF.md` postoji i izričito kaže da 7 **ne znači** „sve je urađeno".
7. `REZIM.md` i `00-PLAN.md` §5.2 opisuju most koji kod stvarno govori.

---

## 8. REALIZACIJA — odstupanja od plana i zašto

*(popunjava agent koji izvršava; prazno do tada)*
