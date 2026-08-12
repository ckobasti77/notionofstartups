# Faza K2 — Veličina kartice (resize)

**Cilj:** u režimu „Uredi raspored" prstom menjaš veličinu stranice na kanvasu i
možeš da je vratiš na podrazumevanu.

**Dobija se:** `api.areasV2.resizePage`, `api.areasV2.resetPageSize`
(razlika pariteta 15 → 13).

---

## 1. Šta je pročitano i šta je zatečeno

### Pročitano

`PARITET.md` (metod `:15–19`, sekcija K `:635`, Z redovi `:719–720`) ·
`ZA-POPRAVKU.md` (Z1–Z4, §5.13, §6) · `00-PLAN.md` §5.2 · `lanac4/OSNOVA.md` ·
`lanac4/REZIM.md` (ceo — K2 se kači na njega) · `planovi/faza-k1.md` (naročito
REVIZIJA §6, koja K2 zadužuje za jednu popravku) ·
`node_modules/@xyflow/react@12.11.2` (`NodeResizeControl`, `XYResizer`,
`style.css`) — jer od toga zavisi da li se resize piše ručno ili ne.

### Zatečeno — činjenice sa linijama

| Šta | Gde | Stanje |
|---|---|---|
| Režim + povlačenje kartice | `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx:362` (`canEdit`), `:516` (`nodesDraggable`), `:400–443` (`onNodeDragStop`) | **gotovo (K1) — resize se kači na isti obrazac** |
| Gate „živi upit ne gazi prst" | isti fajl, `:358–360`, `:364–372` (`draggingRef`/`pendingRef`), `adoptIncoming` `:296–311` | postoji — **proširuje se na veličinu** |
| Upis pozicije + `moved`/`toast` most | isti fajl, `:881–917` (`handleMoveNodes`) | postoji — resize dobija blizanca |
| Detalj čvora ka native-u | isti fajl, `PageNodeDetail :820–824`, `detailById :941–947` | postoji — **dopunjuje se sa `canResize`/`width`/`height`/scope** |
| `selection` poruka | isti fajl, `:470–482` | postoji — nosi `node` kad je izabran baš jedan čvor |
| CSS embeda | isti fajl, `EmbedStyles :1087–1115` | postoji — ovde idu stilovi ručke |
| Čvor embeda (nema nikakvu ručku) | `.../embed-node.tsx:46–79` | K1 ga nije dirao; **K2 mora** |
| Desktop resize (miš, radijalni obod) | `apps/web/components/workspace/canvases/perimeter-resize-control.tsx` (382 linije) + `perimeter-resize-geometry.ts` | **ne dira se i ne uvozi se** — vidi §5 |
| Desktop granice, tvrdo ukucane | `apps/web/components/workspace/canvases/area-flow-node.tsx:284–287` | 240 / 168 / 720 / 1000 → **izdvaja se u modul** |
| Desktop upis + undo | `apps/web/components/workspace/area-canvas-view.tsx:357–358`, `:1778–1888` | referenca za semantiku (undo reseta = `resizePage` sa starim dimenzijama) |
| Native ljuska, `onMessage` | `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx:265–351` | grane `moved`/`viewport`/`toast` postoje |
| Rail (3 ikonice + prekidač režima) | `apps/mobile/src/components/canvas/canvas-rail.tsx:75–90` | u režimu je 4. slot **slobodan** (ikonica „Uredi raspored" se sklanja, `:85`) |
| Traka „Poništi" | `apps/mobile/src/lib/undo.ts:20–43`, `components/undo-bar.tsx:84–121` | **proširuje se novim članom, ne pravi se druga** |
| Primitivi za sheet | `components/ui/sheet.tsx:74` (`visible`/`onClose`), `components/ui/row.tsx:75` | postoje — koristiti ih |

### Backend — sve postoji, nula izmena

- `resizePage` — `packages/backend/convex/areasV2.ts:2399`; prima
  `{startupId, areaId, rootPageId, pageId, width, height, x?, y?}`; `x`/`y` su
  **oba ili nijedan** (`:2425`), klamp `clamp(w, MIN_WIDTH, MAX_WIDTH)` (`:2442`),
  `assertOwnedPage` baca „Možete menjati veličinu samo svoje kartice." (`:2424`).
- `resetPageSize` — `:2450`; briše `width`/`height` iz placement-a, pozicija ostaje.
- Granice: `MIN_WIDTH 240` / `MIN_HEIGHT 168` / `MAX_WIDTH 720` / `MAX_HEIGHT 1000`
  (`areasV2.ts:85–88`). Podrazumevana veličina: `288×196`
  (`canvasPlacement.ts:4–5`).
- Payload već nosi `pages[].canResize` (`areasV2.ts:1637`) i `width`/`height`
  (`:1634–1635`). **Nijedan nov upit nije potreban.**

### Zatečeno u xyflow (proverено u `node_modules`, ne pretpostavljeno)

- `NodeResizeControl` postoji u 12.11.2 i prima `position` (`top-left`…),
  `minWidth/minHeight/maxWidth/maxHeight`, `onResizeStart/onResize/onResizeEnd`,
  `className`, `style`, `children`.
- Renderuje se sa klasom `nodrag` (`@xyflow/react/dist/esm/index.js:4939`), a
  `XYResizer` koristi `d3-drag` (`@xyflow/system/dist/esm/index.js:3386`), koji na
  `touchstart` zove `stopImmediatePropagation` → **ni čvor ni platno ne vide taj
  dodir** (isti mehanizam koji je K1 dokazao za povlačenje).
- Koordinate su zumo-svesne (`getPointerPosition` sa `transform`), pa se ništa ne
  računa ručno.
- Promena veličine ide kroz `triggerNodeChanges` → `onNodesChange` (koji `EmbedFlow`
  već ima, `:504`), a `node.width` pobeđuje `node.style.width`
  (`index.js:2035`, `:2347–2348`) — dakle uživo se vidi bez ijedne izmene mapera.
- `autoScale` (podrazumevano `true`) skalira ručku sa `Math.max(1/zoom, 1)`
  (`:4800`), pa ručka na ekranu **nikad nije manja** od svoje CSS veličine.

### Šta je već urađeno → izbačeno iz plana

- Režim, most, `mode` posle `onLoadEnd`, obod + pilula, haptika, safe-area.
- Prazno / učitavanje / greška — postoje i u embedu (`canvas-embed.tsx:543–550`,
  `:1027`, `error.tsx`) i u native ljusci (`[id].tsx:477–493`, timeout `:214–218`).
  **K2 ne dodaje nijedno novo stanje jer nijedno ne fali.**
- Traka „Poništi" i njen store — samo nov član unije.
- Memoizacija `source`/`injectedAuth`/`style` (Z1) — ne dirati.

---

## 2. Redosled izmena

Redosled je izabran tako da `tsc` prolazi posle svakog koraka.

### Izmena 1 — NOV `apps/web/lib/canvas-node-size.ts`

**Zašto:** granice veličine kartice stranice trenutno postoje na dva mesta
(backend `areasV2.ts:85–88` i desktop `area-flow-node.tsx:284–287`). Embed bi bio
treće. Pravilo lanca traži zajednički modul.

```ts
/** Granice veličine kartice stranice na kanvasu.
 *  MORAJU da prate `packages/backend/convex/areasV2.ts:85–88` (server klampuje). */
export const PAGE_NODE_SIZE = {
  minWidth: 240,
  minHeight: 168,
  maxWidth: 720,
  maxHeight: 1_000,
  defaultWidth: 288,   // canvasPlacement.ts:4
  defaultHeight: 196,  // canvasPlacement.ts:5
} as const;
```

Bez uvoza iz `packages/backend` (web ne uvozi backend module) — sinhronizacija je
komentar + test T7.

### Izmena 2 — `apps/web/components/workspace/canvases/area-flow-node.tsx`

**Zašto:** da modul iz izmene 1 zaista bude zajednički, a ne treći prepis.

Samo `:284–287`: četiri literala → `minWidth={PAGE_NODE_SIZE.minWidth}` itd.
**Vrednosti su identične — ovo je jedina izmena u `components/workspace/` u celoj
fazi i mora da bude vidljiva u `git diff` kao zamena literala.** Ništa drugo u
tom fajlu, ni u `perimeter-resize-control.tsx`, se ne dira.

### Izmena 3 — `apps/web/app/embed/canvas/[kind]/[id]/embed-node.tsx`

**Zašto:** ručka mora da bude unutar komponente čvora (xyflow je tu očekuje).

1. `EmbedNodeData` dobija `canResize?: boolean`.
2. Nov kontekst (u istom fajlu, da ga i `canvas-embed.tsx` uvozi):

```tsx
export type EmbedResizeApi = {
  enabled: boolean;                       // režim + postoji handler + zum ≥ praga
  onStart: () => void;
  onEnd: (nodeId: string, before: Box, after: Box) => void;  // Box = {x,y,width,height}
};
export const EmbedResizeContext = createContext<EmbedResizeApi | null>(null);
```

3. U `EmbedNodeCard`: `const resize = useContext(EmbedResizeContext);`
   `const showHandles = !!resize?.enabled && !!data.canResize && selected && !data.ghost;`
   pa četiri kontrole:

```tsx
{showHandles && HANDLE_POSITIONS.map((position) => (
  <NodeResizeControl
    key={position}
    position={position}
    className="nopan nowheel"      // pojas uz xyflow-ov `nodrag`
    style={HANDLE_STYLE}           // modul-const, ne inline objekat
    minWidth={PAGE_NODE_SIZE.minWidth}
    minHeight={PAGE_NODE_SIZE.minHeight}
    maxWidth={PAGE_NODE_SIZE.maxWidth}
    maxHeight={PAGE_NODE_SIZE.maxHeight}
    onResizeStart={(_e, p) => { startRef.current = p; resize.onStart(); }}
    onResizeEnd={(_e, p) => { if (startRef.current) resize.onEnd(id, startRef.current, p); }}
  >
    <span className="embed-resize-dot" aria-hidden />
  </NodeResizeControl>
))}
```

`HANDLE_POSITIONS = ['top-left','top-right','bottom-left','bottom-right']` —
**bočne ručke se namerno ne prave** (zahtev zadatka).

`HANDLE_STYLE` (modul-const): `{ width: 44, height: 44, background: 'transparent',
border: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
touchAction: 'none' }`. Inline, **ne CSS klasa** — xyflow-ov
`.react-flow__resize-control.handle` ima specifičnost 0-2-0 i pobedio bi jednu klasu.

`id` dolazi iz `NodeProps` (`{ id, data, selected }`).

### Izmena 4 — `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx`

**Zašto:** ovde su čvorovi, most i scope.

**4a. Popravka nasleđena iz K1 REVIZIJE §6(a) — jedna linija.**
`handleMoveEnd` (`:449–469`) u programskoj grani izlazi bez pamćenja kamere, pa
prvi tap posle `[⌖]`/`[+]`/`[−]` (ili prvi tap na kanvasu bez zapamćene kamere)
upiše **programsku** kameru i time zauvek ugasi auto-`fitView`. Ispravka:

```tsx
if (event === null) { lastViewportRef.current = rounded; return; }
```
(zaokruživanje se pomera iznad tog `if`-a). Ulazi u K2 jer je K1 revizija to
izričito dodelila K2 i jer je u istoj funkciji koju faza ionako menja.

**4b. `adoptIncoming` (`:296–311`) prima i veličinu.**
Tip `overrides` postaje `Map<string, { position?: XYPosition; width?: number; height?: number }>`;
kad postoji `width`/`height`, postavlja se i `node.width/height` i `node.style` (da
ne ostane nesklad). Pozivi iz `handleNodeDragStop` se prilagode (`{ position }`).

**4c. `EmbedFlow` dobija resize.**
- Nov opcion prop `onResizeNode?: (nodeId: string, before: Box, after: Box) => Promise<void>`.
- `const canResize = editMode && !!onResizeNode;` — isti obrazac inertnosti kao
  `canEdit` (pravilo 7 iz `REZIM.md`: vrsta bez handlera ne dobija ni ručke).
- Prag zuma: `const zoomOk = useStore((s) => s.transform[2] >= HANDLE_MIN_ZOOM);`
  (`HANDLE_MIN_ZOOM = 0.5`). Selektor vraća **boolean**, pa se `EmbedFlow`
  rerenderuje samo kad prag pređe, ne na svaki frejm pinča.
- Vrednost konteksta kroz `useMemo`: `{ enabled: canResize && zoomOk, onStart, onEnd }`
  — bez memoizacije bi svaki render prezidao sve čvorove.
- `onStart` → `draggingRef.current = true` (isti gate, gest je gest).
- `onEnd` → `draggingRef.current = false`, isprazni `pendingRef` **sa override-om
  nove veličine**, pa `void onResizeNode(...).catch(rollback na before)` — doslovno
  isti oblik kao `handleNodeDragStop` (`:400–443`), uključujući to da poruku greške
  prikazuje pozivalac.
- Provera „da li se veličina uopšte promenila": `Math.round` na obe strane, izlaz
  ako su jednake (pravilo 3 iz `REZIM.md`).
- Provider se stavlja oko `<ReactFlow>` u istom omotaču (`:499`).
- **`nodesConnectable` ostaje `false`** (to je K3).

**4d. Dugi pritisak → native sheet.**
`onNodeContextMenu={canEdit ? handleNodeContextMenu : undefined}` na `<ReactFlow>`;
handler radi `event.preventDefault()` (gasi Android „izaberi tekst" iskačući meni)
i `postNative({ type: 'node:actions', nodeId: node.id, node: detailById.get(node.id) })`.
Ghost i čvor bez detalja se preskaču.

**4e. `PageCanvasView` (`:852–1014`) — jedini deo koji zna scope.**
- `const resizePage = useMutation(api.areasV2.resizePage)`.
- `PageNodeDetail` (`:820–824`) dobija `canResize`, `width`, `height`,
  `startupId`, `areaId`, `rootPageId`. Native tako iz **postojeće** `selection`
  poruke ima sve za sheet — bez novog upita i bez druge poruke.
- U maperu čvorova (`:949–965`): `data.canResize = page.canResize`.
- `handleResizeNode(pageId, before, after)`:
  ```ts
  await resizePage({ startupId, areaId, rootPageId, pageId,
    width: Math.round(after.width), height: Math.round(after.height),
    x: Math.round(after.x), y: Math.round(after.y) });
  postNative({ type: 'resized', startupId, areaId, rootPageId, pageId, before: {…zaokruženo} });
  ```
  na grešku: `postNative({type:'toast', level:'error', message})` **pa `throw`**
  (rollback je u `EmbedFlow`) — identično `handleMoveNodes`.
  `x`/`y` idu **uvek zajedno** (server `:2425`); ugaona ručka pomera gornji/levi rub
  pa pozicija jeste deo poteza.

**4f. `EmbedStyles` (`:1087–1115`) — tri pravila.**
```css
.embed-resize-dot {                 /* vidljivi deo ručke: 16px u 44px meti */
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--primary); border: 2px solid var(--background);
  box-shadow: 0 1px 3px rgb(0 0 0 / .35);
}
.embed-edit .react-flow__node {     /* dugi pritisak ne sme da hvata tekst */
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
.embed-edit .react-flow__node.selected { outline-style: solid; }  /* izabrana ≠ samo povlačiva */
```

### Izmena 5 — `apps/mobile/src/lib/undo.ts`

Nov član unije (obrazac se **proširuje**, ne duplira). Jedan član pokriva i
promenu veličine i reset, jer je inverz oba isti poziv `resizePage` sa
**prethodnim** dimenzijama (isto kao desktop, `area-canvas-view.tsx:1863–1870`):

```ts
| { kind: 'pageResize'; startupId: Id<'startups'>; areaId: Id<'startupAreas'>;
    rootPageId: Id<'pages'> | null; pageId: Id<'pages'>;
    width: number; height: number; x?: number; y?: number }
```

### Izmena 6 — `apps/mobile/src/components/undo-bar.tsx`

`const resizePage = useMutation(api.areasV2.resizePage)` + `case 'pageResize'` u
`restore` (`:84–121`): prosledi `x`/`y` samo ako su oba prisutna. Ostalo (tajmer,
busy brava, `Alert`) je zatečeno i ne dira se.

### Izmena 7 — NOV `apps/mobile/src/components/canvas/page-size-sheet.tsx`

**Zašto:** reset veličine (i jedini put do veličine koji ne traži precizan prst).
Koristi postojeće primitive `Sheet` + `Row` + `pushUndo` — nijedan nov obrazac.

Prop: `page: PageSizeTarget | null` (`{_id, title, canResize, width, height,
startupId, areaId, rootPageId}`) i `onClose`, `onApplied?(w,h)`.

Redovi (svi ≥56pt kroz `Row`):

| Red | Poziv | „Poništi" |
|---|---|---|
| „Umanji (−10%)" | `resizePage` sa `w*0.9`,`h*0.9`, klampovano na `PAGE_NODE_SIZE` | `pageResize` sa starim `w/h` |
| „Uvećaj (+10%)" | isto, `*1.1` | isto |
| „Vrati podrazumevanu veličinu" (`subtitle: '288 × 196'`) | `resetPageSize` | `pageResize` sa starim `w/h` |

Zaglavlje sheet-a: naslov stranice + trenutna veličina („Trenutno: 320 × 210").
`canResize: false` → sheet prikazuje samo objašnjenje „Veličinu može da menja
autor kartice." (ne prazna lista). Greška → `Alert` sa `accessErrorMessage`.
Uspeh → `haptics.success()` + `onClose()`.

**„Umanji/Uvećaj" nisu ukras:** oni su jedini put do promene veličine za čitač
ekrana i za mali zum (gde ručke nisu prikazane) — time se zatvara rupa koju je
K1 REVIZIJA §6(b) prijavila za pomeranje. Klamp je klijentski da se ne šalje
poziv koji server ionako odbije, ali server je i dalje merodavan.

### Izmena 8 — `apps/mobile/src/components/canvas/canvas-rail.tsx`

Nov opcion prop `nodeAction?: RailAction`, renderovan kao **4. `RailIcon`** u
grupi (`:75–90`) kad postoji. U režimu je taj slot slobodan (prekidač se sklanja,
`:85`), pa se dodirne mete ne menjaju: 4 × 44 + 3 × 8 + padding = isti račun kao
u K1, a primarno dugme je tada „Gotovo" (uvek staje).

### Izmena 9 — `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx`

1. `onMessage` (`:265–351`) dobija dve grane:
   - `node:actions` → `haptics.tap()` + `setSizeTarget(msg.node)` (otvara sheet).
   - `resized` → `haptics.success()` + `pushUndo({ label: 'Veličina kartice je promenjena.',
     action: { kind: 'pageResize', …scope, pageId, ...before } })`, i uz to
     **osveži lokalni `selectedNode`** (`width`/`height`) ako je
     to isti čvor — inače bi sheet posle povlačenja računao ±10% iz stare veličine.
2. Rail dobija `nodeAction` kad je `editMode && isPageKind && hasSingleSelection &&
   selectedNode.canResize`: `{ label: 'Veličina kartice', icon: <Scaling …/>,
   onPress: () => setSizeTarget(selectedNode) }`.
3. Montira se `<PageSizeSheet page={sizeTarget} onClose={…} onApplied={…} />` uz
   postojeće sheet-ove; `onApplied` osvežava `selectedNode` istim mehanizmom kao 1.
4. **Nijedan nov objektni prop na `<WebView>`** (Z1) — sve ide kroz `postMessage`.

### Izmena 10 — dokumentacija (isti commit)

- `docs/mobile/lanac4/REZIM.md` §3 — dve nove poruke (`node:actions`, `resized`) u
  tabelu „WebView → native"; §7 — nov prihvaćen limit (ručke ispod zuma 0.5).
- `docs/mobile/00-PLAN.md` §5.2 — iste dve poruke u tabelu mosta.
- `docs/mobile/PARITET.md` — sekcija K dobija `[x]` za `resizePage` i
  `resetPageSize` **sa dokazom fajl:linija**; iz Z tabele brišu se redovi `:719` i
  `:720`; u Z se dopisuje red iz §5 ove tabele (guma-selekcija veličine / bočne ručke).
- `apps/mobile/package.json` se **ne menja** (nema nove zavisnosti) → nema unosa u
  `NATIVE-BUILD.md`.

---

## 3. Prst ↔ miš: isti ishod, drugi pokret

| Ishod | Web (miš) | Telefon (prst) |
|---|---|---|
| Promeni veličinu kartice | povlačenje **oboda** kartice (`PerimeterResizeControl`, ~8px zona, skalira oko centra) | „Uredi raspored" → tap bira karticu → povlačenje jedne od **4 ugaone ručke** (44pt meta, 16px tačka) |
| Isti upis | `onResizeEnd` → `resizePage` (`area-canvas-view.tsx:1789`) | `onResizeEnd` → isti `resizePage`, **jedan upis na kraj poteza** |
| Fina promena bez povlačenja | strelice / `Home` / `End` nad obodom (`perimeter-resize-control.tsx:262–305`) | „Veličina kartice" u rail-u → „Umanji −10%" / „Uvećaj +10%" |
| Vrati podrazumevanu | stavka u toolbar-u čvora → `resetPageSize` (`:1853`) | dugi pritisak na karticu **ili** „Veličina kartice" u rail-u → „Vrati podrazumevanu veličinu" |
| Granice | 240/168 → 720/1000 (`area-flow-node.tsx:284–287`) | **iste**, iz `PAGE_NODE_SIZE` (izmena 1) + serverski klamp |
| Poništi | `Ctrl+Z` (`pushHistory`) | traka „Poništi" 8 s → `resizePage` sa starim dimenzijama |
| Kad se ne sme menjati | `disabled={!canResize}` | ručke se ne renderuju; sheet objašnjava zašto |

---

## 4. Šta može da pukne

**P1 — ručka se bije sa pomeranjem platna i sa povlačenjem kartice. (glavni rizik)**
Lanac odbrane, po redu:
1. `NodeResizeControl` nosi klasu `nodrag` (`index.js:4939`) → `XYDrag` filter
   odbija da počne potez čvora.
2. `d3-drag` na ručki na `touchstart` zove `stopImmediatePropagation`
   (`@xyflow/system:3386`), pa dodir ne stiže ni do d3-drag-a čvora ni do d3-zoom-a
   platna (oba su na precima).
3. Dodajemo i `nopan nowheel` u `className` — isto što desktop radi ručno
   (`perimeter-resize-control.tsx:346`).
4. `touchAction: 'none'` u `HANDLE_STYLE` — pregledač ne sme da uzme gest za skrol.
*Ako ipak pukne* (kartica se pomeri umesto da se skalira, ili platno klizne):
(a) proveri da li se ručka renderuje **iznad** čvora (`z-index`) i da dodir stvarno
pogađa nju — `adb shell input swipe` sa tačnim koordinatama ugla;
(b) povećaj `nodeDragThreshold` sa 5 na 10 (samo kod, jedan broj);
(c) krajnje: dok je čvor izabran u režimu, `draggable: false` za taj čvor —
pomeranje i skaliranje se tada ne dele istom karticom (pomeraj se radi pre
biranja). Mera (c) menja ponašanje K1 pa se uzima samo ako (a)+(b) ne prođu, i
zapisuje se u `REZIM.md`.

**P2 — četiri 44pt ručke pojedu malu karticu na malom zumu.** Na `minZoom={0.15}`
kartica od 288 px je ~43 px na ekranu, a ručke bi je potpuno prekrile i onemogućile
i biranje. Rešeno pragom `HANDLE_MIN_ZOOM = 0.5` (izmena 4c). Ispod praga put
postoji: rail → „Veličina kartice" → ±10%. **Ne rešava se smanjivanjem mete.**

**P3 — dugi pritisak ne stigne (iOS).** Android WebView (Chrome) šalje
`contextmenu` na dugi pritisak; WKWebView je nepouzdan. Zato dugi pritisak **nije
jedini put** — ista radnja je i u rail-u (izmena 9.2), koja radi na obe platforme.
Ako se na iPhone-u pokaže da `contextmenu` ne stiže, to se zapisuje kao poznato
ograničenje, ne popravlja hakom.

**P4 — živi upit gazi veličinu usred poteza.** Isti simptom kao P3 iz K1 (kartica
skoči nazad, obično baš posle uspešnog upisa). Rešeno time što `onStart` diže isti
`draggingRef` i što `adoptIncoming` sada prima i `width`/`height` override (4b).

**P5 — `resizePage` odbije `x` bez `y`.** Server baca „Pozicija kartice mora imati
i x i y koordinatu." (`:2425`). Zato se iz poteza šalju **oba**, a iz sheet-a
**nijedan** (sheet ne pomera karticu).

**P6 — klijentski i serverski klamp se raziđu.** Ako neko promeni `areasV2.ts:85–88`
a zaboravi `canvas-node-size.ts`, ručka bi dozvolila više nego server. Zaštita:
komentar u modulu + test T7 (grep poređenje brojeva), i činjenica da server i
dalje klampuje (najgori ishod je da se kartica „vrati" na klampovanu vrednost).

**P7 — regresija na desktopu.** Jedina izmena van embeda je zamena četiri literala
imenovanim konstantama iste vrednosti (izmena 2). Dokaz: T6.

**P8 — beskonačni reload WebView-a (Z1).** Nijedan nov objektni prop na `<WebView>`.

**P9 — okruženje.** Port 3000 ume da bude otet (Z3), `allowedDevOrigins` mora da
sadrži `10.0.2.2` (Z4). Provera od 10 s je prvi korak testa (T0). `expo lint` ne
radi — mobilna provera je `tsc`.

---

## 5. Šta NEĆU raditi (ide u sekciju Z fajla `PARITET.md`)

| Šta | Zašto |
|---|---|
| Bočne ručke (`top`/`right`/`bottom`/`left`) | Zahtev zadatka. Na telefonu se ne pogađaju, a četiri ugla + ±10% pokrivaju svaki ishod. |
| Prenos `PerimeterResizeControl` (radijalni obod) u embed | To je geometrija za miš koji lebdi nad obodom: ~8px zona, `pointermove` za kursor, skaliranje oko centra. Prstom je obod kartice isto što i sama kartica. `NodeResizeControl` daje isti ishod (`resizePage`) uz zumo-svesnu matematiku koju xyflow već ima. Desktop komponenta se **ne dira i ne uvozi**. |
| Zadržavanje odnosa stranica (`keepAspectRatio`) | Web ga nema; uvođenje bi značilo da isti potez daje različit rezultat na dva klijenta. |
| Veličina čvorova ideja i misli | K5. Granice su im druge (`idea-flow-node.tsx:141–144`, `thought-node.tsx:99–102`) i idu u isti modul tek tada. |
| Veličina checkpoint čvorova (`taskCheckpoints.resetCanvasSize`) | K4 — embed te čvorove uopšte ne crta. |
| Veze (`connectPages`/`disconnectPages`) | K3. `nodesConnectable` ostaje `false`. |
| Promena veličine više kartica odjednom | `resizePage` prima jednu karticu; grupni potez nema ni web. |
| Povlačenje ručke tastaturom u embedu | Desktop ima (`perimeter-resize-control.tsx:262`); nad WebView-om na telefonu nema tastature. Ekvivalent na telefonu su ±10% redovi u sheet-u — zato oni i postoje. |

---

## 6. Kako se dokazuje (konkretni testovi)

Android emulator, `npx convex logs` u drugom terminalu, snimci u
`docs/mobile/lanac4/dokazi/` (konvencija lanaca 2–4).

**T0 — okruženje.**
`curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/area/proba`
→ `200`. `404` = tuđi server na portu (Z3), prazno = server ne radi.

**T1 — ručke postoje i imaju 44pt. (dokazuje izmene 3 i 4c)**
Otvori oblast → „Uredi raspored" → tap na **svoju** karticu.
Snimak `k2-rucke.png`: četiri tačke u uglovima. Meru dokazati u DOM-u preko CDP
(`adb forward` + `Runtime.evaluate`):
`document.querySelector('.react-flow__resize-control').getBoundingClientRect()` →
`width ≥ 44 && height ≥ 44`. Izlaz u `k2-mere.txt`.

**T2 — povlačenje ručke menja veličinu, ne pomera platno. (P1)**
`adb shell input swipe` od koordinate donje-desne ručke ka spolja, 600 ms.
Snimci `k2-pre.png` / `k2-posle.png`. Prolaz: kartica je veća, ostale kartice se
**nisu pomerile** (platno miruje), a sama kartica nije promenila gornji-levi ugao.

**T3 — jedan upis po potezu.**
Tokom T2 `npx convex logs` sme da pokaže **tačno jedan** `areasV2:resizePage`.
Red se lepi u `k2-logovi.txt`.

**T4 — granice se poštuju.**
Povuci ručku maksimalno ka unutra pa maksimalno ka spolja. Prolaz: kartica staje
na 240×168 odnosno 720×1000; u logu **nema greške** (klijent je stao pre servera).
Vrednost pročitati iz DOM-a (`k2-mere.txt`).

**T5 — reset + „Poništi".**
Dugi pritisak na karticu → sheet → „Vrati podrazumevanu veličinu" → kartica je
288×196 (`k2-reset.png`), u logu `areasV2:resetPageSize`. Traka „Poništi" → tap →
kartica je opet u veličini pre reseta, u logu `areasV2:resizePage` sa **starim**
brojevima. Isto ponoviti za potez iz T2 (traka posle povlačenja).

**T5b — put bez dugog pritiska.** Tap na karticu u režimu → 4. ikonica rail-a
„Veličina kartice" → isti sheet (`k2-rail.png`). Ovo je i dokaz za P3 (iOS) i za
pristupačnost.

**T6 — desktop nije promenjen.**
`git diff apps/web/components/` sme da pokaže **isključivo**
`area-flow-node.tsx:284–287` (literal → `PAGE_NODE_SIZE.*`), i to sa istim
brojevima; `git diff --stat` mora imati tačno taj jedan fajl. Uz to
`grep -rn "components/workspace" apps/web/app/embed/` mora biti prazan (embed ne
uvozi desktop) i `npm run build` prolazi. **Ako u okruženju postoje web
kredencijali** (K1 ih nije imao — `faza-k1.md` §8.6), odraditi i ručno:
`localhost:3000` → kanvas oblasti → promeni veličinu kartice mišem po obodu,
`Ctrl+Z` je vraća → `k2-desktop.png`. Ako kredencijala nema, to se **zapisuje kao
i dalje otvoreno**, ne prećutkuje.

**T7 — klijentski klamp = serverski klamp.**
`grep -n "MIN_WIDTH\|MIN_HEIGHT\|MAX_WIDTH\|MAX_HEIGHT" packages/backend/convex/areasV2.ts`
i `apps/web/lib/canvas-node-size.ts` — brojevi moraju biti isti (240/168/720/1000).

**T8 — režim je i dalje režim.** „Gotovo" → ručke nestaju, tap na karticu otvara
stranicu, dugi pritisak **ne** otvara sheet (`k2-gotovo.png`).

**T9 — prag zuma.** Umanji na najmanje ([−] više puta) → ručke nestaju, kartica se
i dalje bira, rail i dalje nudi „Veličina kartice" (`k2-mali-zum.png`).

**T10 — popravka kamere iz K1 (4a).** Bez zapamćene kamere: tapni `[⌖]`, pa jednom
tapni po praznom platnu → u logu **nema** `areasV2:saveViewport`. (Pre popravke je
bio.) Red iz loga u `k2-logovi.txt`.

**T11 — kapije.**
`cd apps/mobile && npx tsc --noEmit` · `cd apps/web && npx tsc --noEmit` ·
`npm run check` · `npm test`. Dva zatečena backend lint upozorenja se ne diraju
(ZA-POPRAVKU §6).

**T12 — paritet.** Metod iz `PARITET.md:15–19`: razlika mora pasti sa 15 na **13**,
i to zato što se `resizePage` (`undo-bar.tsx`, `page-size-sheet.tsx`) i
`resetPageSize` (`page-size-sheet.tsx`) sada zovu iz `apps/mobile/src` — a ne zato
što je nešto na webu obrisano.

---

## 7. Definicija „gotovo" za K2

- [ ] T0–T12 prolaze; snimci i logovi u `docs/mobile/lanac4/dokazi/`
- [ ] `git diff apps/web/components/` sadrži samo zamenu literala (T6)
- [ ] `git diff packages/backend/` je prazan
- [ ] `PARITET.md`: sekcija K ima `[x]` sa dokazima; dva reda uklonjena iz Z, jedan
      nov red dodat u Z (bočne ručke)
- [ ] `REZIM.md` §3 i `00-PLAN.md` §5.2 imaju `node:actions` i `resized`
- [ ] `apps/mobile/package.json` nije menjan (nema unosa u `NATIVE-BUILD.md`)
- [ ] K1 REVIZIJA §6(a) zatvorena (4a + T10); §6(b) zatvorena za veličinu (±10% u
      sheet-u), za **pomeranje** i dalje otvorena i tako zapisana

---

## 8. REALIZACIJA — odstupanja od plana i zašto

Zapisano posle izvođenja (12.08.). Plan je sproveden u celini; ovo su razlike.

### 8.1 Mobilni je dobio SVOJ modul granica (`apps/mobile/src/lib/canvas-node-size.ts`)

Plan je predviđao samo `apps/web/lib/canvas-node-size.ts`. Ispostavilo se da native
sheet („±10%") takođe mora da klampuje, a mobilni ne sme da uvozi iz `apps/web`
(drugi paket, drugi bundler); backend konstante (`areasV2.ts:85–88`) nisu izvezene,
a uvoz tog modula bi u Metro bundle uvukao ceo serverski fajl. Zato su brojevi na
dva mesta, oba sa komentarom „mora da prati `areasV2.ts:85–88`" i oba pokrivena
testom T7. Alternativa (`packages/shared`) bi značila nov workspace paket — van
opsega faze koja ne sme da dira infrastrukturu.

### 8.2 Poruka `resized` nosi `previous` (ne `before`) i uz to NOVU veličinu

`moved` već koristi ime `before` za **niz** kartica. Isto ime sa drugim oblikom
(jedna kartica, sa `width`/`height`) bi u native parseru moralo da bude unija koja
laže o tipu. Zato `previous`. Nova veličina (`width`/`height` na vrhu poruke) je
dodata jer bez nje sheet posle povlačenja računa ±10% iz zastarele vrednosti —
plan to traži u izmeni 9.1, ali nije rekao kojim putem podatak stiže.

### 8.3 Dodata odbrana koje u planu nije bilo: kapija poteza koja se sama otključava

Plan (4c) je kapiju `draggingRef` dizao u `onResizeStart`, a spuštao u
`onResizeEnd`. Na uređaju se pokazalo da `onResizeEnd` **ne mora da stigne**:
xyflow ga zove samo ako je potez promenio dimenziju, a dugi pritisak na ručku
otvori native sheet posle kog WebView više ne dobija `touchend`. Rezultat je bio
zamrznut prikaz (kartica 288 × 196 na ekranu, 259 × 176 u bazi). Dodata su tri
sloja: stražar na `mouseup`/`touchend`/`touchcancel`, deterministično zatvaranje
gesta na `contextmenu`, i vremenski ventil `GESTURE_STALE_MS`. Pun opis:
`ZA-POPRAVKU.md` Z7. **Bez ovoga bi faza isporučila kanvas koji tiho prestane da
prikazuje tuđe izmene.**

### 8.4 Sitnije od plana

- Sheet dobija `Alert` „Granica veličine" kad je kartica već na min/max (plan je
  imao samo klamp) — tih poziv koji ništa ne menja izgleda kao kvar.
- Red „Vrati podrazumevanu veličinu" je `disabled` kad je kartica već 288 × 196,
  uz objašnjenje ispod liste.
- `k2-desktop.png` NIJE snimljen: u okruženju i dalje nema web kredencijala (isto
  kao K1 §8.6). Desktop je pokriven statički — `git diff apps/web/components/`
  sadrži isključivo zamenu četiri literala imenovanim konstantama iste vrednosti,
  `grep -rn "components/workspace" apps/web/app/embed/` je prazan, `npm run build`
  prolazi. **Ručna provera desktop resize-a mišem ostaje otvorena.**
