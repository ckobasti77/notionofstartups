# PARITET — web ⇄ mobilni

> **Agente: čitaj ovaj fajl na početku SVAKE iteracije i čekiraj `[x]` čim nešto
> završiš, u istom commit-u sa kodom.** Ovo je tvoja memorija između iteracija.
> Nemoj da veruješ svom kontekstu — veruj ovom fajlu.

## Kako je lista napravljena (ponovi kad sumnjaš)

Nije nastala klikanjem nego poređenjem stvarno pozvanih Convex funkcija:

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

**REŠENO 2026-08-10** — uzroci: (1) projekat `alati` na portu 3000 (Devotion tiho
pobegao na 3001), (2) bez `allowedDevOrigins: ["10.0.2.2"]` hidracija sa emulatora
visi; vidi `KANVAS-DIJAGNOZA.md`; dokaz: `kanvas-dijagnoza/posle.png` (Ideje, 3
oblačića + veze) i `posle-misli.png` (Misli).

**Ovo se rešava PRVO. Dok ovo stoji, kanvas, Misli i editor preko WebView-a ne
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

- [x] Utvrdi šta zauzima port 3000 (`netstat -ano | findstr :3000`, pa `tasklist /FI "PID eq <pid>"`) — `alati` (PID 19484, pa respawn 24924; gašeno celo `npm run dev` stablo)
- [x] Ugasi to, pa pokreni `npm run dev` iz `notion-clone` — Devotion na 3000, identitet potvrđen kroz netstat + CommandLine
- [x] Potvrdi u browseru na hostu: `http://localhost:3000/embed/canvas/ideas/proba` renderuje Devotion, ne 404 — curl vraća 200
- [x] Potvrdi u Chrome-u u emulatoru: `http://10.0.2.2:3000` je Devotion — `kanvas-dijagnoza/chrome-emulator-posle.png` („Ovaj prikaz radi samo u Devotion aplikaciji.")
- [x] Tek onda otvori kanvas u aplikaciji i **napravi screenshot sa vidljivim oblačićima** — `kanvas-dijagnoza/posle.png` + `posle-misli.png`
- [x] Ako i posle ovoga kanvas ne crta — tek TADA je bag u kodu; bisektuj po `PROMPT-KANVAS-GOAL.md` — nije se steklo: kanvas crta (posle.png)

---

# A — CELE FUNKCIONALNOSTI KOJE FALE

## A1. Misli (thoughts) — 18 funkcija, najveća rupa

Web ima pun sistem: `thoughts-canvas-view.tsx`, `thought-editor-dialog.tsx`,
`thought-conversion-dialog.tsx`, `thought-destination-picker.tsx`.
Mobilni ima samo `thought-create-sheet.tsx` i `thought-node-sheet.tsx`.

Provereno na ekranu: stavka „Misli" u `vise.tsx` **jeste živa** i vodi na kanvas —
ali kanvas 404-uje (sekcija 0). Ostaje sve ostalo.

Embed ruta (`canvas-embed.tsx:292`) **podržava `kind === "thoughts"`**, pa se graf
crta kroz WebView — treba ti native akcije okolo, ne nov graf.

- [x] Ulazna tačka za Misli u `vise.tsx` — POSTOJI, provereno na emulatoru
- [ ] `thoughts.listNodes` / `listEdges` / `getCanvas` — lista misli kao alternativa grafu
- [ ] `thoughts.createEdge` / `updateEdge` / `archiveEdges` / `restoreEdges` — veze
- [ ] `thoughts.moveNodes` / `updateNodeLayout` / `resetNodeLayoutSize` / `saveViewport`
- [ ] `thoughts.nestNode` / `toggleNodeParent` / `detachNode` — ugnježdavanje
- [ ] `thoughts.duplicateNodes`
- [ ] `thoughts.getConnectedGroup` — izbor povezane grupe
- [ ] `thoughts.convertToIdeas` — pretvaranje misli u ideje (uzor `thought-conversion-dialog.tsx`)
- [ ] `thoughts.restoreNodes` — vraćanje obrisane misli

## A2. Administracija startupa — 9 funkcija

Web `admin-dialog.tsx` sve to ima. Mobilni ima samo pozivnice i **listu članova
bez ijedne akcije**.

- [ ] `startups.create` — pravljenje novog startupa
- [ ] `startups.update` — ime, opis
- [ ] `startups.setLogo` / `removeLogo` / `generateLogoUploadUrl` — logo
- [ ] `startups.addMember` / `removeMember` — dodavanje i uklanjanje člana
- [ ] `startups.reorderAreas` — redosled oblasti (na telefonu: „gore/dole", ne drag)
- [ ] `profiles.listAll` — izbor korisnika pri dodavanju člana
- [ ] Sve iza `requireAdmin`, i sakriveno u meniju ako korisnik nije admin

## A3. Zadaci — pregled celog startupa

Mobilni `danas.tsx` koristi samo `tasks.commandCenter` (moji zadaci danas).
Web ima i `tasks-view.tsx` + `task-table-view.tsx` nad `tasks.listForStartup`.

- [ ] `tasks.listForStartup` — svi zadaci startupa, ne samo moji
- [ ] Filteri: status, prioritet, izvršilac, rok (na telefonu: sheet sa filterima, ne kolone)
- [ ] Grupisanje po statusu, sa brojem u zaglavlju grupe
- [ ] Izmena statusa/prioriteta direktno iz liste (`areasV2.updatePage`)

## A4. Ideje — organizacija i konverzija

- [ ] `ideas.convertToPage` — ideja postaje stranica/zadatak
- [ ] `collaboration.requestNesting` + `detachIdea` — ugnježdavanje ideja
- [ ] `ideas.connect` / `disconnect` / `updateEdgeLabel` — veze između ideja
- [ ] `ideas.restoreOwn` — vraćanje sopstvene arhivirane ideje
- [ ] `ideas.updateLayout` / `resetLayoutSize` / `updatePositions` / `saveViewport` — kroz WebView, proveri da rade

## A5. Stranica — što fali u `page-actions-sheet.tsx`

Sheet već ima premeštanje, ugnježdavanje, izdvajanje i povezivanje. Fali:

- [ ] `areasV2.archivePage` — arhiviranje stranice
- [ ] `pages.getBreadcrumbs` — putanja do korena u zaglavlju (sada ne znaš gde si)
- [ ] `pages.addEntry` — dodavanje unosa u stranicu (web `page-editor-view.tsx`)
- [ ] `areasV2.createPage` — mobilni koristi `pages.create`; proveri da li se ponašaju isto i ujednači
- [ ] `pageFiles.prune` — čišćenje nevezanih priloga

## A6. Vraćanje obrisanog — sistemska rupa

Mobilni ume da arhivira, ali **nigde ne ume da vrati**. Korisnik koji pogreši
nema izlaz. Ovo je jedna od najgorih UX rupa u aplikaciji.

- [ ] `ideas.restoreOwn`
- [ ] `taskCheckpoints.restoreOwn`
- [ ] `collaboration.restoreOwnContribution`
- [ ] `thoughts.restoreNodes` / `restoreEdges`
- [ ] Ujednačen obrazac: posle arhiviranja prikaži traku „Poništi" nekoliko sekundi

## A7. Chat

- [ ] `chat.archiveChannel` — arhiviranje kanala
- [ ] `notifications.latest` — brzi pregled poslednjih obaveštenja (odluči: treba li, kad postoji ceo ekran)

## A8. Checkpointi na kanvasu

- [ ] `taskCheckpoints.saveCanvasPlacement` / `resetCanvasSize`
- [ ] `taskCheckpointCanvasEdges.connect` / `disconnect`
- [ ] (Ovo možda ima smisla samo na velikom ekranu — ako procenjuješ da nema, u sekciju Z sa razlogom)

---

# B — NULA GREŠAKA

Ovo nije „popravi ako naiđeš". Ovo je uslov za završetak.

- [ ] `npx tsc --noEmit` u `apps/mobile` — nula grešaka
- [ ] `npx tsc --noEmit` u `apps/web` — nula grešaka
- [ ] `npm run lint` — nula grešaka i nula upozorenja
- [ ] `npm run build` — prolazi
- [ ] `npm test` — svi testovi prolaze
- [ ] Metro konzola pri prolasku kroz sve ekrane — nula crvenih grešaka, nula žutih upozorenja koja se ponavljaju
- [ ] Convex dashboard logovi tokom testiranja — nijedan `Server Error`
- [ ] Nijedan `console.log` dijagnostike ostavljen u kodu
- [ ] Nijedan `TODO` bez zapisa u `ZA-POPRAVKU.md`
- [ ] Nijedna komponenta koja vraća `null` kao placeholder

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

Nisu iz koda. Svaki je viđen na emulatoru dok je aplikacija radila, i svaki
korisnik vidi svaki put. Poređani po tome koliko bole.

## E1. Hardversko dugme Nazad ne zatvara bottom sheet — izlazi iz aplikacije

Otvoren prebacivač startupa (tap na avatar) → pritisak na Android dugme Nazad →
**aplikacija se zatvori i vratiš se na home ekran telefona.** Sheet ostane
„otvoren" u pozadini. Ovo je najgori bag koji sam našao: na Androidu je Nazad
osnovni gest, a ovde te izbacuje iz aplikacije usred rada.

- [ ] Svaki sheet mora da presretne hardversko Nazad i da se samo zatvori
      (`BackHandler` ili `onRequestClose`), na SVIM sheet-ovima, ne samo ovom

## E2. „Danas": traka filtera jede 40% ekrana i ne skroluje

Kartice članova („Svi · 4 otvoreno", „Jovan Milojević · 0 otvoreno", …) visoke su
oko 300px, sa sitnim tekstom vertikalno centriranim u praznini. Traka je zakucana
— **ne pomera se pri skrolovanju**, pa na svakom pomeraju liste zauzima skoro
pola ekrana. Ostane ti oko tri reda zadataka.

- [x] Visina kartice na sadržaj (~72px), ne rastegnuta — uzrok: RN `ScrollView` default `flexGrow:1` gutao visinu; `dokazi-ux/e2-pre.png` → `e2-posle.png`
- [x] Traka skroluje zajedno sa listom, ili postaje kompaktan red chip-ova — kompaktan red chip-ova, ostaje van skrola (filter mora ostati vidljiv kad isprazni listu)
- [x] Ako član ima 0 otvorenih, ne troši istu površinu kao onaj sa 4 — površina je sada na sadržaj; chip sa 0 nema „kasni/hitno" statove i nula je prigušena (`e2-posle.png`)

## E3. Horizontalna traka odsečena na ivici

Treća kartica je presečena na desnoj ivici ekrana, bez paddinga i bez naznake da
ima još. Izgleda kao greška iscrtavanja, ne kao poziv da se skroluje.

- [x] `contentContainerStyle` sa paddingom, i peek sledeće kartice — padding 16 je već postojao; `maxWidth` chipa 220→180 daje jasan peek treće kartice (`e2-posle.png`, vidi se avatar + tekst „Ne…")

## E4. Dvostruko zaglavlje na „Danas"

Vrh ekrana: „ScanMe ⌄" pa „Danas". Odmah ispod, u kartici: „SCANME" pa
„Zdravo, Jovan." Ime startupa dvaput u 400px, i dva naslova jedan ispod drugog.

- [ ] Jedno zaglavlje. Pozdrav i statistika bez ponavljanja imena startupa

## E5. Editor beleške: placeholder na engleskom

Prazna beleška kaže **„Write something …"**. Cela aplikacija je na srpskom.

- [ ] Prevedi, i pretraži ostatak editora za još engleskog teksta

## E6. Pogrešan tekst na beleški: „razgovor o ovom zadatku"

Na beleški (ne zadatku) stoji: „Započni diskusiju — Otvori razgovor tima o ovom
**zadatku**."

- [ ] Tekst mora da prati vrstu stranice (beleška/zadatak)

## E7. Zadatak: „Izvršioci" prikazuje prazan krug koji se vrti

Kad zadatak nema izvršioce, u redu stoji prazan kružić koji izgleda kao spiner
koji se nikad ne završi, umesto poruke „Niko nije dodeljen".

- [ ] Prazno stanje sa tekstom, ne prazan avatar-placeholder

## E8. Nema „…" menija ni na zadatku ni na beleški

`page-actions-sheet.tsx` postoji u kodu i ima premeštanje, ugnježdavanje,
izdvajanje i povezivanje — ali **u zaglavlju detalja nema dugmeta koje ga
otvara.** Funkcija je napisana pa nedostupna.

- [ ] Dugme „…" u zaglavlju i zadatka i beleške, otvara postojeći sheet
- [ ] Proveri da li ima još ovakvih slučajeva: komponenta postoji, ulaz ne

## E9. Naslov se prikazuje dvaput

Na beleški „oze" stoji u zaglavlju i odmah ispod kao izmenjiv naslov.

- [ ] Jedan naslov. Ako je izmenjiv, zaglavlje neka bude putanja, ne isto ime

## E10. Traka za formatiranje odsečena na desnoj ivici

B / I / S / `<>` / link / H1 / H2 / H3 — poslednja ikonica presečena ivicom
ekrana, bez naznake da traka skroluje.

- [ ] Skrolabilna sa peek-om, ili prelom u dva reda
- [ ] Proveri sa OTVORENOM tastaturom da traka stoji iznad nje, ne ispod

## E11. FAB „+" preklapa sadržaj poslednje kartice

Na „Danas" plavo dugme prekriva desni deo poslednjeg zadatka u listi.

- [ ] Donji padding liste = visina FAB-a + razmak

## E12. Nema putanje (breadcrumbs) nigde

U detalju zadatka iznad naslova stoji „Backlog" — to je status, ne putanja.
Posle dva-tri nivoa ugnježdavanja ne znaš gde si, a nemaš sidebar kao na webu.

- [ ] `pages.getBreadcrumbs` u zaglavlju detalja (vidi i A5)

## E13. U oblasti nema dugmeta za novu stranicu

„Danas" ima FAB, ekran oblasti nema ništa — a to je mesto gde se stranica
prirodno pravi.

- [ ] Isti FAB, isto ponašanje, na svim ekranima gde kreiranje ima smisla

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
