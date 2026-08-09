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

## Z3. Nova stranica sleće na (0,0) — placement se mora tražiti, ne pretpostaviti

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
