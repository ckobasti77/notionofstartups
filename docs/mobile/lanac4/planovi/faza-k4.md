# Faza K4 — Checkpointi na kanvasu (razmeštaj i veze)

**Cilj:** checkpointi zadatka se na telefonu razmeštaju i lančaju isto kao na webu.

**Dobija se:** `api.taskCheckpoints.saveCanvasPlacement`, `api.taskCheckpoints.resetCanvasSize`,
`api.taskCheckpointCanvasEdges.connect`, `api.taskCheckpointCanvasEdges.disconnect`
(razlika pariteta **11 → 7**, tj. cilj celog lanca iz `OSNOVA.md`).

**Suština checkpointa se NE duplira.** Tekst, završenost, lančanje, brisanje i glasanje
već su native na detalju zadatka (`components/zadatak/task-checkpoint-list.tsx`). Kanvas
dodaje **samo razmeštaj i vezu**.

---

## 1. Šta je pročitano i šta je zatečeno

### Pročitano

`docs/mobile/PARITET.md` (A8 `:359–366`, sekcija K `:635–792`, Z tabela `:821–833`,
Z-gestovi `:835–855`) · `ZA-POPRAVKU.md` (Z1–Z4, **Z7 ceo**, §6) · `00-PLAN.md` §5.2 ·
`lanac4/OSNOVA.md` · `lanac4/REZIM.md` (ceo — K4 se kači na isti režim) ·
`planovi/faza-k3.md` (naročito §4 i REVIZIJA §4–§6) ·
`packages/backend/convex/taskCheckpoints.ts` · `taskCheckpointCanvasEdges.ts` ·
`areasV2.ts` (payload `:112–203`, `checkpointEdges` `:1680–1739`, resolveri `:1830`, `:1861`) ·
`apps/web/components/workspace/area-canvas-view.tsx` (`:380–393`, `:489–570`, `:616–652`,
`:1043–1153`, `:1580–1677`) · `canvases/task-checkpoint-layout.ts` (ceo) ·
`canvases/task-checkpoint-flow-node.tsx` `:48–63`.

### Zatečeno — činjenice sa linijama

| Šta | Gde | Stanje |
|---|---|---|
| Režim + most (`mode`, `connect`) | `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx:226`, `:232`, `:248–289` | **gotovo (K1–K3)** — K4 dodaje jednu poruku, ne novi kanal |
| Kapija „živi upit ne gazi prst" | isti fajl `:449–454`, `:515–529`, `releaseGesture :609` | radi za sve čvorove — K4 je ne dira |
| Optimistički potez + jedan upis | isti fajl `handleNodeDragStop :558–603` | generičan (`NodeMove {id,x,y}`, `:336`) — **radi i za checkpoint bez izmene** |
| Ručke za veličinu | isti fajl `resizeApi :720–729`, `embed-node.tsx:185–202` | granice su zakucane na `PAGE_NODE_SIZE` (`:192–195`) |
| **Checkpoint čvorovi u embedu** | `canvas-embed.tsx:1264–1269` (komentar „NAMERNO IZOSTAVLJENO") | **ne postoje — embed ih uopšte ne crta.** Ovo je ceo posao faze |
| `checkpointEdges` u payload-u | `areasV2.ts:198`, punjenje `:1720–1739`, `canDelete = autor ivice :1737` | **već stižu** klijentu, embed ih baca |
| Placement checkpointa | `taskCheckpoints.listForTask:127` (arg `canvasRootPageId`, `placement` `:183–190`) | poseban upit — payload ga NE nosi |
| Native ljuska, `onMessage` | `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx:329–481` | grane `node:open`/`node:actions`/`selection`/`connected`/`resized`/`moved`/`viewport`/`toast` |
| 4. ikonica rail-a | isti fajl `:534–541`, `components/canvas/canvas-rail.tsx:97–101` | generička (`nodeAction`) — **rail se NE menja** |
| Sheet čvora | `components/canvas/page-node-sheet.tsx:53–221` + `page-size-section.tsx:50–209` | page-specifičan; **razdvaja se na deljeni prikaz + adapter po vrsti** |
| Traka „Poništi" | `lib/undo.ts:20–88`, `components/undo-bar.tsx:48–163` | **proširuje se sa 3 člana**, ne pravi se druga |
| Ulaz u kanvas zadatka | `app/(app)/zadatak/[id].tsx:171–177` | **NE POSTOJI** — samo `stranica/[id].tsx:66–69` ima „Canvas stranice"; zadatak nema nijedno dugme |
| Glasanje o tuđoj checkpoint-vezi | `collaboration.ts:42` (`task_checkpoint_edge`), `app/(app)/odobrenja.tsx:48` („Veza checkpointa") | backend i ekran odobrenja **već rade**; fali samo ulaz |

### Backend — sve postoji, nula izmena

- `taskCheckpoints.listForTask` (`:127`): `{taskPageId, canvasRootPageId?}` → niz sa
  `text/completed/ordinal/locked/blockedByOrdinal/placement{x,y,width,height}/canMove`.
  **Baca** ako `canvasRootPageId` nije ni `page._id` ni `page.parentPageId` (`:137–143`).
- `saveCanvasPlacement` (`:412`): `{checkpointId, canvasRootPageId, x, y, width?, height?}`.
  Vlasnik = **autor ZADATKA** (`assertOwner :89–93`, `:428`). `width`/`height` idu
  isključivo zajedno (`:435`). Klamp: 140–520 × 92–600 (`:443–444`). Koordinate ±100 000
  (`:56`). `patch` bez `width/height` **ne briše** postojeće dimenzije (`:471`) — zato
  potez sme da šalje samo `x,y`.
- `resetCanvasSize` (`:481`): briše `width/height`, ostavlja `x,y`; bez placement reda je
  no-op (`:508`).
- `taskCheckpointCanvasEdges.connect` (`:95`): `{startupId, areaId, rootPageId, source, target}`,
  endpoint je `{kind:'page'|'task_checkpoint', id}`. Odbija: isti endpoint (`:109`), **par bez
  ijednog checkpointa** (`:112–117`), stavku van kanvasa (`requireEndpoint :40–93`), vezu koja
  ne dodiruje moju stavku (`:122–129` — „Vezu možete praviti samo od ili ka svojoj stavci."),
  preko 400 veza (`:15`, `:158`). Na **aktivan** par vraća postojeći `_id` (`:146`); na
  **arhiviran** par pravi NOV red (indeks traži `archivedAt:null`, `:137–144`).
- `disconnect` (`:188`): arhivira; odbija tuđu vezu (`:212`).
- **Nijedan nov upit i nijedna izmena backenda nisu potrebni.**

### Šta je već urađeno → izbačeno iz plana

- Režim, most, ponovno slanje `mode` posle `onLoadEnd`, obod + pilula, haptika,
  safe-area, memoizacija `source`/`injectedAuth`/`style` (Z1), gejt na zamrznut token (Z2).
- Kapija poteza, stražar kraja gesta i odmontiranje ručki (Z7) — **zatvoreno u K3**, K4 ih
  samo koristi.
- Traka „Poništi", store i tajmer — dodaju se samo članovi unije.
- Ekran „Odobrenja" već prikazuje `task_checkpoint_edge`.
- Prazno/učitavanje/greška na kanvasu i u ljusci postoje (`canvas-embed.tsx:917–924`,
  `[id].tsx:626–642`, timeout `:231–235`). **Nova su samo:** prazan kanvas zadatka,
  prazna lista veza koraka i „autor zadatka" napomena u sekciji veličine.

### Odluka o deljenju koda (prompt izričito proverava)

- `taskCheckpointNodeId` / `taskCheckpointNodeMetrics` / `taskCheckpointOrbitPosition` /
  `taskCheckpointOrdinal` / `TASK_CHECKPOINT_SIZE_PRESETS` žive u
  `apps/web/components/workspace/canvases/task-checkpoint-layout.ts` — **čist TS modul,
  nula uvoza, nula React-a** (proveri: fajl ima 105 linija i nijedan `import`). Embed ga
  **uvozi kakav jeste**. Ne kopira se (orbit matematika bi se razišla) i **ne premešta se**:
  premeštanje bi diralo desktop fajlove bez ijedne funkcionalne dobiti, a dokaz
  ne-regresije („`git status` nad `apps/web/components/` prazan") je jači od estetike
  putanje. U planu se zato izričito dopušta jedan uvoz iz `components/workspace/canvases/`
  — i samo taj.
- Ono što JESTE prekopirano u K2/K3 (sekcija veličine, lista veza u sheet-u) **se sada
  izdvaja** u dva deljena prikaza (Izmene 6 i 7).

---

## 2. Redosled izmena

Koraci 1–4 su web (embed) i nezavisni od mobilnog; posle svakog prolazi web `tsc`.
Koraci 5–10 su mobilni; **6–9 su jedna celina** (sheet se cepa na deljene delove), pa
mobilni `tsc` sme tek posle koraka 9.

---

### Izmena 1 — `apps/web/app/embed/canvas/[kind]/[id]/embed-node.tsx`

**1a. Granice veličine po čvoru.** `HANDLE_*` limiti su zakucani na `PAGE_NODE_SIZE`
(`:192–195`). Checkpoint ima druge granice, ali **ručke ne dobija** (§5) — zato se ne
uvodi nov prop nego se u `showHandles` (`:149`) doda `data.canResize` uslov koji
checkpoint nikad ne postavlja. **Konkretno: nijedna izmena limita.**

**1b. Vizuelna razlika checkpointa.** `EmbedNodeData` dobija jedno polje:

```ts
/** Checkpoint oblačić (K4) — samo CSS razlika; sadržaj je isti (label + meta). */
variant?: "checkpoint";
```

U `EmbedNodeCard` se dodaje `data.variant === "checkpoint" && "embed-checkpoint"` u `cn(...)`
(`:153–159`). Stil je jedno pravilo u `EmbedStyles` (Izmena 4d). **Ne dodaje se dugme, polje
za tekst, kvačica ni brisanje** — to je detalj zadatka.

---

### Izmena 2 — `canvas-embed.tsx`: prijem poruke `checkpoints` i prosleđivanje

**2a.** U `CanvasInner` (`:222–232`) nov state:

```tsx
// Koji zadatak trenutno pokazuje svoje korake na kanvasu OBLASTI (desktop:
// `expandedTaskId`, `area-canvas-view.tsx:354`). Vlasnik je native (sheet kartice);
// na kanvasu SAMOG zadatka je nebitan — tamo su koraci uvek vidljivi.
const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
```

U `handle` (`:264–279`) nova grana, uz postojeće `mode`/`connect`:

```tsx
} else if (msg.type === "checkpoints") {
  setExpandedTaskId(msg.taskPageId ?? null);
}
```

**2b.** Prosleđuje se samo `AreaFlow`/`PageFlow` (`:314–332`); ideje i misli ga ne dobijaju.

---

### Izmena 3 — `canvas-embed.tsx`: `PageCanvasView` crta checkpointe

Uvoz (jedini dozvoljen iz `components/workspace/`):

```tsx
import {
  TASK_CHECKPOINT_SIZE_PRESETS,
  taskCheckpointNodeId,
  taskCheckpointNodeMetrics,
  taskCheckpointOrbitPosition,
  taskCheckpointOrdinal,
} from "@/components/workspace/canvases/task-checkpoint-layout";
```

**3a. Koji zadatak pokazuje korake — ista formula kao desktop (`:380–393`).**

```tsx
const ownTaskPageId = data.scope.pageKind === "task" ? rootPageId : null;
const pageIds = useMemo(() => new Set(data.pages.map((p) => p._id as string)), [data.pages]);
// Guard koji desktop nema: `listForTask` BACA ako task nije na ovom kanvasu
// (`taskCheckpoints.ts:137–143`), a izuzetak u embedu ruši ceo prikaz.
const visibleTaskId =
  ownTaskPageId ?? (expandedTaskId && pageIds.has(expandedTaskId) ? expandedTaskId : null);
const checkpoints = useQuery(
  api.taskCheckpoints.listForTask,
  visibleTaskId === null
    ? "skip"
    : { taskPageId: visibleTaskId as Id<"pages">, canvasRootPageId: rootPageId },
);
```

`checkpoints === undefined` **ne blokira kanvas** (kartice se crtaju odmah, oblačići
doskoče) — isto kao desktop.

**3b. Čvorovi.** U `useMemo` (`:1463–1561`), posle `ghostNodes`, dodaj `checkpointNodes` po
uzoru na `area-canvas-view.tsx:489–570` — sa jednom razlikom: `canResize` je **uvek
`false`** (§5).

```tsx
const taskNode = data.pages.find((p) => p._id === visibleTaskId);
const center =
  ownTaskPageId !== null || !taskNode
    ? { x: 0, y: 0 }
    : { x: taskNode.x + taskNode.width / 2, y: taskNode.y + taskNode.height / 2 };
const exclusion = taskNode
  ? { width: taskNode.width, height: taskNode.height }
  : { width: 176, height: 136 };   // isti fallback kao desktop `:525`
const checkpointNodes = (checkpoints ?? []).map<EmbedFlowNode>((cp, index) => {
  const metrics = taskCheckpointNodeMetrics(cp.text);
  const ordinal = taskCheckpointOrdinal(cp.ordinal, index);
  const width = cp.placement?.width ?? metrics.width;
  const height = cp.placement?.height ?? metrics.height;
  return {
    id: taskCheckpointNodeId(cp._id),
    type: EMBED_NODE_TYPE,
    position: cp.placement
      ? { x: cp.placement.x, y: cp.placement.y }
      : taskCheckpointOrbitPosition({ index, center, node: metrics, exclusion }),
    width, height, style: { width, height },
    draggable: cp.canMove ? undefined : false,   // isto pravilo kao kartica (`:1517`)
    data: {
      variant: "checkpoint",
      label: cp.text.trim().slice(0, 80) || "Korak",
      meta: `Korak ${ordinal} · ${cp.completed ? "Završen" : cp.locked ? `Čeka korak ${cp.blockedByOrdinal}` : "Otvoren"}`,
      canResize: false,
    },
    ariaLabel: `Checkpoint broj ${ordinal}: ${cp.text}.`,
  };
});
```

**3c. Ivice.** `checkpointEdges` iz payload-a, filtrirane na vidljive čvorove (desktop
`:616–652`). Lokalni helper (3 linije, nije „logika"):

```tsx
const endpointNodeId = (e: { kind: string; id: string }) =>
  e.kind === "page" ? e.id : taskCheckpointNodeId(e.id);
const nodeIdToEndpoint = (id: string) =>
  id.startsWith("checkpoint:")
    ? { kind: "task_checkpoint" as const, id: id.slice("checkpoint:".length) as Id<"taskCheckpoints"> }
    : { kind: "page" as const, id: id as Id<"pages"> };
```

Ivica ulazi u `edges` samo ako su **oba** kraja u `visibleNodeIds`, sa
`data: { kind: "checkpoint" }`.

**3d. Susedi za sheet.** Postojeći `edgesByPage` (`:1467–1485`) postaje `edgesByNode` i
prima i checkpoint-ivice. `PageNodeEdgeDetail` dobija:

```ts
kind: "canvas" | "relation" | "checkpoint";
otherId: string;        // bilo pageId, bilo `checkpoint:<id>`  (BILO: otherPageId)
/** Samo za `checkpoint` — „Poništi" raskida traži endpointe, ne id-jeve čvorova. */
endpoints?: { source: CheckpointEndpoint; target: CheckpointEndpoint };
```

Naslov druge strane: iz `titleById` za kartice, iz mape `checkpoint:<id> → "Korak N"` za
korake.

**3e. Detalji ka native-u.** Oba oblika dobijaju diskriminator, pa native ne pogađa oblik:

```ts
type PageNodeDetail   = { nodeKind: "page"; …postojeće…; checkpointTotal: number; nodeCount: number };
type CheckpointNodeDetail = {
  nodeKind: "checkpoint";
  _id: Id<"taskCheckpoints">; nodeId: string; taskPageId: Id<"pages">;
  ordinal: number; text: string; completed: boolean; locked: boolean;
  canMove: boolean;            // autor zadatka — i za razmeštaj i za veze
  manuallySized: boolean;      // placement.width/height postoje → „Poništi" bira inverz
  x: number; y: number; width: number; height: number;
  startupId; areaId; rootPageId;   // scope za mutacije iz native sheet-a
  nodeCount: number; edges: PageNodeEdgeDetail[];
};
```

`pageCount` se preimenuje u `nodeCount` (kartice + prikazani koraci): sa checkpointima na
platnu jedina kartica više nije „nema koga da se poveže".

---

### Izmena 4 — `canvas-embed.tsx`: upisi (potez, veza) i stil

**4a. Potez (`handleMoveNodes`, `:1310–1346`).** Deli se po prefiksu id-a. Kartice idu u
jedan `movePages` (kao do sada), koraci u N × `saveCanvasPlacement` (server prima jedan).
**Jedna** poruka `moved` nosi oba niza — traka „Poništi" ima jedan slot, pa dva
`postNative` poziva ne smeju da nastanu.

```tsx
const cpMoves = after.filter((m) => m.id.startsWith("checkpoint:"));
const pageMoves = after.filter((m) => !m.id.startsWith("checkpoint:")).slice(0, MAX_MOVE_UPDATES);
try {
  if (pageMoves.length) await movePages({ …, updates: pageMoves.map(…) });
  for (const m of cpMoves) {
    await saveCheckpointPlacement({
      checkpointId: nodeIdToEndpoint(m.id).id as Id<"taskCheckpoints">,
      canvasRootPageId: rootPageId, x: m.x, y: m.y,      // BEZ width/height — patch ih čuva
    });
  }
  postNative({ type: "moved", startupId, areaId, rootPageId,
    count: pageMoves.length, before: previousPages,
    checkpoints: previousCheckpoints });   // [{checkpointId,x,y}] od PRE poteza
} catch (error) { …toast error…; throw error; }   // rollback radi EmbedFlow
```

**4b. Veza (`handleConnectNodes`, `:1433–1461`).** Grananje po tome dodiruje li par
checkpoint:

```tsx
const isCp = (id: string) => id.startsWith("checkpoint:");
if (isCp(sourceId) || isCp(targetId)) {
  if (checkpointPairs.has(pairKey(sourceId, targetId))) → toast info „Ove stavke su već povezane." (bez mutacije)
  const edgeId = await connectCheckpointEdge({ startupId, areaId, rootPageId,
    source: nodeIdToEndpoint(sourceId), target: nodeIdToEndpoint(targetId) });
  postNative({ type: "connected", edgeKind: "checkpoint", startupId, areaId, rootPageId, edgeId });
} else { …postojeća grana `connectPages`, uz `edgeKind: "page"`… }
```

`checkpointPairs` je drugi `Set` (`useMemo` nad checkpoint-ivicama) — page-par i
checkpoint-par se ne mogu preklopiti (checkpoint veza uvek ima bar jedan korak).

**4c. Fit posle razvijanja koraka.** Efekat po uzoru na desktop `checkpointFitKeyRef`
(`:677–717`): kad se `visibleTaskId` ili broj koraka promeni, jednom
`fitView({ nodes: [task, …koraci], duration: motionDuration(400), maxZoom: 1.2 })`. Bez
toga se posle „Prikaži korake" oblačići pojave van vidnog polja.

**4d. `EmbedStyles` (`:1659–1721`)** — jedno pravilo:

```css
/* Checkpoint oblačić: da se na prvi pogled razlikuje od kartice stranice. */
.react-flow__node .embed-checkpoint { border-left-width: 3px; border-left-color: var(--primary); }
```

**4e. Komentar `:1264–1269`** („NAMERNO IZOSTAVLJENO … `checkpointEdges`") se **ispravlja**
— sada se crtaju; ostaje samo `truncated` i „label/kind ivica se ne prikazuju vizuelno".

**4f. Prazno stanje kanvasa zadatka.** `PageFlow` (`:1609–1632`): kad je
`data.scope.pageKind === "task"`, `emptyLabel = "Zadatak nema korake ni podstranice."`

---

### Izmena 5 — `apps/mobile/src/lib/canvas-node-size.ts`

Dodaje se blizanac `PAGE_NODE_SIZE`, sa istim obrazloženjem „zašto kopija, a ne uvoz"
(`:6–11`) i pokazivačem na server:

```ts
/** Granice checkpoint oblačića — prate `taskCheckpoints.ts:443–444`; server klampuje. */
export const CHECKPOINT_NODE_SIZE = {
  minWidth: 140, minHeight: 92, maxWidth: 520, maxHeight: 600,
  /** Desktop preseti (`task-checkpoint-layout.ts:6–9`) — jedini put do veličine na telefonu. */
  compact: { width: 164, height: 110 },
  expanded: { width: 360, height: 240 },
} as const;
```

---

### Izmena 6 — NOV `components/canvas/node-size-section.tsx` (deljeni prikaz)

Čisto prikazni deo sekcije „Veličina", bez ijedne mutacije:

```tsx
export type SizeOption = { key: string; title: string; subtitle?: string;
  icon: React.ReactNode; disabled?: boolean; onPress: () => void };
export function NodeSizeSection({ canResize, deniedNote, currentLabel, options, note, hint, busy })
```

`page-size-section.tsx` se prepisuje da renderuje `NodeSizeSection` sa **istim** redovima,
istim tekstovima i istim redosledom (Umanji / Uvećaj / Vrati podrazumevanu) i **istim**
mutacijama i `pushUndo` pozivima. **Guard:** ako refaktor promeni ijedan tekst ili
raspored u sheet-u kartice, vrati `page-size-section.tsx` na zatečeno i pusti checkpoint
adapter da koristi `NodeSizeSection` sam — K2/K3 ponašanje je važnije od deljenja.

---

### Izmena 7 — NOV `components/canvas/node-edges-section.tsx` (deljeni prikaz)

Izdvaja se iz `page-node-sheet.tsx:151–208`: red „Poveži sa…", imenovana lista suseda,
prazno stanje, ✕ (44pt) i „Zatraži brisanje". Props:

```tsx
{ edges: NodeEdgeRow[]; canConnect: boolean; connectHint: string; emptyNote: string;
  busy: string | null; onConnect(): void; onBreak(e): void; onRequestDeletion(e): void;
  subtitleFor(e): string }
```

`NodeEdgeRow.kind` postaje `'canvas' | 'relation' | 'checkpoint'`. Podnaslovi:
`canvas` → „Veza", `relation` → „Relacija — uklanja se na stranici" (bez dugmeta, kao do
sada), `checkpoint` → „Veza koraka".

---

### Izmena 8 — `components/canvas/page-node-sheet.tsx`

- Koristi `NodeEdgesSection` + `PageSizeSection`; `pageCount` → `nodeCount`.
- `breakEdge` grana po `edge.kind`: `canvas` → `areasV2.disconnectPages` (kao do sada),
  `checkpoint` → `taskCheckpointCanvasEdges.disconnect` + `pushUndo({kind:'checkpointEdgeDisconnect'})`.
- **Nov red na vrhu, samo za karticu zadatka** (`page.kind === 'task'`):
  „Prikaži korake (N)" / „Sakrij korake"; `disabled` kad je `checkpointTotal === 0`, sa
  podnaslovom „Zadatak nema korake." Tap zatvara sheet i zove `onToggleCheckpoints(page._id)`.

---

### Izmena 9 — NOV `components/canvas/checkpoint-node-sheet.tsx`

Sheet „Akcije koraka" — isti skelet kao `PageNodeSheet` (zaglavlje + `NodeEdgesSection` +
`NodeSizeSection`), sa checkpoint mutacijama:

- Zaglavlje: tekst koraka (2 reda) + `Korak N · Završen/Otvoren` + „Trenutno: W × H".
- **Veze:** „Poveži sa…" (`canMove && nodeCount > 1`) → `onStartConnect`; lista suseda;
  ✕ → potvrda → `taskCheckpointCanvasEdges.disconnect` → `pushUndo` → `onClose()`;
  tuđa veza → `collaboration.requestDeletion({target:{kind:'task_checkpoint_edge', id}})`.
- **Veličina:** tri reda — „Kompaktno (164 × 110)", „Prošireno (360 × 240)"
  (`saveCanvasPlacement` sa `x,y` iz detalja + preset dimenzijama) i „Vrati podrazumevanu
  veličinu" (`resetCanvasSize`, `disabled` kad `!manuallySized`).
  Kad `!canMove`: „Veličinu i položaj koraka menja autor zadatka."
- Posle svake uspešne izmene: `haptics.success()` + `pushUndo` + `onClose()` (traka je
  ispod modala nevidljiva — pravilo iz K3).

---

### Izmena 10 — `lib/undo.ts` + `components/undo-bar.tsx`

`UndoAction` dobija tri člana (`pageMove` dobija dva opciona polja):

```ts
| { kind:'pageMove'; …postojeće…;
    canvasRootPageId?: Id<'pages'> | null;
    checkpoints?: Array<{ checkpointId: Id<'taskCheckpoints'>; x: number; y: number }> }
| { kind:'checkpointResize'; checkpointId; canvasRootPageId; x; y;
    width: number; height: number; manuallySized: boolean }   // sve od PRE radnje
| { kind:'checkpointEdgeConnect'; startupId; areaId; rootPageId;
    edgeId: Id<'taskCheckpointCanvasEdges'> }
| { kind:'checkpointEdgeDisconnect'; startupId; areaId; rootPageId;
    source: CheckpointEndpoint; target: CheckpointEndpoint }
```

`undo-bar.tsx` (`restore`, `:87–163`):

- `pageMove` — posle `movePages` prođe i kroz `checkpoints` sa `saveCanvasPlacement`.
- `checkpointResize` — **tačan inverz je uslovan** (desktop `area-canvas-view.tsx:1615–1635`):
  `manuallySized ? saveCanvasPlacement({x,y,width,height}) : saveCanvasPlacement({x,y}) + resetCanvasSize()`.
  Bez toga bi „Poništi" nad prvim uvećanjem ostavio oblačić ručno dimenzionisan zauvek.
- `checkpointEdgeConnect` → `disconnect(edgeId)`.
- `checkpointEdgeDisconnect` → `connect(source,target)` — pravi **NOV** red (arhivirana
  ivica se ne oživljava), isto kao `pageEdgeDisconnect`.

Labele: „Korak je pomeren.", „Veličina koraka: 360 × 240.", „Vraćena je podrazumevana
veličina koraka.", „Korak je povezan.", „Veza koraka je uklonjena."
`movedLabel` (`[id].tsx:68–74`) dobija drugi argument: samo koraci → „Korak je pomeren." /
„N koraka je pomereno."; mešano → „N stavki je pomereno."

---

### Izmena 11 — `app/(app)/canvas/[kind]/[id].tsx` (native ljuska)

- Nov state `expandedTaskId` + `postToWeb({type:'checkpoints', taskPageId})`; **ponovo se
  šalje u `onLoadEnd`** ako je postavljen (kao `mode`, `:611`) — sveže učitan embed ga ne zna.
  Za razliku od `connect`, ne poništava se: to je pogled, ne radnja koja čeka tap.
- `onMessage`:
  - `node:actions` / `selection` → po `node.nodeKind` puni `nodeTarget` (kartica) ili nov
    `checkpointTarget`.
  - `node:open` sa `nodeKind === 'checkpoint'` → `router.push('/zadatak/<taskPageId>')`
    (suština koraka je tamo, ne na kanvasu).
  - `connected` sa `edgeKind === 'checkpoint'` → `pushUndo({kind:'checkpointEdgeConnect'})`.
  - `moved` sa `checkpoints` → jedan `pushUndo({kind:'pageMove', checkpoints, canvasRootPageId})`.
- Rail: `nodeAction.label` = „Akcije kartice" ili „Akcije koraka".
- `applyNodeSize` radi i nad `checkpointTarget` (isti `_id` uslov).
- Montira se `CheckpointNodeSheet` uz `PageNodeSheet` (oba samo za `isPageKind`).
- Naslov zaglavlja: `isPage && parentPage?.kind === 'task'` → „Canvas zadatka".

### Izmena 12 — `app/(app)/zadatak/[id].tsx` (ulaz koji ne postoji)

U `ScreenHeader.actions` (`:171–177`), **pre** „Akcije zadatka", ista ikonica i ista
formulacija kao na stranici (`stranica/[id].tsx:89–91`):

```tsx
<IconButton accessibilityLabel="Canvas zadatka" onPress={openCanvas}>
  <LayoutGrid size={20} color={colors.foreground} />
</IconButton>
```

`openCanvas` → `router.push({ pathname: '/canvas/[kind]/[id]', params: { kind: 'page', id: pageId } })`.
**Bez ovoga cela faza nije dostupna korisniku.**

### Izmena 13 — dokumentacija (isti commit)

`REZIM.md` (§3 tabela poruka + §7 ograničenja), `00-PLAN.md` §5.2 (spisak poruka mosta),
`PARITET.md` (A8 čekiranje + brisanje četiri reda iz Z tabele + nov Z-gest red),
`IZVESTAJ.md` (rezultat faze), `planovi/faza-k4.md` §8 (odstupanja).
`apps/mobile/package.json` se **ne dira** — ništa se ne instalira, nema novog dev builda,
pa `NATIVE-BUILD.md` ostaje netaknut.

---

## 3. Prst ↔ miš: isti ishod, drugi pokret

| Na webu mišem | Na telefonu prstom (režim „Uredi raspored") | Ista mutacija |
|---|---|---|
| Prevučeš oblačić koraka po platnu | Isto: prst na oblačiću ga vuče (xyflow mu daje `nopan`), prst na pozadini pomera platno; upis na `onNodeDragStop` | `taskCheckpoints.saveCanvasPlacement` (x,y) |
| Hover toolbar oblačića → `Maximize2`/`Minimize2` (preseti) | Sheet „Akcije koraka" → „Kompaktno" / „Prošireno" (44pt redovi) | `saveCanvasPlacement` (x,y,w,h) |
| Perimetarska ručka oko oblačića (~8 px, `pointermove`) | **Ne postoji** — oblačić je 164 × 110, četiri mete od 44pt pokrivaju 43% njegove površine (§5) | — |
| Toolbar → „vrati veličinu" | Sheet → „Vrati podrazumevanu veličinu" | `resetCanvasSize` |
| Povučeš nit sa `Handle` tačkice na drugi čvor | Sheet → „Poveži sa…" → traka „Izaberi karticu za vezu" → **tap** na cilj (kartica ili korak) | `taskCheckpointCanvasEdges.connect` |
| Klik na liniju + `Delete` | Sheet → imenovana lista suseda → ✕ (44pt) → potvrda | `taskCheckpointCanvasEdges.disconnect` |
| Klik na „razvij korake" na kartici zadatka | Sheet kartice → „Prikaži korake (N)" | (samo prikaz) |
| `Ctrl+Z` | Traka „Poništi" 8 s | inverzni poziv |

---

## 4. Šta može da pukne

**P1 — povlačenje oblačića vs pomeranje platna.** Mehanika je ista kao u K1
(`REZIM.md` §6): xyflow povlačivom čvoru dodaje `nopan`, pa `d3-zoom` dodir koji je počeo
na oblačiću ne vidi. **Nov rizik je veličina mete:** oblačić je 164 × 110 (min 140 × 92), a
na zumu 0.5 to je 82 × 55 px — lako se promaši i umesto poteza se pomeri platno.
*Ako pukne:* ništa se ne piše u bazu (promašaj = pan), pa je ishod bezopasan. Popravka je
zumiranje `[+]` iz rail-a, ne smanjivanje praga. **Ne uvoditi `nodeDragThreshold` manji od
5** — drhtaj prsta bi počeo da piše.

**P2 — ručke bi pojele oblačić.** Zato ih nema (§5). Ako neko ipak pokuša da ih uključi:
`showHandles` traži `data.canResize`, koji checkpoint nikad ne postavlja — provera je u
`embed-node.tsx:149`.

**P3 — `listForTask` baca i ruši embed.** Query baca ako `canvasRootPageId` nije root ni
roditelj (`taskCheckpoints.ts:137–143`); u Convex React-u izuzetak upita ruši podstablo.
*Popravka je u planu:* upit se zove **samo** za task koji je u `data.pages` (ili je sam
root) — `visibleTaskId` guard iz 3a. Ako se ipak desi (task arhiviran u međuvremenu),
`app/embed/canvas/[kind]/[id]/error.tsx` hvata, native nudi „Pokušaj ponovo", a `mode` i
`checkpoints` se posle reload-a ponovo šalju.

**P4 — potez pomeri i karticu i korak (mešano).** Moguće samo sa spoljnom tastaturom
(multi-selekcija). Plan piše oba i šalje **jednu** `moved` poruku sa oba niza, pa traka
„Poništi" vraća oba. Ako upis kartica prođe a koraka padne, stanje je delimično:
`EmbedFlow` vraća SVE povučene čvorove na `before`, a serverska poruka ide u `Alert`.
Prihvaćeno — bolje nego tiho polovično stanje.

**P5 — „Poništi" nad prvom promenom veličine ostavi ručnu veličinu.** Klasična zamka:
inverz zavisi od `manuallySized`. Rešeno uslovnim inverzom (Izmena 10). *Test T7 to gađa
direktno.*

**P6 — dupla veza.** Server na aktivan par vraća postojeći `_id`, pa bi „Poništi" obrisao
tuđu vezu. Zato je duplikat uhvaćen **na klijentu** i mutacija se ne zove (isto kao K3),
uz `toast level:'info'` i biranje koje ostaje upaljeno.

**P7 — orbit pozicija se razmimoiđe sa desktopom.** Rešeno uvozom istog modula umesto
kopije. *Test T13 proverava da modul nije menjan.*

**P8 — Z7 recidiv.** Dugi pritisak na oblačić otvara native sheet; kapija se zatvara u
`handleNodeContextMenu` (`:769–788`) koji je već generički (radi za svaki čvor). Ništa se
ne dodaje — ali **T10 to ponovo meri**, jer je Z7 preživeo jednu fazu neprimećen.

**P9 — kanvas zadatka bez podstranica prikaže „prazno" pre nego što koraci stignu.**
Prazno stanje gleda `nodes.length === 0`, a koraci dolaze drugim upitom. Vidljivo je
tren; prihvatljivo (isti obrazac kao desktop). Ako smeta: prazno stanje se ne crta dok je
`checkpoints === undefined`.

---

## 5. Šta NEĆU raditi (ide u `PARITET.md`, Z-gestovi)

| Šta | Zašto |
|---|---|
| **Ugaone ručke za veličinu na oblačiću koraka** | Podrazumevani oblačić je 164 × 110 (min 140 × 92). Četiri mete od 44pt zauzimaju **88 × 88 od 164 × 110, tj. 43% površine**, a u sredini ostaje traka od 76 × 22 px — potez koji hoće da POMERI korak skoro uvek bi pogodio ručku. K2 je isti kompromis prihvatio na kartici stranice, ali je ona najmanje 240 × 168 i ima stvarnu sredinu za prst (`REZIM.md` §7); ovde je nema. Pravilo lanca je jasno: ako meta ne može da se poveća, **menja se interakcija, ne prst**. Veličina zato ide iz sheet-a („Kompaktno" / „Prošireno" / „Vrati podrazumevanu") — a to su tačno preseti koje i desktop toolbar oblačića nudi (`task-checkpoint-flow-node.tsx`, `setSizePreset`). |
| Slobodno dimenzionisanje oblačića prevlačenjem (desktop `PerimeterResizeControl`) | Isto kao gore; preseti + reset pokrivaju svaki ishod koji tim stvarno koristi. |
| Uređivanje teksta / kvačica / brisanje / glasanje o koraku **na kanvasu** | Izričit zahtev faze: suština koraka je već native na detalju zadatka. Tap na oblačić van režima otvara `/zadatak/<id>` — jedan izvor istine, nula duplikata. |
| Prikaz koraka **više zadataka odjednom** na kanvasu oblasti | Ni desktop to ne radi (`visibleCheckpointTaskId = ownTask ?? expanded`, `area-canvas-view.tsx:384`). Dva orbita bi se preklopila. |
| „Prikaži korake" van režima „Uredi raspored" | Sheet kartice se otvara samo u režimu (`onNodeContextMenu` i rail-akcija su `editMode`-gated). Van režima je kanvas za gledanje i tap otvara stranicu. Jednom razvijeni koraci **ostaju vidljivi** i posle „Gotovo". |
| Povlačenje niti sa `Handle` tačkice za checkpoint veze | `nodesConnectable={false}` ostaje zauvek (K3, `embed-node.tsx:32–37`) — tačkica je ~8 px. |
| Tap na samu liniju checkpoint veze (selekcija + `Delete`) | Linija je 1–2 px; raskidanje ide iz sheet-a, gde je veza red od 56pt sa imenom druge strane. |
| Premeštanje `task-checkpoint-layout.ts` u neutralni folder | Modul je već čist i deljen (nula uvoza, nula React-a); premeštanje bi diralo desktop fajlove bez funkcionalne dobiti i oslabilo dokaz ne-regresije. |

---

## 6. Kako se dokazuje (konkretni testovi)

Sve na Android emulatoru (Pixel_9), nalog Jovan / ScanMe. Dokazi u
`docs/mobile/lanac4/dokazi/` sa prefiksom `k4-`. Log komanda kao u K3
(`adb logcat` filtriran na `[canvas]` + Convex funkcije) → `k4-logovi.txt`.

| # | Test | Dokaz koji mora da postoji |
|---|---|---|
| **T0** | Okruženje: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/area/proba` → `200` (ZA-POPRAVKU Z3 — port 3000 ume da bude otet) | red u `k4-logovi.txt` |
| **T1** | Ulaz: detalj zadatka → „Canvas zadatka" otvara kanvas; oblačići koraka se vide u orbiti | `k4-ulaz.png`, `k4-kanvas.png` |
| **T2** | Potez: u režimu prevuci korak — prati prst, po otpuštanju **tačno jedan** `taskCheckpoints:saveCanvasPlacement` | `k4-pre.png` → `k4-posle.png`, `k4-logovi.txt` (vreme + jedan poziv) |
| **T3** | Platno: u režimu prevuci **pozadinu** — svi oblačići se pomeraju zajedno, u logu **nema** `saveCanvasPlacement` | `k4-pan.png` + odsečak loga |
| **T4** | Trajnost: izađi iz kanvasa i vrati se — korak je na novom mestu (dokaz da je prošao kroz server, ne kroz memoriju) | `k4-povratak.png` |
| **T5** | Baza: `npx convex data taskCheckpointCanvasPlacements --limit 10` pre i posle T2 | `k4-baza.txt` §1 |
| **T6** | Veličina: sheet → „Prošireno" → oblačić 360 × 240; `saveCanvasPlacement` sa `width/height` | `k4-velicina.png`, log |
| **T7** | **Uslovni inverz:** korak koji NIKAD nije dimenzionisan → „Prošireno" → „Poništi" → u logu `saveCanvasPlacement(x,y)` **pa** `resetCanvasSize`, a oblačić se vrati na veličinu izvedenu iz teksta (ne na 164 × 110 iz preseta) | `k4-undo-velicina.png`, log sa oba poziva |
| **T8** | Veza korak → korak: „Poveži sa…" → traka → tap na drugi oblačić → linija; **jedan** `taskCheckpointCanvasEdges:connect` | `k4-veza-pre.png` → `k4-veza-posle.png`, log |
| **T9** | Veza korak → kartica podstranice (drugi tip endpointa) | `k4-veza-kartica.png` |
| **T10** | Duplikat: ponovi T8 nad istim parom → `Alert('Obaveštenje')`, u logu **nijedan** `connect` | `k4-duplikat.png` + odsečak loga |
| **T11** | Raskid + „Poništi" u oba smera; baza pokazuje `archivedAt` i **nov** red posle poništenog raskida | `k4-raskid.png`, `k4-undo-veza.png`, `k4-baza.txt` §2–§3 |
| **T12** | Z7 nije recidivirao: dugi pritisak na oblačić → sheet → izmena veličine iz sheet-a se **vidi** u WebView-u bez reload-a | `k4-z7.png` |
| **T13** | Tuđi korak: nije povlačiv (prst pomera platno), sekcija veličine kaže „menja autor zadatka", tuđa veza nudi „Zatraži brisanje" → ekran „Odobrenja" pokazuje „Veza checkpointa" | `k4-tudji.png`, `k4-odobrenja.png` |
| **T14** | Kanvas oblasti: sheet kartice zadatka → „Prikaži korake (3)" → orbit oko te kartice; „Sakrij korake" ih uklanja | `k4-oblast-prikazi.png`, `k4-oblast-sakrij.png` |
| **T15** | Dodirne mete **izmerene na uređaju** (`adb shell uiautomator dump`): svi redovi sheet-a ≥ 56 dp, ✕ i „Canvas zadatka" ≥ 44 dp | `k4-mete.txt` |
| **T16** | Desktop nepromenjen: `git status --short -- apps/web/components/ packages/backend/` **prazan** (uvoz `task-checkpoint-layout.ts` je jednosmeran — modul se ne dira); `npm run build` prolazi | ispis u izveštaju |
| **T17** | **Promena vidljiva na webu.** Redosled: (1) `npx convex run adminAuth:resetAdminPassword '{"email":"jovanm028@gmail.com","newPassword":"<nova>"}'` — po `ZA-POPRAVKU.md` Z6 taj CLI put **ne poziva `invalidateSessions`**, pa živa mobilna sesija ostaje; (2) prijava na `localhost:3000` istim nalogom; (3) otvori isti kanvas i vidi korak na poziciji iz T2 i vezu iz T8; (4) mišem prevuci karticu i `Ctrl+Z` — desktop kanvas radi kao pre. **Nova lozinka se OBAVEZNO zapisuje u izveštaj.** Ako `resetAdminPassword` više ne postoji u `adminAuth.ts` — ne vraćaj ga (backend se ne dira), nego ostavi T17 otvoren sa tim razlogom | `k4-web.png`, `k4-web-desktop.png` |
| **T18** | Kapije: mobilni `tsc --noEmit -p apps/mobile/tsconfig.json` · web `tsc` · `npm run lint` (0 grešaka; 2 zatečena backend upozorenja su poznata, `ZA-POPRAVKU` §6) · `npm test` · `npm run build` | ispis |
| **T19** | Paritet: komanda iz `PARITET.md:15–19` → **11 → 7** | ispis |

`expo lint` se **ne pokreće** — pokvaren je u `apps/mobile` (ceo `src` je ignorisan);
provera je `tsc`.

---

## 7. Definicija „gotovo" za K4

1. Sa telefona se korak **pomeri** i **poveže**, oba upisa vidljiva u bazi (T5, T11) i na
   webu (T17, ili zapisan razlog zašto ne).
2. Sve četiri funkcije se stvarno zovu iz koda koji mobilni izvršava, sa dokaznom linijom
   uz svaki čekiran kvadratić u `PARITET.md` A8.
3. Svaka od četiri radnje (potez, veličina, veza, raskid) ostavlja traku „Poništi" koja
   radi — uključujući uslovni inverz veličine (T7).
4. Van režima se ništa ne pomera i ništa ne piše (T3 obrnuto: tap otvara zadatak).
5. Desktop kanvas: `git status` nad `apps/web/components/` i `packages/backend/` prazan.
6. Sve kapije zelene (T18), razlika pariteta 7 (T19).
7. `REZIM.md`, `00-PLAN.md` §5.2, `PARITET.md` i `IZVESTAJ.md` ažurirani u **istom** commit-u.

---

## 8. REALIZACIJA — odstupanja od plana i zašto

*(popunjava agent koji izvršava; prazno do tada)*
