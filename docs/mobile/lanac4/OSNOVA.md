# Osnova lanca 4 — uređivanje kanvasa na telefonu

*Zapisano 12.08.2026, pre pokretanja `kanvas-lanac.ps1`.*

## Zašto ovaj lanac postoji

Korisnik: „mnogo komandi sa websajta nema na telefonu — resizing, moving objects,
linking. I ne samo to, želim sve funkcionalnosti iste kao na websajtu."

U `PARITET.md`, sekcija Z, tih deset funkcija stoji kao **izuzetak**, sa mojim
obrazloženjem da „unos koordinata prstom bez direktne manipulacije nije
upotrebljiv". **To obrazloženje je bilo pogrešno** i ovaj lanac ga poništava.
Pogrešno je zato što je pretpostavilo da direktne manipulacije nema — a ima je,
samo je trebalo uključiti.

## Šta je zatečeno (provereno, ne pretpostavljeno)

**Mobilni kanvas nije nativni ekran.** To je `WebView` nad
`apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` (803 linije), koji vrti
**isti `@xyflow/react`** kao desktop.

**Autentikacija već postoji.** `canvas-embed.tsx:116-160`: native injektuje token u
`window.__DEVOTION_AUTH__` pre učitavanja stranice, embed od njega pravi
`ConvexReactClient` i zove `setAuth`. Osvežavanje tokena ide kroz most
(`{type:"auth"}`), bez pravljenja novog klijenta — socket i pan/zoom preživljavaju.

**Zaključak:** mutacije iz embeda rade odmah, kao prijavljen korisnik. Ne treba
nijedna nova biblioteka, nijedan novi ekran i nijedna nova backend funkcija.

**Uređivanje je isključeno sa dve zastavice** — `canvas-embed.tsx:347-348`:

```tsx
nodesDraggable={false}
nodesConnectable={false}
```

Ispod njih već stoji `elementsSelectable`, `panOnDrag`, `zoomOnPinch`,
`zoomOnScroll` — dakle dodir je već obrađen, samo se ništa ne sme pomeriti.

## Deset funkcija koje fale

Mereno komandom iz `PARITET.md` (razlika je 17):

**Kanvas oblasti i stranica**
`areasV2.movePages`, `areasV2.resizePage`, `areasV2.resetPageSize`,
`areasV2.saveViewport`, `areasV2.connectPages`, `areasV2.disconnectPages`

**Checkpointi zadataka**
`taskCheckpoints.saveCanvasPlacement`, `taskCheckpoints.resetCanvasSize`,
`taskCheckpointCanvasEdges.connect`, `taskCheckpointCanvasEdges.disconnect`

Web ih koristi iz `apps/web/components/workspace/area-canvas-view.tsx:356-361`.

Ideje i Misli su bliže: `thoughts.moveNodes` mobilni već zove iz `misli.tsx:82`,
ali sa liste, ne iz kanvasa.

Preostalih 7 od 17 ostaju izuzeci: `activity.listForStartup` (mobilni koristi
bolji `listPaginated`), `areasV2.getCanvas` i `getPageCanvasByPage` (lažno
pozitivni — idu kroz WebView), `areasV2.resolveRoute` (expo-router),
`notifications.latest` (web in-app toast), `pageFiles.prune`,
`pushSubscriptions.myDeviceCount` (mobilni koristi Expo push).

**Cilj lanca: 17 → 7.**

## Odluka o interakciji

Korisnik je izabrao **režim „Uredi raspored"**, ne uvek-uključeno uređivanje.

Kanvas je podrazumevano za gledanje: jedan prst pomera platno, dva zumiraju.
Dugme pali režim; tek tada se čvorovi povlače, menjaju veličinu i povezuju.

Razlog: na telefonu se lako desi da prstom pomeriš čvor dok si hteo da pomeriš
platno — a to piše u bazu i vidi ga ceo tim. Režim tu grešku čini nemogućom, i
uz to jasno kaže korisniku kada su njegovi potezi trajni.

## Šta je pravi posao (nije u zastavicama)

1. **Povlačenje čvora vs pomeranje platna** — jedan prst mora da radi obe stvari
   zavisno od toga gde je dodir počeo.
2. **Ručke za promenu veličine** — web ih crta ~8px, za miš. Dodirna meta mora
   biti 44pt. Ako ne može da se poveća, menja se interakcija, ne prst.
3. **Povezivanje** — React Flow handle je tačkica; prevlačenje niti prstom je
   promašaj za promašajem. Obrazac koji radi: tapni izvor → tapni cilj.
4. **Poništi** — obrazac trake iz Faze 5 prethodnog lanca, primenjen i ovde.

## Najveći rizik

**Regresija na desktop kanvasu.** Embed i desktop dele biblioteku i deo logike;
ako se logika vuče iz `area-canvas-view.tsx`, mora da se izdvoji u zajednički
modul, a desktop da se dokaže da radi isto. Revizor u svakoj fazi to izričito
proverava.
