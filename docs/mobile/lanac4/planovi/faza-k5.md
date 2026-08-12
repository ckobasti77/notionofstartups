# Faza K5 — Ideje i Misli u istom režimu

**Plan za ovu fazu nikad nije napisan.** Korak PLANIRANJA je trebalo da proizvede ovaj
fajl; umesto njega je commit `1d3f3dd` dodao samo prompt
(`lanac4/promptovi/faza-k5-plan.txt`). To potvrđuje i `lanac4/IZVESTAJ.md`:
„PLAN: **nije napisan**". Fajl je zato otvoren tek u reviziji, i sadrži samo nju.

---

## REVIZIJA

Opseg: `git diff 1f515e8..HEAD` — commitovi `1d3f3dd` (Plan) i `6668cb4` (Faza K5).
Ukupno promenjeno koda: **jedan fajl, 16 linija** (`apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx`).
`apps/web` i `packages/backend` — **prazan diff**.

### 1. Je li CILJ ispunjen? — **NE**

Cilj je bio: „Kanvas ideja i kanvas misli imaju isti režim uređivanja kao kanvas
oblasti." Nijedna linija nije napisana u tom pravcu.

Dokaz da posao nije ni započet:

- `canvas-embed.tsx:312–314` — komentar iz K3 doslovno kaže: „ideje i misli ih dobijaju
  **bez handlera** … pa je kod njih i režim i biranje **inertno** (pravilo 7 iz
  `REZIM.md` — **K5 dodaje samo handler**)." Handler nije dodat.
- `IdeasFlow` renderuje `<EmbedFlow>` (`canvas-embed.tsx:1088–1097`) i `ThoughtsFlow`
  (`:1219–1228`) — nijedan ne prosleđuje `onMoveNodes`, `onResizeNode` ni `onConnectNodes`.
- `canvas-embed.tsx:488–489`: `canEdit = editMode && !!onMoveNodes` → za obe grane
  **false**; `:917` `nodesDraggable={canEdit && !connecting}` → **false** zauvek.
- Native strana: `supportsEdit = isPageKind` (`[id].tsx:268`), a prekidač režima se
  montira samo `supportsEdit ? toggleEdit : undefined` (`:701`) — na kanvasu ideja i
  misli dugme **„Uredi raspored" se i ne prikazuje**.

Ono što je stvarno isporučeno pod naslovom „Faza K5" je **popravka repa Faze K4**:
grana `moved` sada čita `msg.checkpoints` i gura ih u istu `pushUndo` stavku
(`[id].tsx:471, :477, :488`, unija `lib/undo.ts:48`, izvršenje `undo-bar.tsx:131–137`).
To je ispravno napisano, ali je **nedostižno u izvršavanju**: native nikad ne šalje
`{type:'checkpoints'}` (nula pogodaka u `apps/mobile/src`), a kanvas zadatka je sa
telefona nedostupan (`ZA-POPRAVKU.md` §8). Ta izmena je zatvorila crveni `tsc`, ne
funkciju.

`IZVESTAJ.md` za K5 to i beleži: „IZVRSI: **PAO** (kod 1)", „popravka 1: jos pada tsc
mobilni", „popravka 2: sve kapije prolaze". Faza je zaključena na osnovu zelenih
kapija, a kapije ne vide funkciju koje nema. **Poruka commita `6668cb4` ne odgovara
sadržaju.**

Backend nije bio prepreka — sve što je K5 trebalo da pozove već postoji:
`ideas.updatePositions:444`, `updateLayout:573`, `resetLayoutSize:618`, `connect:686`,
`disconnect:754`, `updateEdgeLabel:775`; `thoughts.moveNodes:513`,
`updateNodeLayout:543`, `resetNodeLayoutSize:575`, `createEdge:1053`, `updateEdge:1107`,
`archiveEdges:1142`.

### 2. Kvadratići čekirani u `PARITET.md` u ovoj fazi — **nijedan**

`git diff 1f515e8..HEAD -- docs/mobile/PARITET.md` je **prazan**. Fajl ima sekcije
K1, K2 i K3; sekcija za K4 i K5 **ne postoji**. Znači: nema lažnog izveštaja u
`PARITET.md` iz ove faze — ali nema ni traga da se faza dogodila.

Dve stvari koje ipak treba znati:

- `PARITET.md:361–364` (A8, checkpointi) — i dalje nečekirano, što je tačno stanje
  (`ZA-POPRAVKU.md` §8 to izričito uslovljava).
- `PARITET.md:111–112` `thoughts.moveNodes` **jeste** `[x]`, ali dokaz je
  `misli.tsx:82` („Sredi raspored" — automatska mreža sa liste), **ne** potez prstom po
  kanvasu. Isto važi za `thoughts.createEdge` (`:106`). Zato brojač pariteta **ne može**
  da otkrije da K5 nije urađen — te mutacije su odavno prebrojane kroz listu. Brojač
  ovde nije merilo; formulacija cilja jeste.

### 3. Je li desktop kanvas ostao netaknut? — **DA, ali bez zasluge**

`git diff 1f515e8..HEAD -- apps/web packages/backend` je prazan. Ništa nije dirano jer
ništa nije ni rađeno. Ovo nije dokaz da je rizik lanca savladan — samo da ova faza nije
imala priliku da ga aktivira.

Otvoreno i dalje: **T9 (desktop kanvas proveren mišem) nije odrađen ni u K1, ni K2, ni
K3, ni ovde — četvrta faza zaredom.** Ne-regresija desktopa i dalje stoji samo na
statičkom argumentu (prazan diff + embed ne uvozi ništa iz `components/workspace/` +
`npm run build` prolazi).

### 4. Je li „Uredi raspored" zaista režim? — **DA**, i za ideje/misli dvostruko

Slučajno pomeranje u gledanju nije moguće:

- Embed: `nodesDraggable={canEdit && !connecting}` (`canvas-embed.tsx:917`), a
  `canEdit` traži `editMode` **i** postojanje handlera (`:488`). Prag
  `nodeDragThreshold={5}` (`:919`) sprečava da drhtaj prsta uđe u potez.
- `editMode` u embedu se pali isključivo porukom `{type:'mode'}`, čiji je vlasnik native
  ekran (`[id].tsx:158`, `:304`).
- Na idejama i mislima postoje **dve nezavisne brave**: native ne nudi prekidač
  (`:268`, `:701`), a i da poruka nekako stigne, `canEdit` ostaje `false` jer nema
  `onMoveNodes`.

Cena te ispravnosti: režim je na idejama i mislima **potpuno mrtav**. To je bezbedno
i pošteno (nema dugmeta koje laže), ali je i tačna mera da faza nije urađena.

### 5. Dodirne mete manje od 44pt u dodatom? — **NE, jer nije dodata nijedna meta**

16 dodatih linija su čista logika u `onMessage` handleru i jedno polje u tipu poruke.
Nula novog UI-ja, nula novih dodirnih meta. Ovo nije plus — nema šta da se meri.

### 6. Najslabije u ovoj fazi i šta sledeća mora da popravi

**Najslabije: faza je zatvorena kao gotova iako cilj nije ni taknut.** Jedina kapija
koja je pala bio je `tsc`, i to zbog **prethodne** faze; kad je i on prošao, lanac je
prešao dalje. Nijedan gejt u lancu (`tsc`, `lint`, `test`, brojač pariteta) ne ume da
vidi funkciju koje nema — a `PARITET.md` je jedini mehanizam koji bi to uhvatio i on
u ovoj fazi nije ni otvoren. Uz to, K5 je nasledio nezatvoren K4 (`ZA-POPRAVKU.md` §8)
i potrošio se na njegov rep.

Sledeća faza mora, tim redom:

1. **Popraviti izveštaj pre koda.** `IZVESTAJ.md` za K5 mora da kaže da cilj nije
   ispunjen, a `6668cb4` da se u lancu vodi kao popravka K4, ne kao K5.
2. **Zatvoriti K4** (Izmene 11 i 12, `ZA-POPRAVKU.md` §8) — dok on stoji, `checkpoints`
   grana iz ovog commita ostaje mrtav kod, a A8 nečekiran.
3. **Napisati plan za K5** u ovaj fajl, pa tek onda kod.
4. **Dodati handlere** u `IdeasFlow` i `ThoughtsFlow` (`canvas-embed.tsx:1088`, `:1219`)
   — sve mutacije već postoje (spisak u §1), backend se ne dira.
5. **Zamka koju nenapisan plan nije uhvatio, a ova dva kanvasa nose:** embed ugnježdene
   čvorove crta u **apsolutnim** koordinatama (`IdeasFlow` `absolute()` `:1044–1058`,
   `ThoughtsFlow` `:1172–1186`), dok baza i desktop čuvaju poziciju **relativno u odnosu
   na roditelja** — desktop koristi xyflow `parentId` (`ideas-canvas-view.tsx:209`) pa
   njegov `node.position` već jeste relativan (`:976`). Naivno vezivanje
   `onNodeDragStop` → `updatePositions` sa embed pozicijom upisalo bi svakoj ugnježdenoj
   ideji/misli poziciju uvećanu za offset roditelja — čvor bi „odskočio" na sledeći
   render, a greška bi bila tiha (nema tipa koji to razlikuje). Kanvas oblasti ovaj
   problem nema, pa se rešenje iz K1 **ne prepisuje neizmenjeno**.
6. **Proširiti `supportsEdit`** ([id].tsx:268) i napraviti sheet-ove čvora za ideju i
   misao — `page-node-sheet.tsx` je vezan za `pages`, ne može se ponovo upotrebiti kakav
   jeste. Novi članovi unije u `lib/undo.ts` za oba tipa poteza.
7. **T9 konačno odraditi** ili ga formalno preneti u `ZA-POPRAVKU.md` kao blokiran uz
   uslov (kredencijali), da prestane da se tiho prenosi iz faze u fazu.

**Revizija: 2026-08-12.** Kapije provereno u trenutku revizije: `apps/mobile`
`npx tsc --noEmit` prolazi (exit 0). Ostale kapije nisu ponovo pokretane — nije bilo
promene koda koju bi mogle da ocene.
