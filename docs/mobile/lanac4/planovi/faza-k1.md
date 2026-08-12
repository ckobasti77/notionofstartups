# Faza K1 — Režim „Uredi raspored" i pomeranje kartica

**Cilj:** u režimu „Uredi raspored" prstom pomeraš stranice po kanvasu oblasti,
pozicija se pamti, izlazak iz režima vraća gledanje.

**Dobija se:** `api.areasV2.movePages`, `api.areasV2.saveViewport`
(razlika pariteta 17 → 15).

---

## 1. Šta je pročitano i šta je zatečeno

### Pročitano

`docs/mobile/PARITET.md` (Z tabela, red 672 i 675) · `ZA-POPRAVKU.md` (Z1–Z6,
§5.13) · `00-PLAN.md` §5.2 · `lanac4/OSNOVA.md` · `kanvas-lanac.ps1:280–385`
(šta traže K2–K5, da režim iz K1 bude nosiv).

### Zatečeno — činjenice sa linijama

| Šta | Gde | Stanje |
|---|---|---|
| Embed kanvas, sve 4 vrste | `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` (803 linije) | radi |
| Auth injekcijom (bez handshake-a) | isti fajl, `128–152` | **gotovo, ne dirati** |
| Most: prijem `theme`/`focus`/`fit`/`zoom` | isti fajl, `227–255` | **kanal postoji — `mode` ide ovde** |
| Slanje `node:open` / `selection` | isti fajl, `297–320` | postoji |
| Dve zastavice koje gase uređivanje | isti fajl, `347–348` | `nodesDraggable={false}` `nodesConnectable={false}` |
| Jednokratni `fitView` | isti fajl, `325–329` (+ prop `343`) | postoji, bezuslovan |
| Čvor embeda (sopstveni, ne desktop kartica) | `.../embed-node.tsx:46–89` | postoji |
| Prazno / učitavanje / greška u embedu | `canvas-embed.tsx:368–375`, `471`, `error.tsx` | **sva tri postoje** |
| Native ljuska + memoizovan `source`/`injectedAuth` | `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx:136–155` | **ne dirati reference (Z1)** |
| `postToWeb` | isti fajl, `157–160` | postoji |
| Ponovno slanje tokena posle učitavanja | isti fajl, `318–326` | **ovde ide i ponovno slanje `mode`** |
| Native rail (3 ikonice 44pt + primarno dugme) | `apps/mobile/src/components/canvas/canvas-rail.tsx:39–88` | postoji |
| Traka „Poništi" (generička, modul-store) | `apps/mobile/src/lib/undo.ts:20–30`, `components/undo-bar.tsx:81–108` | **postoji — proširuje se, ne pravi novo** |
| `UndoBar` već montiran na kanvasu | `canvas/[kind]/[id].tsx:365` | postoji |
| Swipe-back isključen | `apps/mobile/src/app/(app)/_layout.tsx:26` | **ne uključivati** |

### Backend — sve postoji, nula izmena

- `movePages` — `packages/backend/convex/areasV2.ts:2339`; prima
  `{startupId, areaId, rootPageId, updates: [{pageId,x,y}]}`, batch ≤ 100
  (`MAX_BATCH_LAYOUT_UPDATES`, `:90`), `assertOwnedPage` baca „Možete pomerati
  samo svoje kartice." (`:2378`).
- `saveViewport` — `:2506`; `{startupId, areaId, rootPageId, x, y, zoom}`,
  klampuje zoom na 0.1–4, red je **po korisniku i po scope-u** (`:2534`).
- Payload već nosi sve što treba: `pages[].canMove` (`:136`), `scope.startupId` /
  `scope.areaId` / `scope.rootPageId` (`:172–177`), `viewport{x,y,zoom,persisted}`
  (`:187`). **Nijedan novi upit nije potreban.**

### Šta je već urađeno → izbačeno iz plana

- Kanal mosta, auth, tema, `fit`/`zoom`/`focus`, `focus` na zatvaranje detalja.
- Prazno/učitavanje/greška u embedu i u native ljusci (uključujući timeout od 20 s,
  `canvas/[kind]/[id].tsx:178–182`).
- Memoizacija `source`/`injectedAuth`/`style`/`originWhitelist` (Z1) — **zatečeno
  ispravno, ne dirati.**
- Traka „Poništi", haptika, safe-area u zaglavlju i rail-u.

### Upozorenje na tuđi opis embeda

Postoji verzija embeda koja crta **desktop kartice** (`IdeaFlowNodeCard`,
`AreaFlowNodeCard`) umesto `embed-node.tsx`. Ona živi **isključivo na napuštenoj
grani `paritet-20260810-0159` (commit `51d1a91`)** i nije u ovoj lozi. Na ovoj
grani `embed-node.tsx` postoji i koristi se (`canvas-embed.tsx:25–31, 339`).
K1 ga **ne menja** (vidi izmenu 2) i **ne prepisuje** embed na desktop kartice.

---

## 2. Redosled izmena

Redosled je izabran tako da `tsc` prolazi posle svakog koraka.

### Izmena 1 — `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx`

**Zašto:** ovde živi ReactFlow; režim, povlačenje i kamera moraju biti tu.

**1a. Prijem `mode` (u postojećem listeneru, `227–255`).**
`const [editMode, setEditMode] = useState(false)` u `CanvasInner`; u `handle`
dodati granu `msg.type === "mode"` → `setEditMode(msg.value === "edit")`.
Prosleđuje se kao prop svim četirima flow-ovima. **Ne pravi drugi listener** —
isti `window` + `document` par.

**1b. `EmbedFlow` dobija stanje čvorova.** Sada su `nodes` samo prop; povlačenje
traži lokalno stanje:

```tsx
const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes);
const draggingRef = useRef(false);
const pendingRef  = useRef<EmbedFlowNode[] | null>(null);
useEffect(() => {
  if (draggingRef.current) { pendingRef.current = nodes; return; }
  setFlowNodes(nodes);
}, [nodes, setFlowNodes]);
```

Na `onNodeDragStop` se `pendingRef` isprazni u state. **Bez ovog gate-a** živi
Convex upit (koji stiže i zbog tuđe izmene i zbog naše) resetuje poziciju
usred poteza — kartica „pobegne" ispod prsta.

**1c. Novi propovi `EmbedFlow`-a** (svi opcioni; ideje/misli ih u K1 ne šalju):
`editMode: boolean`, `onMoveNodes?: (before, after) => void`,
`initialViewport?: {x,y,zoom} | null`, `onUserViewport?: (v) => void`.
`const canEdit = editMode && !!onMoveNodes;` — bez handlera režim je inertan,
pa K5 samo doda handler za ideje/misli.

**1d. Zastavice i potez.**

```tsx
nodesDraggable={canEdit}
nodeDragThreshold={5}          // prst uvek malo zadrhti; bez ovoga tap = upis
onNodesChange={onNodesChange}
onNodeDragStart={() => { draggingRef.current = true; preDragRef.current = mapa id→{x,y} }}
onNodeDragStop={(_e, _n, dragged) => { …diff…; if (changed) onMoveNodes(before, after) }}
onNodeClick={editMode ? undefined : handleNodeClick}
```

`before/after` se računaju kao na desktopu (`area-canvas-view.tsx:2011–2039`):
`Math.round` na obe koordinate, u `after` ulaze samo čvorovi kojima se pozicija
stvarno promenila. `nodesConnectable` **ostaje `false`** (to je K3).

**1e. Kamera.** `onMoveEnd={(event, v) => { if (event === null) return; onUserViewport?.(v) }}`.
`event === null` je programska promena (d3 `sourceEvent` je `null` za
`fitView`/`zoomIn`/`zoomOut`/početni fit) — tačno ono što traži zahtev „ne posle
programskog fitView". Ako se na emulatoru ipak vidi upis posle `fit`, dodaje se
pojas i tregeri: `suppressUntilRef = Date.now() + trajanje + 150 ms` pre svake
programske akcije.

**1f. Vraćanje zapamćene kamere.** Kao desktop (`area-canvas-view.tsx:818–834`):
`fitView={!initialViewport}` + `defaultViewport={initialViewport ?? undefined}`,
a jednokratni imperativni fit (`325–329`) se preskače kad `initialViewport`
postoji. Bez ovoga bi `saveViewport` pisao u tabelu koju niko na telefonu ne
čita.

**1g. Vidljiv znak režima (uslov zadatka — ne sme da se oslanja na native dugme).**
U omotač (`334`) dodaje se `className={cn(..., canEdit && "embed-edit")}`, plus:

- obod: `<div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary" />`
- pilula gore-sredina: „Uređivanje rasporeda", `role="status"`, `pointer-events-none`,
  `bg-primary text-primary-foreground`.

U `EmbedStyles` (`785`) jedno pravilo označava **šta se sme pomeriti** (xyflow
sam stavlja klasu `draggable` na čvor koji je povlačiv):

```css
.embed-edit .react-flow__node.draggable {
  outline: 2px dashed color-mix(in oklab, var(--primary) 55%, transparent);
  outline-offset: 4px; border-radius: .75rem;
}
```

Time tuđa kartica (koju backend ionako odbija) nema isprekidan obod i vidi se da
nije za pomeranje — **bez ijedne izmene u `embed-node.tsx`** i bez novog polja u
`data` (koje bi rerenderovalo sve čvorove).

**1h. `PageCanvasView` — jedini deo koji zna scope.**

- `draggable: page.canMove` po čvoru (isto kao desktop `area-canvas-view.tsx:437`),
  `draggable: false` za ghost-ove.
- `const movePages = useMutation(api.areasV2.movePages)` (klijent iz injekcije je
  već autentikovan — `OSNOVA.md`).
- `onMoveNodes`: batch se seče na 100 (`MAX_BATCH_LAYOUT_UPDATES`), poziv sa
  `data.scope`, pa:
  - uspeh → `postNative({type:"moved", scope, before, count})`;
  - greška → vrati `flowNodes` na `before` **i** `postNative({type:"toast",
    level:"error", message})` (embed nema toast površinu; native ima `Alert`).
- `initialViewport = data.viewport.persisted ? {x,y,zoom} : null`.
- `onUserViewport = (v) => postNative({type:"viewport", x:Math.round(v.x),
  y:Math.round(v.y), zoom:Number(v.zoom.toFixed(2))})` — isto zaokruživanje kao
  desktop (`area-canvas-view.tsx:1566–1568`).

**Važi za `kind:"area"` i `kind:"page"`** — isti komponentni put, isti payload,
`rootPageId` iz scope-a razlikuje slučajeve. Prijemni test je oblast; kanvas
stranice se proverava jednim potezom.

### Izmena 2 — `embed-node.tsx`: **bez izmena**

Zabeleženo namerno: signal režima ide kroz CSS klasu koju xyflow već stavlja, pa
čvor ostaje netaknut. `git diff` nad ovim fajlom mora biti prazan.

### Izmena 3 — `apps/mobile/src/lib/undo.ts`

Novi član unije `UndoAction` (obrazac se **proširuje**, ne duplira):

```ts
| { kind: 'pageMove'; startupId: Id<'startups'>; areaId: Id<'startupAreas'>;
    rootPageId: Id<'pages'> | null;
    updates: Array<{ pageId: Id<'pages'>; x: number; y: number }> }
```

### Izmena 4 — `apps/mobile/src/components/undo-bar.tsx`

`const movePages = useMutation(api.areasV2.movePages)` + `case 'pageMove'` u
`restore` (`:81`). Inverz poteza je isti poziv sa **prethodnim** koordinatama —
koordinate stižu iz memorije (poruka `moved`), ne iz baze. Ostalo (tajmer, busy
brava, najava, `Alert` na grešku) je zatečeno i ne dira se.

> Sporedni, ali tražen efekat: ovim `api.areasV2.movePages` postoji u
> `apps/mobile/src` — grep-metod pariteta ga više ne broji kao web-only.

### Izmena 5 — `apps/mobile/src/components/canvas/canvas-rail.tsx`

Dva nova opciona propa: `editMode?: boolean`, `onToggleEdit?: () => void`.

- **Gledanje:** četvrta ikonica `Move` (44pt, `accessibilityLabel="Uredi
  raspored"`), primarno dugme ostaje „Nova stranica".
- **Režim:** četvrta ikonica se sklanja, a primarno dugme postaje **„Gotovo"**
  (ikonica `Check`, `colors.primary`) i gasi režim; „Nova stranica" se u režimu
  ne prikazuje (u režimu se raspoređuje postojeće, ne pravi novo).
- `accessibilityState={{ selected: editMode }}` na prekidaču.

Merenje širine (360 dp, najuži realan ekran): 4 × 44 + 3 × 8 + 24 padding + 12
gap = 236 dp, primarnom dugmetu ostaje ~124 dp → „Nova stranica" se eliptira.
Prihvatljivo: `numberOfLines={1}` + `flexShrink` već postoje
(`canvas-rail.tsx:150–157`), pun tekst je u `accessibilityLabel`, a u režimu je
labela „Gotovo" (uvek staje). Dodirna meta se **ne** smanjuje ni u jednom slučaju.

### Izmena 6 — `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx`

1. `const [editMode, setEditMode] = useState(false)`; `const supportsEdit = isArea || isPage`
   (ideje/misli su K5).
2. Prekidač: `postToWeb({ type: 'mode', value: next ? 'edit' : 'view' })`,
   `haptics.select()`, `AccessibilityInfo.announceForAccessibility(next ?
   'Režim uređivanja rasporeda je uključen.' : 'Uređivanje rasporeda je završeno.')`.
3. **Ponovno slanje posle učitavanja** — u postojeći `onLoadEnd` (`318–326`),
   odmah uz token: `if (editMode) postToWeb({type:'mode', value:'edit'})`.
   Bez ovoga posle „Pokušaj ponovo" native misli da je režim upaljen, a embed ne.
4. `onMessage` (`184–214`) dobija tri grane:
   - `moved` → `haptics.success()` + `pushUndo({ label: count === 1 ? 'Kartica je
     pomerena.' : `${count} kartica je pomereno.`, action: { kind:'pageMove', …scope,
     updates: before } })`;
   - `viewport` → upiši u ref i restartuj debounce od **800 ms**;
   - `toast` → `Alert.alert('Greška', message)`.
5. `const saveViewport = useMutation(api.areasV2.saveViewport)`; debounce u
   `useRef<ReturnType<typeof setTimeout>>`, u cleanup-u ekrana **flush** (poslednji
   pan pre izlaska se ne sme izgubiti) i `clearTimeout`.
6. `mode` NE ulazi u URL ni u `injectedAuth` — svaka promena tih referenci
   reloaduje WebView (Z1).

**Zašto se `saveViewport` piše iz native-a, a `movePages` iz embeda:** upis
pozicije mora da ide odmah uz optimistički potez i da ume da se vrati unazad —
to zna samo embed. Kamera je podešavanje sesije: prigušuje se, nema optimističko
stanje, i native je već vlasnik dugmadi koje kameru pomeraju. Uz to grep-paritet
tada vidi obe funkcije u `apps/mobile/src`.

### Izmena 7 — dokumentacija (isti commit)

- **`docs/mobile/lanac4/REZIM.md`** (novo) — protokol režima za K2–K5: tabela
  poruka, ko je vlasnik stanja, šta se dešava na reload, pravilo „jedan upis po
  potezu", pravilo „svaki upis ima Poništi".
- **`docs/mobile/00-PLAN.md` §5.2** — u tabelu mosta dodati `mode`, `moved`,
  `viewport`, `toast`. Tabela je tamo jedini izvor istine za protokol.
- **`docs/mobile/PARITET.md`** — nova sekcija `# K — UREĐIVANJE KANVASA (lanac 4)`
  sa `[x]` za `movePages` i `saveViewport` **i dokazom fajl:linija**; iz Z tabele
  brišu se redovi 672 (`movePages`) i 675 (`saveViewport`) — više nisu izuzeci.

---

## 3. Prst ↔ miš: isti ishod, drugi pokret

| Ishod | Web (miš) | Telefon (prst) |
|---|---|---|
| Pomeri karticu | levi klik na karticu + prevlačenje (`onNodeDragStop` → `movePages`) | „Uredi raspored" → prst na kartici + prevlačenje → isti `movePages` na kraj poteza |
| Pomeri platno | srednji/desni taster ili Space (`panOnDrag={[1,2]}`) | jedan prst po praznom platnu, **u oba režima** |
| Zumiraj | `Ctrl` + točkić | dva prsta ili `[+]`/`[−]` u rail-u |
| Centriraj sve | `Controls` dugme | `[⌖]` u rail-u |
| Zapamti pogled | `onMoveEnd` → `saveViewport` | isto, samo prigušeno 800 ms i preko native-a |
| Poništi pomeranje | `Ctrl+Z` (`pushHistory`, `area-canvas-view.tsx:2099`) | traka „Poništi" 8 s → isti `movePages` sa starim koordinatama |
| Otvori stranicu | dvoklik / klik na karticu | tap na karticu — **samo van režima**; u režimu tap bira |
| Vidi da je uređivanje aktivno | kursor `grab` | obod + pilula u WebView-u i „Gotovo" u rail-u |

Namerno **nema prevoda** za: guma-selekciju (`selectionOnDrag`) i ugnježdavanje
prevlačenjem jedne kartice na drugu — vidi sekciju 5.

---

## 4. Šta može da pukne

**P1 — povlačenje čvora se bije sa pomeranjem platna. (glavni rizik)**
Mehanizam: xyflow kači `d3-drag` na svaki povlačiv čvor, a `d3-drag` na
`touchstart` zove `stopImmediatePropagation`, pa `d3-zoom` na platnu taj dodir ne
vidi → prst na kartici pomera karticu, prst na pozadini pomera platno. Kad je
`nodesDraggable={false}`, `d3-drag` nije ni zakačen → sve ide platnu. Teorija
je čista, ali **proverava se na emulatoru** (test T1).
*Ako pukne (kartica se ne pomera ili se platno pomera zajedno s njom):*
(1) `nodeDragThreshold` na 8; (2) povlačiva je **samo izabrana kartica**
(`draggable: canMove && selected`) — tap bira, drugi potez pomera; (3) krajnje:
`panOnDrag={false}` u režimu, platno se tada pomera samo sa dva prsta.

**P2 — pinč nad karticom ne zumira.** Posledica istog `stopImmediatePropagation`:
ako prvi prst padne na povlačivu karticu, `d3-zoom` ne dobije gest. Izlaz uvek
postoji — `[+]`/`[−]` u rail-u rade preko mosta i nezavisni su od dodira. Ako
smeta, primenjuje se mera (2) iz P1 i površina se svede na jednu karticu.
**Ovo se ne „popravlja" smanjivanjem dodirne mete.**

**P3 — živi upit resetuje poziciju usred poteza.** Rešeno `draggingRef` +
`pendingRef` gate-om (1b). Simptom ako se preskoči: kartica skoči nazad na
mestu, obično baš posle uspešnog upisa.

**P4 — `saveViewport` posle programskog `fitView`.** Rešeno `event === null`
gate-om; rezerva je vremenski prozor (1e). Simptom: `[⌖]` u rail-u pravi upis.

**P5 — reload WebView-a gubi režim.** Rešeno ponovnim slanjem u `onLoadEnd` (6.3).

**P6 — beskonačni reload (Z1).** Nijedan nov objektni prop se **ne** dodaje na
`<WebView>`; `mode` ide isključivo kroz `postMessage`.

**P7 — `movePages` odbije tuđu karticu.** Tuđe kartice nisu povlačive
(`canMove`), pa se ne bi smelo desiti; ako se desi (trka sa promenom vlasništva),
lokalni rollback + `toast` grana (1h) pokazuje serversku poruku.

**P8 — slučajan mikropomeraj piše u bazu.** `nodeDragThreshold={5}` + provera
„da li se zaokružena koordinata promenila".

**P9 — zapamćena kamera je zajednička sa desktopom.** `pageCanvasViewports` je
red po `viewerProfileId` + scope, isti za oba klijenta: pan na telefonu menja
početni pogled istog korisnika na desktopu. Web se ponaša isto između svojih
prozora, pa se **prihvata**, ali se zapisuje u `REZIM.md` da se ne otkriva kao
bag u K6.

**P10 — okruženje pre testa.** Port 3000 ume da bude otet (Z3) i
`allowedDevOrigins` mora da sadrži `10.0.2.2` (Z4). Provera od 10 s je prvi
korak testa (T0). `expo lint` ne radi — provera mobilnog je `tsc` (memorija).

**P11 — regresija na desktopu.** Sprečena time što se **nijedan fajl u
`apps/web/components/workspace/` ne dira**; desktop logika se čita kao referenca,
ne uvozi. Dokaz je prazan `git diff` (T6).

---

## 5. Šta NEĆU raditi (ide u sekciju Z fajla `PARITET.md`)

| Šta | Zašto |
|---|---|
| Guma-selekcija više kartica (`selectionOnDrag`) | Na telefonu nema modifikatora ni drugog tastera; svaki takav potez bi bio ili pan ili pomeranje. `movePages` ipak prima niz, pa je put ka grupnom potezu otvoren za kasnije. |
| Ugnježdavanje prevlačenjem kartice na karticu (`requestNesting` sa kanvasa) | Ista tačka dodira nosila bi dva ishoda (pomeri / ugnjezdi) bez ijednog vidljivog razgraničenja — na telefonu je to slučajno slanje zahteva celom timu. Ugnježdavanje već postoji native, u `page-actions-sheet.tsx`. |
| Pomeranje checkpoint čvorova | K4 (`taskCheckpoints.saveCanvasPlacement`) — drugi tip čvora, isti režim. |
| Veličina (`resizePage`/`resetPageSize`) i veze (`connectPages`/`disconnectPages`) | K2 i K3. |
| Uređivanje na kanvasu ideja i misli | K5; režim je već napisan tako da se uključuje jednim handlerom. |
| Pomeranje strelicama tastature u embedu | Desktop to ima (`area-canvas-view.tsx:893`); na telefonu nema tastature nad kanvasom, a spoljna tastatura uz WebView je rubni slučaj. |
| Baner „nije sve prikazano" (`truncated`) i natpisi na vezama | Zatečeni, svesni izostanci embeda (`canvas-embed.tsx:630–641`) — K1 ih ne širi. |
| Izdvajanje desktop logike u zajednički modul | K1 ne **uvozi** ništa iz desktop kanvasa (razlika/zaokruživanje su ~15 linija uz drugačiji model podataka). Zajednički modul se pravi u K2, gde se stvarno dele granice veličine. |

---

## 6. Kako se dokazuje (konkretni testovi)

Sve na Android emulatoru, uz `npx convex logs` pokrenut u drugom terminalu.
Snimci idu u `docs/mobile/lanac4/dokazi/` (konvencija iz `lanac2`/`lanac3`).

**T0 — okruženje (pre svega ostalog).**
`curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/area/proba`
→ mora `200`. `404` = tuđi server na portu (Z3), prazno = server ne radi.

**T1 — prst pomera karticu, ne platno. (dokazuje 1b, 1d, P1)**
Otvori oblast → „Uredi raspored" → `adb shell input swipe X1 Y1 X2 Y2 600` sa
početkom **na kartici**. Snimci `k1-pre.png` / `k1-posle.png`
(`adb exec-out screencap -p > …`). Prolaz: kartica je na novom mestu, platno se
nije pomerilo.

**T2 — prst na pozadini i dalje pomera platno u režimu.**
Isti swipe sa početkom na praznom delu. Prolaz: sve kartice se pomere zajedno,
nijedna nije upisala novu poziciju (`convex logs` bez `movePages`).

**T3 — jedan upis po potezu. (dokazuje zahtev „ne po frejmu")**
Tokom T1: `npx convex logs` sme da pokaže **tačno jedan** red
`areasV2:movePages`. Red se lepi u `docs/mobile/lanac4/dokazi/k1-logovi.txt`.

**T4 — pozicija preživi.** Nazad → ponovo uđi u oblast → kartica je gde je
ostavljena. Ista provera na desktopu u browseru (isti podatak, drugi klijent).

**T5 — kamera.** Pan prstom, sačekaj 1 s → u logu **jedan**
`areasV2:saveViewport`. Pa tapni `[⌖]` (fit) → u logu **nema novog**
`saveViewport` (dokaz za P4). Izađi i vrati se → kanvas se otvara na zapamćenom
pogledu, ne na `fitView`.

**T6 — desktop nije promenjen.**
`git diff --stat apps/web/components/` mora biti **prazan**. Uz to ručno na
`localhost:3000`: prevuci karticu na kanvasu oblasti mišem, `Ctrl+Z` je vraća —
snimak `k1-desktop.png`.

**T7 — „Poništi".** Posle T1 traka je vidljiva → tap „Poništi" → kartica se
vraća na staro; u logu drugi `areasV2:movePages` (sa starim koordinatama).

**T8 — izlazak iz režima vraća gledanje.** „Gotovo" → obod i pilula nestaju →
tap na karticu otvara ekran stranice (a ne bira je) → swipe na kartici pomera
platno.

**T9 — režim preživi „Pokušaj ponovo".** U režimu ubij web server, sačekaj
grešku, vrati server, tapni „Pokušaj ponovo" → posle učitavanja obod je i dalje
tu i kartica se i dalje pomera.

**T10 — kapije.**
`cd apps/mobile && npx tsc --noEmit` · `cd apps/web && npx tsc --noEmit` ·
`npm run lint` (2 zatečena backend upozorenja se ne diraju — ZA-POPRAVKU §6) ·
`npm test`.

**T11 — paritet.** Komanda iz `PARITET.md:15–19`; razlika mora pasti sa 17 na
**15**, i to zato što se `movePages` i `saveViewport` sada zovu iz
`apps/mobile/src` (`undo-bar.tsx`, `canvas/[kind]/[id].tsx`), a ne zato što je
nešto na webu obrisano.

---

## 7. Definicija „gotovo" za K1

- [x] T0–T11 prolaze, snimci i red iz loga u `docs/mobile/lanac4/dokazi/`
      (T6 delimično — vidi odstupanje 6 niže)
- [x] `docs/mobile/lanac4/REZIM.md` napisan (protokol za K2–K5)
- [x] `00-PLAN.md` §5.2 tabela mosta dopunjena
- [x] `PARITET.md`: sekcija K sa `[x]` i dokazima; dva reda uklonjena iz Z
- [x] `git diff` prazan nad `packages/backend/` i `apps/web/components/`
- [x] `apps/mobile/package.json` nije menjan (nema unosa u `NATIVE-BUILD.md`)

---

## 8. Odstupanja od plana (dopisano po izvršenju, 12.08.2026)

**1. `draggable: page.canMove ? undefined : false`, ne `draggable: page.canMove`.**
Plan je predviđao `draggable: page.canMove` po čvoru (kao desktop). To bi bio bag:
xyflow računa `isDraggable = !!(node.draggable || (nodesDraggable && typeof
node.draggable === 'undefined'))` — dakle `draggable:true` na čvoru **pobeđuje**
globalni `nodesDraggable={false}`, pa bi se svoje kartice povlačile i VAN režima,
čime bi ceo režim izgubio smisao. `undefined` prepušta odluku globalnoj zastavici,
a `false` je tvrdo NE za tuđe kartice i ghost-ove. Uz to, memo čvorova ne zavisi od
`editMode`, pa se pri paljenju režima ne prezidavaju svi čvorovi.

**2. Provera „da li se kamera uopšte promenila" (nalaz sa emulatora).**
Plan je imao samo `event === null` gate. Na emulatoru se videlo da je **običan tap
po platnu** za `d3-zoom` pun start→end ciklus sa PRAVIM `sourceEvent`-om, pa je
svaki dodir slao upis identične vrednosti (`k1-logovi.txt`, 1:50:41). Dodata je
memorija poslednje prijavljene kamere (`lastViewportRef`, inicijalizovana zapamćenom
vrednošću) i poređenje zaokruženih brojeva. Posle popravke: dva tapa po platnu = nula
upisa. Zaokruživanje se time preselilo iz `PageCanvasView` u `EmbedFlow` (da poređenje
i poruka koriste iste brojeve).

**3. Selekcija preživljava dolazak podataka (`adoptIncoming`).**
Plan je imao `setFlowNodes(nodes)`. Pošto su čvorovi sada LOKALNO stanje, sirov
snimak iz upita bi na svaku tuđu izmenu obrisao selekciju (a od selekcije zavisi
primarna akcija rail-a na idejama/mislima — K5). Zato se `selected` prenosi iz
tekućeg stanja, a ista funkcija prima i „overrides" za pozicije tek pomerenih kartica.

**4. Rollback je u `EmbedFlow`, ne u `PageCanvasView`.** `onMoveNodes` vraća
`Promise`; `PageCanvasView` na grešku pošalje `toast` i **baci dalje**, a `EmbedFlow`
(koji jedini drži čvorove) vrati pozicije. Plan je tražio da `PageCanvasView` „vrati
`flowNodes`" — do tog stanja on nema pristup.

**5. `NodeMove` je generičan (`id`), ne `pageId`.** Potpis `onMoveNodes` tako
neizmenjen služi i K5 (ideje/misli), gde id nije `Id<'pages'>`. Prevod u `pageId`
radi `PageCanvasView`, jedini deo koji zna da su čvorovi stranice.

**6. T6 nije odrađen mišem u browseru — nema web kredencijala u ovom okruženju.**
Dev baza ima dva profila, a lozinka naloga na kome je mobilna sesija nije poznata;
menjati je (`adminAuth`) znači dirati tuđ nalog bez pitanja, a to nije deo zadatka.
Umesto ručnog testa, ne-regresija je dokazana staticki i build-om:
`git diff --stat apps/web/components/` je prazan, `apps/web/app/embed/**` **ne uvozi
ništa** iz `components/workspace/`, nijedan fajl van embed foldera ne uvozi
`canvas-embed`/`embed-node` (provereno grep-om), i `npm run build` prolazi. Desktop
kanvas fizički ne može da vidi ovu izmenu. **Ručnu proveru mišem ipak zapisati kao
otvorenu** — vidi izveštaj faze.

**7. Prekidač u rail-u nema `accessibilityState={{selected}}`.** Pošto se ikonica u
režimu SKLANJA (plan, izmena 5), `selected` bi uvek bio `false` i lagao. Umesto toga
„Gotovo" nosi pun `accessibilityLabel` („Gotovo — završi uređivanje rasporeda"), a
promena režima se najavljuje kroz `AccessibilityInfo.announceForAccessibility`.

**8. Srpska množina za traku „Poništi".** Plan je imao dva oblika; `${n} kartica je
pomereno` za n=2–4 nije srpski. Dodat je `movedLabel` (1 → „Kartica je pomerena.",
2–4 → „N kartice su pomerene.", ostalo → „N kartica je pomereno.").
