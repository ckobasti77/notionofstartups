# Faza UX — plan (13 bagova iz sekcije E)

> Pisano posle čitanja: PARITET.md (cela sekcija E + „ŠTA JE VEĆ URAĐENO"),
> ZA-POPRAVKU.md (Z1–Z4), 00-PLAN.md §5, i svih dole navedenih fajlova.
> Sve linije koda navedene u ovom planu odnose se na stanje grane
> `ui-nocni-20260809-0931` — vidi K0 zašto.

---

## 0. KLJUČNI NALAZ PRE SVEGA: bagovi su snimljeni na build-u koji NIJE na ovoj grani

Dokazi, proverljivi komandama:

- Trenutna grana `paritet-20260810-0252` je nastala od `fd625ae` (vrh
  `faza-3-nocni`). Grana `ui-nocni-20260809-0931` („noćni lanac 2", Faze 3–7:
  editor beleške, redizajn, `ui/sheet.tsx`, `ui/row.tsx`,
  `page-actions-sheet.tsx`, Danas pozdravna kartica…) **NIJE u precima**:
  `git branch --contains a9ea881` → samo `ui-nocni-…` i `paritet-…-0159`.
- Sekcija E opisuje TAJ build: E8 kaže „`page-actions-sheet.tsx` postoji u
  kodu" — na trenutnoj grani taj fajl **ne postoji** (`git ls-files | grep
  page-actions` → prazno). E4 kartica „Zdravo, Jovan" — `grep "Zdravo"
  apps/mobile/src` na trenutnoj grani → prazno. „ŠTA JE VEĆ URAĐENO" navodi
  editor sa autosave-om — na trenutnoj grani editora beleške nema (samo
  `editor-spike.tsx`).
- Presek izmena dve grane (`git diff --name-only fd625ae <grana>` za obe) je
  **samo 2 fajla**: `docs/mobile/ZA-POPRAVKU.md` i
  `packages/backend/convex/_generated/api.d.ts`. `apps/mobile` je na našoj
  grani netaknut → merge je bezbedan.
- Grana `paritet-…-0159` (= ui-nocni + njena Faza 0 + ručni commit „aa" sa
  izmenom lanac-skripte) se NE spaja — našu Fazu 0 već imamo (commit
  `e1b77d8`, revidirana), a „aa" dira samo `paritet-lanac.ps1` koji kod nas
  već radi. Spaja se **čist vrh lanca 2**: `ui-nocni-20260809-0931`
  (`da27012`).

**Zaključak:** bez merge-a, 5 od 13 bagova nema ni ekran na kome postoji
(E5, E8, E9, E10 — editor i „…" meni; E4 — pozdravna kartica), a cilj faze
(„svih 13 popravljeno i viđeno na emulatoru") je neispunjiv. Merge je korak K0.

Druga posledica: korisnik je bagove gledao na bundle-u koji je bio STARIJI od
vrha lanca 2 (Metro nije reload-ovan tokom noći), pa su neki bagovi u
međuvremenu već popravljeni u kodu (E5, E8, E10 — dokazi ispod). Za njih se NE
piše nov kod, nego se na svežem bundle-u dokazuje da rade, pa se čekiraju.

---

## 1. Šta sam pročitao i šta sam zatekao — po bagu

Sve putanje su `apps/mobile/src/...` osim gde piše drugačije; linije su sa
`ui-nocni-20260809-0931` (= stanje posle K0).

| Bag | Stanje | Fajl i linija — šta je zatečeno |
|---|---|---|
| E1 | **UZROK NEPOZNAT — dijagnoza pa lestvica** | `components/ui/sheet.tsx:196–202` — SVI sheet-ovi idu kroz jedan primitiv: RN `Modal` sa `onRequestClose={onClose}` koji bi TREBALO da hvata Nazad. `app.json` ima `predictiveBackGestureEnabled: false` od prvog builda; manifest (`apps/mobile/android/.../AndroidManifest.xml:18`) ima `enableOnBackInvokedCallback="false"`. Dakle poznati „predictive back" uzrok otpada. Jedini drugi `<Modal` u aplikaciji: `components/stranica/file-preview.tsx:43–46` (ima `onRequestClose`). Bag je ili od zastarelog bundle-a, ili RN 0.86 regresija — rešava se na ekranu (K1). |
| E2 | **ŽIV — nađen tačan uzrok** | `components/danas/workload-strip.tsx:61–66`: horizontalni `ScrollView` **bez `style`-a**. RN `ScrollView` podrazumevano ima `flexGrow: 1` → u `danas.tsx` root-u (flex:1, traka van skrola po komentaru na 341–343) traka se razvuče na slobodan prostor, a chipovi (default `alignItems: stretch`) se rastegnu na njenu visinu → „300px kartice sa sitnim tekstom u praznini". Sami chipovi su već kompaktni (`minHeight: 56`, linija 183). |
| E3 | **verovatno simptom E2** | Ista traka: `contentContainerStyle` VEĆ ima `paddingHorizontal: 16` (172–178). Odsečena kartica bez naznake = rastegnuti chip iz E2 + `maxWidth: 220` (184) zbog kog na 360dp ekranu sledeća kartica viri samo ~6dp. Posle E2: verifikacija + smanjenje `maxWidth` za jasan peek. |
| E4 | **ŽIV** | Zaglavlje: `components/app-header.tsx:68–77` (eyebrow = ime startupa, naslov „Danas"). Duplikat: `components/danas/day-summary.tsx:47–53` opet crta ime startupa (eyebrow u kartici) iznad „Zdravo, {ime}". Poziv: `app/(app)/(tabs)/danas.tsx:380–385`. |
| E5 | **VEĆ URAĐENO U KODU — samo verifikovati** | `components/stranica/note-editor.tsx:61` `NOTE_PLACEHOLDER = 'Zapiši kontekst, odluke i sledeće korake…'`, uvezan na :299 (`setPlaceholder`); naslov ima srpski placeholder „Naslov beleške" (:461). Traka je custom srpska (`note-toolbar.tsx:60–64` — komentar izričito kaže da tentap-ov engleski Toolbar NIJE korišćen). „Write something…" je bio tentap default sa starog bundle-a. Ostaje: emulator dokaz + grep ostatka editora na engleski. |
| E6 | **ŽIV** | `components/zadatak/discussion-link.tsx:90` — hardkodovano `subtitle="Otvori razgovor tima o ovom zadatku."`, a komponenta je montirana i na beleški: `app/(app)/stranica/[id].tsx:131` (komentar na :128–130 kaže da je anchorType-agnostična). Drugi pozivalac: `app/(app)/zadatak/[id].tsx:277`. |
| E7 | **ŽIV** | `app/(app)/zadatak/[id].tsx:245–251`: kad je `assigneeList` prazna → `<AssigneeStack assignees={[]}>` → `components/danas/assignee-stack.tsx:34–36` crta `<Avatar empty>` — prazan isečkan krug koji liči na spiner. Skeleton za učitavanje već postoji (:246–247), problem je samo učitano-prazno stanje. |
| E8 | **VEĆ URAĐENO U KODU — samo verifikovati + inventar** | Beleška: `app/(app)/stranica/[id].tsx:80–87` „…" (Ellipsis, `accessibilityLabel="Akcije stranice"`) → `PageActionsSheet` (:92–97). Zadatak: `app/(app)/zadatak/[id].tsx:161–165` → isti sheet (:305–310). Sheet ima menu/move/nest/relate (`page-actions-sheet.tsx:27–33`). Inventar „komponenta postoji, ulaz ne" URAĐEN u planiranju: `NewConversationSheet`→`chat.tsx:84`, `note-link-sheet`→toolbar dugme Link, `rename-area-sheet`→`prostor.tsx:206–213`, `date-picker-sheet`→task-actions, `assignee-picker`→zadatak:297, `/profil`→switcher (`app-header.tsx:113`), `/dizajn-katalog` i `/editor-spike`→`vise.tsx:219,240`. Siročića NEMA; executor ponavlja brzi grep za potvrdu. |
| E9 | **ŽIV** | `app/(app)/stranica/[id].tsx:70–74`: `ScreenHeader title={page.title}` + odmah ispod `NoteEditor` sa izmenjivim naslovom (`note-editor.tsx:458–465`) — isto ime dvaput. Na zadatku duplikata NEMA (telo ne ponavlja naslov). |
| E10 | **VEĆ URAĐENO U KODU — samo verifikovati** | `components/stranica/note-toolbar.tsx:231–257`: horizontalni `ScrollView`, `keyboardShouldPersistTaps="always"`, prikaz SAMO dok je tastatura gore (:83) — dakle traka stoji uz tastaturu. Odsečeni B/I/S/`<>`/H1–H3 set iz E10 je tačno tentap-ov default (stari bundle). Ostaje: dokaz sa otvorenom tastaturom + po potrebi peek doterivanje. |
| E11 | **verovatno simptom E2 — verifikovati, fallback spreman** | `danas.tsx:578` lista ima `paddingBottom: 96`; FAB je 56px na `bottom:16` (`quick-add-fab.tsx:30–35`) → na kraju skrola karta čisti FAB za 24dp. Preklapanje je viđeno kad je E2 pojeo 40% visine. Posle E2 proveriti; ako i dalje preklapa → `paddingBottom` na 104. |
| E12 | **ŽIV** | Nijedan mobilni fajl ne zove `pages.getBreadcrumbs` (`git grep getBreadcrumbs -- apps/mobile` → prazno). Backend funkcija POSTOJI: `packages/backend/convex/pages.ts:233` — vraća `[{_id,title,kind}]` od korena do same stranice. Na zadatku je eyebrow trenutno STATUS (`zadatak/[id].tsx:158`) — baš ono što E12 prijavljuje. Backend se NE dira. |
| E13 | **ŽIV** | „Ekran oblasti" = Nivo 2 u `app/(app)/(tabs)/prostor.tsx:195–247` (zaglavlje sa Preimenuj + Canvas, brifing, lista stranica). Nema nikakvog kreiranja. Gotov gradivni blok postoji: `components/canvas/page-create-sheet.tsx:75–80` prima `{open, startupId, areaId, parentPageId, onClose}`, pravi belešku/zadatak (sa svim task opcijama) kroz `pages.create`, i VEĆ se koristi van kanvasa (sekcija Podstranice). FAB primitiv: `quick-add-fab.tsx` (labela hardkodovana „Novi zadatak" — treba prop). Lista Nivoa 2 ima `paddingBottom: 32` → uz FAB mora 96. |

Već urađeno, NE dirati i NE praviti ponovo (potvrđeno čitanjem koda): srpski
placeholder + srpska traka editora (E5/E10), „…" meni na oba ekrana (E8),
kompaktni chipovi trake (deo E2), `paddingBottom: 96` na Danas listi (deo E11),
`onRequestClose` na oba Modala (deo E1). Za sve njih faza duguje samo DOKAZ sa
emulatora.

---

## 2 + 3. Redosled izmena — svaka sa fajlom, razlogom i obrascem „kako prstom"

Grupisano po uzroku (E3/E11 su simptomi E2; E9 i E12 su jedan zahvat na
zaglavljima), unutar toga po težini iz zadatka (E1 → E2 → E8 → raspored →
tekstovi → E7 → E12).

### K0. Merge lanca 2 + čist temelj (preduslov za sve)

1. `git merge ui-nocni-20260809-0931 --no-ff -m "Merge lanca 2 (ui-nocni): editor, sheet primitiv, redizajn — osnova za Fazu UX"`
2. Očekivana KONFLIKTNA fajla su tačno dva (presek diff-ova proveren u
   planiranju):
   - `docs/mobile/ZA-POPRAVKU.md` → osnova je **ui-nocni verzija** (ima §2–§5
     koje naša nema), pa u nju preneti iz naše verzije: **Z3** (port 3000
     otet), **Z4** (`allowedDevOrigins`) i pasus „Sitnica koja čeka" iz Z2
     (docstring `embed-url.ts`). Ništa ne brisati.
   - `packages/backend/convex/_generated/api.d.ts` → uzmi bilo koju stranu pa
     ODMAH `npx convex codegen` iz root-a repoa i commit-uj regenerisano;
     proveri da u njemu postoji `pages.childCounts` (dodat u lancu 2).
   Ako konfliktuje bilo šta treće: `apps/*` → uzmi ui-nocni stranu (naša grana
   ih nije dirala); `docs/mobile/lanac2/*`, `PARITET.md`, `paritet-lanac.ps1`,
   `apps/web/next.config.ts`, `apps/web/package.json` → uzmi našu (HEAD).
3. Sanity odmah posle merge-a: postoje `components/ui/sheet.tsx`,
   `components/ui/row.tsx`, `components/stranica/page-actions-sheet.tsx`,
   `components/stranica/note-editor.tsx`; `app.json` i dalje ima
   `predictiveBackGestureEnabled: false`; `apps/mobile/package.json` NIJE
   promenjen merge-om (proveri `git diff HEAD~1 -- apps/mobile/package.json`
   → prazno; lanac 2 ga nije dirao pa NATIVE-BUILD.md nije potreban).
4. Metro se OBAVEZNO pokreće sa `--clear` (merge menja `babel.config.js` i
   `tailwind.config.js`): iz `apps/mobile` → `npx expo start --clear`
   (u pozadini; usput regeneriše `.expo/types` za nove rute `ideja/[id]`,
   `/profil`, `/dizajn-katalog` — bez toga `tsc` pada na `router.push`).
5. Pre ijedne izmene: `npx tsc --noEmit` u `apps/mobile` i `apps/web`,
   `npm run lint`, `npm test` — sve mora proći na SPOJENOJ osnovi, da se
   kasniji padovi ne pripišu pogrešnom koraku.
6. Aplikacija na emulator: `adb devices` (emulator mora biti živ), zatim
   `adb shell am start -a android.intent.action.VIEW -d "devotion://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081"`
   (procedura iz KANVAS-DIJAGNOZA.md:146). Reload na svež bundle: `r` u Metro
   terminalu. Web server na 3000 za OVU fazu nije potreban (editor je lokalni
   tentap bundle; kanvasi se ne testiraju) — ali ako K1 testira i canvas
   sheet, prvo 10-sek provera porta iz ZA-POPRAVKU Z3.

### K1. E1 — hardversko Nazad na SVIM sheet-ovima (dijagnoza, pa lestvica)

Svi sheet-ovi idu kroz JEDAN primitiv (`ui/sheet.tsx`), pa je popravka
centralna; jedini drugi Modal je `file-preview.tsx`.

1. **Reprodukcija na svežem bundle-u:** otvori prebacivač startupa (tap na
   avatar) → `adb shell input keyevent 4`.
2. **Ako se sheet zatvori a aplikacija ostane** → bag je bio artefakt
   zastarelog bundle-a; NE menjaj kod, pređi na test svih reprezentativnih
   sheet-ova (spisak u §6) i čekiraj sa dokazima; u plan dopiši odstupanje
   „E1: uzrok bio zastareo bundle, kod netaknut".
3. **Ako aplikacija ode u pozadinu** → u `components/ui/sheet.tsx` dodaj
   `BackHandler` pretplatu aktivnu SAMO dok je `mounted` (u postojeći
   `useEffect` ili zaseban): handler zove `onClose()` i vraća `true`; skida se
   čim se sheet demontira. (RN poziva poslednje registrovan listener prvi, pa
   pretplata sheeta legitimno preskače onu iz `prostor.tsx:175`.) Isto dodaj u
   `file-preview.tsx` (dok je `visible`). Reload → ponovi korak 1.
4. **Ako Nazad i dalje ubija aplikaciju** (događaj uopšte ne stiže do RN-a) →
   instalirani dev client je stariji od native konfiguracije: `bash
   podesi-android.sh` (rebuild + install), pa ponovi. Ako je rebuild rađen,
   dopiši `docs/mobile/lanac2/NATIVE-BUILD.md` red sa razlogom.
5. **Ako ni tada ne radi** → RN 0.86 Modal regresija; NE upuštati se u zamenu
   Modal-a overlay-em u ovoj fazi (rizik po svih 20+ sheet-ova). Zapiši
   reprodukciju u ZA-POPRAVKU.md kao novu zamku, prijavi E1 kao NEISPUNJEN u
   izveštaju — cilj faze tada nije dostignut i to piše u prvoj rečenici.

**Prstom:** Android korisnik zatvara donji sloj sistemskim Nazad — isto što na
webu radi Esc/klik van modala. Backdrop tap i prevlačenje nadole već postoje.

### K2. E2 + E3 + E11 — traka opterećenja i FAB na „Danas"

Fajl: `components/danas/workload-strip.tsx`.

1. E2 (uzrok): `ScrollView`-u trake dodaj `style={styles.scroll}` sa
   `flexGrow: 0` (novi stil; razlog u komentaru: RN ScrollView podrazumevano
   `flexGrow: 1`, pa je traka gutala slobodnu visinu i rastezala chipove).
   U `styles.strip` (contentContainer) dodaj `alignItems: 'flex-start'` —
   chipovi više ni u jednom kontejneru ne mogu da se rastegnu po visini.
2. E3: `maxWidth` chipa `220 → 180` (linija 184) — na 360dp ekranu „Svi" +
   jedan član + vidljiv peek sledećeg ≥ 30dp; postojeći `paddingHorizontal:
   16` ostaje. Ako peek na ekranu i dalje deluje kao greška iscrtavanja,
   dodatno smanji na 168 — odluka NA EKRANU, ne napamet.
3. E2 (treći kvadratić — „član sa 0 ne troši istu površinu"): chip člana bez
   ijednog zadatka već je uži (bez „kasni/hitno" statova) i sa prigušenom
   nulom (`statZero`, linija 213); posle skupljanja visine na ~56dp to je
   zadovoljeno — proveri na ekranu i čekiraj tek tad.
4. E11: NE menjaj ništa unapred. Posle 1–2, na emulatoru napuni „Danas"
   (postojeći nalog ima zadatke), skroluj do kraja: poslednja kartica mora
   celom širinom biti IZNAD FAB-a. Ako i dalje preklapa →
   `danas.tsx:578` `paddingBottom: 96 → 104`.

**Prstom:** filter po članu = jedan tap na chip, ponovni tap gasi (postojeće
ponašanje, ostaje); web-ove široke kolone opterećenja ostaju horizontalna traka
chipova visine jednog reda.

### K3. E8 — „…" meni: verifikacija + inventar (bez novog koda)

1. Na emulatoru: otvori belešku → „…" → sheet sa Premesti / Ugnjezdi /
   Izdvoji / Poveži; isto na zadatku. Ako dugme NE radi na svežem bundle-u —
   tek tada je bag stvaran i debaguje se (`setActionsView('menu')` tok).
2. Inventar ponovi grepom (mora ostati prazan): za svaku komponentu iz
   `components/**/{*-sheet,*-picker,*-preview}.tsx` proveri da ima bar jedan
   import + mount u `app/` ili u montiranoj komponenti. U planiranju: sve
   uvezano (dokaz u §1, red E8).
3. Čekiraj obe E8 stavke sa screenshot dokazom.

**Prstom:** web desni-klik/hover meni stranice = „…" u zaglavlju → bottom
sheet (tabela prevoda iz PARITET.md).

### K4. E4 — jedno zaglavlje na „Danas"

Fajlovi: `components/danas/day-summary.tsx`, `app/(app)/(tabs)/danas.tsx`.

1. Iz `day-summary.tsx` ukloni eyebrow blok (:47–53), prop `startupName` iz
   tipa i JSDoc-a; kartica zadržava pozdrav „Zdravo, {ime}." + tri brojača.
2. U `danas.tsx:382` ukloni `startupName={startup?.name ?? null}`.
3. Ime startupa ostaje SAMO u `AppHeader` eyebrow-u (koji je i prebacivač).

**Prstom:** web ima sidebar sa imenom radnog prostora + pozdravni hero; na
telefonu ime startupa živi u zaglavlju (tap = prebacivanje), kartica samo
pozdravlja i broji.

### K5. E9 + E12 — jedan naslov i putanja u zaglavlju (jedan zahvat)

Nova komponenta: `components/breadcrumbs-eyebrow.tsx` (jedan fajl, dele je oba
ekrana):

- Props: `pageId`, `startupId`, `areaId`.
- Podaci: `useQuery(api.pages.getBreadcrumbs, { pageId })` +
  `useQuery(api.startups.get, { startupId })` za labelu oblasti (breadcrumbs
  ne sadrže oblast; `pages.get` ne vraća labelu — provereno u
  `lib/validators.ts`). Backend se NE dira — obe funkcije postoje.
- Prikaz: `Text` u stilu eyebrow-a (`text.meta`, `mutedForeground`),
  `numberOfLines={1}`, `ellipsizeMode="head"` (kraj — najbliži roditelj —
  uvek vidljiv): `„{oblast} › {roditelj} › …"`, tj. segmenti
  `[areaLabel, ...crumbs.slice(0, -1).map(c => c.title)]` — BEZ tekuće
  stranice. Za stranicu u korenu: samo ime oblasti. Dok stiže: `<Skeleton
  width={140} height={13}>`.
- Sopstveni mali class `ErrorBoundary` U ISTOM fajlu koji na grešku renderuje
  samo labelu oblasti (ili ništa): `getBreadcrumbs` BACA za arhiviran
  roditeljski lanac (`pages.ts:244`), a bačeni upit u render-u inače obara ceo
  ekran kroz route ErrorBoundary — putanja ne sme da sruši detalj.
- Ovo je meta tekst — izuzetak od pravila 16px (dozvoljen po PARITET-u).

Izmene ekrana:

1. `app/(app)/zadatak/[id].tsx:158`: `eyebrow={TASK_STATUS_META[status].label}`
   → `eyebrow={<BreadcrumbsEyebrow …/>}`. Status NIJE izgubljen — već postoji
   kao prvi red meta kartice (:182–197). Time pada tačno E12 primedba
   („Backlog je status, ne putanja").
2. `app/(app)/stranica/[id].tsx:70–74`:
   - `kind === 'note'`: `title={pageKindLabel(page.kind)}` („Beleška"),
     `eyebrow={<BreadcrumbsEyebrow/>}`. Ime stranice ostaje SAMO u editoru,
     gde je izmenjivo (`note-editor.tsx:458`) → E9 rešen tačno po PARITET-u
     („ako je izmenjiv, zaglavlje neka bude putanja, ne isto ime").
   - `kind === 'table' | 'file'`: `title={page.title}` ostaje (telo ne
     ponavlja naslov), `eyebrow={<BreadcrumbsEyebrow/>}` menja dosadašnji
     `pageKindLabel` (vrsta se vidi iz samog sadržaja).
3. U ISTOM commitu čekirati: E9, E12 i A5 stavku „`pages.getBreadcrumbs`", i u
   ZA-POPRAVKU.md sekciji 5.6 (breadcrumb) dopisati da je rešeno ovom fazom.

**Prstom:** web korisnik vidi „gde je" u sidebaru/breadcrumb-u; na telefonu
putanja je prigušena linija iznad naslova. Segmenti NISU dodirljivi (dodirna
meta od 44pt za 3+ segmenata ne staje u meta liniju) — povratak ide sistemskim
Nazad; ovo je orijentacija, ne navigacija.

### K6. E13 — kreiranje stranice u oblasti

Fajlovi: `components/danas/quick-add-fab.tsx`, `app/(app)/(tabs)/prostor.tsx`.

1. `quick-add-fab.tsx`: dodaj prop `label?: string` (default „Novi zadatak")
   → `accessibilityLabel`. Ništa vizuelno se ne menja.
2. `prostor.tsx`, Nivo 2 (blok :195–247): stanje `createOpen`; u view root
   dodaj `<QuickAddFab label="Nova stranica" onPress={…}/>` (isti izgled i
   pozicija kao Danas — „isti FAB, isto ponašanje") i
   `<PageCreateSheet open={createOpen} startupId={activeStartupId}
   areaId={top.areaId} parentPageId={null} onClose={…}/>`. Sheet već sam
   radi busy lock, greške i pun task obrazac — NE praviti nov.
3. Listi Nivoa 2 podigni `paddingBottom: 32 → 96` (stil koji pripada
   `PageLevel` sadržaju; u fajlu postoje dva `paddingBottom: 32` — bump onaj
   koji je contentContainer liste stranica; po potrebi oba, proveri na
   ekranu) — da FAB ne pravi novi E11.
4. Nivo 1 (lista oblasti) NE dobija FAB: tamo se pravi OBLAST i taj ulaz već
   postoji („Nova oblast", :313–320; u „ŠTA JE VEĆ URAĐENO").

**Prstom:** web „area-view" ima dugme za novu stranicu u oblasti; na telefonu
FAB dole desno — isti gest kao „novi zadatak" na Danas.

### K7. E5 — verifikacija placeholder-a + čišćenje engleskog (kod samo ako grep nađe)

1. Emulator: otvori NOVU praznu belešku → telo pokazuje „Zapiši kontekst,
   odluke i sledeće korake…", naslov „Naslov beleške".
2. Sweep ostatka editora i okoline:
   `git grep -inE "write something|type your|add link|url here|untitled" apps/mobile/src`
   → mora biti prazno; šta iskoči — prevedi u istom duhu (nemoj dirati
   engleske IDENTIFIKATORE, samo korisnički vidljive stringove).
3. Čekiraj E5 sa screenshotom.

### K8. E6 — tekst diskusije prati vrstu stranice

Fajl: `components/zadatak/discussion-link.tsx` (+ 2 pozivaoca).

1. Dodaj prop `pageKind: PageKind` (tip iz `lib/page-kinds.ts`). Subtitle
   (:90) postaje mapa: `task` → „Otvori razgovor tima o ovom zadatku.",
   `note` → „…o ovoj beleški.", `table` → „…o ovoj tabeli.", `file` → „…o
   ovom prilogu."
2. Pozivaoci: `zadatak/[id].tsx:277` → `pageKind="task"`;
   `stranica/[id].tsx:131` → `pageKind={page.kind}`.
3. Proveri i `accessibilityLabel`/naslove u istom fajlu da nigde ne ostane
   „zadatak" za ne-zadatak.

### K9. E7 — „Niko nije dodeljen" umesto praznog kruga

Fajl: `app/(app)/zadatak/[id].tsx:245–251`.

1. `value` reda „Izvršioci": `assignees === undefined` → Skeleton (ostaje);
   `assigneeList.length === 0` → `<Text style={[styles.valueText, { color:
   colors.mutedForeground }]}>Niko nije dodeljen</Text>`; inače
   `<AssigneeStack…>`. Red ostaje dodirljiv (otvara piker) — prazno stanje sa
   akcijom.
2. `AssigneeStack` prazan-krug grana (`assignee-stack.tsx:34–36`) se NE dira:
   na kompaktnoj kartici u listi (TaskCard) prazan krug je legitimna vizuelna
   oznaka; E7 je prijavljen na DETALJU. Ovo je svesna odluka — vidi §5.

### K10. E10 — traka za formatiranje: verifikacija sa tastaturom

1. Emulator: otvori belešku, tap u TELO teksta → tastatura gore → traka mora
   stajati NEPOSREDNO IZNAD tastature (ne ispod), skrolabilna do „Ponovi".
2. Ako poslednja ikonica na desnoj ivici deluje odsečeno bez naznake da ima
   još → u `note-toolbar.tsx` `styles.content` dodaj `paddingRight: 28`
   (prazan prostor = jasan kraj, a poluvidljiva ikonica pre njega = poziv na
   skrol). Odluka NA EKRANU.
3. Čekiraj obe E10 stavke (skrol + iznad tastature) sa screenshotom na kom se
   VIDI tastatura.

### K11. Završetak faze

1. `npx tsc --noEmit` (apps/mobile), `npx tsc --noEmit` (apps/web),
   `npm run lint`, `npm test` — nula grešaka.
2. Svaki K-korak je commit-ovan ZAJEDNO sa svojim čekiranjem u PARITET.md
   (pravilo lanca); dokazi u `docs/mobile/lanac2/dokazi-ux/` (vidi §6).
3. Odstupanja od ovog plana dopisati u ovaj fajl (sekcija „Odstupanja" na
   dnu) — revizor poredi plan i diff.

---

## 4. Šta može da pukne i šta tada

| Rizik | Reakcija |
|---|---|
| Merge konflikt van 2 očekivana fajla | Pravila iz K0.2 (apps/* → ui-nocni; docs/config → HEAD). NIKAKO `git merge --abort` pa „radiću bez merge-a" — bez lanca 2 faza je neispunjiva. |
| `tsc` padne odmah posle merge-a | Najverovatnije zastareo `.expo/types` (nove rute) → `npx expo start --offline`, ugasi posle ~8s, pa ponovo `tsc` (zamka iz memorije lanca). Ako i dalje pada — `npx convex codegen` pa tek onda debug. |
| E1 se ne da reprodukovati | To je USPEH koraka 2 lestvice — testiraj svih 11 sheet-ova iz §6, čekiraj sa dokazom, zapiši odstupanje. Ne izmišljaj popravku za bag koga nema. |
| E1 preživi i BackHandler i rebuild | Stani na E1 (korak 5 lestvice): zapiši u ZA-POPRAVKU.md, prijavi cilj kao NEISPUNJEN u izveštaju, nastavi ostale bagove — 12/13 sa iskrenim izveštajem je bolje od laži. |
| Metro servira stari bundle (uzrok cele zbrke sa E listom) | UVEK `--clear` posle merge-a + `r` pre svake verifikacije; u svakom screenshotu mora biti vidljiva promena koja se testira. |
| `getBreadcrumbs` baci (arhiviran roditelj) | Pokriveno dizajnom K5 (lokalni ErrorBoundary u eyebrow komponenti — ekran preživi, putanja se svede na oblast). |
| Emulator ugašen / dev client nije instaliran | `adb devices`; pokretanje kroz deep link iz K0.6; ako client fali → `bash podesi-android.sh` (traje; uraditi jednom, na početku). |
| FAB u Prostoru preklopi poslednji red | Isti lek kao E11: paddingBottom liste ≥ 96 (K6.3), proveri na ekranu. |
| `npm test` padne na nečemu iz lanca 2 | Lanac 2 je svoju Fazu 7 završio zeleno; pad posle merge-a znači interakciju sa NAŠOM granom (najverovatnije api.d.ts) → `npx convex codegen` pa ponovo. Ne ućutkuj test. |

---

## 5. Šta NEĆU raditi u ovoj fazi i zašto

- **Ništa iz sekcija A1–A8** (misli, admin, listForStartup filteri,
  arhiviranje/vraćanje, chat arhiviranje, checkpoint kanvas) — to su Faze 1–4
  lanca. Jedini izuzetak: A5 stavka `pages.getBreadcrumbs` koju E12 prirodno
  zatvara (isti kod, isti commit).
- **Zamena Modal-a custom overlay-em** (E1 poslednja stepenica) — rizik po
  svih 20+ sheet-ova daleko premašuje fazu; ako lestvica dotle dođe, piše se
  ZA-POPRAVKU zapis i iskren izveštaj.
- **Prazan krug u `AssigneeStack` na karticama liste ostaje** (E7 se popravlja
  na detalju zadatka gde je prijavljen) — na kartici je krug kompaktna oznaka
  „mesto čeka nekoga", a red „Izvršioci" sa tekstom tamo ne staje.
- **Breadcrumb segmenti nisu dodirljivi** (E12) — 44pt meta za 3+ segmenata ne
  staje u meta liniju zaglavlja; navigacija ostaje na sistemskom Nazad.
- **Ne diram `packages/backend`** ni u jednom koraku (obe potrebne funkcije
  postoje); `_generated/api.d.ts` se samo regeneriše.
- **Sekcija Z u PARITET.md ostaje netaknuta**: Z tabela beleži isključene
  `api.*` funkcije, a ova faza nijednu API funkciju ne isključuje — gornje
  odluke su UX obim faze i zapisane su ovde (revizor ih ovde nalazi).
- **Ne prepravljam vizuelni stil** (boje, tipografiju, redizajn) — paritet je
  funkcionalni; dira se samo ono što E lista imenuje.

---

## 6. Dokaz za svaku stavku — konkretan test

Svi screenshotovi: `adb exec-out screencap -p >
docs/mobile/lanac2/dokazi-ux/<ime>.png`, commit uz odgovarajući korak.
Pre svake verifikacije: `r` u Metro terminalu (svež bundle).

| Bag | Test na emulatoru | Očekivano | Dokaz |
|---|---|---|---|
| E1 | Za SVAKI od: startup-switcher (avatar), task-actions (⋮ na kartici Danas), quick-add (FAB Danas), date-picker (Rok → proizvoljan datum), page-actions („…" na beleški), assignee-picker (Izvršioci na zadatku), message-actions (long-press poruke u chatu), new-conversation (chat +), create-area (Prostor „Nova oblast"), file-preview (prilog), idea-node (canvas — samo uz port-3000 proveru): otvori → `adb shell input keyevent 4` | Sheet se zatvori, aplikacija OSTAJE u prvom planu; sledeći keyevent 4 normalno navigira | `e1-<sheet>-pre.png` + `e1-<sheet>-posle.png` za switcher; za ostale po jedan „posle" (zatvoren sheet, app živa); spisak u odstupanjima ako neki sheet nije testiran i zašto |
| E2 | Danas, segment Pregled, sa ≥ 4 člana | Traka visoka ~56–80dp (ne 300), tekst ne pluta u praznini; chip člana sa 0 uži od chipa sa 4 | `e2-posle.png` (ceo ekran) |
| E3 | Isti ekran, bez skrola trake | Sledeći chip viri ≥ 30dp preko desne ivice + levi/desni padding 16 | isti `e2-posle.png` (vidljiv peek) |
| E4 | Vrh Danas ekrana | Ime startupa TAČNO JEDNOM (zaglavlje); kartica počinje sa „Zdravo, …" | `e4-posle.png` |
| E5 | Nova prazna beleška, tap u telo | Placeholder „Zapiši kontekst, odluke i sledeće korake…"; naslov „Naslov beleške"; grep iz K7.2 prazan | `e5-posle.png` + ispis grepa u odstupanjima |
| E6 | Otvori BELEŠKU bez diskusije; pa ZADATAK bez diskusije | Beleška: „…o ovoj beleški."; zadatak: „…o ovom zadatku." | `e6-beleska.png` + `e6-zadatak.png` |
| E7 | Zadatak bez ijednog izvršioca | Red „Izvršioci" pokazuje tekst „Niko nije dodeljen", bez praznog kruga; tap i dalje otvara piker | `e7-posle.png` |
| E8 | Beleška → „…" → sva 4 reda; Zadatak → „…" → ista 4 reda; tap „Premesti u oblast" prikaže spisak oblasti | Sheet se otvara sa oba ekrana; grep inventar iz K3.2 bez siročića | `e8-beleska.png` + `e8-zadatak.png` |
| E9 | Otvori belešku sa imenom (npr. „oze") | Ime se vidi JEDNOM (izmenjivo, u telu); zaglavlje: eyebrow=putanja, title=„Beleška" | `e9-posle.png` |
| E10 | Beleška, tastatura OTVORENA, skroluj traku do kraja | Traka neposredno iznad tastature; do „Ponovi" se stiže skrolom; kraj trake jasan | `e10-posle.png` (tastatura U kadru) |
| E11 | Danas sa dovoljno zadataka, skrol do dna | Poslednja kartica cela iznad FAB-a (≥ 8dp zazora) | `e11-posle.png` |
| E12 | Zadatak ugnježden ≥ 2 nivoa (napravi kroz „…" → Ugnjezdi ako ne postoji); pa stranica u korenu oblasti | Eyebrow: „Oblast › Roditelj › …" (bez statusa); u korenu: samo ime oblasti; ekran NE puca ni kad putanja ne može da se učita | `e12-zadatak.png` + `e12-koren.png` |
| E13 | Prostor → uđi u oblast → FAB „Nova stranica" → napravi belešku; pa napravi zadatak sa rokom | Stranica se pojavi u listi oblasti (realtime); FAB ne preklapa poslednji red | `e13-fab.png` + `e13-posle-kreiranja.png` |

Završna kapija (sve četiri zelene, ispisi u logu faze): mobilni `tsc`, web
`tsc`, `npm run lint`, `npm test`. Čekiranje: svih 16 kvadratića sekcije E
(E1×1, E2×3, E3×1, E4×1, E5×1, E6×1, E7×1, E8×2, E9×1, E10×2, E11×1, E12×1,
E13×1) + A5 breadcrumbs — svaki u commitu svog koraka, nijedan bez svog
dokaza na disku.

---

## Odstupanja (popunjava izvršilac)

1. **K0 merge — jedan konflikt umesto dva.** `_generated/api.d.ts` se spojio
   automatski; konfliktovao je samo `ZA-POPRAVKU.md`. Rešeno po pravilu iz
   plana, s tim da je numeracija naših zamki zadržana (Z3 port, Z4
   allowedDevOrigins — plan i memorija ih tako referenciraju), a ui-nocni
   zamka „placement na (0,0)" je postala **Z5**. `npx convex codegen` je usput
   i push-ovao funkcije na dev deployment (potrebno emulatoru za
   `pages.childCounts`).
2. **E1 se NE reprodukuje na svežem bundle-u** — testirano na
   startup-switcheru i page-actions sheet-u (`dumpsys`:
   `topResumedActivity=com.devotion.app` posle keyevent 4, sheet zatvoren).
   Kod NIJE menjan; uzrok je bio zastareo bundle. Ostali reprezentativni
   sheet-ovi testirani usput (spisak u §6 tabeli dokaza).
3. **E5 NIJE bio „već urađen u kodu"** kako je plan pretpostavio. Runtime
   `setPlaceholder` u tentap-u 1.0.1 samo upiše opciju u ekstenziju
   (`editor.setOptions()` uz TODO komentar u samom tentap-u) — ProseMirror
   dekoracija se ne osveži do prvog kucanja, pa prazna beleška večno pokazuje
   engleski default. Popravljeno **statički**:
   `PlaceholderBridge.configureExtension({placeholder})` u `bridgeExtensions`
   (modulski const), runtime poziv uklonjen.
4. **Tastatura na emulatoru:** AVD je imao `hw.keyboard=yes`, pa se softverska
   tastatura uopšte ne iscrtava (`mInputShown=true`, prozor nulte visine) i
   E10 dokaz „tastatura u kadru" nije bio moguć. Promenjeno na
   `hw.keyboard=no` + hladan restart emulatora.
5. **K6 sitnica:** prazno stanje oblasti je govorilo „Otvori Canvas u
   zaglavlju da dodaš prvu stranicu" — zastarelo čim je FAB stigao; sada
   upućuje na FAB.
6. **E11 — preklapanje kad lista NE preskače ekran.** Posle E2 popravke
   trenutna lista (4 zadatka) staje cela na ekran, pa `paddingBottom` nema šta
   da gura: FAB tada stoji preko donjeg desnog ugla poslednje kartice, što je
   standardno Material FAB ponašanje (i Gmail ga ima). Test iz §6 („sa
   dovoljno zadataka, skrol do dna") je merodavan — proveren sa listom koja
   preskače ekran.
