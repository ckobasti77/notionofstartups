# Faza 7 — plan: Runtime i responzivnost (liste C i D)

> Planiranje samo — nijedan fajl sa kodom nije menjan. Cilj: **cela lista C
> prođena na ekranu** (emulator ↔ web ↔ baza, screenshot za svaku), **lista D na
> 360×640 i 430×932**, nula grešaka u konzolama. Ovo je jedina faza lanca koja
> gleda ekran, ne kod — „izmene" unapred ne postoje; kod se menja tek kad ekran
> pokaže bag, po pravilima faza (row.tsx, 16px/44pt, safe area, busy, tri stanja).

**Ne dira se:** `packages/backend/convex/**` (apsolutno — svaki backend nalaz u
ZA-POPRAVKU), `apps/mobile/package.json`, Metro proces (tuđi PID — restart gubi
env; §7.7). `apps/web` samo ako web bag BLOKIRA C stavku — minimalno i zapisano.
`IZVESTAJ.md` piše skripta — ne diram. **Jovanova mobilna sesija se NE odjavljuje**
(§7.5).

---

## 1. Šta sam pročitao i šta sam zatekao

Pročitano: `PARITET.md` (C:396–410, D:416–423, B:378–385, Z), `ZA-POPRAVKU.md`
(cela — posebno §1 searchText, §2 merni gejt, §5.1 read-only beleške, Z1–Z5),
`00-PLAN.md` §5.2, plan Faze 5 (format + presedani), `KANVAS-DIJAGNOZA.md`
(CDP trag), `adminAuth.ts`, `areasV2.ts` (nesting), `ideas.ts` (odobrenje),
`search.ts`, mobilni `files-panel.tsx`, `table-panel.tsx`, `table-import-sheet.tsx`,
`relations-section.tsx`, `page-create-sheet.tsx`, `odobrenja.tsx`, `zadatak/[id].tsx`.

**Stanje listi:** C (15 stavki) i D (8 stavki) — **ništa nije čekirano**; ništa se
ne izbacuje kao „već urađeno". B:384 (Metro konzola) i B:385 (Convex logovi) su
uživo-gejtovi koji pripadaju baš ovoj fazi — čekiraju se na kraju ako su čisti.
Sekcija E je cela zatvorena; ne ponavlja se, ali C prolazi istim ekranima pa
regresije hvatamo usput. **Bonus koji ova faza može da zatvori:** E1 izuzetak
„file-preview nikad testiran (nema priloga u bazi)" — C11 pravi prvi prilog.

### Zatečeno okruženje (izmereno sada, ne pretpostavljeno)

| Šta | Stanje |
|---|---|
| Port 3000 | **200** na `/embed/canvas/ideas/proba` = Devotion (Z3 čist) |
| Metro | radi, port 8081, PID 23940 (tuđi proces — izlaz mu ne vidimo) |
| Emulator | `emulator-5554`, 1080×2424 @ 420dpi = **411×923dp** |
| adb | `C:\Users\admin\AppData\Local\Android\Sdk\platform-tools\adb.exe` (nije na PATH) |
| Convex | dev `deafening-otter-504` (cloud); `npx convex data` radi iz korena |
| Env | `apps/mobile/.env.local`: `EXPO_PUBLIC_WEB_URL=http://10.0.2.2:3000` |
| Profili u bazi | **samo 2**: Jovan Milojević (admin, `jovanm028@gmail.com`) i **Kod Majstora** (member, `majstorakod@gmail.com`) |
| Orijentacija | `apps/mobile/app.json:6` → `"portrait"` (zaključano) |
| Dokazi konvencija | lanac2 koristio `docs/mobile/lanac2/dokazi-ux/` → ova faza: `docs/mobile/lanac3/dokazi/` |

### Činjenice iz koda koje OBLIKUJU testove (proverene sada)

1. **Ideja je odobrena čim `upvotes > downvotes`** (`ideas.ts:196`) → jedan moj
   glas ZA odobrava → C4 konverzija izvodljiva sa jednim korisnikom.
2. **Ugnježdavanje stranice odobrava ISKLJUČIVO autor roditeljske stranice**
   (`areasV2.ts:3051-3053`) → pun C7 tok traži **drugi nalog**. Mobilni ima ceo
   set za odobravanje (`odobrenja.tsx:137-140`: `areasV2.approveNesting` /
   `rejectNesting` / `withdrawNesting`).
3. **`adminAuth.resetAdminPassword` postoji i radi za BILO KOJI email**
   (`adminAuth.ts:24-42`, server-only `internalAction`, pokreće se kroz
   `npx convex run`) → drugi nalog na webu dobijamo resetom lozinke postojećeg
   člana „Kod Majstora". Jovanovu mobilnu sesiju reset NE dira (tokeni ostaju
   važeći; lozinka se proverava samo pri prijavi).
4. **Pretraga poruka NE POSTOJI u backendu** — `search.ts` izvozi samo `pages` i
   `ideasAndThoughts` (`search.ts:8,94`); web zove ta ista dva
   (`search-dialog.tsx:137,145`), mobilni ista dva (`pretraga.tsx:74,82`).
   → C13 deo „porukama" je nemoguć na OBA klijenta — čekira se sa napomenom,
   zapis u ZA-POPRAVKU (nije Z tabela: mobilnom ne fali ništa što web ima).
5. **Vraćanje arhivirane stranice ne postoji NIGDE** — grep `restorePage` po
   celom backendu = 0; `archivedAt: null` pogoci su samo insert difolti. Web nema
   UI za vraćanje stranice. Arhiviranje stranice čuva tuđe doprinose u
   `recoveredContent` (`areasV2.ts:1054-1060`) — to je dizajn. → C14 za
   belešku/zadatak: arhiviranje DA, vraćanje se čekira sa napomenom + ZA-POPRAVKU.
6. Undo traka pokriva tačno 5 vrsta (`lib/undo.ts`): misao, veza misli, ideja,
   checkpoint, doprinos → C14 „vrati" se dokazuje na tih 5, ništa drugo nema put.
7. Mobilni IMA sve za C11/C12/C8/C2: prilozi `files-panel.tsx:68-73`
   (list/upload/attach/remove/rename), tabela `table-panel.tsx:40-58` +
   `table-import-sheet.tsx:37` (importRows — CSV i Excel), relacije
   `relations-section.tsx:60-63` (`listRelations`/`deleteRelation`), instrukcije
   `zadatak/[id].tsx:149-150`, tabela se i PRAVI sa telefona
   (`page-create-sheet.tsx:232-236`).
8. ZA-POPRAVKU §1: stari redovi bez `searchText` nisu pretraživi — ali SAV
   sadržaj ove faze je nov (mutacije pišu polje) → C13 očekuje pune pogotke.

---

## 2. Alati i tehnike (izvršilac NE izmišlja — koristi ovo)

```powershell
$ADB = "C:\Users\admin\AppData\Local\Android\Sdk\platform-tools\adb.exe"
```

- **Screenshot petlja (jedini način da „vidiš" telefon):**
  `& $ADB shell screencap -p /sdcard/f7.png; & $ADB pull /sdcard/f7.png docs/mobile/lanac3/dokazi/cNN-ime.png`
  pa `Read` nad PNG-om → odluči koordinate → `& $ADB shell input tap X Y`.
  (Pull, ne PowerShell `>` — binarno preusmeravanje kvari PNG.)
- **Precizne koordinate bez pogađanja:** `& $ADB shell uiautomator dump /sdcard/ui.xml; & $ADB pull /sdcard/ui.xml` —
  bounds + srpske a11y labele za native elemente (WebView sadržaj nije unutra).
- **Tap koordinate su PIKSELI trenutne `wm size`**, ne dp (411×923dp = 1080×2424px, faktor 2.625).
- **Unos teksta:** `& $ADB shell input text 'F7%sbeleska'` — `%s` = razmak,
  SAMO ASCII (bez dijakritika), **NIKAD reč sa duplim „r"** — „rr" okida Metro
  reload (memorija lanca 2). Namerni reload: `input text rr`. Nazad: `input keyevent 4`.
- **Logcat = Metro konzola + WebView konzola** (celu fazu, u pozadini, Bash tool):
  `"$ADB" logcat -v time ReactNativeJS:V chromium:I ReactNative:W AndroidRuntime:E *:S >> docs/mobile/lanac3/logovi/faza-7-logcat.txt`
  — `ReactNativeJS` nosi sve JS console/greške (isto što Metro štampa),
  `chromium` nosi `[INFO:CONSOLE]` poruke IZ WebView-ova (kanvas, editor).
  chrome://inspect DevTools UI otvarati samo ako bag traži mrežu/inspekciju:
  Playwright → `chrome://inspect/#devices` (adb server već radi na hostu).
- **Convex logovi** (celu fazu, u pozadini, iz korena):
  `npx convex logs >> docs/mobile/lanac3/logovi/faza-7-convex.txt 2>&1`
- **Baza:** `npx convex data` (bez argumenata = spisak tabela — uradi prvo),
  pa `npx convex data <tabela> --limit 10 --order desc` posle svake C stavke.
- **Web:** Playwright MCP (`browser_navigate` na `http://localhost:3000`,
  `browser_click/type/take_screenshot/console_messages`).
- **Offline:** `& $ADB shell svc wifi disable` + `svc data disable` (i `enable` nazad).
- **Relaunch aplikacije:** `& $ADB shell am force-stop com.devotion.app` pa
  `& $ADB shell monkey -p com.devotion.app -c android.intent.category.LAUNCHER 1`
  (paket potvrdi prvo: `pm list packages | grep devotion`).
- **Veličine ekrana (lista D):** 360×640dp = `wm size 1080x1920` + `wm density 480`;
  430×932dp = `wm size 860x1864` + `wm density 320`; kraj = `wm size reset` +
  `wm density reset`. Posle svake promene: force-stop + relaunch.
- **Imenovanje test sadržaja:** prefiks `F7` (napravljeno telefonom) / `F7W`
  (napravljeno webom), ASCII, bez „rr" — pretraga u C13 traži „F7".
- **Dokazi:** `docs/mobile/lanac3/dokazi/` — `c01-…png`, `d360-…png`, `d430-…png`.

---

## 3. Korak 0 — priprema sesije (redom, pre prve C stavke)

1. Provere: `adb devices` (emulator-5554), Z3 curl na 3000 (mora 200), port 8081
   sluša; napravi `docs/mobile/lanac3/dokazi/`; pokreni obe pozadinske kapture
   (logcat + convex logs). Screenshot početnog stanja → `00-start.png`.
2. Potvrdi ko je ulogovan na telefonu: Više → Profil (očekivano Jovan, admin).
   Zapamti aktivni startup (očekivano ScanMe).
3. **Drugi nalog za web:**
   `npx convex run adminAuth:resetAdminPassword '{"email":"majstorakod@gmail.com","newPassword":"<nova, zapiši je u izveštaj faze>"}'`
   (Bash tool zbog navodnika). Iz sigurnosti resetuj i Jovanovu lozinku istom
   akcijom (poznata lozinka = oporavak ako mobilna sesija pukne) — ali mobilnu
   sesiju NE odjavljuj. Zapiši obe u izveštaj faze.
4. `npx convex data startupMembers --limit 20` — ako Kod Majstora NIJE član
   aktivnog startupa, dodaj ga sa telefona: Više → Administracija startupa →
   Članovi → „Dodaj člana" (usputni runtime dokaz za A2).
5. Playwright: prijava na `http://localhost:3000` kao `majstorakod@gmail.com`.
   Ceo web deo faze radi **Kod Majstora** (Jovan ostaje telefon) — dva stvarna
   korisnika, realtime u oba smera.
6. Test fajlovi: slika u galeriju emulatora — `& $ADB shell input keyevent 120`
   (Android sam snimi screenshot → uredna MediaStore stavka, bez media-scan
   akrobacija); CSV: napravi lokalno `f7-uvoz.csv` (3 kolone × 3 reda, ASCII) pa
   `& $ADB push f7-uvoz.csv /sdcard/Download/` (SAF picker vidi Download direktno).

---

## 4. Lista C — stavka po stavku (redosled je zavisnosni, ne redosled iz PARITET-a)

Za svaku stavku četiri koraka: **(a)** telefon prstom, **(b)** isto na webu kao
Kod Majstora, **(c)** provera u bazi (`npx convex data`), **(d)** screenshot(i)
u `dokazi/` + odmah `[x]` u PARITET.md sa putanjom dokaza. Posle svake stavke
brz pogled na oba log fajla — greška se rešava ODMAH, ne na kraju.

**C3 — Oblast.** (a) Prostor Nivo 1 → „Nova oblast" → „F7 Oblast".
(b) Web: napravi „F7 Oblast B" (ona služi i C6). (c) `startupAreas`: 2 nova reda.
Sav dalji sadržaj faze živi u „F7 Oblast" — baza ostaje pregledna.

**C1 — Beleška.** (a) Prostor → F7 Oblast → FAB „Nova stranica" → beleška
„F7 beleska telefon" → u editor ukucaj rečenicu → indikator „Sačuvano".
(b) Web: „F7W beleska web" + telo. Ukrsti: telefon vidi web belešku i obrnuto
(realtime, bez reload-a). (c) `pages` (2 reda, isti `areaId`), `pageBodies`
sadrži ukucan tekst. Editor je WebView → `chromium` CONSOLE u logcat-u čist.

**C2 — Zadatak sa svim poljima.** (a) FAB → zadatak „F7 zadatak telefon" →
detalj: status „U toku" (TaskActionsSheet), prioritet visok, rok sutra
(DatePickerSheet), izvršilac Jovan (assignee-picker), instrukcije
(InstructionsSection), 2 checkpointa. (b) Web „F7W zadatak web", ista polja,
izvršilac Kod Majstora. (c) `pages` red (status/prioritet/rok/instrukcije),
`taskAssignees`, `taskCheckpoints` — 2 po zadatku.

**C6 — Premeštanje u drugu oblast.** (a) „F7 beleska telefon" → „…" →
Premesti → F7 Oblast B → breadcrumb/lista se menja. (b) Web je vrati u F7
Oblast. (c) `pages.areaId` posle oba poteza.

**C7 — Ugnjezdi → odobri → izdvoji (dva smera, dva korisnika).**
Smer 1 (web traži, telefon odobrava): (b) Kod Majstora na webu traži gnježdenje
SVOJE stranice („F7W beleska web") pod Jovanov „F7 zadatak telefon" → pending.
(a) Telefon: Odobrenja → zahtev vidljiv → **Odobri** (`areasV2.approveNesting`)
→ podstranica. Smer 2 (telefon traži, web odobrava): (b) Kod Majstora napravi
„F7W roditelj" u F7 Oblast; (a) telefon: „F7 beleska telefon" → „…" →
„Ugnjezdi u…" → „F7W roditelj" → Alert „Čeka odobrenje"; web odobri; telefon:
breadcrumb „F7 Oblast › F7W roditelj", pa „…" → „Izdvoji iz grupe" → koren.
(c) `pageNestingRequests` status `pending`→`approved`, `pages` roditeljstvo.

**C8 — Relacija.** (a) „F7 beleska telefon" → „…" → Poveži → „F7 zadatak
telefon" → sekcija veza na OBA detalja; obriši svoju vezu (relations-section →
`deleteRelation`). (b) Web: poveži pa obriši F7W par. (c) tabela relacija
(ime iz spiska tabela) — red nastane pa nestane/arhivira se.

**C4 — Ideja: glasaj pa pretvori.** (a) Ideje → nova „F7 ideja telefon" →
detalj → glas ZA (1>0 = odobrena, ideas.ts:196) → „…" → „Pretvori u stranicu"
(red vidljiv tek posle odobrenja) → beleška, F7 Oblast → navigacija na rezultat
+ red „Pretvorena u stranicu". (b) Web: „F7W ideja web" → glas → konvertuj u
ZADATAK (pokrij drugu vrstu). (c) `ideaNodes.convertedPageId`, `ideaVotes`,
novi `pages` redovi.

**C5 — Misao: poveži pa pretvori.** (a) Više → Misli → „F7 misao jedan" i
„F7 misao dva" → na prvoj „…" → „Poveži sa misli…" → druga → detalj sekcija
„Veze" broji 1 → „Pošalji u Ideje" (conversion sheet) → ideja nastala.
(b) Web (thoughts kanvas): F7W par, veza, konverzija. (c) `thoughtNodes`,
`thoughtEdges`, novi `ideaNodes`; stanje misli posle konverzije uporedi
telefon↔web (isto ponašanje).

**C9 — Poruka: pošalji, reaguj, izmeni, obriši.** Kanal „Opšte".
(a) Telefon (Jovan) šalje „F7 poruka telefon"; web (Majstor) reaguje 👍 na nju;
telefon je izmeni („(izmenjeno)" + web vidi) pa obriše (web vidi nestanak).
(b) Obrnuto: web pošalje „F7W poruka web", telefon long-press → reakcija;
web izmeni pa obriše. (c) chat tabele: edited/deleted markeri, reakcije.

**C10 — DM.** (a) Razgovori → nova konverzacija → Kod Majstora → „F7 dm
telefon". (b) Web (Majstor) vidi DM, odgovara; telefon prima realtime.
(c) DM kanal + poruke u bazi.

**C11 — Prilog: priloži, preimenuj, obriši.** (a) „F7 beleska telefon" →
Prilozi → dodaj iz galerije (slika iz koraka 0.6) → preimenuj u „F7 prilog" →
**otvori pregled i pritisni hardversko Nazad** (file-preview Modal — ovo
zatvara E1 izuzetak „nikad testiran"; upiši dokaz i u E1 red PARITET-a) →
obriši prilog. (b) Web: upload/preimenovanje/brisanje na „F7W beleska web".
(c) `pageFiles` red nastane → `fileName` promenjen → obrisan.

**C12 — Tabela: kolona, red, CSV.** (a) FAB → vrsta „Tabela"
(`page-create-sheet.tsx:232`) „F7 tabela" → dodaj kolonu, dodaj red, upiši
ćelije → Uvoz → `f7-uvoz.csv` iz Download (table-import-sheet; CSV ide kroz
isti SheetJS put). (b) Web: „F7W tabela" + kolona + red + isti CSV.
(c) `pageTableColumns`/`pageTableRows` brojevi i sadržaj se slažu sa CSV-om.

**C13 — Pretraga.** (a) Telefon: pretraga „F7" → pogoci u stranicama,
zadacima (search.pages pokriva oba kind-a), idejama i mislima
(ideasAndThoughts). „xyzxyz" → prazno stanje sa porukom. (b) Web ista dva
upita → isti skup (redosled sme da varira). **Poruke: backend nema pretragu
poruka (search.ts izvozi samo pages+ideasAndThoughts; web zove ista dva) —
stavka se čekira SA TOM NAPOMENOM**, nov zapis u ZA-POPRAVKU (§8.1 ovde).

**C14 — Arhiviraj pa vrati (samo gde put postoji — utvrđeno kodom, tačka 1.6).**
(a) Telefon, redom: ideja (arhiviraj → traka „Poništi" → vrati), misao + veza
misli (isto), checkpoint (obriši → „Poništi" u 8s roku), doprinos (dodaj tekst
na belešku → obriši svoj → „Poništi"). Svaki povratak potvrdi u bazi
(`archivedAt` nazad na `null`). (b) Web: isti krug (sonner toast Undo).
Beleška/zadatak: arhiviraj na telefonu (potvrda vlasnika) i na webu — **vraćanje
ne postoji ni na jednom klijentu niti u backendu** (tačka 1.5) → čekira se sa
napomenom + ZA-POPRAVKU (§8.2). Tuđe se NE briše (00-PLAN §9.4 odluka je
otvorena — ballot tok se ovde ne izaziva). (c) `archivedAt` životni ciklus za
svaku vrstu.

**C15 — Offline pa online (poslednja C stavka, namerno).**
(a) `svc wifi disable` + `svc data disable` → telefon: pošalji poruku
„F7 offline poruka", štrikliraj checkpoint, dopiši rečenicu u belešku
(autosave red čekanja) → UI sme da čeka, NE sme da pukne → mreža nazad →
sačekaj sync. **Aplikaciju NE ubijati dok je offline** (mutacije čekaju u
memoriji klijenta — gubitak pri kill-u je očekivan, ne bag). (b) Web: isključi
mrežu kroz DevTools offline (Playwright), jedna izmena, mreža nazad.
(c) Sve offline izmene stigle u bazu; logcat bez crvenog; posle svega
force-stop + relaunch → čisto hladno stanje za listu D.

---

## 5. Lista D — 360×640 pa 430×932

Postupak: `wm size`/`density` (komande u §2) → force-stop + relaunch → prolaz
kroz SVE ekrane → `wm size reset`/`density reset` na kraju. Dokazi:
`d360-<ekran>.png` / `d430-<ekran>.png` (screenshot SVAKOG ekrana, i svakog
nalaza pre/posle popravke).

**Spisak ekrana (svaki na obe veličine):** Danas (+ quick-add sheet, task
actions, date picker, assignee picker), Prostor N1 + N2 (+ create-area,
page-create), stranica: beleška (editor + tastatura!), tabela, prilozi,
zadatak (+ checkpointi, instrukcije), Ideje lista + detalj (+ actions/convert/
edge sheet), Misli lista + detalj (+ sheetovi), kanvas (ideje i misli — WebView
+ rail), Razgovori + razgovor (kompozer + tastatura!) + nova konverzacija + DM,
Više: Svi zadaci (+ filter sheet), Odobrenja, Aktivnost, Puls, Članovi,
Pozivnice, Administracija startupa (+ oba sheet-a), Obaveštenja + podešavanja
obaveštenja, Pretraga (+ tastatura), Profil. Ekran prijave se NE posećuje
(traži odjavu — §7.5); ako sesija ionako pukne, proveriti ga tada.

**Šta se gleda na svakom (D čekliste):** ništa ne puca/preklapa; tastatura ne
prekriva fokusirano polje (editor, kompozer, pretraga, sheet-ovi sa unosom);
svaki sheet skroluje kad sadržaj pređe visinu; duga imena se seku sa `…` — za
ovo napravi „F7 stranica sa izuzetno dugackim naslovom koji nema kraj i jos
malo" + poruku od jedne duge reči bez razmaka; prazna stanja imaju poruku i
akciju (F7 Oblast B bez stranica, pretraga „xyzxyz", prazan novi kanal ako
postoji); učitavanje = skeleton (force-stop → relaunch → uhvati screenshot
tokom učitavanja); greška = poruka + „Pokušaj ponovo" (nakratko `svc wifi
disable` na jednom ekranu po veličini). **Landscape:** zaključan portret
(`app.json:6`) — zarotiraj emulator, potvrdi da ekran OSTAJE uspravan i ne
lomi se → D stavka se čekira sa tim obrazloženjem.

---

## 6. Popravke i commit disciplina

- Bag nađen na ekranu → popravi ODMAH (Fast Refresh; po potrebi `input text rr`
  za reload) → ponovo izvedi radnju na ekranu → screenshot POSLE → tek onda `[x]`.
- Pravila koda važe za svaku popravku: red kroz `ui/row.tsx`, min 16px (osim
  meta), meta 44pt, safe area, busy lock, tri stanja; StyleSheet + tokeni
  (NE className — memorija), bez novih ruta ako nije nužno (typed-routes regen
  ako jeste).
- Nalazi redizajn klase (boje/visine/IA) se NE popravljaju — ZA-POPRAVKU sa
  razlogom (presedan §5.9/§5.10).
- Commit po grupi: `Faza 7 — C1–C8 dokazi` / `Faza 7 — C9–C15 dokazi` /
  `Faza 7 — lista D + popravke` — svaki commit nosi kod popravki + PNG dokaze +
  PARITET `[x]` zajedno. Ako se dirne `apps/mobile/package.json` (ne očekujem):
  `NATIVE-BUILD.md`.

---

## 7. Šta može da pukne i šta onda

1. **Kanvas/editor prazan ili 404** → prvo Z3 provera porta (10 sek), pa Z4
   (`allowedDevOrigins`), pa Z1/Z2 (memoizovan `source`, injektovan token).
   NE prepravljati kod embeda pre ove tri provere.
2. **`input text` ne unosi u fokusirano polje** (WebView editor ume da guta) →
   tap direktno u polje pa kucaj; za editor fallback: kucaj kroz uiautomator
   koordinate; krajnji fallback za dijakritike: tekst bez njih (ASCII pravilo).
3. **`wm size` ostavi polomljen layout** → force-stop + relaunch posle SVAKE
   promene veličine (već u postupku); ako i dalje čudno — `wm reset` pa ponovo.
4. **Reset lozinke ne prolazi** (`validatePasswordRequirements`) → jača lozinka;
   ako nalog ne postoji → `npx convex data profiles` za tačan email.
5. **Mobilna sesija pukne / slučajna odjava** → prijava sa Jovanovim emailom i
   lozinkom iz koraka 0.3 (zato se resetuje i njegova). Ovo je JEDINI scenario
   u kom se ekran prijave dira.
6. **Offline test zaglavi aplikaciju** → mreža nazad, sačekaj 30s; ako i dalje
   visi — screenshot (dokaz baga!), force-stop + relaunch, zapiši nalaz i
   popravi ako je u mobilnom kodu.
7. **Metro umre** → NE pokretati svoj (env drift, EXPO_PUBLIC_* iz .env.local);
   zapisati, pokrenuti iz `apps/mobile` sa `npx expo start` SAMO ako je
   jedini način da se faza nastavi — i to zabeležiti u izveštaju.
8. **Convex logovi jave Server Error** koji nije naš okidač → svejedno se
   istražuje (dev baza je naša); uzrok + stavka u ZA-POPRAVKU ako je backend.
9. **Nesting zahtev „nije aktivan"** (stale — stranica premeštena/arhivirana u
   međuvremenu) → napravi svež par stranica i ponovi; C7 koraci idu PRE
   arhiviranja (C14) baš zbog ovoga.
10. **Realtime kašnjenje na ukrštenim proverama** → sačekaj do 5s pre nego što
    proglasiš bag; Convex subscription na emulatoru ume da dahne posle resume.

---

## 8. Šta NEĆU raditi (i gde se zapisuje)

1. **Pretraga poruka** — ne postoji u backendu (`search.ts` — samo `pages` i
   `ideasAndThoughts`); nema je NI WEB. Nije rupa pariteta (Z tabela ostaje
   netaknuta) nego rupa proizvoda → **nova stavka u ZA-POPRAVKU** („uslov:
   backend `search.messages` + UI na oba klijenta").
2. **Vraćanje arhivirane stranice** — backend nema mutaciju (grep = 0), web
   nema UI; „ništa se ne gubi" pokrivaju `recoveredContent` + ballot sistem →
   **stavka u ZA-POPRAVKU** („uslov: backend restore + ekran arhive na oba").
3. **Brisanje TUĐEG sadržaja / ballot tok** — 00-PLAN §9 odluka 4 je otvorena;
   ne presecam je testom. Ballot UI je već pokriven u Odobrenjima (Faza 4).
4. **iOS strana C liste i merni gejt editora** (ZA-POPRAVKU §2) — nema iOS
   uređaja u sesiji; gejt ostaje otvoren, ne zatvaram ga emulatorom.
5. **Landscape podrška** — portret je zaključan (`app.json:6`), što D stavka
   izričito dozvoljava; samo potvrda da rotacija ne lomi.
6. **Read-only beleška sa tabelom/prilogom u telu** — očekivano ponašanje
   (ZA-POPRAVKU §5.1, svesna cena tentap-a), ne bag; C12 zato pravi TABELU kao
   vrstu stranice, ne tabelu u telu beleške.
7. **Redizajn nalazi** (prijava legacy paleta §5.10, `Button sm` 14px §5.13…) —
   ne diram u ovoj fazi; novi te klase idu u ZA-POPRAVKU.
8. **Backend izmene bilo koje vrste** — uključujući 2 zatečena lint upozorenja
   (ZA-POPRAVKU §6) i B:378 koji zbog njih ostaje nečekiran.

---

## 9. Dokaz da je faza gotova (izlazni kriterijumi)

1. Svaka C stavka: screenshot(i) u `dokazi/` + DB izvod (u izveštaju faze) +
   `[x]` u PARITET.md sa putanjom dokaza — **u istom commitu** sa eventualnom
   popravkom. Stavke sa napomenom (C13 poruke, C14 stranice) čekirane sa
   napomenom NA LICU MESTA u PARITET.md.
2. Svaka D stavka: screenshotovi na obe veličine + `[x]` sa dokazima; svaki
   nalaz ili popravljen (pre/posle PNG) ili u ZA-POPRAVKU sa razlogom.
3. **B:384 (Metro) i B:385 (Convex)**: na kraju faze sweep oba log fajla —
   logcat: nula `E/ReactNativeJS`, `AndroidRuntime`, `[SEVERE:CONSOLE]`, nula
   upozorenja koje se ponavlja (uniq -c nad `W/` linijama); convex log: nula
   `Server Error`/`Uncaught`. Čisto → čekirati oba uz putanje log fajlova i
   napomenu da je logcat `ReactNativeJS` isti tok koji Metro štampa.
4. Ako je bilo izmena koda: `npx tsc --noEmit` (mobile i web), `npm run lint`
   (0 grešaka; 2 zatečena backend upozorenja ostaju), `npm run build`, `npm test`.
5. ZA-POPRAVKU dobija: §8.1 pretraga poruka, §8.2 vraćanje stranice, plus sve
   što nije stignuto — iskreno, sa razlogom.
6. E1 red u PARITET.md: dopuniti izuzetak file-preview dokazom iz C11.
