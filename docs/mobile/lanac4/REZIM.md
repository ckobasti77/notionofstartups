# Režim „Uredi raspored" — protokol (K1, važi za K2–K5)

> Napisano u fazi K1. Svaka sledeća faza lanca 4 kači svoje uređivanje **na ovaj
> režim** — ne pravi drugi prekidač, ne otvara drugi kanal i ne uvodi drugi obrazac
> za „Poništi".

---

## 1. Zašto režim postoji

Kanvas je na telefonu podrazumevano **za gledanje**: jedan prst pomera platno, dva
zumiraju. Bez režima bi svaki promašen prst pomerio tuđu karticu i taj bi se
pomeraj upisao u bazu i pojavio celom timu. Režim tu grešku čini nemogućom i, uz
to, jasno kaže korisniku **kada su njegovi potezi trajni**.

Odluka korisnika, nije predmet preispitivanja.

---

## 2. Ko je vlasnik čega

| Stanje | Vlasnik | Gde živi |
|---|---|---|
| Da li je režim upaljen | **native** | `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` — `editMode` |
| Odjek režima u grafu | web (embed) | `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` — `CanvasInner.editMode` |
| Pozicije čvorova dok traje potez | web (embed) | `EmbedFlow.flowNodes` (`useNodesState`) |
| Upis pozicije (`movePages`) | **web (embed)** | `PageCanvasView.handleMoveNodes` |
| Upis veličine iz poteza (`resizePage`) | **web (embed)** | `PageCanvasView.handleResizeNode` |
| Upis veličine iz sheet-a (`resizePage`/`resetPageSize`) | **native** | `components/canvas/page-size-sheet.tsx` |
| Upis kamere (`saveViewport`) | **native** | isti ekran, prigušeno 800 ms |
| Traka „Poništi" | native | `components/undo-bar.tsx` + `lib/undo.ts` |

**Zašto je upis pozicije u embedu, a kamera u native-u.** Pozicija mora da ide
zajedno sa optimističkim potezom i da ume da se vrati unazad — to zna samo ona
strana koja drži čvorove. Kamera je podešavanje sesije: prigušuje se, nema
optimističko stanje, a native je već vlasnik dugmadi koja kameru pomeraju
(`fit`, `zoom`). Sporedna, ali stvarna korist: obe funkcije se tako **zovu iz
`apps/mobile/src`**, pa ih grep-metod pariteta više ne broji kao web-only.

---

## 3. Poruke mosta koje je K1 dodao

Kanal je **isti** onaj na kom već stižu `auth` i `theme` — iOS preko `window`,
Android preko `document`. Nema drugog kanala i nema handshake-a (ZA-POPRAVKU Z2).

### native → WebView

| Poruka | Kada | Efekat |
|---|---|---|
| `{type:"mode", value:"edit"\|"view"}` | tap na „Uredi raspored" / „Gotovo", i **ponovo posle svakog `onLoadEnd`** ako je režim upaljen | `nodesDraggable`, ručke za veličinu, obod + pilula, tap više ne otvara čvor |

Nepoznata `value` = `view`. Režim se pali samo eksplicitno.

### WebView → native

| Poruka | Kada | Efekat na native strani |
|---|---|---|
| `{type:"moved", startupId, areaId, rootPageId, count, before:[{pageId,x,y}]}` | posle **uspešnog** `movePages` | `haptics.success()` + traka „Poništi" (`kind:'pageMove'`) |
| `{type:"viewport", startupId, areaId, rootPageId, x, y, zoom}` | `onMoveEnd` koji je izazvao **korisnik** | prigušen `saveViewport` (800 ms) |
| `{type:"resized", startupId, areaId, rootPageId, pageId, width, height, previous:{x,y,width,height}}` | posle **uspešnog** `resizePage` iz poteza ručkom (K2) | `haptics.success()`, traka „Poništi" (`kind:'pageResize'`) i osvežena veličina u lokalnom detalju čvora |
| `{type:"node:actions", nodeId, node}` | **dugi pritisak** na karticu u režimu (`contextmenu`) | otvara native sheet „Veličina kartice" (`page-size-sheet.tsx`) |
| `{type:"toast", level:"error", message}` | `movePages` ili `resizePage` je pukao | `Alert.alert('Greška', message)`; embed sam vraća kartice na staro |

`before` (kod `moved`) odnosno `previous` (kod `resized`) nose stanje **od pre
poteza** — traka „Poništi" ga ne čita iz baze (baza u tom trenutku već drži novo).
Imena su namerno različita jer su i oblici različiti: `moved` nosi **niz** kartica,
`resized` **jednu** (server prima jednu po pozivu). `resized` uz to nosi i NOVU
veličinu, da native sheet posle povlačenja računa „±10%" iz tačne vrednosti.

**Dugi pritisak nije jedini put do sheet-a.** Ista radnja stoji i kao četvrta
ikonica native rail-a kad je izabrana jedna svoja kartica — `contextmenu` je na
WKWebView-u nepouzdan, a ručke se ispod zuma 0.5 uopšte ne crtaju.

---

## 4. Pravila koja važe za svaku sledeću fazu

1. **Jedan upis po potezu.** Piše se na `onNodeDragStop` (odnosno na kraj
   odgovarajućeg gesta), nikad po frejmu. Čvor prati prst iz lokalnog stanja.
2. **Svaki upis ima „Poništi".** Isti modul-store (`lib/undo.ts` + `UndoBar`), nov
   član unije `UndoAction` — ne nova traka.
3. **Ne piše se ono što se nije promenilo.** `nodeDragThreshold={5}` + poređenje
   **zaokruženih** koordinata. Drhtaj prsta nije izmena.
4. **Živi upit ne sme da pregazi prst.** `draggingRef` + `pendingRef` u
   `EmbedFlow`: dolazni snimak se tokom poteza pamti, a posle poteza primenjuje sa
   našim pozicijama preko njega. Bez toga kartica „pobegne" ispod prsta.
5. **Šta se sme pomeriti mora da se vidi.** Povlačiv čvor nosi xyflow klasu
   `draggable`, pa ga CSS pravilo `.embed-edit .react-flow__node.draggable`
   obeleži isprekidanim obodom. Tuđa kartica (`draggable:false`) ostaje bez
   oznake — i backend je odbija (`Možete pomerati samo svoje kartice.`).
6. **Znak režima je u WebView-u, ne samo na dugmetu.** Obod + pilula
   „Uređivanje rasporeda", oboje `pointer-events-none`.
7. **Režim je inertan bez handlera.** `canEdit = editMode && !!onMoveNodes` —
   vrsta kanvasa koja još nema upis ne dobija ni povlačive čvorove ni vizuelni
   znak koji bi lagao. **K5 za ideje/misli dodaje samo handler.**
8. **Nijedan nov objektni prop na `<WebView>`.** Sve živo ide kroz `postMessage`
   (ZA-POPRAVKU Z1: promena reference propa reloaduje stranicu).
9. **Swipe-back ostaje isključen** (`(app)/_layout.tsx`, `gestureEnabled:false`).
10. **Dodirna meta 44pt.** Ako se web ručka ne može povećati, menja se
    interakcija — ne prst.

---

## 5. Šta se dešava na reload

Embed posle učitavanja **uvek starta u gledanju** (njegov `editMode` je lokalan
state). Native zato u `onLoadEnd` ponovo pošalje `mode` ako je režim upaljen.
Bez toga bi posle „Pokušaj ponovo" native pokazivao „Gotovo", a kartice se ne bi
pomerale.

Isti razlog: `mode` **ne sme** da uđe u URL ni u `injectedAuth`.

---

## 6. Ponašanje dodira (provereno u xyflow 12.11.2)

U režimu xyflow povlačivom čvoru dodaje i klasu `nopan`
(`isDraggable → noPanClassName`), pa `d3-zoom` dodir koji je počeo **na
povlačivoj kartici** ne vidi:

- prst na **svojoj** kartici → pomera karticu;
- prst na tuđoj kartici, ghost-u ili praznom platnu → pomera platno (**u oba
  režima**);
- dva prsta → zum, osim ako prvi prst padne na povlačivu karticu (P2 niže).

---

## 7. Prihvaćena ograničenja (ne prijavljivati kao bag)

- **P2 — pinč koji počne nad svojom karticom u režimu ne zumira.** Posledica
  `nopan`/`stopImmediatePropagation` mehanike. Izlaz uvek postoji: `[+]` / `[−]`
  u rail-u idu kroz most i nezavisni su od dodira. Ne „popravlja se" smanjivanjem
  dodirne mete.
- **P9 — zapamćena kamera je zajednička sa desktopom.** `pageCanvasViewports` je
  red po `viewerProfileId` + scope, isti za oba klijenta: pan na telefonu menja
  početni pogled istog korisnika na desktopu. Web se isto ponaša između svojih
  prozora — prihvaćeno svesno.
- **Ručke za veličinu se ne crtaju ispod zuma 0.5** (K2, `HANDLE_MIN_ZOOM`). Na
  `minZoom={0.15}` je kartica od 288 px na ekranu ~43 px, pa bi je četiri mete od
  44pt potpuno prekrile i onemogućile i sam izbor. Put do veličine ispod praga
  postoji i tada: rail → „Veličina kartice" → „Umanji / Uvećaj (±10%)". Ne rešava se
  smanjivanjem dodirne mete.
- **Bočne ručke (`top`/`right`/`bottom`/`left`) ne postoje** — samo četiri ugla.
  Prstom se bočna ručka ne pogađa, a ugao + ±10% pokrivaju svaki ishod.
- **Gest ručke koji preuzme native sloj se ne može otkazati spolja.** Dugi pritisak
  na ručku otvori sheet; Android tada prestane da isporučuje dodir WebView-u i
  `touchend` nikad ne stigne do stranice, pa `d3-drag` ostaje naoružan. Naša kapija
  se otključava odmah (`contextmenu`) i, kao mreža, po isteku `GESTURE_STALE_MS`;
  sam d3 gest ne umemo da ubijemo iz JS-a. Posledica u najgorem slučaju je jedna
  promena veličine koja **uvek** ostavlja traku „Poništi" (ZA-POPRAVKU Z7).
- **Guma-selekcija i ugnježdavanje prevlačenjem se NE prenose** (`PARITET.md`,
  sekcija Z): na telefonu nema modifikatora, a ista tačka dodira sa dva ishoda
  (pomeri / ugnjezdi) bi značila slučajno slanje zahteva celom timu.
  Ugnježdavanje već postoji native u `page-actions-sheet.tsx`.
