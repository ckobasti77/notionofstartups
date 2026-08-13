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

**Cena koju tentap naplaćuje — REŠENO (lanac 6, P2, 13.08.2026).** Tekst ispod je
istorijat; sve tri tačke su zatvorene. Šta ih je zamenilo:

| Bila | Sada | Dokaz |
|---|---|---|
| 1. blok koda nije isporučen | `NoteCodeBlockBridge` u šemi; dugme „Blok koda" u traci i u sheet-u | `apps/mobile/src/lib/note-editor-bridges.ts` (`NoteCodeBlockBridge`), `note-toolbar.tsx` („Blok koda"), `note-insert-sheet.tsx` |
| 2. beleška sa tabelom/prilogom/blokom koda je read-only | **uređuje se**; `unsupportedNoteBlocks()` obrisan, zamenio ga je čuvar koji MERI gubitak | `apps/mobile/src/lib/note-content.ts` (`noteBlockSignature`, `noteSignatureLoss`), `note-editor.tsx` (`checkLoss`) |
| 3. nema ubacivanja slika i priloga u telo | sheet „Dodaj u belešku": galerija, kamera, dokument, tabela 3×3, uvoz CSV/XLSX, blok koda | `apps/mobile/src/components/stranica/note-insert-sheet.tsx`, `note-editor.tsx` (`uploadAndInsert`) |

**Kako.** Sopstveni web bundle: `apps/mobile/editor-web/` (vite, `lib`+`iife`, bez
`vite-plugin-singlefile`) → generisan `src/lib/note-editor-html.ts` → `customSource` u
`useEditorBridge`. Lista bridge-ova je **jedna** (`src/lib/note-editor-bridges.ts`) i
troše je i native i bundle — da se ne raziđu, jer `useTenTap` odbacuje svaki bridge koga
nema u `window.bridgeExtensionConfigMap`. Detalji o zavisnostima i build-u:
`docs/mobile/lanac6/NATIVE-BUILD.md`.

**Merni gejt iz ovog odeljka OSTAJE OTVOREN — i postaje važniji, ne manje važan.**
Bundle je posle P2 veći (~680 KB umesto ~600 KB tentap-ovog), a u aplikaciji su sada
oba (tentap svoj statički uvozi u `RichText.tsx:9`; to se ne patchuje). Merenje na
jeftinom Androidu je zato tek sada merodavno.

Istorijat (šta je bilo pre P2): unapred izgrađen tentap web bundle
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

### 5.1 Beleška sa prilogom, tabelom ili blokom koda je na telefonu READ-ONLY — **REŠENO (lanac 6, P2, 13.08.)**

> **REŠENO.** Mobilna Tiptap šema je sada ista kao web: `TableKit`, `CodeBlock`,
> `HorizontalRule`, `noteFile` + `Gapcursor`/`TrailingNode`.
>
> | Šta | Gde |
> |---|---|
> | Zajednička lista bridge-ova (native + bundle) | `apps/mobile/src/lib/note-editor-bridges.ts` |
> | Izvor web bundle-a | `apps/mobile/editor-web/` (`index.ts`, `template.html`, `vite.config.ts`, `inline.mjs`) |
> | Generisan bundle (commituje se) | `apps/mobile/src/lib/note-editor-html.ts` |
> | `customSource` + otključan `bodyEditable` | `apps/mobile/src/components/stranica/note-editor.tsx` |
> | Alatke tabele i blok koda u traci | `apps/mobile/src/components/stranica/note-toolbar.tsx` |
> | Ubacivanje (slika/kamera/prilog/tabela/CSV/blok koda) | `apps/mobile/src/components/stranica/note-insert-sheet.tsx` |
> | Dokaz da se ništa ne gubi | `apps/mobile/src/lib/note-content.roundtrip.test.ts` (16 testova) |
>
> **Zabranu je zamenio čuvar.** `unsupportedNoteBlocks()` je obrisan; umesto liste
> „nepodržanog" sada se MERI stvaran gubitak (`noteBlockSignature` /
> `noteSignatureLoss`) pri prvom čitanju tela iz WebView-a. Ako je bilo kog bloka
> manje, autosave se gasi istim mehanizmom kao konflikt i beleška pada na verno
> čitanje — telo se ne kvari čak i ako bundle jednog dana zaostane za webom.
> Čuvar ne zna šta je „nepodržano", pa preživi i sledeću promenu šeme na webu.
>
> **USLOV iz §2 (merenje na uređaju) i dalje stoji** i sada je relevantniji —
> bundle je porastao. Tekst ispod je istorijat.

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

### 5.2 Arhiviranje / brisanje stranice ne postoji na mobilnom — REŠENO (A5, 10.08.)

> **REŠENO:** `page-actions-sheet.tsx` (`archiveOrRequest`: vlasnik →
> `areasV2.archivePage`, ostali → `collaboration.requestDeletion`); dokazi u
> PARITET A5. Tekst ispod je istorijat.

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

### 5.3 Admin ekran (startupi, logo, članovi) ne postoji na mobilnom — REŠENO (A2, 10.08.)

> **REŠENO:** ekran `admin-startup.tsx` + `create-startup-sheet` +
> `add-member-sheet` + akcije u `clanovi.tsx`; dokazi u PARITET A2. Tekst ispod
> je istorijat.

**Stanje.** Web `admin-dialog.tsx` pokriva `startups.create`, `update`,
`generateLogoUploadUrl`, `setLogo`, `removeLogo`, `addMember`, `removeMember`,
`profiles.listAll`. Mobilni `clanovi.tsx` je izričito read-only; pozivnice rade.

**Zašto nije popravljeno.** To je pun ekran sa sedam mutacija, ne popravka — a
sve su radnje retke i nepovratne (uklanjanje člana, promena logotipa tima). Tok
upload-a slike mobilni **već ima** (`profil.tsx`, `expo-image-picker`), pa je
tehnički put poznat; nedostaje samo ekran.

**USLOV.** Zaseban korak, ne repovi noćnog lanca. Redosled po vrednosti:
kreiranje startupa → izmena naziva/opisa → logo → dodavanje/uklanjanje člana.

### 5.4 Ideja se ne može pretvoriti u stranicu (`ideas.convertToPage`) — REŠENO (Faza 5, 11.08.)

> **REŠENO:** `idea-convert-sheet.tsx` (vrsta + oblast, navigacija na rezultat),
> ulaz kroz `idea-actions-sheet.tsx`; dokazi u PARITET A4. Tekst ispod je
> istorijat.

**Stanje.** Na mobilnom se ideja sada može napraviti, pročitati, izmeniti,
obrisati, prokomentarisati i za nju glasati — ali ne i **pretvoriti** u zadatak
ili belešku. Web to radi kroz dijalog sa izborom oblasti (`ideas-view.tsx`).

**Zašto nije popravljeno.** Traži izbor oblasti + izbor `kind`-a + prelazak na
novonastalu stranicu, i to je poslednji korak životnog ciklusa ideje — zaslužuje
sopstveni tok, ne dugme naguranо u postojeći sheet. Ostalo je van dometa ove
provere.

**Posledica koju treba znati.** Ideja se na telefonu doteruje do kraja, ali se
„zaključava" na laptopu.

### 5.5 Misli: veze, hijerarhija, duplikat, „pošalji u Ideje" — REŠENO (A1, 10.08.)

**Rešeno na grani `paritet-20260810-0252`:** svih 18 funkcija iz PARITET A1 sada
ima stvarno mesto poziva na mobilnom — native lista `/misli` (radi bez WebView-a),
detalj `/misao/[id]` (napajan `getConnectedGroup`), `thought-actions-sheet`
(poveži/ugnjezdi/izdvoji/glavna/dupliraj/veličina/arhiviraj), `thought-edge-sheet`
(naziv + prekid veze), `thought-conversion-sheet` (misao → ideja; ulazi sa detalja,
liste i multi-selekcije na kanvasu) i traka „Poništi" (od Faze 5 generička:
`components/undo-bar.tsx` + `lib/undo.ts`; stari `thought-undo-bar` /
`lib/thought-undo.ts` su obrisani). Dokazi po funkciji: PARITET.md A1.

**Šta je svesno drugačije od weba:**

- **Vraćanje ide kroz in-memory traku „Poništi" (8s + ✕), ne kroz ekran arhive** —
  backend NEMA upit za arhivirane misli (`listNodes` tvrdo filtrira
  `archivedAt: null`), a backend se u ovom koraku nije dirao. Web radi isto
  (`workspace-history.tsx`). Ekran „Arhiva misli" traži novu backend query
  (indeks već postoji) — zapisati kao zaseban posao ako zatreba.
- **`moveNodes`/`saveViewport` su izloženi kao „Sredi raspored"** (mreža u
  pozitivnom kvadrantu, samo top-level, ≤50) — drag raspoređivanje ostaje
  desktop posao (`02-EKRANI.md` §13). Već otvoren kanvas ne „skače": sačuvani
  viewport važi od sledećeg otvaranja (web bootstrap ga čita jednom).
- **`convertToPages` NIJE izložen** — backend ga namerno onemogućava
  („Misli se prvo šalju u Ideje.", `thoughts.ts:1454`).

### 5.6 Breadcrumb na ekranu stranice (`pages.getBreadcrumbs`) — REŠENO (Faza UX)

**Rešeno u Fazi UX (E12):** `components/breadcrumbs-eyebrow.tsx` — putanja
„Oblast › Roditelj › …" u eyebrow-u zaglavlja i stranice i zadatka, sa lokalnim
ErrorBoundary-jem (arhiviran roditeljski lanac ne obara detalj, svede se na ime
oblasti). Segmenti nisu dodirljivi (orijentacija, ne navigacija).

**Prvobitno stanje.** Web pokazuje pun put oblast → roditelj → stranica. Mobilni
je imao samo `router.back()` i sekciju „Podstranice".

### 5.7 Potpisani doprinosi na stranici i na oblasti — **REŠENO (lanac 6, P5, 13.08.)**

> **REŠENO.** Obe preostale rupe su zatvorene; `ContributionThread` sada ima sve
> četiri mete i sve četiri su MONTIRANE:
>
> - **`area`** — nov član unije (`contribution-thread.tsx:54`), potrošač je
>   `components/prostor/area-contributions-section.tsx`, montiran u Nivou 2 taba
>   „Prostor" (`app/(app)/(tabs)/prostor.tsx:255`). Nivo 2 je uz to dobio traku
>   „Poništi" (`:288`), pa `restoreOwnContribution` sada radi i za oblast.
> - **`task_checkpoint`** — grana više nije mrtva: potrošač je
>   `components/zadatak/checkpoint-contributions-sheet.tsx`, ulaz je ikonica u redu
>   koraka (`task-checkpoint-list.tsx:376`), sheet montiran na `:441`.
>
> Metodološka pouka ispod ostaje na snazi — za funkcije sa `target` unijom paritet
> se meri po VRSTI mete, ne po imenu funkcije.

**Istorijat (stanje posle Faze 5).** `ContributionThread` na mobilnom prima
`{ kind: 'idea' }`, `{ kind: 'task_checkpoint' }` i `{ kind: 'page' }`; `page`
je REŠEN u A5 (`page-contributions-section.tsx`, montiran na beleški i zadatku).
Ostaju dve rupe:

1. **`area` član unije ne postoji** — web ima `area-signed-contributions.tsx`
   (`target: {kind:"area"}`), mobilni ekran oblasti nema ništa. Posledica: A6-ov
   `restoreOwnContribution` NIJE na punom paritetu — obrisan tekst na OBLASTI se
   sa telefona ne može ni obrisati ni vratiti (parity-check Faze 5, nalaz P2).
2. **Nit po checkpointu se ne montira** — union član `task_checkpoint` postoji,
   ali ga nijedan ekran ne koristi (web: `CheckpointContributionDialog` u
   `task-checkpoint-list.tsx`). Mrtva grana tipa (nalaz P1).

**Zašto nije popravljeno.** Isto kao pre: posao je mali, ali traži odluku o
mestu na već gustim ekranima (četvrta sekcija na oblasti; dijalog po redu
checkpointa). Faza 5 je namerno ostavila van opsega (plan §4).

**Metodološka pouka (upisati u glavu svakog merenja pariteta).** Ove dve rupe
grep po imenu funkcije NE vidi: `addContribution`/`restoreOwnContribution` se na
mobilnom zovu, ali samo za neke `target.kind` vrednosti. Za funkcije sa `target`
unijom paritet se meri **po vrsti mete**, ne po imenu funkcije.

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
- ~~**`ScreenHeader` eyebrow (prebacivanje startupa) je ~32pt visine.**~~
  **DELOM REŠENO (lanac 6, P5).** Meta je sada 44pt kroz `hitSlop`
  (`ui/screen-header.tsx:96`: `top: 20` umesto `8`, uz `minHeight: 20` reda →
  20 + 20 + 4). Slop ide samo NAGORE — iznad eyebrow-a je samo padding ispod
  statusne trake, dok bi nadole prekrio red naslova i mogao da otme tap sa dugmeta
  „Nazad". **Vizuelna visina zaglavlja nije menjana** i taj deo nalaza (zaglavlje
  je i dalje nisko) ostaje otvoren kao odluka redizajna. Popravka je zatražena zbog
  C11 — putanja je od P5 dodirljiva na oba ekrana detalja, pa je meta morala da
  poštuje pravilo od 44pt.
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

### 5.13 Nalazi rn-review / parity-check Faze 5 (11.08.) koji NISU popravljeni

Popravljeno u Fazi 5 na osnovu revizije: Android tastatura na `ideja/[id].tsx`
(prešao na bezuslovni `behavior="padding"` + headerHeight offset, obrazac iz
`zadatak/[id].tsx`), `saveEdit` re-entrancy guard, „Otvori ideju" red u
`idea-edge-sheet.tsx`, netačan podnaslov o boji. Ostalo, sa razlozima:

- **`page-contributions-section.tsx` lokalni `KeyboardAvoidingView` je na
  Androidu no-op** (`behavior` `undefined` van iOS-a). Na `stranica/[id]` (bez
  spoljašnjeg KAV-a) kompozer „Dodaj tekst" na Androidu rizikuje da ostane pod
  tastaturom. NIJE dirnut jer se ista komponenta montira i u `zadatak/[id]`,
  koji IMA spoljašnji bezuslovni `padding` KAV — bezuslovni lokalni bi tamo
  duplirao kompenzaciju. Ispravka traži proveru na emulatoru na OBA ekrana
  (verovatno: skinuti lokalni KAV i dodati spoljašnji na `stranica/[id]`).
- **Boja ideje se sa telefona ne može izabrati ni promeniti** (kreiranje ne
  šalje `color`, izmena prosleđuje postojeću; embed kanvas je read-only pa ni
  tamo ne može). Web ima piker; mobilni obrazac već postoji za misli
  (`ColorRow` u `thought-node-sheet.tsx`). Mali posao, van opsega Faze 5 (nije
  PARITET stavka — `ideas.create`/`update` SE zovu, samo bez boje).
- **`Button size="sm"` renderuje 14px tekst** — sistemski (SIZES.sm u
  `ui/button.tsx`), koristi se širom aplikacije; menjanje je odluka dizajna,
  ne popravka jednog ekrana.
- **`chainAll` u `task-checkpoint-list.tsx` nema busy bravu** — zatečeno
  (Faza 5 je u tom fajlu dirala samo `remove()`); dupli tap šalje dve
  idempotentne mutacije, šteta ograničena.
- **A5 dokazna linija u PARITET.md pomerena** izmenama Faze 5:
  `PageContributionsSection` mount je sada `stranica/[id].tsx:148` (bilo `:144`)
  — ispravljeno u PARITET.md u ovom commit-u.

---

## 6. Dva zatečena lint upozorenja u backendu — **REŠENO (K6, 12.08.)**

> **REŠENO.** Uslov ispod je ispunjen: faza K6 je dobila backend u opseg **isključivo za
> brisanje mrtvog koda**, i to je jedino što je urađeno.
>
> - `packages/backend/convex/areasV2.ts:9` — obrisan uvoz `findAvailableCanvasPosition`
>   (identifikator se u fajlu pojavljivao **tačno jednom**, u samom uvozu).
>   `getAvailableCanvasPosition` je DRUGA, korišćena funkcija i nije dirana.
> - `packages/backend/convex/chat.ts:1037` — `const { profile } = await requireStartupMember(...)`
>   → `await requireStartupMember(...)`. **Obrisano je samo destrukturisanje**; poziv je
>   provera pristupa, ne mrtav kod — bez njega bi `chat.searchMessages` postao javan.
>   Provera: broj pogodaka `requireStartupMember` u `chat.ts` je pre i posle **11**.
>
> Ishod: `npm run lint` → **0 grešaka, 0 upozorenja**; `PARITET.md` sekcija B je
> čekirana. Tekst ispod je istorijat.

**Stanje.** `npm run lint` prolazi (exit 0) ali javlja 2 upozorenja
`no-unused-vars`, oba u `packages/backend/convex/`: `areasV2.ts:9`
(`findAvailableCanvasPosition` uvezen a nekorišćen) i `chat.ts:1037`
(`profile` destrukturisan a nekorišćen). Provereno kroz `git log -L`: oba su
zatečena iz ranijih commit-a (`93cd258` monorepo refaktor, `58c9f23` chat
testovi) — nijedna faza noćnog lanca pariteta ih nije unela.

**Zašto nije popravljeno.** Pravilo faza pariteta je „Backend NE menjaj — nula
izmena u `packages/backend/convex/**`". Popravka je trivijalna (obrisati uvoz /
destrukturisanje) ali bi prekršila jače pravilo.

**USLOV.** Prva faza/zadatak kojem je backend u opsegu briše ta dva mrtva
identifikatora; tek tada PARITET sekcija B sme da čekira „nula upozorenja".

---

## 7. Broj registrovanih uređaja za push (`expoPushTokens.myDeviceCount`) nije izložen na mobilnom

**Kontekst.** `packages/backend/convex/expoPushTokens.ts:119` izvozi
`myDeviceCount` (broj Expo push tokena registrovanih za trenutni profil,
komentar: „za ekran podešavanja") — `apps/mobile/src` ga nigde ne poziva.
Web ima analogni ALI ODVOJENI `pushSubscriptions.myDeviceCount` (web push
pretplate, drugi mehanizam — već IZUZETAK u PARITET.md Z tabeli), prikazan u
`notifications-panel.tsx:341`.

**Zašto mobilni to nema.** Funkcija postoji i spremna je; dodavanje broja
uređaja na ekran podešavanja obaveštenja je NOVA funkcionalnost (nov red u
UI-ju), van opsega Faze 5 (nije bila u planu) i Faze 6 (nula nove
funkcionalnosti).

**USLOV za zatvaranje.** Sledeći put kad se ekran podešavanja obaveštenja
menja: dodati red „Registrovano na N uređaja" pozivom
`useQuery(api.expoPushTokens.myDeviceCount, {})`, po uzoru na web red iz
`notifications-panel.tsx:341`.

**Nalaz:** `parity-check` agent, plan Faze 6 (2026-08-11).

---

## 8. Faza K4: native ljuska kanvasa nikad nije povezana — **REŠENO (K6, 12.08.)**

> **REŠENO.** Izmene 11 i 12 iz `docs/mobile/lanac4/planovi/faza-k4.md` su sprovedene u
> celini, u fazi K6. Šta je konkretno ušlo:
>
> | Plan | Gde je sada | Šta radi |
> |---|---|---|
> | Izmena 11, `expandedTaskId` | `canvas/[kind]/[id].tsx:333` (`useEffect`) + `:737` (`onLoadEnd`) | Poruka `{type:'checkpoints', taskPageId}` se šalje na svaku promenu i ponovo posle učitavanja; `onToggleCheckpoints` + `checkpointsExpanded` prosleđeni `PageNodeSheet`-u (`:874`, `:879`), pa se red „Prikaži korake (N)" konačno renderuje |
> | Izmena 11, `node:actions` / rail | `:461` (grananje po `node.nodeKind`) i `:645`–`:652` (`selectedCheckpoint`, labela „Akcije koraka") | `checkpointTarget` se puni, `CheckpointNodeSheet` je montiran (`:886`) |
> | Izmena 11, `node:open` | `:441` | Tap na oblačić van režima vodi na `/zadatak/<taskPageId>`, ne na `/stranica/<checkpointId>` |
> | Izmena 11, `connected` | `:480` (grananje po `msg.edgeKind`) | Checkpoint veza dobija `checkpointEdgeConnect` — „Poništi" više ne bi zvao `areasV2.disconnectPages` sa tuđim id-jem |
> | Izmena 11, `startConnect` / `applyNodeSize` | `:285` / `:371` | Izvor veze je `checkpoint.nodeId` (prefiksiran id ČVORA, ne `_id`); veličina se osvežava u sve tri lokalne kopije |
> | Izmena 12 | `zadatak/[id].tsx:182` (`openCanvas` `:138`) | Ikonica „Canvas zadatka" u zaglavlju detalja zadatka — jedini ulaz u kanvas na kom su koraci vidljivi bez poruke `checkpoints` |
>
> Dokazi po funkciji: `PARITET.md` A8 i sekcija K4 (obe čekirane u istom commit-u).
> Tekst ispod je istorijat i **pouka koju ne treba zaboraviti**: nijedan gejt ovo nije
> video, jer se kod kompajlirao i lint je bio čist. `useMutation` u fajlu **nije dokaz**
> da korisnik do te radnje može da dođe.

**Stanje (istorijat).** Commit `ef87e84` („Faza K4 — Checkpointi zadataka na kanvasu") isporučio
je ceo embed deo (`canvas-embed.tsx`: checkpoint čvorovi, ivice, potez, veza, poruka
`checkpoints`), sve nove native delove (`checkpoint-node-sheet.tsx`,
`node-edges-section.tsx`, `node-size-section.tsx`, `canvas-endpoints.ts`,
`lib/undo.ts` + `undo-bar.tsx`) i „Prikaži korake (N)" red u `page-node-sheet.tsx:188`
— ali **Izmena 11 iz `docs/mobile/lanac4/planovi/faza-k4.md:441` nikad nije ušla u
`apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx`**. U taj fajl je stiglo samo ono
što je K4 diff dodao na vrh: uvoz `CheckpointNodeSheet` (`:29`), state
`checkpointTarget` (`:145`), state `expandedTaskId` (`:149`) i nova dvoargumentna
`movedLabel` (`:83`). Nijedno se dalje ne koristi.

Posledica po fazama: K5 je zatekao **`npx tsc --noEmit` u `apps/mobile` u crvenom** —
`movedLabel(msg.count ?? msg.before.length)` (jedan argument) protiv potpisa sa dva.
To je jedina rupa koju je TS mogao da vidi (`onMessage` poruku parsira u labav
inline tip, pa nepročitana polja ne prijavljuje) i **popravljena je** 2026-08-12:
grana `moved` sada čita `msg.checkpoints` i prosleđuje ih u istu `pushUndo` stavku
(`[id].tsx:464–490`) — što je i bio zahtev plana (`faza-k4.md:452`).

**Šta i dalje NEDOSTAJE** (nijedan gejt ovo ne vidi — kompajlira se i prolazi):

| Plan | Šta fali u `[id].tsx` | Posledica |
|---|---|---|
| Izmena 11, `expandedTaskId` | Poruka `{type:'checkpoints', taskPageId}` se **nikad ne šalje**; `onToggleCheckpoints` se ne prosleđuje `PageNodeSheet`-u (`:786`) | Red „Prikaži korake (N)" se ne renderuje (`page-node-sheet.tsx:170` traži taj prop) → koraci se na kanvasu oblasti/stranice **ne mogu prikazati** |
| Izmena 11, `node:actions`/`selection` | Ne grana se po `node.nodeKind`; `checkpointTarget` se nikad ne puni, `CheckpointNodeSheet` se nikad ne montira | Sheet „Akcije koraka" je mrtav kod; oblačić bi otvorio `PageNodeSheet` sa checkpoint detaljem |
| Izmena 11, `node:open` | Checkpoint detalj se šalje u `openPage()` (`:405–408`) | `router.push('/stranica/<taskCheckpoints id>')` umesto `/zadatak/<taskPageId>` |
| Izmena 11, `connected` | `msg.edgeKind` se ignoriše (`:415`) | Checkpoint veza bi dobila `pushUndo({kind:'pageEdgeConnect'})` → „Poništi" zove `areasV2.disconnectPages` sa `taskCheckpointCanvasEdges` id-jem → serverska greška |
| Izmena 11, rail i `applyNodeSize` | Labela je uvek „Akcije kartice" (`:580`); `applyNodeSize` ne dira `checkpointTarget` (`:345–356`) | — |
| Izmena 12 | `zadatak/[id].tsx` nema dugme „Canvas zadatka" | Kanvas zadatka (jedini na kom su koraci vidljivi bez poruke `checkpoints`) **nije dostupan sa telefona** |

**Zašto to danas ne pravi kvar korisniku.** Sve tri latentne greške iz tabele traže
checkpoint čvor na platnu. Bez poruke `checkpoints` oblačići se crtaju samo na kanvasu
SAMOG zadatka (`canvas-embed.tsx:1418`, `ownTaskPageId`), a jedina ruta ka `kind:'page'`
kanvasu ide iz `stranica/[id].tsx:68` — zadatak se na mobilnom otvara kao `/zadatak/[id]`,
koji ulaz u kanvas nema. Dakle: **cela K4 funkcionalnost je na telefonu nedostupna**, ne
pokvarena.

**USLOV za zatvaranje.** Sprovesti Izmene 11 i 12 iz `docs/mobile/lanac4/planovi/faza-k4.md`
u celini (uz `onLoadEnd` ponovno slanje `checkpoints`, pored postojećeg `mode` na
`[id].tsx:654`) i T14 iz iste tabele dokaza.
Do tada `PARITET.md` A8 ne sme da bude čekiran.

**Nalaz:** provera gejtova posle plana Faze K5 (2026-08-12).

---

## 9. Faza K5 nije urađena — Ideje i Misli nemaju režim „Uredi raspored" — **REŠENO (lanac 5, 12.08.)**

**Rešeno.** Ideje i misli imaju pun režim „Uredi raspored": povlačenje
(`ideas.updatePositions` / `thoughts.moveNodes`), veličina ugaonim ručkama i
presetima (`updateLayout`/`resetLayoutSize`, `updateNodeLayout`/`resetNodeLayoutSize`),
veze tapom izvor→cilj (`ideas.connect`/`disconnect`, `thoughts.createEdge`/`archiveEdges`)
i zapamćena kamera (`saveViewport`). Svaki upis ima „Poništi" (`lib/undo.ts`: `ideaMove`,
`ideaResize`, `ideaEdgeConnect`, `thoughtMove`, `thoughtResize`, `thoughtEdgeConnect`).

- `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` — `IdeasCanvasView` i
  `ThoughtsCanvasView` (handleri `handleMoveNodes` / `handleResizeNode` /
  `handleConnectNodes` / `handleUserViewport`).
- `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` — `supportsEdit = true`.
- `apps/mobile/src/components/canvas/idea-node-sheet-actions.tsx` i
  `thought-node-sheet-actions.tsx` — sheet-ovi „Akcije ideje" / „Akcije misli".
- Zamka apsolutno↔relativno: `apps/web/lib/canvas-nesting.ts` + `canvas-nesting.test.ts`.
- Protokol: `lanac4/REZIM.md` §3a.

**Ostaje da čovek proveri prstom** (agent nema uređaj): `docs/mobile/lanac5/BRIEF.md`.

Original nalaza, za istoriju:

**Stanje.** Commit `6668cb4` nosi poruku „Faza K5 — Ideje i Misli u istom režimu", ali
K5 **nije ni započet**: to je popravka repa K4 (`movedLabel` sa dva argumenta). Dokaz
je u samom kodu:

- `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx:312–314` doslovno kaže da
  `IdeasFlow`/`ThoughtsFlow` dobijaju `editMode`/`connectSourceId` **bez handlera**, pa je
  režim tamo inertan (pravilo 7 iz `lanac4/REZIM.md` — „K5 dodaje samo handler").
- `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx:272` — `supportsEdit = isPageKind`,
  dakle prekidač režima se na kanvasu ideja i misli **ni ne prikazuje**.

**Zašto brojač pariteta to ne vidi.** `thoughts.moveNodes`, `updateNodeLayout`,
`resetNodeLayoutSize`, `saveViewport`, `ideas.updatePositions`, `updateLayout`,
`resetLayoutSize` — sve se **već zovu** sa mobilnog, ali sa LISTI („Sredi raspored",
„Veličina oblačića": `misli.tsx:82`, `ideje.tsx:131`, `thought-actions-sheet.tsx:101`,
`idea-actions-sheet.tsx:111`). Grep po imenu funkcije ih broji kao pokrivene. Razlika
pariteta je 7 i sa K5 i bez njega — **broj 7 se ne sme čitati kao „sve je urađeno"**.
Ista metodološka zamka kao `target` unija iz §5.7.

**Šta posao stvarno obuhvata** (backend je **ceo već tu**, ništa se ne dodaje):

| Šta | Postojeća funkcija |
|---|---|
| Potez prstom (ideje) | `ideas.updatePositions` |
| Potez prstom (misli) | `thoughts.moveNodes` |
| Veličina | `ideas.updateLayout` / `resetLayoutSize`, `thoughts.updateNodeLayout` / `resetNodeLayoutSize` |
| Veze | `ideas.connect` / `disconnect`, `thoughts.createEdge` / `archiveEdges` |
| Kamera | `ideas.saveViewport`, `thoughts.saveViewport` |

Plus dva nova sheet-a čvora (po uzoru na `page-node-sheet.tsx` / `checkpoint-node-sheet.tsx`,
deljene sekcije `node-edges-section.tsx` i `node-size-section.tsx` već postoje) i novi
članovi `UndoAction` u `apps/mobile/src/lib/undo.ts`.

**ZAMKA koju sledeći agent MORA da zna — apsolutne vs relativne koordinate.**
Ideje i misli podržavaju **ugnježdene čvorove** (`parentId`), a kartice stranica ne. U
`@xyflow/react` čvor sa `parentId` ima poziciju **relativnu na roditelja**, dok backend
(`updatePositions` / `moveNodes`) očekuje **apsolutnu**. Ako se `node.position` iz
`onNodeDragStop` prosledi direktno, ugnježden čvor tiho sleti na pogrešno mesto — i to
se vidi tek sledećem članu tima. Desktop to već rešava (`ideas-canvas-view.tsx`,
`thoughts-canvas-view.tsx`) tako što pre upisa dodaje poziciju roditelja; logika mora da
se izdvoji u zajednički modul, ne da se prepiše po sećanju. Detalji:
`docs/mobile/lanac4/planovi/faza-k5.md:119–127`.

**USLOV za zatvaranje.** ~~Zasebna faza.~~ Ispunjen u lancu 5.

**Nalaz:** faza K6 (2026-08-12). **Rešeno:** lanac 5 (2026-08-12).

---

## 10. Desktop kanvas nikad nije proveren mišem — **REŠENO (lanac 5, 12.08.)**

**Rešeno.** Korisnik se **sam** prijavio u svom Chrome-u (agent lozinku ne unosi ni
kad je dobije — pravilo je kategorično), a agent je preuzeo tu sesiju i mišem prošao
sva tri kanvasa na `localhost:3000` (nalog Jovan Milojević, startup ScanMe):

| | Ideje | Misli | Oblast |
|---|---|---|---|
| prevlačenje + `Ctrl+Z` | ✅ | ✅ | ✅ |
| veličina obodom + `Ctrl+Z` | ✅ | ✅ | ✅ |
| veza + `Ctrl+Z` | ✅ | ✅ | ✅ |
| zum / pan | ✅ | ✅ | ✅ |

Nula regresija; svaka izmena iz provere je odmah poništena. Tabela sa tačnim porukama
i dva zapažanja (veza ide source→target; prevlačenje po platnu je guma-selekcija, ne
pan): `docs/mobile/lanac5/BRIEF.md` §4.

Original nalaza, za istoriju:

### (istorija) Desktop kanvas nikad nije proveren mišem (T9/T17/T18)

**Stanje.** Lanac 4 je u desktop kod dirnuo **tačno jednu stvar**: četiri granice veličine
kartice izvučene su iz `apps/web/components/workspace/canvases/area-flow-node.tsx`
(inline `240/168/720/1_000`) u zajednički modul `apps/web/lib/canvas-node-size.ts`, koji
od tada koriste i desktop kanvas i mobilni embed. Sve ostalo je novo (`app/embed/…`) i
uvoz je jednosmeran — ništa van `app/embed/` ne uvozi embed module.

**Šta NIJE urađeno.** Niko nije otvorio `localhost:3000`, prijavio se i mišem prevukao
karticu na desktop kanvasu. Sve četiri faze lanca su to prenele dalje.

**USLOV — preformulisan u lancu 5.** Nije „nedostaju kredencijali" nego **agent ne sme
da unosi lozinku**, ni kad je dobije. To je kategorično pravilo i ne menja se time što
korisnik izričito traži. Reset lozinke kroz CLI ne pomaže: problem nije nabavka
lozinke nego njeno KUCANJE u polje za prijavu.

**Jedini put koji radi:** korisnik se prijavi sam na `localhost:3000`; agent od tog
trenutka vozi već prijavljenu sesiju i radi sve provere mišem. U lancu 5 je stigla
ponuda za to (dev server je bio živ na 3000, embed je odgovarao `200`), ali prijava u
tom trenutku nije obavljena — pa §10 ostaje otvoren i **prijavljen kao otvoren**.

Original uslova, za istoriju. Put (`ZA-POPRAVKU` Z6 — taj CLI **ne** poziva
`invalidateSessions`, pa živa mobilna sesija preživi):

```
npx convex run adminAuth:resetAdminPassword '{"email":"jovanm028@gmail.com","newPassword":"<nova>"}'
```

Zatim: prijava na `localhost:3000` → isti kanvas → prevuci karticu mišem → `Ctrl+Z` →
promeni veličinu obodom → proveri da se ponaša kao pre lanca. **Nova lozinka se
OBAVEZNO upisuje u izveštaj faze.** Ako `resetAdminPassword` više ne postoji u
`adminAuth.ts` — ne vraćaj ga i ne izmišljaj drugi put, nego zapiši razlog.

**Šta ga zamenjuje do tada** (nije isto, ali nije ni ništa):

1. `apps/web/lib/canvas-node-size.test.ts` (K6) — zakiva sve četiri granice na brojeve
   koje je desktop imao **inline pre lanca** (`git show 019239d:…area-flow-node.tsx:284–287`),
   podrazumevanu veličinu poredi sa pravim serverskim izvorom, i uz to čuva mobilnu
   kopiju i presete oblačića od razlaza sa desktopom.
2. Statički dokaz: `git status --short -- apps/web/components/` je **prazan** kroz ceo
   lanac; jedina dva izmenjena backend fajla su brisanja mrtvog koda (§6).
3. Lanac 5 dodaje treći: `canvas-nesting.ts` je **nov** modul koji uvozi isključivo
   `app/embed/`, a jedina izmena u `components/workspace/chat/` je chat (drugi
   proizvod, ne kanvas). Desktop kanvas fajlovi (`ideas-canvas-view.tsx`,
   `thoughts-canvas-view.tsx`, `area-canvas-view.tsx`, `canvases/*`) nisu dirani —
   proverivo sa `git diff --stat` po grani.

**Nalaz:** faza K6 (2026-08-12) — prestaje da se prenosi prećutno.
**Rešeno:** lanac 5 (2026-08-12) — korisnik prijavljen sam, agent vozio njegovu sesiju.

---

# Naučene zamke — ne ponavljaj

Ove nisu „čeka se na uslov" — već rešene greške koje se lako vrate. Zapisane da
sledeći put ne izgubimo sat na dijagnostiku.

## 11. Duplirane konstante chata — **REŠENO (lanac 6, P3, 13.08.)**

Nastavak nalaza A.1 iz `PARITET-REVIZIJA-12-08.md` (`CHAT_PRESENCE_REFRESH_MS` je
bio mrtav export, a oba klijenta su hardkodovala svoju vrednost). Ista bolest je
postojala i za **prozor izmene poruke**:

| Bilo | Sada |
|---|---|
| `apps/mobile/src/components/chat/message-actions-sheet.tsx:11` — `const EDIT_WINDOW_MS = 15 * 60 * 1_000` | uvozi `CHAT_EDIT_WINDOW_MS` iz `@/convex/lib/validators` |
| `apps/web/components/workspace/chat/message-row.tsx:23` — ista kopija | uvozi istu konstantu |
| server `chat.editMessage` — `CHAT_EDIT_WINDOW_MS` | nepromenjeno (uvek je bio izvor) |

Kapija: `grep -rn "15 \* 60" apps/` više nema nijedan pogodak.

**Zašto je `lib/validators.ts` bezbedan za oba klijenta:** uvozi samo
`convex/values`, bez `_generated` i bez Node API-ja — isti razlog zbog kog
`message-composer.tsx` već uvozi `@/convex/lib/page_files`.

**Nova konstanta iz iste faze:** `MAX_CHAT_CHANNEL_MEMBERS` (`validators.ts`) —
uvoze je **oba** klijenta (`new-conversation-sheet.tsx`, `channel-members-sheet.tsx`)
i sam backend. Ako se ikad ponovo doda konstanta koju ne uvozi niko, to je isti
nalaz A.1 u novom ruhu.

---

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

## Z6. Ručni reset lozinke člana (ako dugme „Promeni lozinku" pukne)

Admin postavlja novu lozinku članu kroz `adminAuth.adminSetPassword` (web:
„Lozinke" tab u `admin-dialog.tsx`; mobilni: ekran `/lozinke`, ulaz „Lozinke" u
tabu „Više"). Ako taj put ikad otkaže, evo kako se ista stvar radi ručno — i
zašto se lozinka nigde ne vidi kao tekst.

**Preporučeno (CLI — odradi heširanje umesto tebe).**

    npx convex run adminAuth:resetAdminPassword '{"email":"<član-email>","newPassword":"<nova-lozinka>"}'

Pokreće se iz KORENA repoa (root `convex.json` cilja `packages/backend/convex`).
`resetAdminPassword` je `internalAction` (nije u javnom API-ju, ne može sa
klijenta) i — uprkos imenu — radi za BILO KOJI nalog, ne samo adminov: prima
email i novu lozinku, provuče ih kroz `validatePasswordRequirements` i pozove
`modifyAccountCredentials`. Ovaj Scrypt-uje novu lozinku i upiše je u
`authAccounts.secret`; `profiles`/`users` ne dira.

> Ako je taj deo `adminAuth.ts` u međuvremenu obrisan (komentar `resetAdminPassword`
> kaže „obrisati posle upotrebe"), vrati jednolinijski `internalAction` koji zove
> `modifyAccountCredentials(ctx, { provider: "password", account: { id:
> normalizeEmail(email), secret: newPassword } })`. Ništa više nije potrebno.

**Zašto NE editovati `authAccounts.secret` ručno u Convex dashboard-u.**

`secret` je Scrypt heš (jednosmeran), a ne čist tekst. Zato:

1. **Ne vidiš ničiju lozinku tamo.** Polje nikad ne pokazuje lozinku kao tekst —
   samo heš. To je i poenta: lozinke se čuvaju tako da ih ni admin ni baza ne
   znaju.
2. **Ne možeš da zalepiš čist tekst.** Prijava poredi `Scrypt(uneto)` sa
   sačuvanim hešom; ako u `secret` upišeš plaintext, poređenje nikad ne prolazi
   → niko se ne prijavi. Zato ide `modifyAccountCredentials`, koji odradi heš.

Nalog za člana se u tabeli `authAccounts` nalazi po `provider = "password"` i
`providerAccountId = <normalizovan email člana>` (index `providerAndAccountId`).
Email u `profiles.email` je već normalizovan (trim + lowercase) i jednak je
`providerAccountId`.

**Ručno izbacivanje sesija (ono što dugme radi automatski).**

`adminSetPassword` posle promene poziva `invalidateSessions(ctx, { userId })` —
sve žive sesije mete van, da samo neko ko zna NOVU lozinku može da uđe.
`modifyAccountCredentials` (i CLI put gore) to NE radi sam. Ručno u dashboard-u:
obriši sve redove u `authSessions` po indeksu `userId` za `userId =
profiles.userId` tog člana, pa i pripadajuće `authRefreshTokens` (po `sessionId`).
Bez toga stara sesija (na staroj lozinci) ostaje živa do isteka.

---

## Z7. Native sheet iznad WebView-a proguta `touchend` — kapija poteza ostane zaključana

> **ZATVORENO u fazi K3 (12.08.).** Mehanizam i dopunski nalaz su na kraju odeljka.

**Otkriveno u fazi K2 (12.08.), na emulatoru.** Simptom je zvučao kao fantomski
upis: kartica na ekranu 288 × 196, a posle ponovnog ulaska u kanvas — 259 × 176.
Podatak u bazi je sve vreme bio ispravan; **prikaz** je bio zamrznut.

**Uzrok.** Embed drži kapiju „živi upit ne gazi prst" (`draggingRef` u
`canvas-embed.tsx`, pravilo 4 iz `lanac4/REZIM.md`): dok gest traje, dolazni snimak
iz `useQuery` se parkira u `pendingRef` umesto da se primeni. Kapija se diže u
`onNodeDragStart` / `onResizeStart`, a spušta u `onNodeDragStop` / `onResizeEnd`.

Dva mesta gde se „spuštanje" ne desi:

1. **xyflow zove `onResizeEnd` samo ako je potez stvarno promenio dimenziju**
   (`resizeDetected` u `@xyflow/system` `XYResizer`, grana `'end'`). Dodir ručke bez
   pomeranja podigne kapiju i nikad je ne spusti.
2. **Dugi pritisak na ručku otvori native sheet.** Android od tog trenutka prestane
   da isporučuje dodir WebView-u, pa `touchend` (a ni `touchcancel`) ne stigne do
   stranice. `d3-drag` ostaje naoružan, a naša kapija zaključana.

Posledica je najgora moguća vrsta tihe greške: kanvas i dalje radi, ali **više ne
prikazuje ničije izmene** — ni tuđe ni sopstvene — do sledećeg završenog gesta ili
reload-a.

**Kako je rešeno (tri sloja, svi u `canvas-embed.tsx`):**

1. `onResizeStart` naoruža stražara na `window` za `mouseup` / `touchend` /
   `touchcancel` — iste događaje koje koristi `d3-drag`, pa naš listener uvek ide
   POSLE njegovog. **Ne `pointerup`**: on na dodir stiže PRE `touchend`-a i pregazio
   bi novu veličinu starim snimkom.
2. `contextmenu` (tj. tačka na kojoj otvaramo native sheet) gest zatvara odmah i
   deterministički — to je jedini trenutak u kom pouzdano znamo da native sloj
   preuzima dodir.
3. Vremenski ventil `GESTURE_STALE_MS = 8000`: ako snimak stigne dok je kapija
   podignuta duže od 8 s, kapija se otključava sama. Mreža za slučajeve koje ne
   znamo; 8 s je znatno više od svakog stvarnog poteza prstom.

**Šta je K2 pogrešno proglasio nepopravljivim.** K2 je napisao da se sam `d3-drag` gest
„ne ume otkazati iz JS-a", pa dodir koji je počeo na ručki a završio se „u vazduhu"
može biti nastavljen sledećim dodirom po platnu. Sintetički događaj i nije bio potreban:
`d3-drag` za dodir sluša **na samom DOM čvoru ručke**, a ručka postoji samo dok je
`resizeApi.enabled === true`.

**Kako je zatvoreno (K3, sve u `canvas-embed.tsx`):**

4. `handleNodeContextMenu` pored `disarmResizeWatchdog()` + `releaseGesture()` obara i
   `enabled` (`setSuspendedKey(gateKey)`, `:781`). Četiri `NodeResizeControl` čvora se
   **odmontiraju**, d3 listeneri odu sa njima i gest umre zajedno sa čvorom. Vraćaju se
   na prvi `touchstart` koji ponovo stigne do stranice (znak da je native sheet
   zatvoren), a promena režima ili ulazak u biranje ih vraća odmah (izvedeno stanje
   `suspendedKey === gateKey`, `:476–478`).

**Dopunski nalaz K3 — zašto stražar iz K2 za dodir NIKAD nije radio.** `d3-zoom`
(`touchstarted`) i `d3-drag` (`touchended`) zovu `nopropagation(event)`, tj.
`stopImmediatePropagation()`, na elementu na kom slušaju. Zato listener na `window` u
**bubble** fazi nikad ne dobije taj događaj: `touchend` sa ručke ne stigne do stražara,
a `touchstart` sa platna ne stigne do „vrati ručke". Prvo je značilo da je gate posle
dodira-bez-pomeraja otključavao **samo** `GESTURE_STALE_MS` (8 s); drugo je izmereno na
emulatoru — posle jednog dugog pritiska ni jedna ručka se više nije crtala do reload-a.
Popravka: oba listenera su prebačena u **capture** fazu (`{capture:true}`, `:496`, `:654`).
Kod stražara je posao uz to odložen na sledeći task (`setTimeout(0)`, `:648`), jer
capture ide PRE `onResizeEnd` — bez odlaganja bi `releaseGesture()` pregazio novu
veličinu starim snimkom, što je tačno ono čega se K2 bojao kad je izabrao bubble fazu.

**Pravilo za sledeće faze:** svaka kapija koja se diže na početku gesta mora da ima i
put da se spusti bez događaja koji možda nikad neće stići. Događaj koji „uvek dolazi" u
browseru ne dolazi uvek u WebView-u ispod native slojeva — a nad `@xyflow/react`
platnom **ne dolazi ni u bubble fazi**, jer ga d3 preseče. Listener koji mora da vidi
dodir nad kanvasom ide u capture fazu; ako mu je potreban redosled posle xyflow-a,
odloži posao, ne fazu.

## Z8. Emulatoru pukne DNS — aplikacija zauvek stoji na „Pripremam radni prostor"

**Simptom.** Aplikacija se otvori i ostane na spineru „Pripremam radni prostor". Nema
greške na ekranu, nema izuzetka. U `adb logcat` se ponavlja:

```
WebSocket closed with code 1006: Unable to resolve host
"deafening-otter-504.eu-west-1.convex.cloud": No address associated with hostname
Attempting reconnect in 1223ms
```

**Uzrok.** Emulator ima IP konekciju ali nema razrešavanje IMENA (viđeno na Windows
hostu posle promene mreže / VPN-a). Provera koja to razdvaja za 10 sekundi:

```
adb shell ping -c 2 8.8.8.8      → 0% packet loss        (IP radi)
adb shell ping -c 2 google.com   → ping: unknown host    (DNS ne radi)
```

**Popravka.** Restart emulatora sa eksplicitnim DNS serverom — `-dns-server` se zadaje
**pri pokretanju**, ne može posle:

```
adb emu kill
"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Pixel_9 -dns-server 8.8.8.8 -no-snapshot-save
```

**Sesija u aplikaciji preživi restart** (token je u `expo-secure-store`, na disku AVD-a),
pa se ne traži prijava — što je bitno jer lozinka naloga nije poznata (§10, Z6).

**Ne dijagnostikuj ovo kao „Convex je pao" ni kao „auth je pukao".** Web klijent na
hostu radi normalno u istom trenutku, pa se lako promaši.

## Z9. `adb reverse` mapiranja nestaju sa restartom emulatora — kanvas onda `ERR_CONNECTION_REFUSED`

**Simptom.** Svaki kanvas javlja „Canvas se ne može učitati — `net::ERR_CONNECTION_REFUSED`",
a `curl http://localhost:3000/embed/canvas/ideas/proba` sa HOSTA vraća `200`.

**Uzrok.** `apps/mobile/.env.local` drži `EXPO_PUBLIC_WEB_URL=http://localhost:3000`.
Na emulatoru `localhost` je **sam emulator**, ne host — to radi isključivo zato što
postoji `adb reverse` tunel. Tunel je vezan za konkretnu ADB sesiju uređaja i **nestaje
sa svakim restartom emulatora**. `adb reverse --list` tada vraća prazno.

**Popravka (obavezan korak posle svakog restarta emulatora):**

```
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
```

**NE menjaj `EXPO_PUBLIC_WEB_URL` na `10.0.2.2`** da bi „rešio" ovo — promena `.env.local`
traži Metro restart sa `--clear` i vraća tihi drift opisan u Z3. Tunel je jeftiniji i
radi i za fizički telefon preko USB-a.

**Kombinuje se sa Z3, pa proveravaj oba:** `200` sa hosta znači samo da server radi;
da li ga TELEFON vidi je zasebno pitanje.

## Z10. `isExpo()` u tentap izvoru: build editora povuče `react-native`, a da nije pukao — ugasio bi traku alata

**Otkriveno u fazi P2 (lanac 6), pri prvom `npm run editor:build`.**

**Simptom.** Vite build web bundle-a editora pada sa `[PARSE_ERROR] Flow is not supported`
nad `node_modules/react-native/index.js`. Nijedan fajl u grafu ne uvozi `react-native` kao
vrednost — svi pogoci su `import type`.

**Uzrok.** `@10play/tentap-editor/src/utils/misc.ts`:

```js
export const isExpo = () => {
  let isRunningOnExpo = false;
  try { if (require('expo-constants')) isRunningOnExpo = true } catch { isRunningOnExpo = false }
  return isRunningOnExpo;
};
```

Rollup (koji tentap koristi u SVOM buildu) `require` u ESM fajlu ostavlja kao nedefinisanu
promenljivu → poziv baci `ReferenceError` → `catch` ga proguta → `isExpo()` je `false`.
**Rolldown (Vite 8) taj `require()` razrešava** i povuče `expo-constants` → `expo-modules-core`
→ `react-native` → Flow.

**Zašto je pad bio sreća.** `isExpo()` odlučuje da li su `focusListener` i
`contentHeightListener` **pravi ili prazni shim-ovi** (`webEditorUtils/focusListener.tsx:26`,
`contentHeight.tsx:36`). Da je rolldown uspeo da razreši paket, `isExpo()` bi vratio `true`,
`focusListener.isFocused` bi bio zauvek `false`, a traka alata beleške se prikazuje baš po
tom polju (`note-toolbar.tsx`, uslov `state.isFocused`) — **traka ne bi postojala, bez
ijedne greške u logu**.

**Popravka.** `apps/mobile/editor-web/expo-constants-absent.cjs` (`module.exports = undefined`)
+ alias u `editor-web/vite.config.ts` i `apps/mobile/vitest.config.ts`. Rolldown CJS modul
umotava u **lenju** funkciju, pa se poziv desi tačno na mestu `require`-a i vrati falsy
vrednost. Provereno u izlazu: `qp=o(((e,t)=>{t.exports=void 0})), Jp=()=>{let e=!1;try{qp()&&(e=!0)}catch{e=!1}return e}`
i `Xp=Jp()?{isFocused:!1}:new Yp` — grana `new Yp` (pravi `FocusListener`) je ta koja se
izvršava. Uz to: `grep -c react-native` nad bundle-om vraća **0**.

**Pravilo.** Kad se paket gradi iz TUĐEG izvora drugim bundlerom nego što ga autor gradi,
`try { require(...) } catch` obrasci menjaju ishod umesto da samo menjaju put. Traži ih pre
nego što objasniš pad — i proveri šta bi bilo da nije pao.

---

## Z11. Punjenje forme iz živog Convex upita: `setState` u efektu je LINT GREŠKA na webu

**Otkriveno u fazi P3 (lanac 6),** pri pisanju dijaloga „Članovi kanala".

**Simptom.** `npm run lint` pada sa
`react-hooks/set-state-in-effect` („Calling setState synchronously within an effect
can trigger cascading renders"). `tsc` je čist, mobilni tsc je čist — pukne tek
korenski lint, i to samo za `apps/web` (`apps/mobile` nijedan linter ne pokriva,
§5.12).

**Uzrok obrasca.** Refleks je: „dijalog se otvori → prepiši lokalno stanje iz upita",
pa se piše `useEffect(() => { if (open) setSelected(new Set(current…)) }, [open, current])`
plus `hydrated` ref da živi upit ne pregazi kvadratić pod kursorom. Dva mehanizma
(efekat + ref) za jednu stvar, i oba padnu na lintu.

**Rešenje bez efekta** — jedno stanje, jedan izraz:

```tsx
// `null` = korisnik još nije dirao formu → prikaži živo stanje sa servera.
const [draft, setDraft] = useState<Set<Id<"profiles">> | null>(null);
const initial = useMemo(() => new Set(current?.map(...) ?? []), [current]);
const selected = draft ?? initial;

// Zatvaranje vraća na `null`; sledeće otvaranje opet kreće od servera.
function change(next: boolean) { if (!next) setDraft(null); onOpenChange(next); }
```

Prvi dodir „zamrzava" izbor, a do tada je prikaz **reaktivan** — što je bolje od
zamrzavanja na otvaranju: tuđa izmena se vidi dok korisnik gleda, a ne posle.

**Gde je primenjeno:** `apps/web/components/workspace/chat/channel-members-dialog.tsx`
i, radi doslednosti, `apps/mobile/src/components/chat/channel-members-sheet.tsx`
(mobilni lint to ne bi ni prijavio — utoliko pre treba isti obrazac).

---

## Z12. Posle selidbe grane u drugu oblast dokument u ruci je USTAJAO

**Simptom.** Stranica se premesti u drugu oblast POD određenu stranicu; naizgled
sve prođe, `parentPageId` je tačan — a kartica se pojavi na kanvasu **stare**
oblasti, ili placement dobije `areaId` oblasti iz koje je stranica upravo otišla.
Nijedna greška se ne prijavi.

**Uzrok.** `movePageAcrossAreasWithSidecars`
(`packages/backend/convex/areasV2.ts:3343`) radi `ctx.db.patch("pages", …)` nad
celom granom — menja `areaId` i `parentPageId`. Dokument koji je pozivalac držao u
promenljivoj se time NE osvežava. Svaki sledeći korak koji čita `page.areaId`
onda radi nad starom oblašću. Konkretno, `moveWithinArea` (`:1090`) prosleđuje
`child.areaId` u `assertCanvasCapacity` i u `getAvailableCanvasPosition`, a
`upsertPlacement` (`:353`) upisuje `args.page.areaId` doslovno.

**Pravilo.** Posle svakog helpera koji patchuje dokument, **pročitaj ga ponovo**
pre nego što ga proslediš dalje:

```ts
await movePageAcrossAreasWithSidecars(ctx, { page, targetAreaId, … });
const moved = await ctx.db.get("pages", page._id);   // ← bez ovoga: tiha greška
if (moved === null) throw new Error("Stranica nije pronađena posle premeštanja.");
return await moveWithinArea(ctx, { child: moved, targetParent, … });
```

Primenjeno u `areasV2.ts:3732-3771` (kompozicija za C10, lanac 6 P5).

**Zašto tsc i lint ovo ne vide.** Tip je isti `Doc<"pages">` pre i posle patch-a —
razlikuje se samo SADRŽAJ. Jedina kapija je test koji tvrdi gde je kartica
zaista sletela: `areasV2.test.ts`, „premeštanje u drugu oblast pod svoju stranicu
sleti tačno tamo" proverava `areaId` **i** `parentPageId` **i** placement
(`areaId` + `rootPageId`) — treća tvrdnja je jedina koja hvata baš ovu grešku.

**Šire.** Isto važi za `applySameAreaReparent`, `archivePageWithV2Sidecars` i svaki
drugi helper iz `areasV2.ts` koji piše u `pages`. Convex mutacija je transakcija,
pa je bacanje bezbedno — ali čitanje ustajalog dokumenta nije greška koju
transakcija hvata.
