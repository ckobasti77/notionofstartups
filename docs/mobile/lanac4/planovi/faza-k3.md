# Faza K3 — Veze između kartica (povezivanje i raskidanje)

**Cilj:** prstom povežeš dve stranice na kanvasu i raskineš vezu, bez povlačenja
niti koje na telefonu ne radi.

**Dobija se:** `api.areasV2.connectPages`, `api.areasV2.disconnectPages`
(razlika pariteta **13 → 11**).

**Uz to (dug iz K2 REVIZIJE §6):** zatvara se rezidualni defekt **Z7** i popravlja
stražar kraja gesta. K2 je to izričito dodelio K3, jer K3 uvodi isti obrazac
(„gest počne u WebView-u, native sloj preuzme ekran").

---

## 1. Šta je pročitano i šta je zatečeno

### Pročitano

`docs/mobile/PARITET.md` (metod `:15–19`, sekcija K `:635–721`, Z tabela `:750–764`,
Z-gestovi `:766–779`) · `ZA-POPRAVKU.md` (Z1–Z4, **Z7 ceo**, §6) · `00-PLAN.md` §5.2 ·
`lanac4/OSNOVA.md` · `lanac4/REZIM.md` (ceo — K3 se kači na njega) ·
`planovi/faza-k2.md` (naročito **REVIZIJA §4 i §6**) ·
`packages/backend/convex/areasV2.ts` (`connectPages` `:2590`, `disconnectPages` `:2721`,
payload `:1470–1690`) · `packages/backend/convex/collaboration.ts` `:25–50` ·
postojeći mobilni obrazac za veze: `components/ideja/idea-edge-sheet.tsx`,
`components/stranica/relations-section.tsx`.

### Zatečeno — činjenice sa linijama

| Šta | Gde | Stanje |
|---|---|---|
| Režim + most (`mode`) | `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx:226` (`editMode`), `:242–273` (prijem poruka), `:403` (`canEdit`) | **gotovo (K1/K2) — K3 se kači na isti kanal** |
| Kapija „živi upit ne gazi prst" | isti fajl `:396–401`, `:415–429`, `releaseGesture :509` | postoji — K3 je ne dira, samo je koristi |
| Stražar kraja gesta | isti fajl `:532–545` (`handleResizeStart`) | **ima grešku** — reaguje na svaki `touchend` (K2 REVIZIJA §6.3) |
| Dugi pritisak → native sheet | isti fajl `:621–636` (`handleNodeContextMenu`) | postoji; **ostavlja `d3-drag` naoružan** (Z7) |
| Ručke za veličinu | isti fajl `:606–613` (`resizeApi`), `embed-node.tsx:182–199` | postoje — K3 im dodaje dva nova razloga da se ne crtaju |
| `PageNodeDetail` ka native-u | `canvas-embed.tsx:1030–1040`, `detailById :1199–1215` | postoji — **dopunjuje se sa `canConnect`, `pageCount`, `edges`** |
| Mapiranje ivica | isti fajl `:1262–1266` | **gubi `kind`, `label`, `canDelete`** — K3 ih čuva u `edge.data` |
| `nodesConnectable` | isti fajl `:722` | `false` i **ostaje `false`** (vidi §5) |
| Native ljuska, `onMessage` | `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx:296–420` | grane `node:open`/`node:actions`/`selection`/`resized`/`moved`/`viewport`/`toast` |
| 4. ikonica rail-a | isti fajl `:472–479`, `components/canvas/canvas-rail.tsx:97–101` | generička (`nodeAction`) — **rail se NE menja**, menja se samo šta ekran u nju stavi |
| Sheet veličine | `components/canvas/page-size-sheet.tsx:48–222` | radi; **telo se izdvaja u `PageSizeSection`** da stane u sheet čvora |
| Traka „Poništi" | `lib/undo.ts:20–62`, `components/undo-bar.tsx:48–138` | **proširuje se sa dva člana**, ne pravi se druga |
| Obrazac „sheet jedne veze" | `components/ideja/idea-edge-sheet.tsx:81–134` | **uzor**: Alert potvrda → mutacija → `pushUndo` → `onClose()` |
| Relacije stranica na mobilnom | `components/stranica/relations-section.tsx:60,92–93` | postoje na ekranu stranice (`deleteRelation` / `requestDeletion`) — **ne dupliraju se na kanvasu** |
| Glasanje o tuđoj vezi | `collaboration.ts:33–36` (`page_edge`), `app/(app)/odobrenja.tsx:45` („Veza stranica") | backend i ekran odobrenja **već rade**; fali samo ulaz |

### Backend — sve postoji, nula izmena

- `connectPages` (`areasV2.ts:2590`): `{startupId, areaId, rootPageId, sourcePageId,
  targetPageId, label?}` → `Id<"pageCanvasEdgesV2">`.
  Odbija: isti čvor (`:2608`), karticu van kanvasa (`assertDirectCanvasPage :810` —
  „Kartica ne pripada ovom kanvasu."), vezu koja **ne dodiruje moju karticu**
  (`:2623–2628` — „Vezu možete praviti samo od ili ka svojoj kartici."), preko
  `MAX_CANVAS_EDGES = 400` (`:77`, `:2665`). Na **postojeći aktivan par** ne pravi
  duplikat nego vraća `_id` postojeće ivice (`:2648–2651`).
- `disconnectPages` (`:2721`): `{startupId, areaId, rootPageId, edgeId}` → arhivira.
  Odbija tuđu vezu (`:2747` — „Možete ukloniti samo vezu koju ste napravili.") i
  vezu van scope-a (`:2745`).
- Payload već nosi sve što treba: `edges[]` sa `_id/source/target/label/kind/canDelete/
  canRequestDeletion` (`visibleEdgeValidator :141–149`, punjenje `:1646–1660`),
  `relations[]` istog oblika (`:1661–1678`), `pages[].canMove` = *moja kartica*
  (`:1636`). **Nijedan nov upit nije potreban.**
- Sve kartice u payload-u su **direktna deca** scope root-a (`:1476–1489`), pa svaka
  vidljiva kartica prolazi `assertDirectCanvasPage`. Klijent ne mora da filtrira mete.

### Šta je već urađeno → izbačeno iz plana

- Režim, most, ponovno slanje `mode` posle `onLoadEnd`, obod + pilula, haptika,
  safe-area, memoizacija `source`/`injectedAuth`/`style` (Z1).
- Prazno / učitavanje / greška — postoje na obe strane (`canvas-embed.tsx:749–756`,
  `:879`, `[id].tsx:560–576`, timeout `:227–231`). **K3 ne dodaje nijedno novo
  stanje jer nijedno ne fali**; novo je samo prazno stanje *liste veza* u sheet-u.
- Traka „Poništi", njen store i tajmer — samo dva nova člana unije.
- Glasanje o tuđoj vezi (ekran „Odobrenja", `page_edge`) — postoji, dodaje se ulaz.

---

## 2. Redosled izmena

Koraci 1–3 su nezavisni (`tsc` prolazi posle svakog). Koraci **4–6 su jedna
celina** (zamena sheet-a na mobilnom): `page-size-sheet.tsx` gubi omotač koji ekran
uvozi, pa `tsc` sme da se pokrene tek posle koraka 6.

### Izmena 1 — `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx`

**1a. Prijem `connect` poruke (`CanvasInner`, `:242–273`).**
Nov state `const [connectSourceId, setConnectSourceId] = useState<string | null>(null)`;
u `handle`: `if (msg.type === 'connect') setConnectSourceId(msg.sourceId ?? null)`.
Prosleđuje se svim vrstama kanvasa (`:277–289`) kao i `editMode` — ideje i misli
nemaju handler, pa je kod njih inertno (pravilo 7 iz `REZIM.md`; K5 dodaje handler).

**1b. `EmbedFlow` (`:354–387`) dobija dva propa i jedno izvedeno stanje.**

```tsx
connectSourceId?: string | null;
onConnectNodes?: (sourceId: string, targetId: string) => Promise<void>;
// …
const connecting = !!connectSourceId && !!onConnectNodes;
```

Posledice, sve u već postojećim izrazima:

- `nodesDraggable={canEdit && !connecting}` (`:719`) — **ovo je ključna odluka**:
  dok se bira cilj, nijedna kartica se ne povlači, pa se potez i pan ne biju (§4/P1).
- `resizeApi.enabled = canResize && zoomAllowsHandles && !connecting && !handlesSuspended`
  (`:606–613`) — ručke ne smeju da pojedu tap na cilj.
- `onNodeClick`: `connecting ? handleConnectPick : canEdit ? undefined : handleNodeClick`
  (`:733`).
- `onNodeContextMenu={canEdit && !connecting ? handleNodeContextMenu : undefined}` (`:735`).
- Pilula „Uređivanje rasporeda" (`:766–773`) se u biranju **ne prikazuje** — poruku
  tada nosi native traka iznad WebView-a; obod (`:762–765`) ostaje.

`handleConnectPick` (memoizovan, kao svi ostali handleri):

```tsx
const connectBusyRef = useRef(false);           // dupli tap ne sme da napravi dve ivice
const handleConnectPick = useCallback((_e, node) => {
  if (!connectSourceId || !onConnectNodes || connectBusyRef.current) return;
  if (node.data.ghost) { postNative({type:'toast', level:'info',
    message:'Kartica čeka odobrenje i ne može da se poveže.'}); return; }
  if (node.id === connectSourceId) { postNative({type:'toast', level:'info',
    message:'Izaberi drugu karticu.'}); return; }
  connectBusyRef.current = true;
  void onConnectNodes(connectSourceId, node.id).finally(() => { connectBusyRef.current = false; });
}, [connectSourceId, onConnectNodes]);
```

**1c. Z7 — ručke se odmontiraju kad native sloj preuzme ekran (dug iz K2).**
`const [handlesSuspended, setHandlesSuspended] = useState(false)`.
`handleNodeContextMenu` (`:621`) pored postojećih `disarmResizeWatchdog()` +
`releaseGesture()` poziva i `setHandlesSuspended(true)`. Time se četiri
`NodeResizeControl` čvora odmontiraju, a `d3-drag` za dodir sluša **na samom
elementu** (`touchmove/touchend/touchcancel` na `this`) — gest umire sa čvorom.
Otključavanje bez poruke iz native-a: prvi `touchstart` koji ponovo stigne do
stranice znači da je native sheet zatvoren.

```tsx
useEffect(() => {
  if (!handlesSuspended) return;
  const resume = () => setHandlesSuspended(false);
  // setTimeout(0): listener se kači TEK posle tekućeg gesta — inače bi ga uhvatio
  // isti dodir koji je i otvorio sheet.
  const arm = setTimeout(() => {
    window.addEventListener('touchstart', resume, { once: true, passive: true });
  }, 0);
  return () => { clearTimeout(arm); window.removeEventListener('touchstart', resume); };
}, [handlesSuspended]);
```

Uz to `setHandlesSuspended(false)` na promenu `editMode` i `connectSourceId`
(izlaz iz režima / iz biranja je uvek čist start).

**1d. Stražar kraja gesta — jedan uslov (dug iz K2 REVIZIJE §6.3).**
`handleResizeStart` (`:536`): `finish` prima događaj i izlazi ako dodir traje dalje:

```tsx
const finish = (event: Event) => {
  if (event.type.startsWith('touch') && (event as TouchEvent).touches.length > 0) return;
  disarmResizeWatchdog(); releaseGesture();
};
```

**1e. `PageCanvasView` (`:1068`) — jedino mesto koje zna scope.**

1. `const connectPages = useMutation(api.areasV2.connectPages)`.
2. `PageNodeDetail` (`:1030–1040`) dobija tri polja:
   - `canConnect: boolean` — `page.canMove` (server: veza mora da dodiruje **moju**
     karticu, `areasV2.ts:2623–2628`; izvor je zato uvek moja kartica);
   - `pageCount: number` — `data.pages.length` (sheet gasi „Poveži sa…" kad nema druge
     kartice);
   - `edges: Array<{ _id, kind:'canvas'|'relation', otherPageId, otherTitle,
     label: string|null, canDelete, canRequestDeletion }>` — susedi tog čvora,
     izračunati iz `data.edges` + `data.relations` (naslov druge strane iz mape
     `pages`). Native tako **ne radi nijedan dodatni upit** (isti princip kao K2).
3. Mapiranje ivica (`:1262–1266`) čuva `data: { kind }` (za proveru duplikata i za
   buduće razlikovanje linija) — vizuelno ostaje isto.
4. `const canvasPairs = useMemo(...)` — `Set` ključeva `pairKey` (`[a,b].sort().join(':')`)
   samo za `kind === 'canvas'` ivice. Isto pravilo kao desktop: postojeća **relacija**
   ne blokira canvas vezu (`area-canvas-view.tsx:1165–1172`).
5. `handleConnectNodes(sourceId, targetId)`:

```tsx
if (canvasPairs.has(pairKey(sourceId, targetId))) {
  postNative({ type:'toast', level:'info', message:'Ove kartice su već povezane.' });
  return;                                   // mutacija se NE zove (zahtev zadatka)
}
try {
  const edgeId = await connectPages({ startupId, areaId, rootPageId,
    sourcePageId: sourceId as Id<'pages'>, targetPageId: targetId as Id<'pages'> });
  postNative({ type:'connected', startupId, areaId, rootPageId, edgeId });
} catch (error) {
  postNative({ type:'toast', level:'error',
    message: error instanceof Error ? error.message : 'Veza nije sačuvana.' });
}
```

**Bez optimističke ivice.** Kad se obećanje mutacije razreši, isti Convex klijent
(onaj u embedu) već drži osvežen `getAreaCanvasByArea` — linija se pojavi sama.
Zato se ni `edges` ne prebacuje u lokalni state (za razliku od čvorova, koji moraju
zbog poteza). **Greška ne gasi biranje** — biranje gasi isključivo native (vlasnik
režima); poruka objasni, „Otkaži" je nadohvat.

6. `<EmbedFlow … connectSourceId={connectSourceId} onConnectNodes={handleConnectNodes} />`.

**1f. `EmbedStyles` (`:1359`) + jedan dinamički `<style>`.**
Izvor mora da se vidi, a da se ne prezidaju svi čvorovi (nov prop u `data` bi to
uradio). Zato CSS po `data-id` atributu, koji xyflow već stavlja na omotač čvora:

```tsx
{connectSourceId ? (
  <style>{`.embed-connect .react-flow__node[data-id=${JSON.stringify(connectSourceId)}] {
    outline: 3px solid var(--primary); outline-offset: 4px; border-radius: .75rem; }`}</style>
) : null}
```

Klasa `embed-connect` ide na isti omotač gde stoji `embed-edit` (`:699`).
U `EmbedStyles` još: `.embed-connect .react-flow__node { cursor: pointer }` i
gašenje isprekidanog oboda povlačivosti (`.embed-connect .react-flow__node.draggable
{ outline: none }`) — u biranju se ništa ne povlači, pa oznaka koja to obećava laže.

**1g. Komentar u `embed-node.tsx:32–34`** („povezivanje je K3") se ispravlja: ručke
za povezivanje ostaju nevidljive i `isConnectable={false}` **zauvek** — povezivanje
ide tapom, ne niti. Nijedna druga izmena u tom fajlu.

### Izmena 2 — `apps/mobile/src/lib/undo.ts`

Dva nova člana unije (`:20–62`), oba inverzni potezi kao `pageMove`/`pageResize`:

```ts
| { kind: 'pageEdgeConnect'; startupId; areaId; rootPageId: Id<'pages'>|null;
    edgeId: Id<'pageCanvasEdgesV2'> }        // Poništi = disconnectPages
| { kind: 'pageEdgeDisconnect'; startupId; areaId; rootPageId: Id<'pages'>|null;
    sourcePageId: Id<'pages'>; targetPageId: Id<'pages'>; label?: string }
                                             // Poništi = connectPages (label se čuva)
```

Komentar mora da kaže zašto `pageEdgeDisconnect` nosi par a ne `edgeId`:
`connectPages` **ne oživljava** arhiviranu ivicu (traži aktivnu, `:2630–2642`), pa
poništavanje pravi novu ivicu — isto što radi desktop redo (`area-canvas-view.tsx:1497`),
i zato mora da ponese `label`.

### Izmena 3 — `apps/mobile/src/components/undo-bar.tsx`

Dve mutacije uz postojeće (`:48–55`) i dva `case`-a u `restore` (`:85–138`):

```ts
case 'pageEdgeConnect':   await disconnectPages({ startupId, areaId, rootPageId, edgeId }); return;
case 'pageEdgeDisconnect': await connectPages({ startupId, areaId, rootPageId,
  sourcePageId, targetPageId, ...(label ? { label } : {}) }); return;
```

Ostalo (tajmer, `busyRef`, `Alert` koji ostavlja traku) je zatečeno i ne dira se.
**Time se obe funkcije zovu iz `apps/mobile/src`** — to je i uslov pariteta (§6/T10).

### Izmena 4 — `apps/mobile/src/components/canvas/page-size-sheet.tsx` (refaktor, bez promene ponašanja)

Telo sheet-a (`:154–221`) se izdvaja u **`export function PageSizeSection({ page,
busy, setBusy, onClose, onApplied })`**; omotač `PageSizeSheet` se **briše** (posle
izmene 6 nema pozivaoca — sve ide kroz sheet čvora). `PageSizeTarget` (`:21`) ostaje
u ovom fajlu i postaje osnova za `PageNodeTarget`. `busy` se diže u roditelja da ceo
sheet ima **jednu bravu** (veličina i veze ne smeju da se okinu jedna preko druge).
Logika `scale`/`reset`/`run` (`:65–147`), klamp, Alert „Granica veličine" i
`pushUndo` se sele **doslovno**. Docstring se ažurira.

### Izmena 5 — NOV `apps/mobile/src/components/canvas/page-node-sheet.tsx`

Jedan sheet čvora — ono što zadatak zove „sheet čvora". Otvara ga dugi pritisak
(`node:actions`) **ili** 4. ikonica rail-a. Jedan nivo, `ScrollView` kao u
`page-actions-sheet.tsx:252`.

```ts
export type PageNodeEdge = {
  _id: string; kind: 'canvas' | 'relation';
  otherPageId: string; otherTitle: string; label: string | null;
  canDelete: boolean; canRequestDeletion: boolean;
};
export type PageNodeTarget = PageSizeTarget & {
  canConnect: boolean; pageCount: number; edges: PageNodeEdge[];
};
```

Sadržaj, redom:

| Red | Uslov | Radnja |
|---|---|---|
| Zaglavlje: naslov + „Trenutno: Š × V" | uvek | — |
| **„Poveži sa…"** (`Link2`) | `canConnect && pageCount > 1` | `onStartConnect(page)` → roditelj zatvara sheet i ulazi u biranje |
| isti red, `disabled` + podnaslov razloga | `!canConnect` → „Vezu možete praviti samo od ili ka svojoj kartici."; `pageCount < 2` → „Na kanvasu nema druge kartice." | — |
| **„Veze (N)"** naslov sekcije + redovi suseda | `edges.length > 0` | vidi ispod |
| „Nema veza sa ove kartice." | `edges.length === 0` | prazno stanje, ne prazna lista |
| `PageSizeSection` (3 reda iz K2) | uvek | nepromenjeno |

Red suseda: `Row` sa `title = otherTitle`, `subtitle = label ?? ('Relacija' | 'Veza')`,
a u `value` **dugme 44pt**:

- `kind === 'canvas' && canDelete` → ✕ „Raskini vezu sa „X"" → `haptics.warning()` →
  `Alert.alert('Prekinuti vezu?', …, [Otkaži, Prekini(destructive)])` → `disconnectPages`
  → `pushUndo({ label:'Veza je uklonjena.', action:{kind:'pageEdgeDisconnect', …} })` →
  `haptics.success()` → **`onClose()`**;
- `kind === 'canvas' && !canDelete && canRequestDeletion` → dugme „Zatraži brisanje" →
  `collaboration.requestDeletion({ target:{ kind:'page_edge', id } })` →
  `Alert.alert('Poslato', 'Glasanje o brisanju veze je pokrenuto.')` → `onClose()`
  (obrazac 1:1 iz `idea-edge-sheet.tsx:118–134`; ekran „Odobrenja" to već prikazuje
  kao „Veza stranica", `odobrenja.tsx:45`);
- `kind === 'relation'` → **bez dugmeta**, podnaslov „Relacija — uklanja se na
  stranici" (put već postoji: `relations-section.tsx`).

**Zašto se sheet zatvara posle uspeha:** `UndoBar` živi na ekranu kanvasa, a `Sheet`
je `Modal` — traka iza otvorenog sheet-a se **ne vidi**, pa bi njenih 8 s isteklo
neiskorišćeno. Zatvaranje je uslov da „Poništi" uopšte postoji (isto radi
`page-size-sheet.tsx:72` i `idea-edge-sheet.tsx:106`).

### Izmena 6 — NOV `components/canvas/connect-bar.tsx` + `app/(app)/canvas/[kind]/[id].tsx`

**`ConnectBar`** — traka preko vrha `webWrap`-a (`:527`), `position:'absolute'`,
`accessibilityLiveRegion="polite"`: naslov „Izaberi karticu za vezu", podnaslov
„Izvor: «naslov»" (1 red, `numberOfLines={1}`) i dugme **„Otkaži"** 44pt.

**Ekran** (`app/(app)/canvas/[kind]/[id].tsx`):

1. State: `nodeTarget: PageNodeTarget | null` (zamenjuje `sizeTarget`, `:119`) i
   `connectSource: { _id: string; title: string } | null`.
2. `onMessage` (`:296–420`):
   - `node:actions` (`:338`) → `setNodeTarget(msg.node as PageNodeTarget)` (bilo:
     `setSizeTarget`);
   - nova grana `connected` → `haptics.success()`, `setConnectSource(null)`,
     `postToWeb({type:'connect', sourceId:null})`,
     `pushUndo({ label:'Kartice su povezane.', action:{kind:'pageEdgeConnect', …} })`,
     `AccessibilityInfo.announceForAccessibility('Kartice su povezane.')`;
   - `toast` (`:412`) razlikuje nivo: `error` → dosadašnje `haptics.error()` +
     `Alert.alert('Greška', …)`; `info` → `haptics.warning()` +
     `Alert.alert('Obaveštenje', …)` i **ostaje** u biranju.
3. `startConnect(page)`: `setNodeTarget(null)`, `setConnectSource({_id, title})`,
   `postToWeb({type:'connect', sourceId: page._id})`, `haptics.tap()`, najava za
   čitač ekrana. `cancelConnect()`: obrnuto (`sourceId: null`).
4. `toggleEdit` (`:237`) i izlazak iz režima **uvek** zovu `cancelConnect()`.
5. `onLoadEnd` (`:538`): posle reload-a embed nema izvor — ako je `connectSource`
   postavljen, native ga **poništava** (ne šalje ga ponovo). Isti razlog kao za
   `mode`, samo obrnut smer: dangling izvor posle „Pokušaj ponovo" je laž.
6. Rail: `nodeAction` (`:472–479`) postaje **„Akcije kartice"** (ikonica
   `MoreHorizontal`) i otvara `nodeTarget`; uslov je `editMode && hasSingleSelection
   && !connectSource` (u biranju rail ne otvara sheet). `canvas-rail.tsx` se **ne dira**.
7. Montaža: `<PageNodeSheet page={nodeTarget} onClose={…} onStartConnect={startConnect}
   onApplied={applyNodeSize} />` umesto `<PageSizeSheet…>` (`:670–678`);
   `{connectSource ? <ConnectBar … onCancel={cancelConnect}/> : null}` unutar `webWrap`-a.
8. **Nijedan nov objektni prop na `<WebView>`** (Z1) — sve ide kroz `postMessage`.

### Izmena 7 — dokumentacija (isti commit)

- `REZIM.md` §3: nove poruke (`connect` u tabelu native→WebView; `connected` i
  `toast level:'info'` u tabelu WebView→native); §7: brisanje reda o Z7 rezidualu
  (zatvoren) i nov red „ugaone mete na najmanjoj kartici" (K2 REVIZIJA §5).
- `00-PLAN.md` §5.2: iste poruke u tabelu mosta.
- `ZA-POPRAVKU.md` Z7: dopisati „**Zatvoreno u K3**" sa mehanizmom (odmontiranje
  ručki) i ostaviti pouku.
- `PARITET.md`: nova sekcija **K3** sa `[x]` i dokazima fajl:linija; brišu se redovi
  `:762` i `:763` iz Z tabele; dodaju se redovi iz §5 ovog plana; **ispravljaju se
  K2 dokazne linije** koje pomera izmena 6 (`node:actions` → sheet čvora).
- `IZVESTAJ.md`: popuniti K3 („Šta sada radi" + tabela dokaza) i **naknadno dopuniti
  K2**, kojem je unos ostao patrljak (K2 REVIZIJA §6.4).
- `apps/mobile/package.json` se **ne menja** → nema unosa u `NATIVE-BUILD.md`.

---

## 3. Prst ↔ miš: isti ishod, drugi pokret

| Ishod | Web (miš) | Telefon (prst) |
|---|---|---|
| Napravi vezu | povuci nit sa handle tačkice na drugu karticu (`onConnect`, `area-canvas-view.tsx:1159`) | režim → dugi pritisak/rail → „Poveži sa…" → traka „Izaberi karticu za vezu" → **tap na cilj** |
| Duplikat | `alreadyConnected` → `toast.info("Ove kartice su već povezane.")` (`:1173`) | ista provera u embedu (samo `kind:'canvas'`) → `Alert('Obaveštenje', …)`, **mutacija se ne zove** |
| Odustani usred poteza | pusti nit u prazno | „Otkaži" u traci (44pt) — ili „Gotovo" (izlazak iz režima gasi i biranje) |
| Raskini **svoju** vezu | klik na liniju + `Delete` (`onEdgesDelete :1311`) | sheet čvora → „Veze" → ✕ na redu → Alert potvrda → `disconnectPages` |
| Raskini **tuđu** vezu | isti `Delete` → `requestDeletion` (`page_edge`) | red „Zatraži brisanje" → isti `page_edge` → glasanje na ekranu „Odobrenja" |
| Vidi šta je povezano | vidiš linije na platnu | iste linije **plus** imenovana lista „Veze (N)" u sheet-u (prst ne pogađa liniju) |
| Poništi | `Ctrl+Z` (`pushHistory :1224`, `:1481`) | traka „Poništi" 8 s: veza → `disconnectPages(edgeId)`; raskid → `connectPages(par, label)` |
| Relacija (druga vrsta linije) | isti `Delete` put | prikazana u „Veze", uklanja se na ekranu stranice (`relations-section.tsx`) |

---

## 4. Šta može da pukne

**P1 — tap na cilj vs pomeranje platna vs povlačenje kartice. (glavni rizik)**
U režimu xyflow povlačivoj kartici dodaje `nopan`, pa dodir na njoj **ne stiže** do
`d3-zoom`-a: prst na svojoj kartici je pomera. Da tap na cilj ne bi bio potez, u
biranju se `nodesDraggable` gasi (izmena 1b) — tada nijedna kartica nema `nopan`,
svaki dodir ide platnu (pan radi), a običan tap i dalje daje `click` na čvor. To
nije pretpostavka: isti mehanizam već nosi „tap otvara stranicu" van režima
(dokazi K1 `k1-tap-otvara.png`, K2 `k2-gotovo.png`).
*Ako ipak pukne* (tap pomeri platno umesto da izabere): (a) proveri da li se `connect`
poruka uopšte primila (`__DEV__` log `[canvas] ← primljeno`); (b) podigni
`nodeDragThreshold` privremeno na 10; (c) krajnje — u biranju `panOnDrag={false}` i
pan kroz `[⌖]`/`[+]`/`[−]`; to je gubitak, pa se uzima samo ako (a)+(b) padnu, i
zapisuje se u `REZIM.md`.

**P2 — ručka za veličinu pojede tap na cilj.** Izabrana svoja kartica nosi četiri
mete od 44pt baš u uglovima. Zato `resizeApi.enabled` pada na `false` u biranju
(izmena 1b). Bez toga bi tap u ugao cilja pokrenuo `resize` tuđe… odnosno svoje
kartice, umesto da napravi vezu.

**P3 — Z7 se ponavlja u novom obliku.** Native sheet (sada i traka) preuzima ekran,
`touchend` ne stigne, kapija ostane zaključana i kanvas prestane da prima žive
izmene. Odbrana je trostruka i sada potpuna: postojeći stražar + `GESTURE_STALE_MS`
(K2) + **odmontiranje ručki** (izmena 1c). Provera je T7.

**P4 — dupla ivica na dupli tap.** `connectBusyRef` (1b) + serverska semantika
(postojeći par vraća isti `_id`, ne pravi drugu ivicu, `:2648`). Najgori ishod je
bezopasan.

**P5 — „Poništi" veze padne.** Ako je `connectPages` vratio **tuđu postojeću** ivicu
(trka: neko je povezao isti par u međuvremenu), `disconnectPages` će je odbiti
(„Možete ukloniti samo vezu koju ste napravili."). Traka tada **ostaje** i prikazuje
serversku poruku — postojeće ponašanje `UndoBar`-a (`:150–155`). Ne popravlja se.

**P6 — lista „Veze" je snimak, ne pretplata.** Detalj stiže uz `node:actions`/
`selection`; ako neko u međuvremenu ukloni istu vezu, `disconnectPages` vrati „Veza
nije pronađena na ovom kanvasu." Poruka je jasna, sheet se zatvara, kanvas je i
dalje tačan. Alternativa (drugi `useQuery` nad celim payload-om na native strani)
je skuplja od problema koji rešava.

**P7 — traka za biranje pokriva vrh platna.** Kartica ispod trake se ne može tapnuti;
izlaz je pan ili `[⌖]`. Zato je traka niska (jedan red + „Otkaži") i zato pilula iz
embeda u biranju nestaje (1b) — dva sloja iste poruke na istom mestu.

**P8 — regresija na desktopu.** K3 **ne dira nijedan fajl u `apps/web/components/`**
(za razliku od K2). Provera je T8, a ručna provera mišem T9.

**P9 — beskonačan reload WebView-a (Z1).** Nijedan nov objektni prop na `<WebView>`.

**P10 — okruženje.** Port 3000 ume da bude otet (Z3) → T0; `allowedDevOrigins` mora
da sadrži `10.0.2.2` (Z4); `expo lint` ne radi — mobilna kapija je `tsc`.

---

## 5. Šta NEĆU raditi (ide u sekciju Z fajla `PARITET.md`)

| Šta | Zašto |
|---|---|
| Povlačenje niti sa `Handle` tačkice (`nodesConnectable`) | Zahtev zadatka i fizika prsta: tačkica je ~8 px, a povećanje mete bi je pretvorilo u metu koja jede i tap i potez kartice. Isti ishod (`connectPages`) daje tap izvor → tap cilj. `isConnectable={false}` ostaje. |
| Tap na samu liniju (selekcija ivice + `Delete`) | Linija je 1–2 px i najčešće ide ispod kartica; „pogodi liniju prstom" je promašaj za promašajem. Raskidanje ide iz sheet-a čvora, gde je veza red od 56pt sa imenom druge strane. |
| Imenovanje veze (`label`) pri crtanju | Ni web ga ne unosi na kanvasu (`connectPages` bez `label`, `area-canvas-view.tsx:1199`); labela postoji u shemi i **prikazuje** se u listi „Veze", a „Poništi" je čuva pri vraćanju raskida. Za ideje i misli mobilni već ima preimenovanje veze (`idea-edge-sheet`, `thought-edge-sheet`) — za stranice ne postoji mutacija ni na jednom klijentu. |
| Uklanjanje **relacije** (`pageRelations`) sa kanvasa | Put već postoji native na ekranu stranice (`relations-section.tsx:92–93`, `deleteRelation` + `requestDeletion`). Drugi ulaz za istu radnju je duplirani tok, ne paritet. Na kanvasu se relacija vidi i objasni. |
| Veze checkpointa (`taskCheckpointCanvasEdges.connect/disconnect`) | K4 — embed te čvorove uopšte ne crta. |
| Veze ideja i misli iz kanvasa | K5. Native put već postoji (`idea-edge-sheet`, `thought-edge-sheet`), pa je to čist dodatak handlera po pravilu 7 iz `REZIM.md`. |
| Optimistička ivica pre odgovora servera | Convex razrešava mutaciju tek kad je pretplata istog klijenta osvežena, pa je linija tu u istom trenutku. Lokalno stanje ivica bi uvelo drugi izvor istine bez ijedne dobiti. |
| Grupno povezivanje (jedan izvor → više ciljeva odjednom) | `connectPages` prima jedan par; ni web to nema. Ponavljanje „Poveži sa…" pokriva slučaj. |

---

## 6. Kako se dokazuje (konkretni testovi)

Android emulator, `npx convex logs` u drugom terminalu, snimci i logovi u
`docs/mobile/lanac4/dokazi/` (konvencija lanaca 2–4).

**T0 — okruženje.**
`curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/area/proba`
→ `200`. `404` = tuđi server na portu (Z3), prazno = server ne radi.

**T1 — ulazak u biranje.** Oblast → „Uredi raspored" → dugi pritisak na **svoju**
karticu → sheet čvora ima red „Poveži sa…" → tap. Prolaz: sheet se zatvara, gornja
traka kaže „Izaberi karticu za vezu" + „Izvor: «naslov»", **izvor je obeležen punim
prstenom** u WebView-u, pilula „Uređivanje rasporeda" je nestala.
Dokaz: `k3-biranje.png`.

**T2 — tap na cilj pravi vezu, prstom, iz prve.** Tap na drugu karticu.
Prolaz: linija između dve kartice, traka nestaje, traka „Poništi" se pojavi.
Dokazi: `k3-pre.png` → `k3-posle.png`; u `npx convex logs` **tačno jedan**
`areasV2:connectPages` (`k3-logovi.txt`).

**T3 — veza je u bazi (zahtev zadatka).**
`npx convex data pageCanvasEdgesV2 --limit 5` iz korena repoa pre i posle T2:
posle mora da postoji nov red sa `archivedAt: null` i sa oba `nodeAId`/`nodeBId`
iz T2. Izlaz u `k3-baza-veza.txt`. (Ako CLI nema `data` podkomandu: snimak reda iz
Convex dashboard-a, `k3-baza-veza.png`. Query preko `convex run` **ne radi** —
`getAreaCanvasByArea` traži prijavljenog korisnika.)

**T4 — duplikat se ne pravi.** Ponovi T1+T2 nad istim parom.
Prolaz: `Alert('Obaveštenje', 'Ove kartice su već povezane.')`, u logu **nema**
`connectPages` (red iz `k3-logovi.txt` je dokaz da mutacija nije ni pozvana).

**T5 — raskidanje.** Sheet čvora → „Veze (N)" → ✕ na redu → „Prekini".
Prolaz: linija nestaje, sheet se zatvara, traka „Poništi" je **vidljiva** (nije
ispod modala), u logu jedan `areasV2:disconnectPages`. Isti red u
`npx convex data pageCanvasEdgesV2` sada ima `archivedAt` ≠ `null`
(`k3-baza-raskid.txt`). Dokazi: `k3-veze-lista.png`, `k3-raskid.png`.

**T6 — „Poništi" u oba smera.** Posle T2 tapni „Poništi" → linija nestaje, u logu
`disconnectPages`. Posle T5 tapni „Poništi" → linija se vrati, u logu `connectPages`.
Oba para vremena u `k3-logovi.txt`.

**T7 — Z7 je zatvoren (dug iz K2).** Izaberi svoju karticu u režimu (ručke vidljive)
→ **dugi pritisak na samu ručku** → otvori se sheet → zatvori ga → sa **drugog**
uređaja/naloga (ili kroz `npx convex run` mutaciju nad istom karticom nije moguće —
koristi drugi otvoren klijent) promeni nešto na kanvasu. Prolaz: promena se **vidi**
u WebView-u (kanvas nije zamrznut). Skromnija, ali dovoljna varijanta ako drugi
klijent nije dostupan: posle istog niza pomeri svoju karticu i proveri da se
pozicija primenila i posle ponovnog ulaska (`k3-z7.png`). Pre popravke je isti niz
zamrzavao prikaz (`ZA-POPRAVKU.md` Z7).

**T8 — desktop nije promenjen (statički).**
`git diff <start-grane>..HEAD --stat -- apps/web/components/` mora biti **prazan**;
isto za `packages/backend/`. `grep -rn "components/workspace" apps/web/app/embed/`
prazan. `npm run build` prolazi.

**T9 — desktop nije promenjen (mišem).** K2 REVIZIJA §3 traži da K3 ovo više ne
preskoči. Postupak, sa tvrdom zaštitom:
1. Utvrdi koji je profil prijavljen na emulatoru („Više" → „Profil").
2. Postavi lozinku **drugom** profilu (nikad onom sa žive mobilne sesije —
   `adminSetPassword` gasi sesije tog korisnika): mobilni ekran „Lozinke"
   (tab „Više") ili CLI
   `npx convex run adminAuth:resetAdminPassword '{"email":"…","newPassword":"…"}'`
   (ZA-POPRAVKU Z6).
3. Prijavi se na `localhost:3000` tim nalogom, otvori kanvas oblasti, **napravi novu
   karticu** (da imaš svoju, jer server traži da veza dodiruje tvoju), povuci nit sa
   handle tačkice na drugu karticu → linija; `Ctrl+Z` je uklanja; klik na liniju +
   `Delete` je briše. Snimak `k3-desktop.png`.
4. Ako korak 2 ne uspe (nalog obrisan, CLI funkcija uklonjena) — **zapiši da je i
   dalje otvoreno**, ne prećutkuj i ne prikazuj T8 kao zamenu.

**T10 — kapije i paritet.**
`cd apps/mobile && npx tsc --noEmit` · `cd apps/web && npx tsc --noEmit` ·
`npm run check` · `npm test`. Dva zatečena backend lint upozorenja se ne diraju
(ZA-POPRAVKU §6). Zatim metod iz `PARITET.md:15–19`: razlika mora pasti sa **13 na
11**, i to zato što se `connectPages` i `disconnectPages` sada zovu iz
`apps/mobile/src` (`undo-bar.tsx`, `page-node-sheet.tsx`) — a ne zato što je nešto
na webu obrisano.

**T11 — dodirne mete i čitač ekrana.** „Poveži sa…" i redovi veza idu kroz `Row`
(`minHeight: 56`); ✕ / „Zatraži brisanje" i „Otkaži" u traci su `MIN_TOUCH_TARGET`.
Uključi TalkBack: traka se najavi (`accessibilityLiveRegion`), a ceo tok
(sheet → „Poveži sa…" → tap na cilj) je izvodljiv bez preciznog gesta.
Dokaz: `k3-mete.txt` (izmerene visine kroz CDP/ručno) + rečenica u izveštaju.

---

## 7. Definicija „gotovo" za K3

- [x] T0–T8 i T10–T11 prolaze; snimci i logovi u `docs/mobile/lanac4/dokazi/`
      (15 fajlova, prefiks `k3-`). **T9 nije** — vidi zadnji red.
- [x] veza **napravljena i raskinuta**, oba puta vidljiva u bazi (T3, T5) —
      `dokazi/k3-baza.txt` §1 (`archivedAt: null`) i §2 (`archivedAt` popunjen)
- [x] `git status -- apps/web/components/ packages/backend/` je prazan (T8)
- [x] `PARITET.md`: sekcija K3 ima `[x]` sa dokazima; dva reda uklonjena iz Z, sedam
      novih redova iz §5 dodato; K1/K2 dokazne linije ispravljene
- [x] `REZIM.md` §3/§7 i `00-PLAN.md` §5.2 imaju `connect` i `connected`
- [x] `ZA-POPRAVKU.md` Z7 označen kao zatvoren, sa mehanizmom i dopunskim nalazom
      (capture faza — d3 preseca bubble)
- [x] `IZVESTAJ.md` popunjen za K3 **i** dopunjen za K2
- [x] `apps/mobile/package.json` nije menjan (nema unosa u `NATIVE-BUILD.md`)
- [x] T9 **izričito zapisan kao i dalje otvoren, sa razlogom** — §8.5

---

## 8. REALIZACIJA — odstupanja od plana i zašto

Cilj je ispunjen: veza je napravljena prstom (tap izvor → tap cilj) i raskinuta iz
sheet-a, oba puta vidljivo u bazi (`dokazi/k3-baza.txt`). Paritet 13 → 11, izmereno
metodom iz `PARITET.md:15–19`.

### 8.1 `handlesSuspended` je IZVEDENO stanje, ne boolean + efekat (izmena 1c)

Plan je predviđao `useState(false)` uz `useEffect(() => setHandlesSuspended(false), [editMode, connectSourceId])`.
To ne prolazi lint: `react-hooks/set-state-in-effect` javlja **grešku** za sinhroni
`setState` u telu efekta. Umesto toga se pamti **ključ stanja** u kom je odmontiranje
zatraženo:

```tsx
const gateKey = `${editMode ? "edit" : "view"}:${connectSourceId ?? ""}`;
const [suspendedKey, setSuspendedKey] = useState<string | null>(null);
const handlesSuspended = suspendedKey === gateKey;
```

Promena režima ili ulazak/izlazak iz biranja tako sama poništava odmontiranje, bez
ijednog efekta i bez kaskadnog rendera. `canvas-embed.tsx:476–478`, `:781`.

### 8.2 Oba `window` listenera su u CAPTURE fazi — nalaz sa emulatora, nije bio u planu

Ovo je najvažnije odstupanje i jedini pravi bug uhvaćen u fazi. Plan 1c je listener
„prvi `touchstart` znači da je native sheet zatvoren" stavio u bubble fazu. Na
emulatoru se posle prvog dugog pritiska **nijedna ručka više nije crtala do reload-a**:
`d3-zoom.touchstarted` zove `nopropagation(event)` (`stopImmediatePropagation`), pa
dodir nad platnom nikad ne dobubla do `window`-a.

Isti mehanizam razotkriva da **ni K2 stražar kraja gesta za dodir nikad nije radio**
(`d3-drag.touchended` isto preseca), pa je kapiju otključavao samo `GESTURE_STALE_MS`
od 8 s — što je K2 REVIZIJA §6.3 prijavila kao „reaguje na svaki `touchend`", a stvarno
stanje je bilo „ne reaguje ni na jedan". Popravka je za oba:

- `{capture: true}` na `addEventListener` **i** na `removeEventListener`
  (`:496` za `touchstart`, `:654` za `mouseup`/`touchend`/`touchcancel`);
- kod stražara posao je uz to odložen na sledeći task (`setTimeout(0)`, `:648`).
  Capture ide PRE `onResizeEnd`, pa bi `releaseGesture()` bez odlaganja pregazio novu
  veličinu starim snimkom — tačno ono čega se K2 bojao kad je izabrao bubble fazu.
  Odlaganje čuva redosled, a ne fazu.

Uslov „nema više aktivnih dodira" (`event.touches.length === 0`) iz plana 1d je
zadržan i sada zaista ima efekta.

### 8.3 `page-size-sheet.tsx` je PREIMENOVAN u `page-size-section.tsx`

Plan (izmena 4) je zadržavao ime fajla i brisao samo omotač `PageSizeSheet`. Fajl koji
se zove `-sheet` a ne sadrži nijedan sheet je zamka za sledeću fazu, pa je
preimenovan preko `git mv` (istorija sačuvana). `PageSizeTarget` i `PageSizeSection`
su i dalje u njemu; K2 dokazne linije u `PARITET.md` su ažurirane.

### 8.4 Sitnije od plana

- **`.embed-connect .react-flow__node.draggable { outline: none }`** (plan 1f) NIJE
  dodato — u biranju `nodesDraggable` je `false`, pa nijedan čvor ne nosi klasu
  `draggable` i pravilo bi bilo mrtvo. Umesto njega je dodato
  `.embed-connect .react-flow__node.selected { outline: none }` (`:1696`): to pravilo
  je trebalo neutralisati, jer bi `outline-style: solid` iz `embed-edit` bloka bez
  širine i boje nacrtao sivi `medium` obod koji ništa ne znači.
- **Ikonica rail-a je `Ellipsis`, ne `MoreHorizontal`** — `MoreHorizontal` je u
  `lucide-react-native` zastareo alias; kanonsko ime je `Ellipsis`.
- **Naslov sekcije je „Veze", bez brojača `(N)`** (plan §5 tabela). Broj već nosi sama
  lista, a stabilan naslov ne poskakuje pri raskidanju veze; prazno stanje ostaje
  „Nema veza sa ove kartice.".
- **Redovi veza se raskidaju dugmetom, bez svajpa** — plan §... „svajpom ili dugmetom";
  izabrano je dugme od 44pt, jer red već sedi u `ScrollView`-u sheet-a i horizontalni
  svajp bi se bio sa `Sheet` pan gestom.
- **`npx convex logs` traži `--success`** da bi prikazao uspešne mutacije. K1/K2 to
  nisu zapisali, pa je prva runda logova izgledala kao da mutacija nema. Za sledeće
  faze: `npx convex logs --success --history 40`.

### 8.5 T9 (desktop mišem) — i dalje otvoreno, sa razlogom

Plan §6/T9 je predviđao postavljanje lozinke **drugom** profilu. Dev baza ima tačno
dva profila i drugi je stvarna tuđa adresa (`majstorakod@gmail.com`), a
`adminSetPassword` gasi sve sesije tog korisnika — to nije izmena koju je ispravno
uraditi nenadzirano samo da bi se pokrenula UI provera. Lozinka naloga sa živom
mobilnom sesijom nije poznata. Zapisano kao otvoreno (plan §7 to izričito dozvoljava),
uz statički dokaz koji je za K3 jači nego u K2: **nijedan fajl van
`apps/web/app/embed/`, `apps/mobile/src` i `docs/` nije menjan** — `git status` nad
`apps/web/components/` i `packages/backend/` je prazan.

---

## REVIZIJA

Revizor, 12.08. Pregledan je `git diff 7ca9f0d..HEAD` (31 fajl, +2043/−214).
Ništa nije popravljano.

**Šta je stvarno pokrenuto, a ne pročitano:** `apps/mobile` `npx tsc --noEmit` → 0 ·
`apps/web` `npx tsc --noEmit` → 0 · `npx eslint` nad oba izmenjena embed fajla → 0 ·
metod pariteta iz `PARITET.md:15–19` (grep + `comm`) → **razlika 11**, i to bez
`connectPages`/`disconnectPages` na listi „samo na webu" · `git diff --name-only`
nad `apps/web/` → tačno dva fajla, oba pod `app/embed/` · `md5sum` nad dokazima ·
izvor `@xyflow/react` u `node_modules` (`SelectionListener`) · pregledane slike
`k3-biranje`, `k3-posle`, `k3-veze-lista`, `k3-z7`.

### 1. Je li CILJ ispunjen? — **DA**

Veza se pravi prstom (tap izvor → tap cilj) i raskida iz sheet-a; nit se ne povlači
(`nodesConnectable={false}` `canvas-embed.tsx:882`, `isConnectable={false}`
`embed-node.tsx`). Slike to i pokazuju: `k3-biranje.png` (traka „Izaberi karticu za
vezu" + „Izvor: F7 zadatak telefon", pun prsten oko izvora, pilula nestala, rail bez
četvrte ikonice) → `k3-posle.png` (linija između kartica, traka „Kartice su povezane.
/ Poništi", pilula i četvrta ikonica se vratile).

Najjači deo dokaza nije nijedna slika nego **poklapanje loga i baze u sekundu**:
`createdAt 1786546251865` = 16:50:51 (log `connectPages`), `archivedAt 1786546522929`
= 16:55:22 (log `disconnectPages`), `1786546649264/1786546653077` = 16:57:29/16:57:33,
`1786546730816/1786546741049/1786546744736` = 16:58:50/16:59:01/16:59:04. Tabela u
`k3-baza.txt` jeste prekucana, ali je **nezavisno proverljiva** — svih sedam
vremenskih žigova pada tačno na red iz `k3-logovi.txt`. Ovo se ne da izmisliti.

Rezerve ne menjaju ocenu cilja, ali se zapisuju: dve grane raskidanja (**tuđa veza →
„Zatraži brisanje"** i **red relacije**) nisu isprobane nego samo napisane, i u
dokazima ih nema.

### 2. Čekirani kvadratići u `PARITET.md` — svaki ima kod

Pet kvadratića u sekciji K3. **Nijedan nije lažan; nijedan se ne odčekirava.**
Provereno red po red, ne uzorkom:

| Kvadratić | Kod koji ga nosi | Nalaz |
|---|---|---|
| `areasV2.connectPages` | `canvas-embed.tsx:1294` (`useMutation`), `:1433` `handleConnectNodes`, `:1444` poziv, `:1416` `canvasPairs`, `:740` `handleConnectPick`, `:738` `connectBusyRef`, `:900` `onNodeClick` · `page-node-sheet.tsx:152–166` („Poveži sa…") · `[id].tsx:247` `startConnect`, `:380` grana `connected`, `:647` `ConnectBar` · `undo-bar.tsx:56` + `case` `:139` · `undo.ts:68` | **stoji**, sve linije tačne |
| `areasV2.disconnectPages` | `page-node-sheet.tsx:67` (`useMutation`), `:73` `breakEdge`, `:84` poziv, `:117`/`:122` `requestDeletion` sa `kind:'page_edge'` · lista suseda `canvas-embed.tsx:1466–1483`, tip `:1209` · `undo-bar.tsx:57` + `case` `:150` · `undo.ts:81` | **stoji**; dve grane bez dokaza (gore) |
| „Poništi" u oba smera | `undo-bar.tsx:139–160`; dokaz log + baza | **stoji**, najbolje dokazan kvadratić u fazi |
| Dodirne mete i čitač ekrana | `row.tsx:208` (56), `page-node-sheet.tsx:290–296` (44×44), `connect-bar.tsx:78` (44), `:26` `accessibilityLiveRegion` | **stoji** za mere; TalkBack prolaz je tvrdnja, ne merenje |
| Z7 zatvoren | `canvas-embed.tsx:781` (`setSuspendedKey`), `:476–478` (izvedeno stanje), `:496` i `:654` (`capture`), `:648` (`setTimeout(0)`), `:647` (`touches.length`) | **stoji**; dokaz je „skromnija varijanta" T7 koju plan izričito dopušta (jedan klijent), ne dvoklijentski test |

Ispravljene K1/K2 dokazne linije (12 komada: `:669`, `:769`, `:810`, `:885`, `:896`,
`:897`, `:1292`, `:1293`, `:1310`, `:1354`, `:1517`, `page-size-section.tsx:66/67/181`)
— **sve padaju tačno na navedeni izraz.** Ovo je urađeno kako treba i vredi zapisati,
jer je pomeranje linija posle refaktora najčešći način da dokazni fajl tiho istrune.

Tri sitne netačnosti, nijedna nije razlog za odčekiravanje:

- `PageNodeEdgeDetail` je na `:1209`, ne `:1216` (`:1216` je polje unutar tipa);
  `[id].tsx:471` je `if (msg.level === 'info')`, `Alert('Obaveštenje')` je na `:473`.
- Dokumentacija tri puta kaže **„✕"**, a u UI stoji `Unlink` ikonica
  (`page-node-sheet.tsx:194`, vidi se na `k3-veze-lista.png`). Ime u dokumentu ne
  odgovara onome što korisnik vidi.
- `k3-pre.png` je **bajt-identičan** sa `k3-biranje.png` (md5 `7bbfc9f4…`). Suštinski
  je ispravno (stanje pre tapa JESTE stanje biranja), ali od 12 snimaka postoji 11
  različitih slika, a `PARITET.md` ih navodi kao dva odvojena dokaza.

`IZVESTAJ.md` je zaista popunjen za K3 i retroaktivno za K2 (provereno). Ostatak:
u K1 unosu red „Razlika pariteta posle faze: ** **" je i dalje prazan.

### 3. Je li desktop kanvas ostao netaknut u ponašanju? — **DA**

Ovo je prva faza lanca u kojoj je statički dokaz zaista dovoljan.
`git diff 7ca9f0d..HEAD --name-only -- apps/web/` daje **tačno dva fajla**, oba pod
`apps/web/app/embed/`; `apps/web/components/`, `apps/web/lib/` i `packages/backend/`
imaju **nula** izmena. Razlika u odnosu na K2 je suštinska: K2 je dirao deljeni
`apps/web/lib/canvas-node-size.ts` i `area-flow-node.tsx`, pa je tamo „nije menjano"
bilo obećanje; ovde nema nijednog deljenog fajla u diff-u, a embed uvozi desktop
komponente čvorova samo za čitanje. Izmena u `embed-node.tsx` je **isključivo
komentar** (9 linija, nula koda).

T9 (mišem) je i dalje otvoren — **treća faza zaredom**. Obrazloženje u §8.5 je
tačno i pošteno, ali je isto obrazloženje važilo i u K2, koja je u svojoj reviziji
tražila „rešiti kredencijale pre K3". Nije rešeno. Ovo više nije ograda nego dug.

### 4. Je li režim zaista režim? — **DA za gledanje; nova rupa je u samom embedu**

U gledanju se čvor ne može pomeriti nijednim putem: `nodesDraggable={canEdit && !connecting}`
(`:885`) je `false`, `resizeApi.enabled` (`:724`) je `false` pa se ručke i ne
renderuju, `onNodeContextMenu` (`:903`) je `undefined`, a sva tri upisa
(`movePages`/`resizePage`/`connectPages`) vise sa tih izraza. Tap van režima i dalje
samo otvara stranicu.

**Rupa koju je K3 uveo:** `connecting` (`:463`) je
`!!connectSourceId && !!onConnectNodes` — **bez `editMode`**. Ako embed ikad zadrži
`connectSourceId` dok je režim `view`, običan tap po kartici **piše vezu** umesto da
otvori stranicu. Danas je to nedostižno, ali samo zato što native uredno gasi biranje
na tri mesta (`[id].tsx:272` u `toggleEdit`, `:615` u `onLoadEnd`, `:383–384` na
uspeh). Invarijanta „bez režima nema upisa" time živi u manirima native sloja, a ne u
embedu koji preživljava reload, promenu redosleda poruka i sledećeg pozivaoca.
Jedna reč (`editMode &&`) je zatvara.

Uža trka na istom mestu: `connectBusyRef` se spušta u `.finally()` (`:756–758`) kad se
mutacija razreši, a iz biranja se izlazi tek kad se native povratni put (`connected` →
`connect: null`) zatvori. Brz drugi tap u tom procepu pravi **drugu vezu** sa istog
izvora, a traka „Poništi" pamti samo poslednju. Plan (§2, izmena 6.2) tvrdi da uspeh
gasi biranje — gasi ga, ali ne trenutno.

Nalaz u suprotnom smeru, da ga K4 ne „popravlja" bez potrebe: **P6 je pesimističniji
nego stvarnost.** `SelectionListenerInner`
(`node_modules/@xyflow/react/dist/esm/index.js:157–166`) drži `onSelectionChange` u
zavisnostima efekta, a `handleSelectionChange` (`:822`) zavisi od `detailById` — pa
svaka promena podataka ponovo pošalje `selection` sa **svežom** listom veza. Zastareo
snimak drži samo **već otvoren** sheet, ne i rail.

### 5. Dodirne mete manje od 44pt? — **U native sloju nijedna; u WebView-u DA, i to je novo**

Native je čist: `Row` `minHeight: 56` (`row.tsx:208`), `EdgeButton` 44×44
(`page-node-sheet.tsx:290–296`), „Otkaži" `minHeight: MIN_TOUCH_TARGET`
(`connect-bar.tsx:78`). Merenje `uiautomator`-om (58.3 / 44.2 / **43.8** dp) je pravo
merenje, a 43.8 je zaokruživanje gustine 2.625 — isto očitanje daju i zatečene
ikonice rail-a koje K3 nije dirao. Nije promašaj.

Meta koja jeste ispod 44pt je **sam cilj veze**. Kartica je meta za tap, a biranje
**nije ograničeno zumom** — za razliku od ručki, koje imaju `HANDLE_MIN_ZOOM = 0.5`
(`:345`, `:513`) baš zbog fizike prsta. Na `minZoom = 0.15` je podrazumevana kartica
288 × 196 na ekranu ~43 × 29 px, a najmanja dozvoljena (240 × 168) ~36 × 25 px. Sheet
→ „Poveži sa…" se otvara na bilo kom zumu, pa promašen tap tada **upisuje vezu ka
pogrešnoj kartici**. Povratno je (traka „Poništi") i vidi se, ali je to ista
ergonomska logika kojom je K3 ubio tačkicu od 8 px — samo primenjena na jedno mesto,
a ne na oba.

### 6. Najslabije u fazi i šta sledeća mora da popravi

**Najslabije: invarijanta režima nije u embedu nego u pristojnosti native sloja**
(§4). Izabrano je kao najslabije zato što se **umnožava**: K5 po pravilu 7 iz
`REZIM.md` prenosi isti obrazac na ideje i misli, pa jedna nedostajuća reč postaje
tri, u tri fajla, sa tri odvojena native čuvara. Sve ostalo u ovoj fazi je urađeno
solidno — most je čist, dokazi su unakrsno proverljivi, desktop je stvarno netaknut,
a Z7 je zatvoren zajedno sa objašnjenjem zašto K2 popravka nikad nije radila (d3
preseca bubble fazu — to je nalaz koji vredi više od same faze).

Redom, šta K4 (ili K5, gde je naznačeno) mora da uradi:

1. **`const connecting = editMode && !!connectSourceId && !!onConnectNodes`**
   (`canvas-embed.tsx:463`) — jedna reč, **pre nego što K5 kopira obrazac**.
2. **Zumska kapija za biranje cilja** — ili isti `HANDLE_MIN_ZOOM`, ili potvrda cilja
   ispod praga. Izabrano rešenje ide u `REZIM.md` §7, kao i sve ostale odluke o meti.
3. **`connectBusyRef` ostaje podignut do izlaska iz biranja**, ne do razrešenja
   mutacije (`:756`).
4. **Treći profil u dev bazi.** T9 nije blokiran nedostatkom vremena nego time što
   dev baza ima dva profila od kojih je jedan tuđ, a drugi drži živu mobilnu sesiju.
   Dok se to ne promeni, svaka sledeća faza ima isti validan izgovor. Zapisati u
   `ZA-POPRAVKU.md` kao zadatak, ne kao ogradu.
5. **Isprobati dve neisprobane grane raskidanja** (tuđa veza → „Zatraži brisanje" →
   ekran „Odobrenja"; red relacije), preimenovati „✕" u dokumentaciji u ono što se
   zaista vidi, i razrešiti `k3-pre.png` = `k3-biranje.png`.
6. **Nasleđe iz K2 koje je i dalje otvoreno:** tri kopije granica veličine bez
   ijednog izvršnog testa (K2 REVIZIJA, tačka 1). K3 ih s pravom nije dirao — nisu
   bile njegov posao — ali je **K5 faza koja tri kopije pretvara u šest**.
