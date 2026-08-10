# Za popravku — čeka se na uslov

Otvorene stavke koje su namerno ostavljene u „expand" fazi. Svaka se zatvara tek
kad je naveden uslov ispunjen. Ne diraj pre toga.

---

## 1. `searchText` narrow (korak 2 — contract)

**Kontekst.** `ideaNodes` i `thoughtNodes` imaju denormalizovan `searchText`
(title+text) za full-text pretragu. Stari redovi (nastali pre uvođenja pretrage)
nemaju to polje. Šema je bila sužena (`v.string()`) pre nego što je backfill
uspeo da se izvrši, pa je Convex odbijao šemu i backfill nikad nije krenuo.

**Šta je urađeno (korak 1 — expand).** Polje je vraćeno na opcionalno na tri
mesta, da stari redovi prođu i validaciju šeme i return validaciju:

| Fajl | Linija | Bila | Sad |
|---|---|---|---|
| `packages/backend/convex/schema.ts` | ~142 (`thoughtNodes`) | `searchText: v.string()` | `searchText: v.optional(v.string())` |
| `packages/backend/convex/schema.ts` | ~610 (`ideaNodes`) | `searchText: v.string()` | `searchText: v.optional(v.string())` |
| `packages/backend/convex/thoughts.ts` | ~68 (`thoughtNodeDocumentValidator`) | `searchText: v.string()` | `searchText: v.optional(v.string())` |

> `thoughtNodeDocumentValidator` je return validator za `thoughts.listNodes` i
> `thoughts.getConnectedGroup` — vraća sirove `thoughtNodes` dokumente, pa bi
> `v.string()` pukao na starom redu bez polja. Zato i on mora ostati opcionalan
> dok backfill ne završi.
>
> `pages.searchText` (`schema.ts:229`, `pageSummaryValidator` u
> `lib/validators.ts:251`) **nije deo ovoga** — postoji odranije i ostaje
> `v.string()`. Ne diraj.

**Napomena o pretrazi u međuvremenu.** Prazan `searchText` indeks znači da stari
red **neće biti u rezultatima pretrage** dok se ne backfill-uje. To je prihvatljivo
privremeno stanje — sve upisne mutacije već popunjavaju polje, pa novi/izmenjeni
redovi jesu pretraživi. Backfill zatvara rupu za zatečene redove.

**Korak koji sledi (contract — zatvaranje).**

1. Pokreni backfill:
   ```
   npx convex run migrations:runSearchTextBackfill
   ```
2. Proveri da je gotovo:
   ```
   npx convex run migrations:verifySearchTextBackfill
   ```
3. **USLOV:** narrow (vraćanje sva tri polja na `v.string()`) sme tek kada
   `verifySearchTextBackfill` vrati `remaining: { ideas: 0, thoughts: 0 }`
   (`complete: true`). Ako `note` javi da je skeniranje odsečeno na 1000 redova po
   tabeli, pokreni backfill pa proveru ponovo dok limit više nije dostignut.
4. Tek tada vrati na obavezno `searchText: v.string()` na sva tri mesta iz tabele
   gore (schema.ts × 2 + thoughts.ts × 1), pa `npm run check` i backend typecheck
   (`tsc -p packages/backend/convex/tsconfig.json`).

Redosled je opisan i u `packages/backend/convex/migrations.ts:437`.

---

## 2. Editor beleške — merni gejt (M3.2)

> **ČITAJ PRVO (izmena od 2026-08-09).** Editor je **izgrađen i pušten PRE nego što je
> merenje obavljeno.** Nije mereno ništa — nijedan broj u tabeli „Brojevi" nije popunjen i
> nijedan nije ni procenjen. Odluka da se gradi bez merenja je doneta svesno (noćni rad,
> nema čoveka sa telefonom u ruci), pa se ovaj gejt **ne zatvara ovim commit-om — i dalje
> stoji.** Šta se menja: gejt više ne odlučuje *da li* se gradi, nego *da li ostaje*.
> Detalji, uključujući plan B, u pododeljku „Stanje posle implementacije" niže.

**Kontekst.** Prvobitna arhitektura je bila **embed web editora u WebView-u**
(`/embed/note/[id]`) — nula prepravki, savršen paritet, nema rizika gubitka tabela/
priloga. Ostaje jedan nemereni rizik: **latencija Tiptap-a u WebView-u na jeftinom
Androidu**. Plan je bio: pun editor (auth + autosave) se NE gradi dok se to ne izmeri —
„ne pravi ono što nisi izmerio".

**Šta je urađeno (proba).** Merni prototip renderuje PRAVI `RichTextEditor` (istu
komponentu koja se šalje) sa ~2000 reči, bez auth-a/snimanja, uz HUD:
- Web: `apps/web/app/embed/note/[id]/note-embed.tsx` (grana `pageId === 'probe'`).
- Mobilni host: `apps/mobile/src/app/(app)/editor-spike.tsx` (WebView nad `/embed/note/probe`),
  ulaz „Editor proba (merenje)" u tabu „Više".
- Provereno u web pregledaču: editor se renderuje, ~1910 reči, kucanje registruje, HUD
  `Ready`/`Warm` rade, nula grešaka u konzoli.

**Kako meriti (radi se na UREĐAJU — ne emulator).** Na fizičkom iPhone-u **i** jeftinom/
starijem Androidu: „Više" → „Editor proba (merenje)".
- `Ready` (HUD): od navigacije stranice do editora — cold otvaranje.
- `Warm` (HUD, dugme „Ponovo montiraj"): re-init editora bez reload-a stranice.
- keystroke→glyph: snimi 240fps kamerom drugog telefona, izbroj frejmove od dodira do slova.
- Skroluj do dna (~2000 reči) i kucaj tamo — proveri da tastatura ne prekriva kursor.
- **`EXPO_PUBLIC_WEB_URL` mora da bude dostupan sa uređaja** (LAN IP za fizički telefon;
  `10.0.2.2` važi samo za Android emulator).

**Pragovi:** cold `Ready` < 1.5 s (ili prihvatljivo uz skeleton), `Warm` < 500 ms,
keystroke→glyph neprimetno.

**Brojevi (popuni na uređaju):**

| Uređaj | Ready (cold) | Warm | keystroke→glyph | Tastatura ne prekriva kursor? | Prolazi? |
|---|---|---|---|---|---|
| iPhone (model?) | — | — | — | — | — |
| Jeftin Android (model?) | — | — | — | — | — |

> Proba (`editor-spike.tsx`) meri **embed** varijantu. Isporučeni editor je tentap —
> zajednički rizik (Tiptap u WebView-u) je isti, ali merodavno merenje je sada nad **pravim
> ekranom beleške**: „Prostor" → bilo koja beleška. Proba ostaje samo kao poređenje.

---

### Stanje posle implementacije (2026-08-09) — šta je urađeno bez merenja

**Šta je izgrađeno.** Pun editor beleške na **`@10play/tentap-editor`** (Tiptap u skrivenom
WebView-u, native traka alata), a ne na embed ruti. Bundle je lokalni, pa editor radi i bez
mreže; snimanje je jedino što traži Convex.

| Fajl | Uloga |
|---|---|
| `apps/mobile/src/components/stranica/note-editor.tsx` | Editor + naslov + autosave + konflikt |
| `apps/mobile/src/components/stranica/note-toolbar.tsx` | Traka alata (srpska, lucide ikone, prati tastaturu) |
| `apps/mobile/src/components/stranica/note-link-sheet.tsx` | Unos adrese linka |
| `apps/mobile/src/components/stranica/note-reader.tsx` | Verno čitanje HTML tela (`WebView`, bez JS-a) |
| `apps/mobile/src/lib/note-content.ts` | Format tela, granice, CSS za editor i čitanje |
| `apps/mobile/src/lib/note-link.ts` | `normalizeNoteLinkHref` bez `URL` (RN nema pun polyfill) |
| `apps/mobile/src/app/(app)/stranica/[id].tsx` | `note` grana više nije placeholder |

Model podataka je **identičan webu**: telo je HTML iz Tiptap-a u `pageBodies.content`,
snima se kroz `areasV2.updatePage` sa `expectedRevision` i istim `KONFLIKT_IZMENA`
protokolom. **Nula izmena u backendu.**

**Zašto tentap, a ne embed.** Tri zahteva iz zadatka embed rešava lošije: traka koja prati
tastaturu (tentap je ima kao native traku, embed bi je imao u DOM-u ispod softverske
tastature), rad bez veze (embed traži da web app bude dostupan) i `EXPO_PUBLIC_WEB_URL`
koji na fizičkom telefonu mora da bude LAN IP. Cena je opisana odmah ispod.

**Cena koju tentap naplaćuje — pročitaj pre nego što nešto „popraviš".** Unapred izgrađen
tentap web bundle
(`node_modules/@10play/tentap-editor/src/simpleWebEditor/build/editorHtml.js`) ima fiksnu
Tiptap šemu: nema `table`, nema `codeBlock`, nema našeg `noteFile` čvora (provereno:
`grep -c codeBlock` nad bundle-om vraća 0; u `bridges/code.ts` je `CodeBlock` zakomentarisan
kao `tiptapExtensionDeps`). Posledice:

1. **Blok koda NIJE isporučen**, iako je bio u minimumu zadatka. Inline `kod` jeste. Jedini
   put do bloka koda je **sopstveni web bundle** (vite + `vite-plugin-singlefile`, pa
   `customSource` umesto `editorHtml`) — zaseban posao, nije rađen noću.
2. **Beleška koja sadrži tabelu, prilog ili blok koda otvara se SAMO ZA ČITANJE**
   (`NoteReader`), uz objašnjenje u traci. Bez toga bi učitavanje takvog tela u editor tiho
   obrisalo te blokove, a prvi autosave bi taj gubitak upisao u bazu. Provera je
   `unsupportedNoteBlocks()` i radi nad **telom koje je editor učitao**, ne nad živim
   upitom (da tuđa izmena ne sruši editor usred kucanja).
3. **Ubacivanje slika i priloga u telo beleške ne postoji na mobilnom.** Web ima
   (`note-file-node`). To je rupa u paritetu, samo je bila van minimuma ovog zadatka.

**Native build.** `apps/mobile/package.json` NIJE menjan (tentap je ušao još u `3efa76c`),
ali tentap ima native deo (`android/build.gradle`, `ios/TentapUtils.m`). Ako dev build na
uređaju potiče od pre tog commita, potreban je nov dev build — Metro reload nije dovoljan.

---

**USLOV / odluka — i dalje otvoren.**

- **Prolazi** (pragovi gore, na fizičkom iPhone-u *i* jeftinom Androidu, nad pravim ekranom
  beleške) → editor ostaje. Tek tada se briše proba (`editor-spike.tsx` + ulaz u `vise.tsx`
  + ruta u `_layout.tsx`) i otvara zaseban zadatak za sopstveni bundle (blok koda + tabele
  + prilozi).
- **Pada** → **plan B: markdown u native `TextInput` + pregled.** Konkretno:
  - Pisanje: `TextInput` (multiline) sa markdown sintaksom i istom trakom alata, koja tada
    umeće znakove (`**`, `#`, `- [ ]`, `[tekst](url)`) umesto da poziva Tiptap komande.
  - Čitanje: već postoji — `NoteReader` renderuje sačuvani HTML verno i ostaje nepromenjen.
  - Konverzija: backend čuva HTML, pa plan B traži HTML→markdown pri otvaranju i
    markdown→HTML pri snimanju. **To gubi tabele, priloge i sve što markdown ne pokriva**,
    zato mora da nasledi pravilo koje editor već ima: telo koje padne na
    `unsupportedNoteBlocks()` se ne uređuje nego se čita (uz „napredno uređivanje na webu").
    Bez tog pravila plan B briše tuđi sadržaj.
  - Zadržava se ceo autosave sloj iz `note-editor.tsx` (debounce, red čekanja,
    `KONFLIKT_IZMENA`, snimanje pri izlasku i odlasku u pozadinu), `note-reader`,
    `note-link` i granice iz `note-content`. Menja se samo površina za unos.
  - Odluka o konverziji se donosi zajedno, ne prećutno.

Plan: `~/.claude/plans/mobilni-nema-editor-bele-ki-shimmying-fern.md`.

---

## 3. Nedostaju agregatni brojači zadataka (napredak %)

**Kontekst.** Web `home-view.tsx` prikazuje karticu „Napredak" — procenat završenih
zadataka u startupu. Računa ga tako što povuče **prvih 100** zadataka kroz
`tasks.listForStartup` (paginirano) i podeli `done / ukupno`; kad ima još rezultata,
sam obeleži broj zvezdicom jer je procena, ne podatak.

**Zašto mobilni to nema.** `tasks.commandCenter` (jedini upit koji tab „Danas"
koristi) vraća **samo otvorene** zadatke, pa se procenat iz njega ne može izvesti.
Druga paginirana pretplata od 100 dokumenata po ekranu — zarad broja koji je i na
webu približan — ne isplati se na telefonu. `DaySummary` zato prikazuje
`otvoreno / kasni / hitno`, sve tri tačne.

**USLOV za zatvaranje.** Novi (jeftin) upit koji vraća agregat po startupu, npr.
`tasks.counts({ startupId }) → { open, done, total }`, izračunat iz indeksa
`by_startup_status_active_sort` po statusu (`.take` samo brojanja, bez učitavanja
tela). Kad postoji: dodati četvrti brojač u `DaySummary` i, po želji, izbaciti
web hak sa prvih 100.

**Ne dodavati backend samo zbog ovoga** dok se ne skupi još potrošača agregata
(npr. Puls, widget iz Faze 5).

---

## 4. Nema jeftinog upita za brifing oblasti

**Kontekst.** Sadržaj brifinga oblasti (`areaBodies`) se čita jedino kao deo canvas
payload-a: `areasV2.getCanvas` / `getAreaCanvasByArea` → `scope.briefing`. Payload
uz to nosi sve stranice oblasti, ivice, placement-e, ghost-ove i viewport.

**Posledica na mobilnom.** `AreaBriefingSection` (tab Prostor) je zato skupljena
podrazumevano i telo se montira tek na razvijanje — inače bi svaki ulazak u oblast
otvorio tešku pretplatu zbog jednog tekstualnog polja.

**USLOV za zatvaranje.** Upit `areasV2.getAreaBriefing({ areaId })` koji vraća samo
`{ content, revision, ownerProfileId, canEdit }` (jedan `areaBodies` red +
`requireStartupMember`). Kad postoji: prebaciti `AreaBriefingSection` na njega i
razmisliti o tome da sekcija bude razvijena podrazumevano (brifing je kontekst
oblasti, korisniji otvoren).

**Ne dodavati backend samo zbog ovoga** dok je jedini potrošač ova sekcija — trenutno
rešenje radi ispravno, samo je skuplje nego što mora.

---

## 5. Nalazi završne provere (2026-08-09) koji NISU popravljeni

Završna provera noćnog lanca pokrenula je tri parity-check agenta (ceo `apps/web`
vs `apps/mobile`), dva `rn-review` agenta i ručnu reviziju pristupačnosti. Ono što
je popravljeno stoji u istoriji grane; **ovde je iskren spisak onoga što nije**,
sa razlogom. Nije poređano po veličini posla nego po tome koliko boli.

> **Metodološka napomena.** Prompt je tražio skill `design:accessibility-review`.
> Taj skill **nije instaliran** u ovom okruženju (postoji samo `frontend-design`).
> Revizija pristupačnosti je zato urađena ručno, po WCAG 2.2 AA + React Native
> accessibility API-ju, kroz zaseban agent. Nije korišćen skill koji ne postoji.

### 5.1 Beleška sa prilogom, tabelom ili blokom koda je na telefonu READ-ONLY

**Stanje.** `lib/note-content.ts` (`unsupportedNoteBlocks`) prepoznaje `image`,
`video`, `file`, `table` i `codeBlock` u telu beleške i tada `note-editor.tsx`
montira `NoteReader` umesto editora. Web nudi sve to iz trake alata
(`rich-text-editor.tsx`).

**Zašto nije popravljeno.** Traži prepakivanje tentap web-bundle-a sa
`@tiptap/extension-table`, `extension-image` i custom node view-om za prilog
(`note-file-node.tsx`), pa novi development build i merenje na uređaju. To je
posao od ~1 nedelje iz `00-PLAN.md` §5.1, ne popravka nalaza.

**USLOV.** Zatvara se zajedno sa mernim gejtom iz §2 ovog dokumenta — nema smisla
širiti bundle pre nego što se izmeri koliko postojeći košta na jeftinom Androidu.

**Ovo nije rubni slučaj.** To je svaka bogatija beleška napisana na laptopu.

### 5.2 Arhiviranje / brisanje stranice ne postoji na mobilnom

**Stanje.** Web `page-editor-view.tsx` ima `archive()`: autor briše direktno,
ostali pokreću `collaboration.requestDeletion` sa `target.kind: "page"`. Mobilni
`PageActionsSheet` nudi premesti / ugnjezdi / izdvoji / poveži — brisanja nema.

**Zašto nije popravljeno.** `00-PLAN.md` §9, otvorena odluka br. 4 glasi: „**Da li
mobilni sme da briše sadržaj**, ili brisanje ostaje samo na desktopu uz postojeći
ballot sistem." Ta odluka **nije donesena**. Dodati brisanje cele stranice sa
telefona bez odluke znači preseći je u svoju korist; izostaviti je i ne zapisati
znači prećutati. Zato: zapisano, ne urađeno.

**USLOV.** Odluka vlasnika proizvoda. Ako je „sme" — posao je mali: ista dva
poziva koja mobilni već radi za ideju i checkpoint (`archive` vs
`requestDeletion`), plus red u `PageActionsSheet`.

### 5.3 Admin ekran (startupi, logo, članovi) ne postoji na mobilnom

**Stanje.** Web `admin-dialog.tsx` pokriva `startups.create`, `update`,
`generateLogoUploadUrl`, `setLogo`, `removeLogo`, `addMember`, `removeMember`,
`profiles.listAll`. Mobilni `clanovi.tsx` je izričito read-only; pozivnice rade.

**Zašto nije popravljeno.** To je pun ekran sa sedam mutacija, ne popravka — a
sve su radnje retke i nepovratne (uklanjanje člana, promena logotipa tima). Tok
upload-a slike mobilni **već ima** (`profil.tsx`, `expo-image-picker`), pa je
tehnički put poznat; nedostaje samo ekran.

**USLOV.** Zaseban korak, ne repovi noćnog lanca. Redosled po vrednosti:
kreiranje startupa → izmena naziva/opisa → logo → dodavanje/uklanjanje člana.

### 5.4 Ideja se ne može pretvoriti u stranicu (`ideas.convertToPage`)

**Stanje.** Na mobilnom se ideja sada može napraviti, pročitati, izmeniti,
obrisati, prokomentarisati i za nju glasati — ali ne i **pretvoriti** u zadatak
ili belešku. Web to radi kroz dijalog sa izborom oblasti (`ideas-view.tsx`).

**Zašto nije popravljeno.** Traži izbor oblasti + izbor `kind`-a + prelazak na
novonastalu stranicu, i to je poslednji korak životnog ciklusa ideje — zaslužuje
sopstveni tok, ne dugme naguranо u postojeći sheet. Ostalo je van dometa ove
provere.

**Posledica koju treba znati.** Ideja se na telefonu doteruje do kraja, ali se
„zaključava" na laptopu.

### 5.5 Misli: veze, hijerarhija, duplikat, „pošalji u Ideje"

**Stanje.** Mobilni ima `thoughts.listNodes`, `listEdges`, `createNode`,
`updateNode`, `archiveNodes` (kroz `thought-node-sheet`). Nema `createEdge`,
`updateEdge`, `archiveEdges`, `restoreEdges`, `nestNode`, `detachNode`,
`toggleNodeParent`, `duplicateNodes`, `restoreNodes`, `convertToIdeas`,
`getConnectedGroup`, `getCanvas`.

**Zašto nije popravljeno.** Većina je uređivanje grafa i pada pod zapisani izuzetak
iz `02-EKRANI.md` §13 („Uređivanje layouta kanvasa"). Ali **dve stvari nisu**, i to
treba reći otvoreno:

- **`convertToIdeas`** — jedini most misli → ideje. Bez njega je mobilni kanvas
  misli ćorsokak. Nije uređivanje layouta, nego tok.
- **`restoreNodes`** — web ima undo posle brisanja misli, mobilni ima samo potvrdu
  pre. Ako korisnik potvrdi, nema puta nazad.

**USLOV.** Oba su realan posao od pola dana; nisu urađena jer je prioritet bio na
tabu koji uopšte nije radio (Obaveštenja). Sledeći na redu.

### 5.6 Breadcrumb na ekranu stranice (`pages.getBreadcrumbs`) — REŠENO (Faza UX)

**Rešeno u Fazi UX (E12):** `components/breadcrumbs-eyebrow.tsx` — putanja
„Oblast › Roditelj › …" u eyebrow-u zaglavlja i stranice i zadatka, sa lokalnim
ErrorBoundary-jem (arhiviran roditeljski lanac ne obara detalj, svede se na ime
oblasti). Segmenti nisu dodirljivi (orijentacija, ne navigacija).

**Prvobitno stanje.** Web pokazuje pun put oblast → roditelj → stranica. Mobilni
je imao samo `router.back()` i sekciju „Podstranice".

### 5.7 Potpisani doprinosi na stranici i na oblasti

**Stanje.** `ContributionThread` na mobilnom prima `{ kind: 'idea' }` i
`{ kind: 'task_checkpoint' }`. Web nudi isti mehanizam i za `page`
(`PageAuthorEntries`) i za `area` (`area-signed-contributions.tsx`).

**Zašto nije popravljeno.** Backend prima isti `target` diskriminator, pa je posao
mali (jedan član unije + montiranje sekcije). Nije urađeno zato što bi ekran
stranice dobio **četvrtu** sklopivu sekciju (Podstranice, Povezane stavke,
Diskusija — koja je u ovoj reviziji dodata — i Doprinosi), a to traži odluku o
redosledu i podrazumevanoj skupljenosti, ne samo kod.

### 5.8 Web propusti (obrnut smer) — nisu dirani

Parity ide u oba smera; ovo mobilni ima a web nema. **Namerno nisu popravljeni:**
zadatak je bio mobilni klijent, a dirati web bez potrebe je rizik bez dobiti.

| Šta | Mobilni | Web |
|---|---|---|
| Beskonačan skrol u Aktivnosti | `activity.listPaginated` | tvrdi `limit: 50`, bez nastavka |
| Brojači stranica po oblasti / podstranica | `pages.areaTopLevelCounts`, `childCounts` | nema — red se mora otvoriti |
| Sekcija „Nedavno" | `pages.recentForStartup` | nema server-side liste |
| Proba zvuka obaveštenja | ima | nemoguće (web push ne svira OS zvuk) — već zapisano u kodu |

Prva tri su prava tri PROPUSTA na webu i sve tri funkcije su klijent-neutralne i
već deployovane.

### 5.9 Pristupačnost — šta je ostalo

Popravljeno je: kontrast (`primary` 4.47:1 → 6.29:1, nov token `primaryText`,
`subtle` i svetla semantička paleta), izolacija fokusa u svim sheet-ovima
(`accessibilityViewIsModal`), ekran prijave (labele polja, `role`, live region za
grešku, dodirne mete), svajp akcije kroz `accessibilityActions`, najave uspeha,
`Button` koji raste sa sistemskim fontom, najava skeletona.

**Nije popravljeno:**

- **Pomeranje fokusa na prvi element sheet-a posle ulazne animacije**
  (`AccessibilityInfo.setAccessibilityFocus`). `accessibilityViewIsModal` sprečava
  čitanje sadržaja ispod, ali fokus i dalje ostaje na dugmetu koje je sheet
  otvorilo. Traži `ref` na prvi fokusabilni čvor u svakom sheet-u i sinhronizaciju
  sa `Sheet` animacijom — nije jednolinijska izmena u primitivu.
- **`ScreenHeader` eyebrow (prebacivanje startupa) je ~32pt visine.** Glavni ulaz u
  `StartupSwitcher` na svakom tabu. Povećanje mete menja visinu zaglavlja na svim
  ekranima, pa je to vizuelna odluka redizajna, ne popravka.
- **`SegmentedControl` seče labelu pri uvećanom fontu** (`numberOfLines={1}` u
  `flex: 1` segmentu). Isti popravak kao za `Button` ovde ne radi — tri segmenta u
  jednom redu nemaju kuda da narastu; treba prelom u dva reda iznad praga
  `PixelRatio.getFontScale()`.
- **`Stagger` čita „smanji pokret" jednom na mount-u** (`useState`), pa uključivanje
  opcije ne deluje na već montirane stavke do remount-a. Bezopasno, ali nije tačno.
- **Mehurić poruke nema objedinjen `accessibilityLabel`** (autor + telo + vreme),
  pa VoiceOver čita 3–4 čvora po poruci. `accessibilityRole` i akcije jesu
  popravljeni; sklapanje labele menja i strukturu `message-bubble`.

### 5.10 Ekran prijave je i dalje na legacy paleti

`(auth)/prijava.tsx` koristi `constants/theme.ts`, ne `theme/tokens.ts`. U ovoj
reviziji su mu popravljeni pristupačnost i boja greške (sada `colors.destructive`
umesto hardkodovanog `#e5484d`), ali polje za unos se od pozadine razlikuje
**1.14:1** (svetla tema) i nema ivicu — vizuelno se jedva razaznaje.

**Zašto nije popravljeno.** Prelazak na tokene znači redizajn celog ekrana, a to
je posao serije „dizajn", ne provere pariteta.

### 5.11 Zastarelo pravilo u `.claude/rules/mobile.md`

Pravilo kaže „Stilizuj kroz NativeWind (`className`)". Stvarnost: NativeWind JSX
wrapping je **namerno uklonjen** iz babel konfiguracije jer je interop jeo
funkcijske stilove `Pressable`-a; ceo kod koristi `StyleSheet.create` +
`useThemeColors()`. Pravilo nije menjano u ovoj reviziji jer je van opsega
(`.claude/` nije `apps/mobile`), ali **zavodi svakog sledećeg agenta** i treba ga
ispraviti.

### 5.12 Šta NIJE provereno

Iskreno, da se ne pretpostavi šire pokriće nego što ga ima:

- **Ništa nije pokrenuto na uređaju ni u emulatoru.** Verifikacija je
  `npx tsc --noEmit` + `npm run check` + `npm test`. Nov `DatePickerSheet`, novi
  bedževi u tab baru, sheet-ovi za preimenovanje i izmenu ideje — nijedan nije
  viđen kako radi.
- **`expo lint` i dalje ne radi** u `apps/mobile` (ceo `src` je ignorisan) —
  provera je isključivo `tsc`.
- **Kontrastni odnosi su izračunati, ne izmereni na ekranu.** Formula je WCAG
  relativna luminanca sa kompozitovanjem alfe preko stvarne pozadine; tačna je za
  sRGB, ali ne uzima u obzir OLED gamu ni „smanji prozirnost" opciju sistema.
- **Promena `primary` sa `#6366F1` na `#4F46E5` menja izgled cele aplikacije.**
  Ton je isti, ali je tamniji; ako se to proceni kao pregruba izmena redizajna,
  vraća se jednom linijom u `theme/tokens.ts` (uz svesno prihvatanje pada AA).

---

# Naučene zamke — ne ponavljaj

Ove nisu „čeka se na uslov" — već rešene greške koje se lako vrate. Zapisane da
sledeći put ne izgubimo sat na dijagnostiku.

## Z1. Inline objekti kao propovi `WebView`-a izazivaju reload petlju

**Simptom.** WebView beskonačno učitava — u logu se `onLoadStart` ponavlja bez
prestanka, na uređaju stoji „Refreshing…", a `postMessage` handshake (npr. auth za
canvas embed) nikad ne stigne do kraja jer se dokument ruši pre nego što klijent
bude napravljen.

**Uzrok.** `react-native-webview` na svaku promenu **reference** propa `source`
(a i drugih objektnih/nizovnih propova) ponovo učitava stranicu. Inline vrednost
kao `source={{ uri: url }}` ili `originWhitelist={['*']}` pravi **nov objekat na
svaki render**. Kad `onLoadStart`/`onLoadEnd` menjaju state (`loading`), dobijaš:
render → nov `source` objekat → reload → `onLoadStart` → render → … petlja se
zatvara.

**Popravka.**
- `source` **uvek** memoizovan: `const source = useMemo(() => ({ uri: url }), [url])`.
- Konstantne nizove/objekte (`originWhitelist={['*']}`) izvuci **van komponente**
  kao modulski `const`.
- `style` i ostale objektne propove memoizuj (`useMemo`) ili izvuci ako su
  konstantni.
- Callback-e (`onMessage`, `onShouldStartLoadWithRequest`) drži u `useCallback`.

**Gde je već popravljeno (ne vraćaj na inline).**
`apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` i
`apps/mobile/src/components/stranica/file-preview.tsx`. Oba imaju komentar iznad
`source` koji objašnjava zašto mora da bude memoizovan.

## Z2. `postMessage` handshake za auth ima trku sa startom mosta — injektuj token

**Simptom.** Canvas embed se učita, ali Convex klijent se nikad ne napravi: token ne
stigne do embed-a iako je kod handshake-a naizgled ispravan (retry na obe strane,
listeneri na `window` i `document`, `authed` potvrda, memoizovan `source`). U dev logu se
ponavlja „→ poslato: auth" bez odgovora. Pet rundi debagovanja handshake-a nije pomoglo.

**Uzrok.** Most `window.ReactNativeWebView` (i embed-ov `message` listener) postoje tek
posle učitavanja/hidracije. Prvi `ready`/`auth` se pošalju PRE nego što je druga strana
spremna, pa se tiho odbace; retry intervali onda zatrpaju log a i dalje se oslanjaju na
tajming koji nije garantovan. Handshake preko mosta na startu je trka koja se ne rešava
pouzdano dodavanjem još retry-ja.

**Popravka.** Ukloni handshake — token ide kroz `injectedJavaScriptBeforeContentLoaded`:
- Native upiše `window.__DEVOTION_AUTH__ = {token, theme}` PRE učitavanja stranice. Prop
  MORA da bude memoizovan i iz **zamrznutog** tokena (ne živog) — promena reference
  reloaduje WebView (vidi Z1); `; true;` na kraju da WKWebView ne loguje upozorenje.
- Gejtuj render WebView-a na zamrznuti token, NIKAD na živi (`useAuthToken()` blesne na
  null tokom refresh-a → unmount → reload → gubi se subscription/pan-zoom).
- Embed čita `window.__DEVOTION_AUTH__` sinhrono na mount-u (SSR-safe `useLayoutEffect`,
  NE lazy `useState` initializer — on daje hydration mismatch) i odmah pravi klijent. Ako
  injekcije nema (običan browser) → jasna poruka, ne spiner.
- Most ostaje samo za nekritično osvežavanje tokena (`{type:"auth"}`) i žive kontrole
  (`theme`/`focus`/`fit`/`zoom`). Tipovi `ready`/`authed` više ne postoje.

**Gde je već popravljeno.**
`apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` (injekcija + zamrznut token, gejt na
`initialToken`) i `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` (sinhroni
bootstrap kroz `useLayoutEffect`). Protokol: `docs/mobile/00-PLAN.md` §5.2.

**Sitnica koja čeka:** docstring `apps/mobile/src/lib/embed-url.ts` još opisuje
ukinuti `ready`/`auth` handshake — ispraviti u prvoj fazi koja dira mobilni kod
(Faza 0 mobilni namerno ne dira).

## Z3. Port 3000 ume da bude otet — sve `/embed/*` rute onda 404-uju

**Simptom.** Svaki kanvas u aplikaciji javlja „Greška 404."; Chrome u emulatoru
na `10.0.2.2:3000` pokazuje 404 stranicu sa tuđim zaglavljem. Kod embeda deluje
(i jeste) ispravan.

**Uzrok.** Drugi projekat (viđeno: `alati`) drži port 3000, a Devotion pri
startu **tiho pobegne na 3001**. Telefon i dalje gleda u 3000
(`EXPO_PUBLIC_WEB_URL`). Tihi drift je jednom koštao celu noć pogrešne
dijagnoze „kanvas je slomljen".

**Provera za 10 sekundi:**

```
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/ideas/proba
```

`200` = Devotion · `404` = uljez na portu · ništa = server ne radi.

**Popravke.**
- Dev skripta je zakucana na `-p 3000` (`apps/web/package.json`) — otimanje
  porta sada obara start glasno umesto tihog bežanja (provereno: exit 1, ništa
  na 3001).
- Uljez se gasi kao **celo stablo** (`taskkill /PID <npm-run-dev> /T /F`) —
  `next dev` master regeneriše ubijeno server-dete (viđeno uživo).
- Ako `npm run dev` javi „port in use" a provera vraća `200` — Devotion VEĆ
  radi, ne diraj ništa.
- NIKAKO ne prebacivati `EXPO_PUBLIC_WEB_URL` na drugi port — traži Metro
  restart sa `--clear` i vraća tihi drift. Detalji: `KANVAS-DIJAGNOZA.md`.

## Z4. `allowedDevOrigins` je OBAVEZAN za pristup sa emulatora

**Simptom.** Kanvas (ili bilo koja stranica) sa emulatora potpuno prazan — bez
čvorova, bez greške na ekranu, bez izuzetka u konzoli. Ista ruta na
`localhost:3000` u desktop browseru radi.

**Uzrok.** Next 16 dev server vraća 403 na `/_next/webpack-hmr` websocket za
origin van allowlist-a; React-ov debug kanal u dev-u ide baš tim socketom, pa
hidracija visi zauvek (stranica ostane na SSR HTML-u). `10.0.2.2` nije
`localhost`, pa emulator uvek pada na ovo.

**Popravka.** `allowedDevOrigins: ["10.0.2.2"]` u `apps/web/next.config.ts`
(već dodato). Fizički telefon preko LAN-a → dodati i LAN IP računara u isti
niz. Važi samo za dev server, produkciju ne dira. Pun bisekcioni trag:
`git show paritet-20260810-0159:docs/mobile/KANVAS-DIJAGNOZA.md`.

## Z5. Nova stranica sleće na (0,0) — placement se mora tražiti, ne pretpostaviti

**Simptom.** Stranica napravljena sa mobilnog kanvasa (i konverzijom misli u stranicu)
pojavljuje se u gornjem levom uglu, po pravilu tačno preko neke već postojeće kartice —
dok ista radnja na webu uredno spusti karticu na slobodno mesto.

**Uzrok.** `insertWorkspacePage` je placement upisivao na `(0,0)` bezuslovno. Web put
(`areasV2.createPage`) je kvar maskirao: on posle inserta ionako prepiše poziciju kroz
`upsertPlacement`, pa se pogrešna početna vrednost nikad nije videla. Ispod je ispadalo
samo kod direktnih pozivalaca koji tog drugog koraka nemaju — `pages.create` sa mobilnog
kanvasa i konverzija misli u stranicu.

**Pravilo.** Svaki novi put ka `insertWorkspacePage` MORA da prođe kroz
`canvasPlacement.getAvailableCanvasPosition` — pozicija se traži od kanvasa, ne
pretpostavlja. Ako neki pozivalac poziciju bira sam, to mora biti eksplicitna namera
(npr. drop na tačnu koordinatu), a ne difolt koji je neko zaboravio da prepiše.
