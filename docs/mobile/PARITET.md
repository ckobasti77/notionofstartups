# PARITET — web ⇄ mobilni

> **Agente: čitaj ovaj fajl na početku SVAKE iteracije i čekiraj `[x]` čim nešto
> završiš, u istom commit-u sa kodom.** Ovo je tvoja memorija između iteracija.
> Nemoj da veruješ svom kontekstu — veruj ovom fajlu.

## Kako je lista napravljena (ponovi kad sumnjaš)

Nije nastala klikanjem nego poređenjem stvarno pozvanih Convex funkcija.
**Zamka metode:** za funkcije sa `target` unijom (`collaboration.*`) grep po
imenu NE meri paritet — mobilni može da zove funkciju samo za neke `target.kind`
vrednosti (viđeno: `area` doprinosi, checkpoint nit — ZA-POPRAVKU §5.7). Za njih
se paritet meri po vrsti mete.

```bash
grep -rhoE "api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+" apps/web/components apps/web/app | sort -u > /tmp/w.txt
grep -rhoE "api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+" apps/mobile/src              | sort -u > /tmp/m.txt
comm -23 /tmp/w.txt /tmp/m.txt   # samo na webu
```

Stanje na početku: **web 160, mobilni 110, razlika 63.**
Cilj nije 0 — neke funkcije opravdano ne idu na telefon. Cilj je da svaka od 63
bude ili **urađena** ili **zapisana kao IZUZETAK sa razlogom** u sekciji Z.

## Šta paritet OVDE znači

Paritet je **funkcionalni, ne vizuelni**. Ne prekopavaj web layout na telefon.
Za svaku stavku pitanje je: *može li korisnik na telefonu da postigne isti ishod?*

Prevod obrazaca web → telefon:

| Web | Telefon |
|---|---|
| hover meni / desni klik | long-press → bottom sheet |
| modal dijalog | bottom sheet, sadržaj skrolabilan |
| sidebar | tab ili ekran |
| drag & drop | dugmad „Premesti gore/dole" ili sheet sa izborom cilja |
| tabela sa mnogo kolona | kartica po redu, kolone kao meta-podaci |
| tooltip | podnaslov u redu, ili ništa |

Pravila koja važe uvek: tekst min 16px osim `meta`; dodirna meta min 44pt;
svaki red kroz `components/ui/row.tsx`; safe area; `busy` lock na svakoj mutaciji.

---

# 0 — BLOKATOR: SVI KANVASI VRAĆAJU 404

**REŠENO 10.08. u Fazi 0 lanca (commit `8d69cfd`).** Uzrok: na portu 3000 je radio
projekat `alati`, a Devotion je tiho pobegao na 3001; plus je nedostajao
`allowedDevOrigins` za emulator. Dokazi i screenshot-i: `docs/mobile/KANVAS-DIJAGNOZA.md`.

~~Ovo se rešava PRVO. Dok ovo stoji, kanvas, Misli i editor preko WebView-a ne
mogu ni da se testiraju.**

Dokaz, uhvaćen na emulatoru:

1. Ekran „Ideje" → kanvas: **„Canvas se ne može učitati — Greška 404."**
2. Ekran „Misli" → kanvas: **ista greška**
3. U Chrome-u UNUTAR emulatora otvoren `http://10.0.2.2:3000/embed/canvas/ideas/proba`
   → vraća **Next.js stranicu „404 | This page could not be found."**
4. Ta 404 stranica ima **tuđe zaglavlje** — hamburger meni, narandžasti okrugli
   logo i sun/dark prekidač. Devotion nema takvo zaglavlje.

Zaključak: na portu 3000 **radi neki drugi Next.js projekat**, ne Devotion. Zato
svaka `/embed/*` ruta 404-uje. Ruta `apps/web/app/embed/canvas/[kind]/[id]/page.tsx`
postoji na disku i ispravna je — problem nije u kodu nego u tome šta sluša na 3000.

Ovo takođe znači da **prethodne „popravke kanvasa" nisu ni mogle da se provere** —
sve vreme se testiralo protiv pogrešnog servera.

- [x] Utvrdi šta zauzima port 3000 (`netstat -ano | findstr :3000`, pa `tasklist /FI "PID eq <pid>"`)
- [x] Ugasi to, pa pokreni `npm run dev` iz `notion-clone`
- [x] Potvrdi u browseru na hostu: `http://localhost:3000/embed/canvas/ideas/proba` renderuje Devotion, ne 404
- [x] Potvrdi u Chrome-u u emulatoru: `http://10.0.2.2:3000` je Devotion
- [x] Tek onda otvori kanvas u aplikaciji i **napravi screenshot sa vidljivim oblačićima**
- [x] Ako i posle ovoga kanvas ne crta — tek TADA je bag u kodu; bisektuj po `PROMPT-KANVAS-GOAL.md`

---

# A — CELE FUNKCIONALNOSTI KOJE FALE

## A1. Misli (thoughts) — 18 funkcija, najveća rupa

> **ZATVORENO 10.08. (grana `paritet-20260810-0252`).** Svih 18 funkcija sada ima
> stvarno mesto poziva na mobilnom: native lista `/misli` (radi bez WebView-a),
> detalj `/misao/[id]`, akcioni sheet, edge sheet, konverzioni sheet i traka
> „Poništi". Stavka „Misli" u `vise.tsx` sada vodi na LISTU (`route: '/misli'`),
> a kanvas ostaje dostupan iz zaglavlja liste (isti dualitet kao `ideje.tsx`);
> pretraga vodi pravo na `/misao/[id]` (deep-link sada postoji).

Web ima pun sistem: `thoughts-canvas-view.tsx`, `thought-editor-dialog.tsx`,
`thought-conversion-dialog.tsx`, `thought-destination-picker.tsx`.
Mobilni ima samo `thought-create-sheet.tsx` i `thought-node-sheet.tsx`.

Provereno na ekranu: stavka „Misli" u `vise.tsx` **jeste živa** i vodi na kanvas —
ali kanvas 404-uje (sekcija 0). Ostaje sve ostalo.

Embed ruta (`canvas-embed.tsx:292`) **podržava `kind === "thoughts"`**, pa se graf
crta kroz WebView — treba ti native akcije okolo, ne nov graf.

- [x] Ulazna tačka za Misli u `vise.tsx` — POSTOJI, provereno na emulatoru
- [x] `thoughts.listNodes` / `listEdges` / `getCanvas` — lista misli kao alternativa grafu
      — `apps/mobile/src/app/(app)/misli.tsx:63` (listNodes, paginirano) / `:72`
      (listEdges, brojači veza) / `:79` (getCanvas, zoom za „Sredi raspored");
      listNodes/listEdges i u pikerima sheet-a (`thought-actions-sheet.tsx:107`, `:113`)
- [x] `thoughts.createEdge` / `updateEdge` / `archiveEdges` / `restoreEdges` — veze
      — `thought-actions-sheet.tsx:96` (createEdge, prikaz „Poveži sa misli…");
      `thought-edge-sheet.tsx:44` (updateEdge, naziv veze) / `:45` (archiveEdges,
      „Prekini vezu"); `components/undo-bar.tsx:87` (restoreEdges, generička traka
      „Poništi" — Faza 5 zamenila `thought-undo-bar.tsx`)
- [x] `thoughts.moveNodes` / `updateNodeLayout` / `resetNodeLayoutSize` / `saveViewport`
      — `misli.tsx:82`/`:83` (moveNodes+saveViewport: „Sredi raspored" — mreža u
      pozitivnom kvadrantu, samo top-level ≤50, čuva zoom iz getCanvas);
      `thought-actions-sheet.tsx:101`/`:102` (updateNodeLayout/resetNodeLayoutSize:
      prikaz „Veličina oblačića" sa presetima 264×196/360×280/520×420 kao web)
- [x] `thoughts.nestNode` / `toggleNodeParent` / `detachNode` — ugnježdavanje
      — `thought-actions-sheet.tsx:97` (nestNode, prikaz „Ugnjezdi u…") / `:99`
      (toggleNodeParent, „Proglasi glavnom") / `:98` (detachNode, „Izdvoji iz grupe")
- [x] `thoughts.duplicateNodes` — `thought-actions-sheet.tsx:100` („Dupliraj",
      ofset 38×38 kao web)
- [x] `thoughts.getConnectedGroup` — izbor povezane grupe
      — `apps/mobile/src/app/(app)/misao/[id].tsx:71`: napaja CEO detalj misli
      (reaktivno; sekcije „Veze" i „Povezana grupa" + „Pošalji grupu u Ideje")
- [x] `thoughts.convertToIdeas` — pretvaranje misli u ideje (uzor `thought-conversion-dialog.tsx`)
      — `thought-conversion-sheet.tsx:78`; ulazi: detalj („Pošalji u Ideje" +
      grupa), akcioni sheet sa liste, i multi-selekcija na kanvasu („U Ideje (N)",
      `canvas/[kind]/[id].tsx` trosmerna primarna akcija rail-a)
- [x] `thoughts.restoreNodes` — vraćanje obrisane misli
      — `components/undo-bar.tsx:86` (Faza 5: generička traka zamenila
      `thought-undo-bar.tsx`, store `lib/undo.ts`); posle svakog arhiviranja
      (lista/detalj/kanvas) traka „Poništi" stoji 8s + eksplicitno ✕; redosled
      restoreNodes→restoreEdges je ugovor backenda. Backend NEMA upit za
      arhivirane misli (`listNodes` tvrdo filtrira `archivedAt: null`), pa je
      in-memory undo jedini put bez izmene backenda — isto radi i web
      (`workspace-history.tsx`).

## A2. Administracija startupa — 9 funkcija

> **ZATVORENO (grana `paritet-20260810-0252`).** Novi ekran „Administracija
> startupa" (`admin-startup.tsx`) + dva sheet-a
> (`components/admin/create-startup-sheet.tsx`,
> `components/admin/add-member-sheet.tsx`) + akcije dodate u postojeći
> `clanovi.tsx`. Ulaz je nova `adminOnly` stavka u `vise.tsx` — isti
> dvostruki gejt kao za Članove/Pozivnice (meni sakriva ulaz, `requireAdmin`
> na serveru je stvarna brana, `ErrorBoundary` na svakom ekranu hvata
> odbijanje). Backend NIJE dirán — svih 9 funkcija je već postojalo i već je
> bilo iza `requireAdmin` (izuzetak niže).

Web `admin-dialog.tsx` sve to ima. Mobilni je imao samo pozivnice i **listu
članova bez ijedne akcije**.

- [x] `startups.create` — pravljenje novog startupa
      — `components/admin/create-startup-sheet.tsx:37` (mutacija), `:52`
      (poziv u `submit()`); ulaz: red „Napravi novi startup" u
      `admin-startup.tsx:246-256`, uvek vidljiv (radi i bez izabranog
      startupa — bootstrap slučaj); uspeh prebacuje `activeStartupId` na novi
      startup (`admin-startup.tsx:334`, `onCreated`)
- [x] `startups.update` — ime, opis
      — `admin-startup.tsx:73` (mutacija), `:103-107` (poziv u
      `saveStartup()`); polja naziv/opis, dugme „Sačuvaj" busy-locked
      (`busySave`)
- [x] `startups.setLogo` / `removeLogo` / `generateLogoUploadUrl` — logo
      — `admin-startup.tsx:74-76` (mutacije), `:128` (`generateLogoUploadUrl`),
      `:136` (`setLogo`), `:195` (`removeLogo`, iza potvrde „Ukloniti logo?");
      `expo-image-picker` (već instaliran) — galerija/kamera po uzoru na
      `profil.tsx`; limit 2 MB (ogleda `validateLogo` na serveru, ne 5 MB kao
      avatar); `generateLogoUploadUrl` vraća URL string direktno (bez
      `token`), pa `setLogo` nema `token` argument — namerna razlika od
      avatar toka, ne propust
- [x] `startups.addMember` / `removeMember` — dodavanje i uklanjanje člana
      — dodavanje: `components/admin/add-member-sheet.tsx:36` (mutacija),
      `:53` (poziv), `profiles.listAll` minus već-učlanjeni, tap odmah dodaje
      (nije destruktivno, bez potvrde); uklanjanje: `clanovi.tsx:61`
      (mutacija), `:85` (poziv u `confirmRemove`/`doRemove`), dugme samo za
      `role !== 'admin'` članove (ista odluka kao web), `Alert.alert`
      potvrda sa `style: 'destructive'` koja imenuje posledicu (gubi pristup
      odmah, skida se sa zadataka gde je izvršilac — zadaci ostaju).
      Dugme „Dodaj člana" ima klijentski `profile.role === 'admin'` gejt
      (`clanovi.tsx:105`) — `rn-review` je uhvatio da `profiles.listAll` baca
      kao QUERY (ne mutacija), pa bi ne-admin koji otvori sheet oborio ceo
      ekran na `ErrorBoundary` umesto da dobije običan `Alert` kao kod
      uklanjanja; dugme se zato sakriva pre nego što do toga dođe.
- [x] `startups.reorderAreas` — redosled oblasti (na telefonu: „gore/dole", ne drag)
      — `admin-startup.tsx:77` (mutacija), `:220` (poziv u `moveArea()`);
      dugmad gore/dole po redu oblasti (ne `Row disabled` — svako dugme nosi
      svoj `disabled`, jer bi `Row disabled` prigušio i dugmad u `value`
      slotu), prvo/poslednje dugme onemogućeno, svi dugmići zaključani dok je
      potez u letu (`busyAreaId`)
- [x] `profiles.listAll` — izbor korisnika pri dodavanju člana
      — `components/admin/add-member-sheet.tsx:35`; lokalna pretraga po
      imenu/emailu nad rezultatom
- [x] Sve iza `requireAdmin`, i sakriveno u meniju ako korisnik nije admin
      — meni: `vise.tsx:65` (`adminOnly: true` na novoj stavci „Administracija
      startupa" → `/admin-startup`); backend: svih 8 `startups.*` +
      `profiles.listAll` poziva već zove `requireAdmin` (`startups.ts`,
      `profiles.ts`, nepromenjeno).
      **IZUZETAK:** `startups.reorderAreas` na backendu zove
      `requireStartupMember`, NE `requireAdmin` (isto ponašanje kao na
      webu — sidebar drag&drop je tamo dozvoljen svakom članu, van
      `admin-dialog.tsx`). Zadatak zabranjuje izmenu backenda. Za razliku od
      `listMembers` u `clanovi.tsx` (gde je čitanje koje pokreće ekran samo
      po sebi iza `requireStartupMember`, ali ekran ne nudi nijednu pisanu
      radnju pa nema šta da se zloupotrebi), `reorderAreas` JESTE pisana
      radnja — bez dodatne provere bi deep-link na `/admin-startup` ne-adminu
      stvarno dozvolio da pomeri oblasti (uhvatio `parity-check` agent u
      verifikacionoj rundi). Zato `admin-startup.tsx` zadržava eksplicitnu
      `profile.role === 'admin'` proveru unutra (`admin-startup.tsx:244`) — jedino mesto
      u ovom koraku koje odstupa od „samo server gejtuje" obrasca, i to
      namerno, sa objašnjenjem u doc-komentaru fajla.

## A3. Zadaci — pregled celog startupa

Mobilni `danas.tsx` koristi samo `tasks.commandCenter` (moji zadaci danas).
Web ima i `tasks-view.tsx` + `task-table-view.tsx` nad `tasks.listForStartup`.

- [x] `tasks.listForStartup` — svi zadaci startupa, ne samo moji
      — nov ekran `zadaci.tsx` (tab „Više" → „Svi zadaci"), `zadaci.tsx:95`
      (`usePaginatedQuery(api.tasks.listForStartup, ...)`, status/izvršilac
      server-side); ulaz `vise.tsx:57` (`route: '/zadaci'`)
- [x] Filteri: status, prioritet, izvršilac, rok (na telefonu: sheet sa filterima, ne kolone)
      — nov `components/zadaci/tasks-filter-sheet.tsx` (4 sekcije, `OptionChip`,
      primena odmah); status/izvršilac server-side (`zadaci.tsx:90-106`),
      prioritet/rok/nedodeljeno klijentski nad `classifyDeadline`
      (`zadaci.tsx:132-159`, `@/lib/deadline`); mont. `zadaci.tsx:427`
- [x] Grupisanje po statusu, sa brojem u zaglavlju grupe
      — `zadaci.tsx:161-170` (`grouped`, samo kad je status filter „Svi"),
      `SectionHeader` (deljena komponenta) `zadaci.tsx:376`; kad je status filter
      na konkretnoj vrednosti: ravna lista + summary red „N zadataka"
      (`zadaci.tsx:382-386`)
- [x] Izmena statusa/prioriteta direktno iz liste (`areasV2.updatePage`)
      — `zadaci.tsx:197` (mutacija), `patchTask` `zadaci.tsx:210-225` (`busyTaskId`
      brava); `TaskCard`/`TaskActionsSheet` ponovo upotrebljeni bez izmene, kačeni
      na `areasV2.updatePage` (STROŽI model — samo kreator, dosledno
      web `tasks-view.tsx`/`task-table-view.tsx`, ne Danas-ovom izuzetku za
      izvršioca)

## A4. Ideje — organizacija i konverzija

> **ZATVORENO 11.08. (Faza 5, grana `paritet-nocni-20260811-0711`).** Nov deljeni
> `components/ideja/idea-actions-sheet.tsx` (ulazi: „…" na detalju ideje —
> `ideja/[id].tsx:186`, sada bezuslovno — i long-press na kartici liste,
> `ideje.tsx:228`; mountovi `ideja/[id].tsx:261`, `ideje.tsx:243`), plus
> `idea-edge-sheet.tsx`, `idea-edges-section.tsx` (sekcija „Veze" na detalju,
> `ideja/[id].tsx:244`) i `idea-convert-sheet.tsx`. Web gestovi sa kanvasa
> (drag ručica→ručica, drop-na-karticu) prevedeni u pickere — ista tabela
> prevoda kao A1.

- [x] `ideas.convertToPage` — ideja postaje stranica/zadatak
      — `idea-convert-sheet.tsx:53` (mutacija), `:82` (poziv u `submit()`);
      vrsta (zadatak/beleška) + oblast kao web dijalog, po uspehu direktna
      navigacija na rezultat; red „Pretvori u stranicu" vidljiv samo
      `isApproved && !convertedPageId` (`idea-actions-sheet.tsx:269`) — server NE
      čuva od dvostruke konverzije, vidljivost + `busyId` brava su brana (kao
      web); detalj ideje posle konverzije dobija red „Pretvorena u stranicu"
      (`ideja/[id].tsx:225`)
- [x] `collaboration.requestNesting` + `detachIdea` — ugnježdavanje ideja
      — `idea-actions-sheet.tsx:109`/`:362` (requestNesting, picker „Ugnjezdi
      u…", samo svoja kartica; `approved`/`pending` ishodi razdvojeni porukom) /
      `:110`/`:248` (detachIdea, „Izdvoji iz grupe" po `canDetach` — pokriva i
      povlačenje/odbijanje predloga); odobravanje tuđeg predloga već postoji u
      Odobrenjima (`odobrenja.tsx`, `resolveNesting`)
- [x] `ideas.connect` / `disconnect` / `updateEdgeLabel` — veze između ideja
      — `idea-actions-sheet.tsx:108`/`:352` (connect, picker „Poveži sa idejom…";
      već povezane i tuđe-uz-tuđu prigušene sa razlogom) + `undo-bar.tsx:49`/`:95`
      (connect kao inverz za undo veze); `idea-edge-sheet.tsx:47`/`:92`
      (disconnect, „Prekini vezu" samo `canDeleteDirectly` — za tuđu vezu je
      serverski TIH no-op, pa ona ide kroz `requestDeletion`, `idea_edge` prikaz
      u Odobrenjima već postoji) / `:46`/`:70` (updateEdgeLabel, naziv veze;
      prazan string briše)
- [x] `ideas.restoreOwn` — vraćanje sopstvene arhivirane ideje
      — `undo-bar.tsx:48`/`:90` (traka „Poništi"); push `idea-actions-sheet.tsx:189`
      posle `ideas.archive`, SAMO kad je `recoveredId === null` — server odbija
      undo kad su tuđe izmene izdvojene u „Oporavljeno" (web radi isto)
- [x] `ideas.updateLayout` / `resetLayoutSize` / `updatePositions` / `saveViewport`
      — **NE kroz WebView — embed je read-only** (zove samo `ideas.list`; provera
      „da rade kroz WebView" bi pala — vidi plan Faze 5 §1.2). Urađeno NATIVE po
      A1 presedanu: `idea-actions-sheet.tsx:111`/`:402` (updateLayout, „Veličina
      oblačića" — preseti su web `ITEM_SIZE_DIMENSIONS`, deljeni sa mislima kroz
      `lib/thought-layout.ts`) / `:112`/`:432` (resetLayoutSize, „Automatska");
      `ideje.tsx:82`/`:131` (updatePositions) + `:83`/`:141` (saveViewport):
      „Sredi raspored" — mreža u pozitivnom kvadrantu, samo top-level ≤50
      (isključene i kartice sa vidljivim predlogom gnježdenja — `updatePositions`
      bi pomerao PREDLOG umesto kartice), čuva zoom iz `canvasState` koji je već
      u pretplati

## A5. Stranica — što fali u `page-actions-sheet.tsx`

Sheet već ima premeštanje, ugnježdavanje, izdvajanje i povezivanje. Fali:

- [x] `areasV2.archivePage` — arhiviranje stranice
      — `page-actions-sheet.tsx:191-230` (`archiveOrRequest`: vlasnik → potvrda →
      `archivePage`; nevlasnik → `collaboration.requestDeletion`), red „Obriši"
      `page-actions-sheet.tsx:282-294`; `onArchived={() => router.back()}` na
      `stranica/[id].tsx:108` i `zadatak/[id].tsx:326`
- [x] `pages.getBreadcrumbs` — putanja do korena u zaglavlju (sada ne znaš gde si)
      — rešeno sa E12 (`breadcrumbs-eyebrow.tsx`, dokazi tamo); backend netaknut
- [x] `pages.addEntry` — dodavanje unosa u stranicu (web `page-editor-view.tsx`)
      — `contribution-thread.tsx:49` (target union +`page`), `:85-89` (grananje
      u `submit()`: `page` → `pages.addEntry`, ostalo → `collaboration.
      addContribution`); nova sekcija `page-contributions-section.tsx` (ograničena
      visina + interni skrol + lokalni `KeyboardAvoidingView`, rn-review nalaz),
      montirana `stranica/[id].tsx:148` i `zadatak/[id].tsx:294` (linije
      pomerene mountom UndoBar-a u Fazi 5)
- [x] `areasV2.createPage` — mobilni koristi `pages.create`; proveri da li se ponašaju isto i ujednači
      — `page-create-sheet.tsx:89` (`useMutation(api.areasV2.createPage)`),
      `:142` (`rootPageId: parentPageId` u pozivu), `:159-164` (Alert „Čeka
      odobrenje" kad `result.nestingStatus === 'pending'`)
- [x] `pageFiles.prune` — čišćenje nevezanih priloga — IZUZETAK, vidi tabelu Z
      (mobilni tentap editor ne ume da ubaci prilog u telo beleške, pa nema šta
      da se čisti; zatvara se sa mernim gejtom ZA-POPRAVKU §2/§5.1)

## A6. Vraćanje obrisanog — sistemska rupa

> **ZATVORENO 11.08. (Faza 5).** Obrazac za misli je generalizovan u
> `lib/undo.ts` (union `UndoAction` za svih 5 vrsta) + `components/undo-bar.tsx`
> (jedna traka za celu aplikaciju; serverski `undoUntil` vodi tajmer kad
> postoji). Stari `lib/thought-undo.ts` i `thought-undo-bar.tsx` su OBRISANI.
> Traka je montirana na: `misli.tsx:299`, `misao/[id].tsx:342`,
> `canvas/[kind]/[id].tsx:365` (sada za SVE vrste kanvasa, ne samo misli),
> `ideje.tsx:266`, `ideja/[id].tsx:305`, `zadatak/[id].tsx:331`,
> `stranica/[id].tsx:113`.

- [x] `ideas.restoreOwn` — `undo-bar.tsx:48`/`:90`; push
      `idea-actions-sheet.tsx:189` (samo `recoveredId === null` — vidi A4)
- [x] `taskCheckpoints.restoreOwn` — `undo-bar.tsx:50`/`:102`; push
      `task-checkpoint-list.tsx:137` posle `archiveOwn` („Checkpoint je
      obrisan.", serverski `undoUntil`); vraćeni checkpoint zadržava svoj
      ordinal i stanje završenosti (server samo skida `archivedAt`)
- [x] `collaboration.restoreOwnContribution` — `undo-bar.tsx:51`/`:105`; push
      `contribution-thread.tsx:140` posle `deleteOwnContribution` („Tekst je
      obrisan."); deljena nit, pa isti potez pokriva diskusiju ideje i
      „Doprinose" na beleški i zadatku
- [x] `thoughts.restoreNodes` / `restoreEdges` — traka „Poništi" posle arhiviranja
      misli/veze, na listi, detalju i kanvasu (`components/undo-bar.tsx:86`/`:87`,
      store `lib/undo.ts`; push mesta: `thought-actions-sheet.tsx:178`,
      `thought-edge-sheet.tsx:93`, `thought-node-sheet.tsx:122`)
- [x] Ujednačen obrazac: posle arhiviranja prikaži traku „Poništi" nekoliko sekundi
      — JEDAN fajl (`components/undo-bar.tsx`), jedna vizuelna forma (traka 8s +
      „Poništi" + ✕, `busyRef` brava, `accessibilityLiveRegion`, greška = Alert a
      traka ostaje), jedan store (`lib/undo.ts`, preživljava `router.back()`,
      briše se na promenu startupa); svako novo mesto arhiviranja dodaje samo
      `pushUndo` + granu u `restore()`

## A7. Chat

- [x] `chat.archiveChannel` — arhiviranje kanala
      — `conversation-header.tsx:96` (mutacija), `:127` (poziv u
      `requestArchive()`, potvrda sa imenom kanala); red „Arhiviraj razgovor" u
      postojećem ⋮ meniju kanala (tačno gde ga web drži, `conversation-pane.tsx`);
      klijentski gejt `razgovor/[id].tsx:133`
      (`profile.role === 'admin' && channel.kind !== 'startup'` — ogleda
      serverski `chat.ts`), ishod `onArchived={() => router.back()}` (`:136`);
      korisnik koji je u razgovoru kad ga admin arhivira pada u postojeću granu
      „Razgovor nije pronađen"
- [x] `notifications.latest` — IZUZETAK, vidi tabelu Z (web-only in-app toast
      infrastruktura; na telefonu tu ulogu igraju OS push baner, tab bedž i pun
      ekran „Obaveštenja")

## A8. Checkpointi na kanvasu

- [x] `taskCheckpoints.saveCanvasPlacement` / `resetCanvasSize` — IZUZETAK, vidi
      tabelu Z (čisto uređivanje layouta kanvasa; mobilni kanvas je pregled)
- [x] `taskCheckpointCanvasEdges.connect` / `disconnect` — IZUZETAK, vidi tabelu
      Z (vizuelne strelice u koordinatnom prostoru kanvasa; STVARNA zavisnost
      koraka je već native — `setChainedToPrevious`/`setAllChained`)
- [x] (Ovo možda ima smisla samo na velikom ekranu — ako procenjuješ da nema, u sekciju Z sa razlogom)
      — procenjeno da nema: sve četiri funkcije upisane u Z sa razlozima
      („ne pravi neupotrebljivo")

---

# B — NULA GREŠAKA

Ovo nije „popravi ako naiđeš". Ovo je uslov za završetak.

- [x] `npx tsc --noEmit` u `apps/mobile` — nula grešaka
- [x] `npx tsc --noEmit` u `apps/web` — nula grešaka
- [ ] `npm run lint` — nula grešaka i nula upozorenja — **0 grešaka, 2 upozorenja**
      zatečena u `packages/backend/convex/` (`areasV2.ts:9`, `chat.ts:1037`);
      backend se ne dira u fazama pariteta (pravilo važi apsolutno). Uslov za
      čekiranje: `ZA-POPRAVKU.md §6`.
- [x] `npm run build` — prolazi
- [x] `npm test` — svi testovi prolaze (37 fajlova, 321 test)
- [ ] Metro konzola pri prolasku kroz sve ekrane — nula crvenih grešaka, nula žutih upozorenja koja se ponavljaju — zahteva uređaj/emulator sesiju uživo, van dometa headless faze; nijedna faza noćnog lanca ovo još nije radila (`ZA-POPRAVKU.md §5.12`)
- [ ] Convex dashboard logovi tokom testiranja — nijedan `Server Error` — isto, zahteva uživo testiranje
- [x] Nijedan `console.log` dijagnostike ostavljen u kodu — jedina 2 pogotka (`canvas/[kind]/[id].tsx:158,193`) su `__DEV__`-gated, namerna
- [x] Nijedan `TODO` bez zapisa u `ZA-POPRAVKU.md` — jedini pogodak (`vise.tsx:199-202`) već pokriven `ZA-POPRAVKU.md §2`
- [x] Nijedna komponenta koja vraća `null` kao placeholder — svi pogoci su legitimni guard/konvencija (Faza 6 plan §1.2)

---

# C — RUNTIME PROVERA (ne veruj kodu, otvori aplikaciju)

Za svaku stavku: uradi je na emulatoru, pa istu na webu, i uporedi ishod u bazi.

- [ ] Napravi belešku — na oba klijenta, pa proveri da se vidi na oba
- [ ] Napravi zadatak sa statusom, prioritetom, rokom, izvršiocem, instrukcijama i dva checkpointa
- [ ] Napravi oblast
- [ ] Napravi ideju, glasaj za nju, pa je pretvori u stranicu
- [ ] Napravi misao, poveži je sa drugom, pa je pretvori u ideju
- [ ] Premesti stranicu u drugu oblast
- [ ] Ugnjezdi stranicu, pa odobri zahtev, pa je izdvoji
- [ ] Poveži dve stranice relacijom, pa obriši relaciju
- [ ] Pošalji poruku u kanalu, reaguj na nju, izmeni je, obriši je
- [ ] Otvori DM sa članom
- [ ] Priloži fajl na stranicu, preimenuj ga, obriši ga
- [ ] Napravi tabelu na stranici, dodaj kolonu i red, uvezi CSV
- [ ] Pretraži nešto što postoji u stranicama, zadacima, porukama i idejama
- [ ] Arhiviraj svaku od tih stvari, pa je vrati
- [ ] Prođi kroz sve ovo sa isključenim internetom pa uključenim — ništa ne sme da se izgubi

---

# D — RESPONZIVNOST I DODIR

- [ ] Nijedan ekran ne puca na malom telefonu (360×640) ni na velikom (430×932)
- [ ] Tastatura ne prekriva nijedno polje za unos, ni na jednom ekranu
- [ ] Svaki sheet je skrolabilan kad sadržaj pređe visinu ekrana
- [ ] Landscape ne lomi nijedan ekran (ili je zaključan portret gde ima smisla)
- [ ] Duga imena i dugi tekstovi se skraćuju sa `…`, ne razvlače red
- [ ] Prazna stanja svuda imaju poruku i akciju, ne prazan ekran
- [ ] Stanje učitavanja svuda ima skeleton, ne beli ekran
- [ ] Stanje greške svuda ima poruku i „Pokušaj ponovo"

---

# E — BAGOVI UHVAĆENI NA EKRANU

> **ISPRAVKA od 10.08. — pročitaj pre nego što kreneš.**
>
> 1. **Grana `ui-nocni-20260809-0931` JE već sadržana u istoriji ove grane.**
>    Provereno: `git merge-base --is-ancestor ui-nocni-20260809-0931 HEAD` prolazi,
>    i `note-editor.tsx`, `page-actions-sheet.tsx` i `ui/sheet.tsx` postoje na disku.
>    **NE radi merge.** Plan Faze UX od 10.08. tvrdio je suprotno i bio je u krivu.
> 2. Bagovi E1–E13 su snimljeni sa **zastarelog Metro bundle-a**. Za svaki prvo
>    proveri da li i dalje postoji na svežem bundle-u, pa tek onda popravljaj.
>    **E5, E8 i E10 su najverovatnije već popravljeni** — potvrdi na ekranu i
>    čekiraj bez izmene koda ako rade.
> 3. **E2 ima poznat uzrok:** `ScrollView` u React Native ima podrazumevani
>    `flexGrow: 1`, pa se traka filtera razvlači. Popravka je jedna linija stila.
>    **E3 i E11 su verovatno samo posledice E2** — proveri ih tek posle nje.


Nisu iz koda. Svaki je viđen na emulatoru dok je aplikacija radila, i svaki
korisnik vidi svaki put. Poređani po tome koliko bole.

## E1. Hardversko dugme Nazad ne zatvara bottom sheet — izlazi iz aplikacije

Otvoren prebacivač startupa (tap na avatar) → pritisak na Android dugme Nazad →
**aplikacija se zatvori i vratiš se na home ekran telefona.** Sheet ostane
„otvoren" u pozadini. Ovo je najgori bag koji sam našao: na Androidu je Nazad
osnovni gest, a ovde te izbacuje iz aplikacije usred rada.

- [x] Svaki sheet mora da presretne hardversko Nazad i da se samo zatvori
      (`BackHandler` ili `onRequestClose`), na SVIM sheet-ovima, ne samo ovom —
      NE reprodukuje se na svežem bundle-u (bag bio artefakt zastarelog bundle-a);
      svi sheet-ovi idu kroz jedini primitiv `ui/sheet.tsx` (RN `Modal` +
      `onRequestClose`), kod netaknut. Testirano 11 na emulatoru: switcher,
      quick-add, task-actions (statusOnly i pun), date-picker (ugnježden preko
      task-actions — Nazad skida samo gornji sloj), assignee-picker, page-actions,
      new-conversation, message-actions, create-area, idea-node (canvas, WebView);
      posle svakog `topResumedActivity=com.devotion.app`. Dokazi:
      `dokazi-ux/e1-*-p2.png`. Izuzetak: `file-preview` (jedini drugi Modal, isti
      `onRequestClose`) nije testiran — u dev bazi nema nijednog priloga.

## E2. „Danas": traka filtera jede 40% ekrana i ne skroluje

Kartice članova („Svi · 4 otvoreno", „Jovan Milojević · 0 otvoreno", …) visoke su
oko 300px, sa sitnim tekstom vertikalno centriranim u praznini. Traka je zakucana
— **ne pomera se pri skrolovanju**, pa na svakom pomeraju liste zauzima skoro
pola ekrana. Ostane ti oko tri reda zadataka.

- [x] Visina kartice na sadržaj (~72px), ne rastegnuta — uzrok bio RN `ScrollView`
      default `flexGrow: 1` (gutao visinu); `workload-strip.tsx` ima `flexGrow: 0`
      + `alignItems: 'flex-start'`; potvrđeno na svežem bundle-u, chipovi ~56–80dp:
      `dokazi-ux/e2-posle-p2.png`
- [x] Traka skroluje zajedno sa listom, ili postaje kompaktan red chip-ova —
      kompaktan red chip-ova, namerno van skrola (filter mora ostati vidljiv kad
      isprazni listu); isti dokaz
- [x] Ako član ima 0 otvorenih, ne troši istu površinu kao onaj sa 4 — chip sa 0
      nema „kasni/hitno" statove i nula je prigušena (`statZero`); isti dokaz

## E3. Horizontalna traka odsečena na ivici

Treća kartica je presečena na desnoj ivici ekrana, bez paddinga i bez naznake da
ima još. Izgleda kao greška iscrtavanja, ne kao poziv da se skroluje.

- [x] `contentContainerStyle` sa paddingom, i peek sledeće kartice —
      `paddingHorizontal: 16` + chip `maxWidth: 180`; treći chip viri ~50dp preko
      desne ivice (jasan poziv na skrol): `dokazi-ux/e2-posle-p2.png`

## E4. Dvostruko zaglavlje na „Danas"

Vrh ekrana: „ScanMe ⌄" pa „Danas". Odmah ispod, u kartici: „SCANME" pa
„Zdravo, Jovan." Ime startupa dvaput u 400px, i dva naslova jedan ispod drugog.

- [x] Jedno zaglavlje. Pozdrav i statistika bez ponavljanja imena startupa —
      eyebrow uklonjen iz `day-summary.tsx` (1. runda); ime startupa samo u
      `AppHeader` (koji je i prebacivač); svež bundle: `dokazi-ux/e4-posle-p2.png`

## E5. Editor beleške: placeholder na engleskom

Prazna beleška kaže **„Write something …"**. Cela aplikacija je na srpskom.

- [x] Prevedi, i pretraži ostatak editora za još engleskog teksta — statički
      `PlaceholderBridge.configureExtension` (runtime `setPlaceholder` ne osvežava
      dekoraciju — odstupanje 3 u planu); nova prazna beleška pokazuje „Zapiši
      kontekst, odluke i sledeće korake…", naslov „Naslov beleške"
      (`dokazi-ux/e5-posle-p2.png`); sweep grep
      (`write something|type your|add link|url here|untitled`) — jedini pogodak
      je komentar u `note-toolbar.tsx` koji objašnjava zašto tentap-ov engleski
      toolbar nije korišćen

## E6. Pogrešan tekst na beleški: „razgovor o ovom zadatku"

Na beleški (ne zadatku) stoji: „Započni diskusiju — Otvori razgovor tima o ovom
**zadatku**."

- [x] Tekst mora da prati vrstu stranice (beleška/zadatak) — `DiscussionLink`
      ima `pageKind` mapu za sve 4 vrste; beleška: „…o ovoj beleški."
      (`dokazi-ux/e6-beleska-p2.png`), zadatak: „…o ovom zadatku."
      (`e6-zadatak-p2.png`)

## E7. Zadatak: „Izvršioci" prikazuje prazan krug koji se vrti

Kad zadatak nema izvršioce, u redu stoji prazan kružić koji izgleda kao spiner
koji se nikad ne završi, umesto poruke „Niko nije dodeljen".

- [x] Prazno stanje sa tekstom, ne prazan avatar-placeholder — red „Izvršioci"
      na detalju: tekst „Niko nije dodeljen" (16px, prigušeno), red i dalje
      dodirljiv (otvara piker); skeleton tokom učitavanja ostaje; prazan krug na
      kompaktnim karticama LISTE je svesno zadržan (oznaka „mesto čeka nekoga");
      `dokazi-ux/e7-posle-p2.png`

## E8. Nema „…" menija ni na zadatku ni na beleški

`page-actions-sheet.tsx` postoji u kodu i ima premeštanje, ugnježdavanje,
izdvajanje i povezivanje — ali **u zaglavlju detalja nema dugmeta koje ga
otvara.** Funkcija je napisana pa nedostupna.

- [x] Dugme „…" u zaglavlju i zadatka i beleške, otvara postojeći sheet —
      potvrđeno na svežem bundle-u: beleška `dokazi-ux/e8-beleska-p2.png`
      (4 reda; „Izdvoji" ispravno prigušen u korenu), zadatak `e8-zadatak-p2.png`
- [x] Proveri da li ima još ovakvih slučajeva: komponenta postoji, ulaz ne —
      grep inventar svih `*-sheet/*-picker/*-preview` komponenti: svaka ima ≥1
      import + mount (provereno u istraživanju 2. runde); siročića nema

## E9. Naslov se prikazuje dvaput

Na beleški „oze" stoji u zaglavlju i odmah ispod kao izmenjiv naslov.

- [x] Jedan naslov. Ako je izmenjiv, zaglavlje neka bude putanja, ne isto ime —
      beleška: title=„Beleška", eyebrow=putanja, ime („oze") samo u editoru sa
      „Sačuvano" indikatorom; tabela/prilog zadržavaju naslov u zaglavlju (telo ga
      ne ponavlja); `dokazi-ux/e9-posle-p2.png`

## E10. Traka za formatiranje odsečena na desnoj ivici

B / I / S / `<>` / link / H1 / H2 / H3 — poslednja ikonica presečena ivicom
ekrana, bez naznake da traka skroluje.

- [x] Skrolabilna sa peek-om, ili prelom u dva reda — poslednja vidljiva ikonica
      prirodno viri preko desne ivice (poziv na skrol); skrol stiže do „Ponovi"
      (undo/redo grupa iza separatora), kraj trake čist — `paddingRight` nije
      potreban (odluka na ekranu): `dokazi-ux/e10-posle-p2.png` +
      `e10-kraj-trake-p2.png`
- [x] Proveri sa OTVORENOM tastaturom da traka stoji iznad nje, ne ispod —
      puna Gboard tastatura u kadru (`mInputShown=true`), traka NEPOSREDNO iznad
      nje (`use-keyboard-inset.ts` popravka iz 1. runde radi); oba dokaza gore

## E11. FAB „+" preklapa sadržaj poslednje kartice

Na „Danas" plavo dugme prekriva desni deo poslednjeg zadatka u listi.

- [x] Donji padding liste = visina FAB-a + razmak — `paddingBottom: 160`
      (izmereno u 1. rundi, ne smanjivati); na svežem bundle-u sa listom od 5
      zadataka koja preskače ekran: na dnu skrola poslednja kartica cela, ~22dp
      iznad FAB-a: `dokazi-ux/e11-posle-p2.png`

## E12. Nema putanje (breadcrumbs) nigde

U detalju zadatka iznad naslova stoji „Backlog" — to je status, ne putanja.
Posle dva-tri nivoa ugnježdavanja ne znaš gde si, a nemaš sidebar kao na webu.

- [x] `pages.getBreadcrumbs` u zaglavlju detalja (vidi i A5) —
      `breadcrumbs-eyebrow.tsx` na oba detalja; ugnježden zadatak: eyebrow
      „Dev › oze" bez tekuće stranice (`dokazi-ux/e12-zadatak-p2.png`); koren:
      samo ime oblasti „Dev" (`e12-koren-p2.png`); status više NIJE eyebrow
      (ostaje u meta kartici); lokalni `TrailBoundary` čuva ekran od arhiviranog
      roditeljskog lanca

## E13. U oblasti nema dugmeta za novu stranicu

„Danas" ima FAB, ekran oblasti nema ništa — a to je mesto gde se stranica
prirodno pravi.

- [x] Isti FAB, isto ponašanje, na svim ekranima gde kreiranje ima smisla —
      `QuickAddFab` (label „Nova stranica") + postojeći `PageCreateSheet` na
      Nivou 2 Prostora (`dokazi-ux/e13-fab-p2.png`); kreirana beleška „E5 proba"
      i zadatak „E7 zadatak sa datumom" (rok sutra) — oba realtime u listi, FAB
      ne preklapa red (`e13-posle-kreiranja-p2.png`); Nivo 1 ne dobija FAB (tamo
      se pravi oblast, ulaz „Nova oblast" postoji)

---

# ŠTA JE VEĆ URAĐENO — NE DIRAJ I NE PRAVI PONOVO

Provereno na emulatoru, radi:

- Editor beleške radi, sa autosave i indikatorom „Sačuvano", i sa trakom za formatiranje
- „Nova oblast" postoji u Prostoru
- „Misli" je živa stavka u meniju „Više"
- „Podešavanja" je pravilno prigušeno sa oznakom „USKORO"
- Chat kanali postoje i lista se puni (Opšte, Dev, Marketing notes, Sales notes, Other notes, Design)
- Hijerarhija u oblasti postoji — stranica sa decom ima strelicu za razvijanje
- Detalj zadatka ima ispravan raspored redova, checkpointe, povezane stavke i „Započni diskusiju"
- Prostor: oblasti sa brojačima i „NEDAVNO" listom izgledaju uredno

---

# Z — IZUZECI (popunjava agent)

Za svaku stavku iz A koju odlučiš da NE preneseš na telefon, upiši ovde red:

```
- api.X.Y — RAZLOG zašto na telefonu nema smisla, i šta korisnik radi umesto toga.
```

Prazan razlog ne važi. „Nije bitno" nije razlog.

| Funkcija | Razlog izuzeća |
|---|---|
| `pushSubscriptions.myDeviceCount` | Web push kroz browser; mobilni koristi Expo push, drugi mehanizam. |
| `areasV2.resolveRoute` | Rutiranje web URL-ova; mobilni ima expo-router. |
| `pageFiles.prune` | Čisti osirotele priloge UMETNUTE U TELO beleške preko node-view mehanizma; mobilni tentap editor ne ume da ubaci prilog u telo (ZA-POPRAVKU §2/§5.1, gejt i dalje otvoren) — nema koda koji na mobilnom može da napravi taj osiroteli red, pa nema šta da se čisti. Zatvara se zajedno sa proširenjem tentap bundle-a. |
| `notifications.latest` | Postoji isključivo kao izvor za web in-app toast (`useNotificationToasts`, notifications-panel.tsx — jedini pozivalac u celom webu; backend komentar: „služi samo detekciji novih obaveštenja za toast"). Na telefonu tu ulogu već igraju OS push baner (expo-notifications, kanal/zvuk po tipu), bedž na tabu (unreadCount) i pun ekran „Obaveštenja" (notifications.list). Drugi, in-app toast sloj bi dupliralo OS baner. |
| `taskCheckpoints.saveCanvasPlacement` | Prevlačenje/dimenzionisanje checkpoint oblačića na page kanvasu — čisto uređivanje layouta kanvasa. Mobilni kanvas je pregled (00-PLAN §5.2), embed je read-only; native unos koordinata bez direktne manipulacije = neupotrebljivo. Semantika checkpointa (tekst, završenost, lančanje, brisanje, glasanja) je već native na detalju zadatka (nit doprinosa PO CHECKPOINTU još nije montirana — ZA-POPRAVKU §5.7, van ove kategorije). Ista kategorija kao areasV2.movePages/resizePage, koji takođe (svesno) nisu na telefonu. |
| `taskCheckpoints.resetCanvasSize` | Isto — reset dimenzija oblačića na kanvasu; veličina se na telefonu ni ne postavlja. |
| `taskCheckpointCanvasEdges.connect` | Vizuelne strelice toka na page kanvasu (spajaju i checkpoint↔stranicu), imaju smisao samo u koordinatnom prostoru kanvasa. Stvarna zavisnost koraka je native kroz `setChainedToPrevious`/`setAllChained` (task-checkpoint-list.tsx). Crtanje dijagrama je posao za veliki ekran. |
| `taskCheckpointCanvasEdges.disconnect` | Isto; uz to glasanje o brisanju tuđe canvas veze već radi na mobilnom (odobrenja.tsx, `task_checkpoint_edge`), pa tim tokovima ništa ne fali. |
| `areasV2.getCanvas` | Šira desktop-samo pretplata (ceo startup odjednom — `area-canvas-view.tsx`, `area-view.tsx`, `page-workspace-view.tsx`, `workspace-shell.tsx`). Mobilni embed (`canvas/[kind]/[id].tsx` → `canvas-embed.tsx`) zove UŽE resolvere po meti: `getAreaCanvasByArea`/`getPageCanvasByPage` — funkcionalno zamenjuju `getCanvas` za tačno onaj scope koji se prikazuje, ne rupa. |
| `areasV2.getPageCanvasByPage` | Nije "web-only" u pravom smislu — poziva ga `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx`, DELJENI kod koji mobilni učitava kroz WebView (00-PLAN §5.2). Grep metod ga vidi kao web-only jer broji samo `apps/web/components`+`app`. |
| `areasV2.movePages` | Prevlačenje/pozicioniranje stranica na kanvasu oblasti — čisto uređivanje layouta. Mobilni kanvas je pregled (00-PLAN §5.2), embed je read-only. Ista kategorija kao `taskCheckpoints.saveCanvasPlacement`. |
| `areasV2.resizePage` | Isto — promena dimenzija kartice stranice na kanvasu. |
| `areasV2.resetPageSize` | Isto — reset dimenzija na podrazumevane. |
| `areasV2.saveViewport` | Čuva zum/poziciju kanvasa oblasti za sledeće otvaranje — postavlja se isključivo ručnim pomeranjem na desktop kanvasu. |
| `areasV2.connectPages` | Crtanje veza između stranica na kanvasu — vizuelna radnja u koordinatnom prostoru kanvasa. |
| `areasV2.disconnectPages` | Isto, obrnuta radnja. |
| `activity.listForStartup` | Mobilni koristi `activity.listPaginated` (bez tvrdog limita 50, sa nastavkom) — funkcionalno superiorna zamena, ne rupa. Obrnut paritet, već objašnjeno u ZA-POPRAVKU §5.8. |
