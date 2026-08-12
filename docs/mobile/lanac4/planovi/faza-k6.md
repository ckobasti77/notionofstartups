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

Plan je sproveden u celini (I1–I11). Cilj je ispunjen: razlika pariteta **7**, svih 7 u
Z-tabeli sa svežim obrazloženjem, sve četiri kapije zelene (`lint` sada **0/0**).
Odstupanja, redom:

### O1 — I5 (test) je proširen preko onoga što je plan tražio

Plan je tražio dve tvrdnje (desktop-era brojevi + serverske granice/podrazumevana
veličina). Isporučeno je **šest** testova u istom fajlu, jer su dva dodatka besplatna i
zatvaraju stvarne rupe:

- podrazumevana veličina se poredi sa **pravim izvorom** — `DEFAULT_CANVAS_NODE_WIDTH` /
  `HEIGHT` uvezeni iz `@/convex/canvasPlacement` (moguće jer taj modul ima samo
  `import type`, pa se u vitest-u čisto izvršava). MIN/MAX iz `areasV2.ts` **nisu
  izvezeni**, pa oni ostaju zakucani brojevi uz komentar;
- **mobilna kopija** (`apps/mobile/src/lib/canvas-node-size.ts`) i **preseti oblačića**
  (`TASK_CHECKPOINT_SIZE_PRESETS` iz desktop `task-checkpoint-layout.ts`) se porede sa
  web modulom. To je test koji K2 najavljuje kao „T7" a nikad nije napisan.

Cena: test uvozi jedan fajl iz `apps/mobile` relativnom putanjom. Provereno da ne dira
nijednu kapiju — `apps/web/tsconfig.json` u `exclude` ima `**/*.test.ts`, pa web `tsc`
taj fajl ni ne gleda; `next build` ga ne uvlači; `eslint` prolazi.

### O2 — `startConnect` je generalizovan drugačije nego što plan opisuje

Plan (I3.h) kaže „generalizuj na `(source: { nodeId; title })`, pozivalac za karticu
prosleđuje `page._id`". Urađeno tako, uz jednu dopunu koju plan nije naveo:
`startConnect` sada gasi **oba** sheet-a (`setNodeTarget(null)` **i**
`setCheckpointTarget(null)`), a ne samo onaj iz kog je pozvan. Bez toga bi sheet koraka
ostao otvoren preko trake „Izaberi stavku za vezu". Uz to je i tekst najave za čitač
ekrana promenjen sa „Izaberi karticu…" na „Izaberi stavku… karticu ili korak", jer izvor
više nije nužno kartica.

### O3 — `connectSource` je preimenovan `_id` → `nodeId`

Plan to nije tražio, ali je polje **prestalo da bude** `_id`: za korak nosi prefiksiran
id čvora (`checkpoint:<id>`). Ostaviti ime `_id` značilo bi da sledeći čitalac pomisli da
sme da ga pošalje u mutaciju — tačno greška P2 iz §4. Preimenovanje je u jednom fajlu i
ne prelazi granicu komponente.

### O4 — T18 nije odrađen, i nije ni pokušan

Plan ga uslovljava uspehom `adminAuth:resetAdminPassword`. Taj poziv **menja lozinku
naloga** čija je mobilna sesija jedini put do testiranja u ovom okruženju; korisnik nije
tu da je primi, a promena bi bila trajna. Procenjeno da je to izmena tuđeg naloga bez
potrebe, ne test. Zapisano u `ZA-POPRAVKU §10` sa tačnim putem i uslovom, umesto da se
peti put prećutno prenese dalje. Ne-regresija desktopa stoji na T14 (prazan
`git status` nad `apps/web/components/`) + nov test iz O1.

### O5 — T11 je ispunjen samo za `mode`

`reload()` u ovom ekranu postoji **isključivo** u stanju greške, a u stanju greške na
platnu nema čvorova, pa se `expandedTaskId` ne može ni postaviti. Dakle scenario
„razvijeni koraci prežive Pokušaj ponovo" se na uređaju ne može proizvesti bez izmene
koda samo radi testa. Odrađeno je ono što se može: režim uključen u stanju greške →
tunel vraćen → „Pokušaj ponovo" → u logu `onLoadEnd` ponovo šalje `mode`
(`dokazi/k6-logovi.txt`, 19:48:07). Linija za `checkpoints` je u istom bloku sa istim
`!failed` guardom, a samo slanje poruke je dokazano u T3. Zapisano kao ograda, ne
prećutano. Usput provereno i da prelazak u pozadinu **ne** reloaduje WebView.

### O6 — dva kvara okruženja koja plan nije predvideo (i sada su zamke)

§1 plana kaže „emulator radi, dev server radi". Do trenutka izvršavanja **oba su bila
pokvarena**, na način koji je izgledao kao kvar aplikacije:

1. emulator je izgubio DNS (IP radi, imena ne) → aplikacija zauvek na „Pripremam radni
   prostor", u logcat-u `Unable to resolve host …convex.cloud`. Rešeno restartom sa
   `-dns-server 8.8.8.8`; sesija je preživela (`expo-secure-store` je na disku AVD-a);
2. restart je odneo `adb reverse` mapiranja, pa je svaki kanvas javljao
   `net::ERR_CONNECTION_REFUSED` iako `curl` sa hosta vraća `200` —
   `EXPO_PUBLIC_WEB_URL` je `localhost:3000`, što na emulatoru radi **samo** kroz tunel.

Oba su zapisana kao `ZA-POPRAVKU` **Z8** i **Z9**, jer su oba pogrešno dijagnostikovana
kao „auth je pukao" odnosno „kanvas je slomljen" pre nego što su izmerena.

### O7 — dokumentacija je dobila i ono što I8 nije tražio

Uz poruku `checkpoints` i polja `nodeKind`/`edgeKind` (traženo), u `REZIM.md` je dodato i
pravilo **„id čvora ≠ id dokumenta"** sa objašnjenjem zašto je zamena tiha greška. To je
zamka P2 iz §4 ovog plana; da je ostala samo u planu faze, nestala bi sa fazom.

---

# REVIZIJA

*Nezavisna provera, 12.08.2026. Opseg: `git diff a4a26c6..HEAD`. Sve tvrdnje ispod su
proverene ponovnim pokretanjem komandi i čitanjem koda na disku, ne preuzete iz izveštaja
faze.*

## 1. Je li CILJ ispunjen? — **DA**

CILJ: *„Razlika pariteta je 7 i svih 7 su obrazloženi izuzeci; tsc, lint i testovi su
čisti."*

Komanda iz `PARITET.md` zaglavlja, pokrenuta ponovo:

```
web 161 · mobilni 169 · razlika 7
api.activity.listForStartup · api.areasV2.getCanvas · api.areasV2.getPageCanvasByPage
api.areasV2.resolveRoute · api.notifications.latest · api.pageFiles.prune
api.pushSubscriptions.myDeviceCount
```

Z-tabela (`PARITET.md:914–922`) ima **tačno tih 7 redova**, uparuju se red po red.

**Provera na prevaru prošla.** Stari web skup na `019239d` je 160; `comm -23 stari novi`
je **prazan** — nijedna `api.*` referenca nije nestala sa weba. Jedini prirast je
`api.adminAuth.adminSetPassword`. Broj je pao rastom mobilnog, ne brisanjem sa weba.

Kapije, sve pokrenute ponovo u ovoj reviziji:

| Kapija | Ishod |
|---|---|
| `apps/mobile npx tsc --noEmit` | exit 0 |
| `apps/web npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, prazan ispis (0/0) |
| `npm test` | 39 fajlova, 333 testa, exit 0 |
| `npm run build` | exit 0 |

Sedam obrazloženja u Z-tabeli nisu prepisana napamet — nasumično proverenih šest
pozivalaca stoji tačno gde piše: `activity-view.tsx:13` (`limit: 50`),
`notifications-panel.tsx:341` i `:426`, `page-editor-view.tsx:150`,
`workspace-shell.tsx:331` i `:637`, `aktivnost.tsx:73` (`listPaginated`).

**Ograda uz „DA":** cilj je ispunjen doslovno, ali broj 7 ne meri lanac. K5 nije urađen i
broj je isti sa njim i bez njega. Faza to sama kaže na tri mesta (`PARITET.md` sekcija K5,
`ZA-POPRAVKU §9`, `BRIEF §1`) — to je ispravno postupanje, ne zamerka. Zamerka bi bila da
ćuti.

## 2. Čekirani kvadratići — ima li koda iza svakog?

**Da, iza svakog. Nijedan nije za odčekiranje.** Svaka citirana linija je otvorena i
pročitana:

| Kvadratić | Citat | Šta je na toj liniji |
|---|---|---|
| A8 `saveCanvasPlacement` | `canvas-embed.tsx:1412` | `useMutation(api.taskCheckpoints.saveCanvasPlacement)` ✓ |
| | `checkpoint-node-sheet.tsx:80`, poziv `:114` | `useMutation` ✓ / `await savePlacement({` ✓ |
| | `undo-bar.tsx:59`, `case` `:179`, unija `undo.ts:103` | ✓ ✓ ✓ |
| A8 `resetCanvasSize` | `checkpoint-node-sheet.tsx:81`, `:143`, `:248`; `undo-bar.tsx:60` | ✓ ✓ ✓ ✓ |
| A8 `edges.connect` | `canvas-embed.tsx:1413`, `:1617`, `:1632`, `:1641`; `[id].tsx:285`, `:480`, `:482` | ✓ (sve) |
| A8 `edges.disconnect` | `checkpoint-node-sheet.tsx:82`, `:157`; `page-node-sheet.tsx:72`, `:89` | ✓ ✓ ✓ ✓ |
| A8 „ulaz sa telefona" | `zadatak/[id].tsx:138` `openCanvas`, dugme `:182`; `page-node-sheet.tsx:170`/`:186`; `[id].tsx:333`, `:737`, `:688`; `canvas-embed.tsx:288` | ✓ (sve) |
| K4 (6 stavki) | `[id].tsx:149`, `:371`, `:441`, `:461`, `:645–652`, `:886`; `canvas-embed.tsx:1429`, `:1672` | ✓ (sve) |
| B `npm run lint` | — | ✓ 0/0, ali vidi §6.1 |
| B `npm test` (39/333) | — | ✓ izmereno isto |
| K5 | **`[ ]` nečekiran** | ispravno — koda nema i tako i piše |

Dodatno provereno, jer je to bila tačno greška koju je K6 popravljao: `selection` poruka
za korak **stvarno nosi** `nodeKind` — `canvas-embed.tsx:862` puni `node` iz istog
`detailById` mapa u kom `CheckpointNodeDetail` postavlja `nodeKind: "checkpoint"`
(`:1853`). Da ga ne nosi, rail bi izabranom koraku pisao „Akcije kartice" i otvarao
pogrešan sheet — tiho.

## 3. Je li desktop kanvas ostao netaknut? — **Jeste, i to je dokazano statički**

- **U K6:** nula fajlova u `apps/web/components/`. Ceo dodir weba je jedan **nov test**
  (`apps/web/lib/canvas-node-size.test.ts`). Backend dobio samo brisanje mrtvog uvoza
  (`areasV2.ts:9`) i destrukturisanja (`chat.ts:1037`) — `await requireStartupMember(...)`
  je u diff-u vidljivo zadržan, pretraga chata nije postala javna.
- **U celom lancu K1–K6:** `git log 61af45b~1..HEAD --name-only -- apps/web/components/`
  vraća **jedan commit i jedan fajl** — `52a5fbf` → `area-flow-node.tsx`, 9 linija: četiri
  inline broja (240/168/720/1000) zamenjena poljima `PAGE_NODE_SIZE`. Vrednosti su iste.
  `task-checkpoint-layout.ts` lanac nije dirao ni jednom.
- Nov test zakiva baš ta četiri broja na predlančane vrednosti i uz to poredi mobilnu
  kopiju i presete oblačića — dobra brana, jer je zajednički modul jedini put kojim
  „izmena za telefon" može tiho da promeni desktop `NodeResizer`.

**Šta ostaje nedokazano:** niko nije otvorio desktop kanvas mišem (T18, `ZA-POPRAVKU §10`).
Rizik je mali — 9 linija bez promene vrednosti plus test — ali je to jedini strah lanca i
otvoren je četvrtu fazu zaredom. Blokada nije tehnička nego kredencijali.

## 4. Je li „Uredi raspored" zaista režim? — **Jeste. Čvor se u gledanju ne može pomeriti.**

Provereno u kodu, ne u opisu:

- `canvas-embed.tsx:917` → `nodesDraggable={canEdit && !connecting}`, a `canEdit =
  editMode && !!onMoveNodes` (`:488`).
- Zamka „po čvoru pobeđuje globalno" je **izbegnuta**: jedina dva mesta koja postavljaju
  `draggable` po čvoru pišu `undefined` ili `false` (`:1736` korak, `:1888` kartica,
  `:1911` duh). **Nigde `draggable: true`.** `undefined` prepušta odluku globalnom
  prekidaču, pa gledanje ostaje gledanje.
- Ručke za veličinu: `embed-node.tsx:161` traži `resize?.enabled && data.canResize &&
  selected` — a oblačić koraka `canResize` nikad ne dobija, pa ručke ne postoje ni u režimu.
- Dugi pritisak: `:935` `onNodeContextMenu={canEdit && !connecting ? … : undefined}`.
- Runtime potvrda: `k6-logovi.txt` T5 — potez po pozadini u režimu daje samo `viewport`,
  **nijedan** `moved` / `saveCanvasPlacement`.

Ishod promašaja je pan, dakle nikakav upis. Van režima tap na čvor otvara detalj —
navigacija, ne izmena.

## 5. Dodirne mete ispod 44pt u dodatom? — **Nema nijedne**

- „Canvas zadatka" (`zadatak/[id].tsx:182`) je `IconButton`, `icon-button.tsx:41–42` =
  `MIN_TOUCH_TARGET` (44). Izmereno 43.8 dp — to je zaokruživanje piksela na gustini 420
  (44 × 2.625 = 115.5 → 115 px), identično postojećim „Nazad" i „Akcije zadatka".
- Redovi koje je K6 učinio dostupnim: „Prikaži korake (N)" i svi redovi sheet-a „Akcije
  koraka" mere **58.3–58.7 dp** (`ui/row.tsx:208` `minHeight: 56`). ✕ na vezi je 44 × 44
  (`node-edges-section.tsx:171–172`).
- Ugaone ručke na oblačiću su **odbijene** sa izračunom (43% površine čvora) i upisane u
  Z-gestove — to je pravilno primenjeno pravilo „menja se interakcija, ne prst".

**Metodološka rupa koju treba znati:** `k6-mete.txt` prijavljuje na ekranu zadatka i mete
od 35.8–36.2 dp („Uredi instrukcije", „Uredi/Obriši korak", „Veži za prethodni"). One
**nisu iz K6** (zatečene: `instructions-section.tsx:138–139`,
`task-checkpoint-list.tsx:556–557`) i **nisu stvarni prekršaj** — nose `hitSlop` 6–8, pa
je efektivna meta 48–52 dp. `uiautomator dump` čita `bounds` i `hitSlop` **ne vidi**.
Zaključak: metod merenja podcenjuje mete, i to nigde ne piše. Sledeći put uz svaku metu
ispod praga treba proveriti `hitSlop` u kodu pre nego što se proglasi prolaz ili pad.

## 6. Najslabije u fazi, i šta sledeća mora da popravi

### 6.1 `npm run lint` **ne gleda kod koji je ova faza napisala** ← najslabije

`eslint.config.mjs:26` globalno ignoriše `apps/mobile/**`, a `expo lint` je u ovom
projektu pokvaren (ceo `src` ignorisan). Jedine dve fajla sa pravim kodom u K6 su
`canvas/[kind]/[id].tsx` i `zadatak/[id].tsx` — **oba u `apps/mobile`**. Dakle:

- kvadratić `PARITET.md:407` („`npm run lint` — nula grešaka i nula upozorenja") je
  tačan kao činjenica, ali stvara utisak koji ne stoji;
- `BRIEF.md:118–120` isto: `npm run lint → 0/0` stoji u istom bloku sa `apps/mobile tsc`,
  bez ijedne reči da lint tu granicu ne prelazi;
- ograda postoji **samo** u planu (`faza-k6.md §1`) i u starim logovima lanca 3.

Ovo nije sitnica upravo u ovoj fazi: bug koji je K6 popravljao (K4 ljuska) je bio
**deklarisano-a-nikad-upotrebljeno stanje** — klasa greške koju `no-unused-vars` hvata, a
`tsc` propušta. Gejt koji bi ga uhvatio nikad nije radio nad tim fajlom.

**Sledeća faza:** ili popraviti `expo lint`, ili uz svaku tvrdnju „lint je čist" doslovno
dopisati *„`apps/mobile` nije pokriven — jedini mobilni gejt je `tsc`"*. Prvo je posao,
drugo je jedna rečenica i mora se uraditi odmah.

### 6.2 K5 — lanac se zatvara sa imenovanom nezavršenom fazom

`supportsEdit = isPageKind` (`[id].tsx:272`) — prekidač se na kanvasu ideja i misli ni ne
pojavljuje, pa nema mrtve kontrole; to je urađeno kako treba. Ali lanac je planiran kao
K1–K6 i zatvara se sa K5 na nuli. Zapisano je iskreno na tri mesta i tu nema šta da se
zamera fazi K6 — samo se ne sme čitati kao „gotovo". Sledeća faza je **K5**, sa zamkom iz
`ZA-POPRAVKU §9` (relativne vs apsolutne koordinate ugnježdenih čvorova).

### 6.3 Dokazi su čitljiv narativ, ne sirov ispis

`k6-logovi.txt` nije `adb logcat` dump nego rukom pisan zapis sa vremenima i **id-jevima
redova iz baze**. To je provereno bolje od tvrdnje (id se može ponovo pogledati) i faza
sama beleži šta nije uspela da proizvede (T11, O5). Ali sirov ispis se može nezavisno
ponoviti, a narativ ne. Sledeći put: sačuvati i filtrirani `logcat` uz sažetak.

### 6.4 Dve sitnice za usput (ne blokiraju ništa)

- **Tap na oblačić na kanvasu SAMOG zadatka** radi `router.push('/zadatak/<taskPageId>')`
  (`[id].tsx:441–448`) — a to je tačno ekran sa kog si ušao. Stek postaje
  zadatak → kanvas → **zadatak** umesto povratka. Na kanvasu oblasti je ponašanje tačno;
  ovde bi `router.back()` bio ispravniji kad je `taskPageId === parentPageId`.
- **Zastarelo obrazloženje u `PARITET.md:411–412`:** dva nečekirana runtime kvadratića
  (Metro konzola, Convex logovi) i dalje kažu „*van dometa headless faze; nijedna faza
  noćnog lanca ovo još nije radila*". K6 **jeste** imao živu emulator sesiju (19:24–19:52).
  Kvadratići s pravom ostaju prazni (sesija je pokrila kanvas, ne sve ekrane) — ali razlog
  treba prepisati, inače sledeći agent misli da uređaj nije dostupan.
