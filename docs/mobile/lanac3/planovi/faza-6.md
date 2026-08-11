# Faza 6 — plan: Nula grešaka (sekcija B)

> Planiranje samo. Nijedan fajl sa kodom nije menjan u ovom koraku. Cilj faze:
> **`tsc`, `lint`, `build` i testovi prolaze bez ijedne greške i bez ijednog
> upozorenja.** Faza ne dodaje funkcionalnost — svaka stavka dole je ili
> mehanička ispravka (tip/veličina/dodirna meta) ili dopuna dokumentacije.

Struktura: (1) šta je pročitano i zatečeno, sa rezultatima svih automatskih
provera i sva tri sweep-a iz prompta, (2) izmene u redosledu — svaka sa
fajlom/linijom, razlogom, prst-na-ekranu ekvivalencijom, rizikom i dokazom,
(3) tabela fajlova, (4) šta se NEĆE raditi i zašto, (5) redosled provere na
kraju, uključujući tačan status svake kućice u PARITET.md sekciji B.

**Ne dira se:** `packages/backend/convex/**` (pravilo važi u svakoj fazi, ne
samo u fazama pariteta). `apps/mobile/package.json` — nema novih biblioteka,
`NATIVE-BUILD.md` se ne otvara. Nema novih ruta — typed-routes regeneracija
nije potrebna.

---

## 1. Šta sam pročitao i zatekao

**Dokumenti:** `PARITET.md` (cela, posebno sekcija B i Z), `ZA-POPRAVKU.md`
(cela), `00-PLAN.md`, `IZVESTAJ.md` (lanac 3), plan Faze 5 (`planovi/faza-5.md`,
radi konzistentnog formata), `.claude/agents/{rn-review,web-review,parity-check}.md`,
`eslint.config.mjs`, `vitest.config.ts` (root + `apps/web` + `packages/backend`),
`package.json` (root/web/mobile).

### 1.1 Automatske provere — pokrenute sada, rezultat

| Provera | Komanda | Rezultat |
|---|---|---|
| tsc mobilni | `npx tsc --noEmit -p apps/mobile/tsconfig.json` | **0 grešaka** |
| tsc web | `npx tsc --noEmit -p apps/web/tsconfig.json` | **0 grešaka** |
| tsc backend | `npx tsc --noEmit -p packages/backend/convex/tsconfig.json` | **0 grešaka** (backend NIJE u redomu prompta, ali `npm run lint` ga pokriva pa je typecheck relevantan kontekst) |
| `npm run lint` | eslint (pokriva `apps/web` + `packages/backend/convex`; `apps/mobile/**` je namerno globalno ignorisan — ima svoj `expo lint`) | **0 grešaka, 2 upozorenja** — oba `no-unused-vars` u `packages/backend/convex/` (`areasV2.ts:9`, `chat.ts:1037`). **Već dokumentovano u `ZA-POPRAVKU.md §6`, zatečeno, backend van opsega.** Ne diram. |
| `npm run build` | `next build --webpack` | **Prolazi.** Kompajlira, typecheck unutar builda čist, sve rute generisane. |
| `npm test` | `vitest run` (projects: `apps/web`, `packages/backend`) | **37 fajlova, 321 test — svi prolaze.** Tri identična upozorenja iz Vite-a o `vitest.config.ts` (ESM `import` sintaksa u CJS-loaded fajlu, `configLoader: 'native'`) — kozmetički tooling nalaz, obrazloženje zašto se ne dira u §4. |

`apps/mobile` nema `npm test` (nema test fajlova) i `expo lint` je pokvaren
(ceo `src` ignorisan — memorija, potvrđeno `ZA-POPRAVKU §5.12`). Mobilni gejt
je isključivo `tsc`, tačno kako redom prompta i traži (korak 1 je `tsc`, ne
`lint`).

### 1.2 Sweep — console.log / TODO / return null / prazne funkcije

Tražio po `apps/mobile/src` i `apps/web`, tačno kako prompt traži (backend
namerno isključen — van opsega diranja).

- **`console.log`** — 2 pogotka, oba u `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx:158,193`, **oba unutar `if (__DEV__)`** (proverio okolne linije). Namerni dev-only dijagnostički log, ne ostatak debagovanja — ne diram. Web pogodak (`note-embed.tsx:64`) je string literal unutar HTML uzorka za probu editora, ne stvaran poziv — lažno pozitivan.
- **`TODO`/`FIXME`** — 1 pogodak: `apps/mobile/src/app/(app)/(tabs)/vise.tsx:199-202`, vezan za `__DEV__`-gated ulaz u merni prototip editora. **Već zapisano u `ZA-POPRAVKU.md §2`** (ceo odeljak o mernom gejtu). Ne treba nov zapis. 0 pogodaka na webu.
- **`return null`** — pretražio oba stabla (`*.tsx`), pregledao SVAKI pogodak:
  - `apps/mobile/src/components/animated-icon.web.tsx:9` — `.web.tsx` platform-specifična varijanta, namerno no-op (splash animacija nema smisla na web preview cilju). Legitimno.
  - `thought-actions-sheet.tsx` (4×), `idea-actions-sheet.tsx` (3×) — `return null` unutar `runAction(...)` callback-a. **Već ustanovljena konvencija** (Faza 5 revizija): znači "uspeh, bez Alert poruke". Nije placeholder.
  - `_layout.tsx:35` (`NotificationTargetNavigator`) — headless komponenta, samo kači hook, namerno bez UI-ja.
  - `deadline-badge.tsx:51`, `conversation-row.tsx:102` (mobilni) i `channel-list.tsx:214`, `mention-textarea.tsx:26/31`, `area-canvas-view.tsx:747`, `thought-sidebar-drag.tsx:84` (web) — svi su uslovni guard na kraju funkcije/komponente ("nema šta da se prikaže" / "nije pronađeno"). Legitimno, uporedio mobilni `conversation-row.tsx` sa web `channel-list.tsx` — **identična logika, nezavisno implementirana, dobra potvrda pariteta**.
  - `circular-text-flow.tsx:301` (`catch { return null; }`) — pogledao kontekst (270-315): brani `Intl.Segmenter`-baziran proračun kružnog teksta na canvasu, dekorativna funkcija, već iza dva guard-a (`typeof window`, `"Segmenter" in Intl`). Vraćanje `null` degradira u "ne crtaj efekat", ne gubi korisnički podatak. Legitimna odbrana, ne "tiha greška koja boli".
  - Nijedan pogodak nije nedovršena komponenta koja čeka kod.
- **Prazne/tihe catch grane** (`catch\s*(\([^)]*\))?\s*\{\s*\}`) — 1 pogodak: `apps/web/app/layout.tsx:9`, unutar inline `<script>` stringa za sprečavanje bljeska teme (`try { localStorage.getItem(...) } catch (_) {}`). Standardni, namerni SSR-safe obrazac — `theme` je već postavljen na `preferred` PRE `try`-ja, pa tih catch znači "koristi already-computed fallback". Legitimno, ne diram.
- **`eslint-disable`** (samo web, backend/mobile van opsega) — 12 pogodaka, svi uski (`react-hooks/set-state-in-effect` na canvas view-ovima koji sinhronizuju XYFlow state; `@next/next/no-img-element` na 5 mesta za dinamičke/blob slike). Svi zatečeni, opravdani, jednolinijski — nijedan ne skriva nov problem iz ove faze.

### 1.3 Agenti — `rn-review` (×3), `web-review`, `parity-check`

Pokrenuo sve na CELOM stablu (ne samo izmenjeni ekrani — ovo je završni sweep,
ne inkrementalna provera), podeljeno po opsegu radi kvaliteta nalaza. Stvarni
nalazi idu u odeljak 2 dole; sve što je "čisto" NIJE ponovo navedeno.

- `rn-review` #1 (tab i vrh-nivo ekrani): 4 nalaza (KAV na Androidu, FAB padding, ugnježđeno glasanje).
- `rn-review` #2 (detalj ekrani): 4 nalaza (accessibilityLabel na spinneru, busy brava, 2× tekst < 16px).
- `rn-review` #3 (deljene komponente/sheet-ovi, ~89 fajlova): 4 nalaza (legacy theme na 2 ekrana, nedostaje KAV, hitSlop, tekst < 16px).
- `web-review` (embed rute + layout + chat): 4 nalaza (hardkodovane boje, nedostaje spinner, nedostaje aria-live, theme-color duplikat).
- `parity-check` (audit PARITET.md posle Faze 5, NE nova diskusija): **30/30 citata tačno**, **razlika pariteta i dalje tačno 17** (bez drifta), Z tabela koherentna OSIM što 8 funkcija (7× `areasV2` kanvas-layout + `activity.listForStartup`) nema SVOJ red — obrazloženje postoji rasuto po drugim redovima/ZA-POPRAVKU, ali ne kao eksplicitan Z red. Uzgred pronašao sitan propust: `expoPushTokens.myDeviceCount` (backend, spreman) nema pozivaoca na mobilnom.

### 1.4 Već urađeno — ne diram, izbačeno iz plana

- Cela sekcija E (E1-E13) u PARITET.md — zatvorena, van opsega ove faze.
- `admin-startup.tsx:291-297` — KeyboardAvoidingView već ispravan (bezuslovan `behavior="padding"` + komentar o Expo SDK 57 edge-to-edge bugu). **Ovo je referentni obrazac** za 2.1 dole, ne nalaz.
- PARITET.md A1-A8 citati — potvrđeno tačni (parity-check), ne diram.
- `expo lint` je i dalje pokvaren — poznato, ne pokušavam popravku (posebna, veća istraga; van redoma prompta koji za mobilni traži samo `tsc`).

---

## 2. Izmene, u redosledu

Format po stavci: **Fajl:linija** → Šta/zašto → Prst na ekranu → Rizik/fallback → Dokaz.

### Mobilni

#### 2.1 KeyboardAvoidingView no-op na Androidu — `profil.tsx`, `prijava.tsx`

**Fajlovi:** `apps/mobile/src/app/(app)/profil.tsx:193`,
`apps/mobile/src/app/(auth)/prijava.tsx:96`.

**Šta/zašto.** Oba imaju `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
— na Androidu je `undefined` = bez efekta. Ostatak koda (`admin-startup.tsx:296`,
`pretraga.tsx:164`, `zadatak/[id].tsx:186`, `ui/sheet.tsx:216`) koristi
bezuslovni `'padding'` na OBE platforme zbog dokumentovanog Expo SDK 57
edge-to-edge bug-a koji lomi Android `adjustResize`. Ova dva ekrana su
promašila tu ispravku.

**Izmena.** `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` →
`behavior="padding"`, po uzoru na `admin-startup.tsx:291-297` (isti komentar
o razlogu, kratko preneti). Ne dirati `keyboardVerticalOffset` osim ako se na
ekranu pokaže da polje i dalje ostaje ispod trake.

**Prst na ekranu.** Android: otvori „Uredi profil" / ekran prijave, dodirni
polje pri dnu forme (ime tima / lozinka) — tastatura više ne prekriva polje.

**Rizik/fallback.** Nizak — jednolinijska izmena, ista kao već proverena na 4
druga ekrana. Ako se pojavi razmak ispod polja na iOS-u, dodati
`keyboardVerticalOffset` po uzoru na `admin-startup.tsx:297`.

**Dokaz.** `tsc` nula grešaka (nema tipske promene). Emulator/uređaj: fokusiraj
poslednje polje na oba ekrana na Androidu, tastatura ne prekriva ga.

#### 2.2 FAB prekriva poslednji zadatak — `zadaci.tsx`

**Fajl:** `apps/mobile/src/app/(app)/zadaci.tsx:377` (`paddingBottom: insets.bottom + 96`),
FAB na `:424` (`insets.bottom + 16`).

**Šta/zašto.** Isti par (FAB + lista) je u `danas.tsx` i `prostor.tsx` IZMEREN
na uređaju kao nedovoljan na `96` (E11 bug) i ispravljen na `160`. `zadaci.tsx`
ima identičan obrazac ali vrednost nije preneta — poslednji red verovatno
upada pod dugme.

**Izmena.** `insets.bottom + 96` → `insets.bottom + 160` (ista vrednost kao
`danas.tsx`/`prostor.tsx`).

**Prst na ekranu.** Skroluj listu „Svi zadaci" do dna — poslednja kartica cela
vidljiva, ne ispod plavog FAB dugmeta.

**Rizik/fallback.** Nijedan — kopija već izmerene, radne vrednosti sa
identičnog obrasca u istoj kodnoj bazi.

**Dokaz.** Emulator: lista od 5+ zadataka, skrol do dna, poslednja kartica ~20dp
iznad FAB-a (isti dokazni oblik kao `dokazi-ux/e11-posle-p2.png`).

#### 2.3 Dodirna meta < 44pt bez hitSlop — `note-editor.tsx`

**Fajl:** `apps/mobile/src/components/stranica/note-editor.tsx:643-655`
(`SaveIndicator`, retryable `Pressable`), stil `styles.state` na `:679-685`
(`minHeight: 32`, bez `hitSlop`).

**Šta/zašto.** „Pokušaj ponovo" dugme kad snimanje padne ima vizuelnu visinu
32pt i nijedan `hitSlop`. Isti oblik problema (32pt vizuelno, 44pt dodirno)
već je rešen u `puls.tsx:203-204` sa `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}`
i komentarom koji to i kaže.

**Izmena.** Dodati identičan `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}`
na `Pressable` na `:643` (props lista oko `:649-652`). Vizuelna veličina se ne
menja.

**Prst na ekranu.** Kad snimanje beleške padne (offline test), dodirni tekst
„Pokušaj ponovo" — meta je sad efektivno 48pt, lakše se pogađa jednom rukom.

**Rizik/fallback.** Nula — čisto dodavanje `hitSlop`, ne menja layout niti stil.

**Dokaz.** Emulator: simuliraj grešku snimanja (isključi mrežu, izmeni belešku),
dodirni ivicu teksta „Pokušaj ponovo" van vizuelnih 32pt — akcija i dalje
okine.

#### 2.4 Tekst pune rečenice ispod 16px — `note-editor.tsx`, `ideja/[id].tsx`

**Fajlovi:**
- `apps/mobile/src/components/stranica/note-editor.tsx` — `styles.noticeText`
  (`:699-703`, koristi se `:497`) i `styles.conflictText` (`:715-718`, koristi
  se `:552`). Oba `fontSize: 14, lineHeight: 20`.
- `apps/mobile/src/app/(app)/ideja/[id].tsx:254-256` — objašnjenje ispod
  naslova „Diskusija", koristi `styles.meta` (13px).

**Šta/zašto.** Sve tri su pune objašnjavajuće rečenice („Sadržaj i naslov
menja samo autor…", „Tvoj nacrt je ostao netaknut…", „Tekst članova ide na
odobrenje autoru ideje…"), ne meta/caption — pravilo „tekst min 16px osim
meta" važi. `theme/tokens.ts:230` definiše `text.body = { fontSize: 16,
lineHeight: 22, fontWeight: '400' }` — tačno ono što ovde treba.

**Izmena.**
- `note-editor.tsx`: uvezi `text` iz `@/theme/tokens` (ako već nije uvezeno —
  proveriti postojeći `import { fontWeight, radius } from '@/theme/tokens'` i
  dodati `text` u istu liniju). Zameni `fontSize: 14, lineHeight: 20,` sa
  `...text.body,` na oba mesta (`noticeText`, `conflictText`).
- `ideja/[id].tsx:254`: `style={[styles.meta, { color: colors.mutedForeground }]}`
  → `style={[styles.meta, text.body, { color: colors.mutedForeground }]}`
  (spread POSLE `styles.meta` da pregazi fontSize/lineHeight; uvezi `text` iz
  `@/theme/tokens` ako nedostaje).

**Prst na ekranu.** Otvori belešku sa aktivnim zaključavanjem/konfliktom i
detalj ideje — objašnjavajući tekst je čitljiviji, bez uvećane pristupačnosti
sistema.

**Rizik/fallback.** Nizak — samo tipografija, `lineHeight` ostaje proporcionalan
(22 za 16px je ista otprilike 1.375 razmera kao 20 za 14px). Ako tekst
prelomi red i naruši raspored notice/conflict kartice, smanjiti `lineHeight`
na 21 pre nego vraćati fontSize.

**Dokaz.** Emulator: izazovi „Neko iz tima je izmenio ovu belešku" (konflikt)
i otvori detalj ideje — oba teksta vizuelno veća, i dalje unutar kartice bez
prelivanja.

#### 2.5 Nedostaje accessibilityLabel na spinneru — `razgovor/[id].tsx`

**Fajl:** `apps/mobile/src/app/(app)/razgovor/[id].tsx:100` (`ActivityIndicator`
u stanju učitavanja).

**Šta/zašto.** Isti spinner na ekranu kanvasa (`canvas/[kind]/[id].tsx:338`) ima
`accessibilityLabel="Učitavanje kanvasa"` — ovaj nema ništa, čitač ekrana ćuti
dok se razgovor učitava.

**Izmena.** Dodati `accessibilityLabel="Učitavanje razgovora"` na
`ActivityIndicator` na `:100`.

**Prst na ekranu.** Nema vizuelne razlike — VoiceOver/TalkBack sad najavljuje
stanje učitavanja umesto tišine.

**Rizik/fallback.** Nula.

**Dokaz.** Uključi TalkBack, otvori razgovor sa sporom mrežom — najava
„Učitavanje razgovora" se čuje.

#### 2.6 Legacy theme sistem na cold-start/access-error ekranima — `full-screen-loader.tsx`, `access-problem.tsx`

**Fajlovi:** `apps/mobile/src/components/full-screen-loader.tsx` (ceo, 33 linije),
`apps/mobile/src/components/auth/access-problem.tsx` (ceo, 89 linija).

**Šta/zašto — NAJVAŽNIJI nalaz ove faze.** Oba uvoze `ThemedText`/`ThemedView`
(`components/themed-text.tsx`/`themed-view.tsx`) i `useTheme()` iz
`hooks/use-theme.ts` + `constants/theme.ts` — čist Expo-template ostatak
(`#000`/`#fff`), NE `useThemeColors()`/`theme/tokens.ts` koji koristi svaki
drugi ekran u aplikaciji (redizajn iz memorije „mobile-redesign-tokens" —
near-black dark-first paleta). `FullScreenLoader` je, po sopstvenom komentaru
u kodu, **„jedini tekst koji korisnik vidi na svakom hladnom startu"** —
znači ovo se vidi na SVAKOM pokretanju aplikacije, i na svakom ekranu greške
pristupa, sa pogrešnom pozadinom/bojom teksta u odnosu na ostatak near-black
redizajna.

**Izmena — `full-screen-loader.tsx`:**
- Ukloni: `ThemedText`, `ThemedView`, `Spacing` (iz `@/constants/theme`),
  `useTheme` (iz `@/hooks/use-theme`).
- Dodaj: `useThemeColors` iz `@/theme/theme-provider`; `Text`, `View` iz
  `react-native` (uz postojeće `ActivityIndicator`, `StyleSheet`); `text` iz
  `@/theme/tokens` (za `...text.body` na labeli — komentar o 16px već postoji
  u kodu, samo mu treba stvaran token umesto ThemedText default-a).
- `const theme = useTheme()` → `const colors = useThemeColors()`.
- `<ThemedView style={styles.container}>` → `<View style={[styles.container, { backgroundColor: colors.background }]}>`.
- `<ActivityIndicator size="large" color={theme.text} />` → `color={colors.foreground}`.
- `<ThemedText themeColor="textSecondary" style={styles.label}>` → `<Text style={[styles.label, { color: colors.mutedForeground }]}>`, dodati `...text.body` u `styles.label`.
- `styles.container`-ov `gap: Spacing.three` → literal `gap: 12` (vizuelno
  manje bitno; ako `theme/tokens.ts` ima svoju spacing skalu, koristiti nju
  umesto literala — proveriti pre pisanja).

**Izmena — `access-problem.tsx`:** ista zamena uvoza. Mapiranje površina po
POSTOJEĆIM konvencijama iz ostatka aplikacije (ne izmišljati nove tonove):
- vanjski `ThemedView` → `View` sa `colors.background`.
- `<ThemedView type="backgroundElement" style={styles.card}>` → `View` sa
  `colors.card` pozadinom + `colors.border` (`borderWidth: StyleSheet.hairlineWidth`)
  — isti par kao kartice svuda drugde (npr. `ideje.tsx` red).
  `<ThemedText type="subtitle">` → `Text` + `...text.title` (`theme/tokens.ts:228`).
- `<ThemedText themeColor="textSecondary">` (poruka) → `Text` + `...text.body`
  + `colors.mutedForeground`.
- Dugme „Odjavi se": `backgroundColor: theme.backgroundSelected` →
  `colors.primary` (glavna/jedina akcija na ekranu — isti tretman kao
  `note-editor.tsx` `conflictBtn` „Učitaj timsku", `:574`), tekst boja
  `colors.primaryForeground` dodata u `buttonLabel` (već ima ispravnu
  veličinu `fontSize: 16`, samo mu fali boja pošto `ThemedText` nestaje).

**Prst na ekranu.** Zatvori i ponovo otvori aplikaciju (cold start) — spinner
ekran ima istu tamnu pozadinu kao ostatak aplikacije, ne odudara. Uđi u nalog
sa nezavršenim pozivnicom (INVITE_REQUIRED) — ekran greške pristupa isto tako
uklopljen, dugme „Odjavi se" je jasno primarne boje.

**Rizik/fallback.** Srednji — dva fajla se vide na SVAKOM pokretanju, pa
vizuelna regresija je vidljiva odmah, ali i lako uočljiva na prvom testu.
Tačne vrednosti za „card"/"title" tokene potvrditi čitanjem CELOG
`theme/tokens.ts` pre pisanja (ovaj plan navodi PRECEDENT iz drugih fajlova,
ne garantuje da su to jedina ispravna imena). Ako `tsc` padne na nepostojeći
token — proveriti tačan izvezen naziv u `theme/tokens.ts`, ne izmišljati.

**Dokaz.** `tsc` nula grešaka (hvata svaki pogrešan naziv tokena/uvoza,
`grep -rn "ThemedText\|ThemedView\|use-theme" apps/mobile/src/components/full-screen-loader.tsx apps/mobile/src/components/auth/access-problem.tsx` = 0 pogodaka). Emulator: force-quit pa ponovo
otvori aplikaciju — spinner ekran tamn pozadina uklopljena; uđi sa
nezavršenim onboardingom — isto za ekran greške.

#### 2.7 Nedostaje KeyboardAvoidingView na brifingu oblasti — `area-briefing-section.tsx`

**Fajl:** `apps/mobile/src/components/prostor/area-briefing-section.tsx:159-182`
(`TextInput` multiline, bez ikakve zaštite od tastature). Ekran koji je
montira (`apps/mobile/src/app/(app)/(tabs)/prostor.tsx`, mount na `:242`) NEMA
`KeyboardAvoidingView` NIGDE u fajlu (potvrđeno grep — 0 pogodaka).

**Šta/zašto.** Svaki drugi „goli" `TextInput` u kodu je zaštićen ili
`Sheet`-ovim `avoidKeyboard`-om ili eksplicitnim, bezuslovnim `padding` KAV-om
(isti Android edge-to-edge razlog kao 2.1). Ovaj input nema ništa — na
Androidu tastatura verovatno prekriva polje i dugme „Sačuvaj brifing".

**Izmena — dva koraka, prvi je izviđanje.** `AreaBriefingSection` je montiran
DUBOKO ugnježden (kolapsibilna sekcija unutar liste oblasti u `prostor.tsx`).
`note-editor.tsx:504-507` ima UGRAĐENO upozorenje: KAV ugnježden preduboko
meša relativne/apsolutne koordinate i traka završi ISPOD tastature (E10 bag) —
zato tamo koriste `use-keyboard-inset.ts` umesto KAV-a. Isti rizik ovde.

1. Pre pisanja: pročitati `prostor.tsx` oko mounta na `:242` da se utvrdi da
   li je to `ListHeaderComponent`/sekcija na vrhu Level-2 (unutar-oblasti)
   ekrana, ili nešto plići. Ako je taj Level-2 ekran plitak (header + lista),
   preferirani fix je bezuslovni `<KeyboardAvoidingView behavior="padding" style={{flex:1}}>`
   omotan OKO CELOG ekrana (isti obrazac kao `admin-startup.tsx:291-297`) —
   ne lokalno unutar `AreaBriefingSection`.
2. **Fallback ako (1) izazove layout pomeranje liste ispod (FlatList na
   `:526` u `prostor.tsx` ima paginaciju `onEndReached` — proveriti da KAV ne
   remeti to)**: lokalna zaštita PO UZORU na `use-keyboard-inset.ts` (isti
   mehanizam kao `note-editor.tsx` traka alata) — izračunaj tastaturni inset i
   primeni ga kao `paddingBottom`/`marginBottom` na `BriefingBody`-jev
   `TextInput` kontejner, bez novog KAV sloja.

**Prst na ekranu.** Prostor → oblast → razviju „Brifing oblasti" → dodirni
polje za unos na Androidu — tastatura ne prekriva ni polje ni dugme „Sačuvaj
brifing".

**Rizik/fallback.** SREDNJI — ovo je jedina stavka u planu gde tačno mesto
izmene zavisi od strukture koju izvršilac mora sam da potvrdi čitanjem
`prostor.tsx` pre pisanja (zato dva koraka gore). Ako OBA pristupa pokvare
raspored liste, zapisati u `ZA-POPRAVKU.md` kao uslovnu stavku (isti obrazac
kao §5.13) umesto nasilno gurati popravku koja lomi paginaciju.

**Dokaz.** Emulator na Android: razvij brifing bilo koje oblasti, fokusiraj
`TextInput`, potvrdi da polje i dugme ostaju iznad tastature; skroluj listu
stranica ispod brifinga pre i posle izmene — ista paginacija/ponašanje.

#### 2.8 Busy brava nedostaje na izmeni poruke — `message-composer.tsx`

**Fajl:** `apps/mobile/src/components/chat/message-composer.tsx:201-233`
(`submit()`), dugme za slanje/snimanje na `:418-426` (`disabled={uploading}`).

**Šta/zašto.** Grana za NOVU poruku (`:221-232`) sinhrono prazni `draft` PRE
`await send(...)` — to već sprečava dupli tap (dugme nestaje čim `draft`
postane prazan, `canSubmit` pada). Grana za IZMENU poruke (`:209-219`,
`editMessage`) NE prazni ništa dok `await` ne uspe — dupli tap na „Sačuvaj
izmenu" može ispaliti DVA `editMessage` poziva pre nego što prvi završi.

**Izmena.** Dodati `const [submitting, setSubmitting] = useState(false)` uz
postojeće state promenljive u komponenti. Na početku `submit()`:
`if (submitting) return;` (re-entrancy guard, isti obrazac kao `saveEdit`
guard uveden u Fazi 5 za `ideja/[id].tsx`). Omotati editing granu:
`setSubmitting(true)` pre `try`, `setSubmitting(false)` u `finally`. Na dugmetu
`:422`: `disabled={uploading}` → `disabled={uploading || submitting}`.

**Prst na ekranu.** Uredi poruku, dvaput brzo dodirni „Sačuvaj izmenu" —
šalje se samo jedna izmena, drugi tap je no-op dok prva ne završi.

**Rizik/fallback.** Nizak — dodaje state i guard, ne menja postojeću logiku
slanja nove poruke (koja već radi ispravno).

**Dokaz.** Emulator: uredi poruku, dvaput brzo tapni „Sačuvaj izmenu" (ili
simuliraj sporu mrežu i dupli tap) — dashboard pokazuje JEDNU izmenu poruke,
ne dve uzastopne.

#### 2.9 Glasanje za ideju nedostupno čitaču ekrana iz liste — `ideje.tsx`

**Fajl:** `apps/mobile/src/app/(app)/ideje.tsx:313-356` (`IdeaRow`).

**Šta/zašto.** Cela kartica je JEDAN `Pressable` (`accessibilityLabel="Otvori
ideju: …"`, `onPress` otvara detalj, `onLongPress` otvara akcije) koji
UGNJEŽĐUJE `VoteButtons` (`:346-353`, sopstveni interaktivni Pressable-i za/
protiv). RN/iOS čitač ekrana tretira roditelja sa `accessible`+`accessibilityLabel`
kao JEDAN neprozirni element — ugnježdena dugmad za glasanje postaju
nedostupna za direktnu aktivaciju iz liste (za razliku od `puls.tsx`, gde je
ugnježđeni sadržaj samo informativan, ne interaktivan). Faza 5 je već jednom
razmatrala i namerno odložila `accessibilityActions` za OVAJ isti red — ali
za DRUGI problem (dugi pritisak → meni akcija), uz obrazloženje da je akcija
dostupna i sa detalja ideje. Za glasanje TAKO redundantan put ne postoji na
isti način (otvaranje celog detalja samo da bi se glasalo je mnogo veći
korak) — vredi zasebne, aditivne popravke.

**Izmena.** Dodati na postojeći `<Pressable>` (`:314`, POSLE
`accessibilityHint` na `:317`, ne menjajući ništa vizuelno/na dodir):

```tsx
accessibilityActions={[
  { name: 'vote_up', label: 'Glasaj za' },
  { name: 'vote_down', label: 'Glasaj protiv' },
]}
onAccessibilityAction={(event) => {
  if (event.nativeEvent.actionName === 'vote_up') void cast('up');
  else if (event.nativeEvent.actionName === 'vote_down') void cast('down');
}}
```

`cast` je već definisan u istom komponentnom telu (`:~285-306`, ista funkcija
koju `VoteButtons`-ov `onVote` već zove na `:352`). Nema novih uvoza — čisto
aditivno, nula vizuelne/dodirne promene za viđene korisnike.

**Prst na ekranu.** Bez promene za dodir/miš. Za VoiceOver/TalkBack: fokusiraj
red ideje, otvori „Actions" rotor/meni (swipe gore/dole na iOS, dvoprst meni
na Android) — pojavljuju se „Glasaj za"/„Glasaj protiv", aktiviraju glas bez
otvaranja detalja.

**Rizik/fallback.** Nizak (čisto aditivno), ali NE mogu potvrditi ponašanje
bez fizičkog čitača ekrana — ako se u testu pokaže da RN verzija u projektu
(0.86.2) ne podržava `accessibilityActions` na Androidu identično iOS-u,
zapisati razliku u `ZA-POPRAVKU.md` (platform-specific gap), ne izbacivati
celu izmenu (iOS deo i dalje vredi).

**Dokaz.** Uređaj sa uključenim VoiceOver (iOS) i TalkBack (Android): fokusiraj
red ideje na listi, otvori akcije, aktiviraj „Glasaj za" — glas se upiše
(`AccessibilityInfo.announceForAccessibility` već najavljuje uspeh, `:297-299`),
broj glasova na kartici raste, bez navigacije na detalj.

### Web

#### 2.10 Hardkodovane boje u probi editora — `note-embed.tsx`

**Fajl:** `apps/web/app/embed/note/[id]/note-embed.tsx:154` (`Metric`
komponenta, HUD mernog prototipa — `pageId === 'probe'` grana, opisana u
`ZA-POPRAVKU.md §2`).

**Šta/zašto.** `text-green-600`/`text-red-600` su hardkodovane Tailwind boje
umesto tokena. `globals.css:24-25` već definiše `--color-success`/
`--color-destructive` (Tailwind v4 `@theme` konvencija → `text-success`/
`text-destructive` klase automatski postoje, koriste se već drugde npr.
`message-row.tsx`). Dodatno: `green-600` na svetloj temi računa ~3.3:1
kontrast — ispod AA praga za mali tekst. Ovo je dev-only merni alat (dostupan
samo kroz `__DEV__`-gated mobilni ulaz), NISKA vidljivost, ali trivijalna i
bezrizična ispravka.

**Izmena.** `value < budget ? "text-green-600" : "text-red-600"` →
`value < budget ? "text-success" : "text-destructive"`.

**Prst na ekranu.** Nema — ovo je dev alat za merenje (fizički uređaj +
kamera), ne korisnički put. Popravlja se za doslednost i AA kontrast dok alat
postoji (briše se kad se merni gejt zatvori, `ZA-POPRAVKU §2`).

**Rizik/fallback.** Nula — jedan izraz, dve klase, potvrđeno da tokeni
postoje.

**Dokaz.** `npm run build` prolazi (Tailwind klase se razrešavaju), vizuelna
provera u browseru na `/embed/note/probe` (otvoriti direktno na webu) — brojevi
ispod/iznad budžeta i dalje zeleni/crveni, sada iz tokena.

#### 2.11 Nedostaje loading spinner na dugmadima — `new-conversation.tsx`

**Fajl:** `apps/web/components/workspace/chat/new-conversation.tsx` —
„Kreiraj kanal" dugme (`:330-336`, `disabled={busy || !name.trim()}`) i
DM kandidat dugmad (`:172-185`, `disabled={busyId !== null}`).

**Šta/zašto.** Oba onemogućavaju dugme dok je mutacija u letu, ali ne
prikazuju spiner — svaki sličan dijalog u `apps/web/components/workspace/`
menja ikonu/avatar za `<LoaderCircle className="animate-spin" />` dok čeka
(`create-area-dialog.tsx:102-106`, `create-page-dialog.tsx:194`,
`tables/table-import-dialog.tsx:296`). Ovaj par odudara od uspostavljenog
obrasca.

**Izmena.**
- „Kreiraj kanal" dugme: dodati `{busy ? <LoaderCircle className="animate-spin" /> : null}`
  pre teksta „Kreiraj kanal" (isti raspored kao `create-area-dialog.tsx:102-106`).
  Uvesti `LoaderCircle` iz `lucide-react` ako već nije uvezen u ovaj fajl.
- DM kandidat dugme (`:172-185`): zameniti `<ProfileAvatar profile={member.profile} className="size-8" />`
  sa uslovnim `busyId === member.profile._id ? <LoaderCircle className="size-8 shrink-0 animate-spin text-muted-foreground" /> : <ProfileAvatar profile={member.profile} className="size-8" />`
  — spiner SAMO na redu koji je kliknut, ne na svim.

**Prst na ekranu.** N/A (web dugme) — klikni „Kreiraj kanal" ili ime člana za
DM, dugme/red pokazuje vrteću ikonicu dok se kanal pravi, umesto da samo
potamni.

**Rizik/fallback.** Nizak — kozmetička izmena, ne menja `busy`/`busyId` logiku,
samo šta se renderuje dok je `true`.

**Dokaz.** Browser: uspori mrežu (DevTools throttling), klikni „Kreiraj kanal"
— spiner vidljiv ~1s pre uspeha; isto za klik na kandidata za DM.

#### 2.12 Snimanje glasovne poruke se ne najavljuje čitaču ekrana — `message-composer.tsx` (web)

**Fajl:** `apps/web/components/workspace/chat/message-composer.tsx:310-318`
(`VoiceRecorder`, `recording === true` grana).

**Šta/zašto.** Ulazak u režim snimanja je isključivo vizuelan (crvena tačka
koja pulsira, `aria-hidden="true"`, tajmer) — korisnik čitača ekrana koji
pritisne dugme mikrofona ne dobija potvrdu da je snimanje počelo.

**Izmena.** Dodati u `recording === true` granu, kao prvo dete diva na
`:311`: `<span className="sr-only" role="status">Snimanje poruke počelo.</span>`.
Element postoji SAMO dok `recording === true` (grana se ne renderuje kad
`false`) — čitač ekrana najavljuje pri montiranju. NE stavljati `role="status"`
na kontejner koji sadrži tiker `{formatVoiceDuration(elapsed)}` — to bi
najavljivalo svaku sekundu (loše iskustvo), zato je poruka odvojen, statičan
element.

**Prst na ekranu.** N/A (web) — pritisni dugme mikrofona sa uključenim čitačem
ekrana, čuje se „Snimanje poruke počelo." jednom, ne ponavlja se svake
sekunde.

**Rizik/fallback.** Nizak — nov, izolovan element, ne dira postojeći tajmer/
dugmad. Ako se u testu pokaže da se najava ipak ponavlja (neki čitači
najavljuju svaki re-render `role="status"` sadržaja unutar iste grane), ukloniti
`role="status"` i osloniti se na `aria-label` na kontejneru umesto live-region
pristupa.

**Dokaz.** Browser + čitač ekrana (NVDA/VoiceOver): klikni mikrofon — jedna
najava „Snimanje poruke počelo.", tiker koji otkucava sekunde se NE najavljuje
ponovo svake sekunde.

#### 2.13 `themeColor` duplira token vrednosti bez komentara — `layout.tsx`

**Fajl:** `apps/web/app/layout.tsx:33-36` (`viewport.themeColor`).

**Šta/zašto.** Next.js metadata API ne ume da čita CSS custom properties, pa
`#f7f8fb`/`#151821` moraju biti literal hex — ovo NIJE moguće rešiti kroz
tokene (ograničenje frejmvorka, ne propust). Vrednosti duplira `--background`
iz `globals.css` bez komentara — tiho zastari ako se token promeni.

**Izmena.** Dodati jednolinijski komentar iznad `themeColor` niza:
`// Next.js metadata ne čita CSS custom properties — ručno sinhronizovati sa --background u globals.css.`
Bez izmene vrednosti/logike.

**Prst na ekranu.** N/A — nema funkcionalnu promenu, samo sprečava budući tihi
drift.

**Rizik/fallback.** Nula.

**Dokaz.** `npm run build` prolazi (komentar ne utiče na build). Vizuelna
provera nepotrebna — nema promene ponašanja.

### Dokumentacija

#### 2.14 Nepotpuna Z tabela u `PARITET.md`

**Fajl:** `docs/mobile/PARITET.md`, tabela Z (trenutno linije 628-637).

**Šta/zašto.** `parity-check` je potvrdio da je razlika pariteta i dalje
tačno 17, ali 8 od tih funkcija nema SVOJ red u Z tabeli — obrazloženje
postoji rasuto (u prozi drugog reda, ili u `ZA-POPRAVKU §5.8`), ne kao
eksplicitan red kako PARITET.md sam sebe obavezuje („svaka od 63 mora biti
urađena ili zapisana kao IZUZETAK sa razlogom u sekciji Z").

**Izmena.** Dodati redove (potvrđeno da sve funkcije postoje tačno ovako
imenovane u `packages/backend/convex/areasV2.ts`: `getCanvas:1421`,
`getPageCanvasByPage:1861`, `movePages:2339`, `resizePage:2399`,
`resetPageSize:2450`, `saveViewport:2506`, `connectPages:2590`,
`disconnectPages:2721`):

```
| `areasV2.movePages` | Prevlačenje/pozicioniranje stranica na kanvasu oblasti — čisto uređivanje layouta. Mobilni kanvas je pregled (00-PLAN §5.2), embed je read-only. Ista kategorija kao `taskCheckpoints.saveCanvasPlacement`. |
| `areasV2.resizePage` | Isto — promena dimenzija kartice stranice na kanvasu. |
| `areasV2.resetPageSize` | Isto — reset dimenzija na podrazumevane. |
| `areasV2.saveViewport` | Čuva zum/poziciju kanvasa oblasti za sledeće otvaranje — postavlja se isključivo ručnim pomeranjem na desktop kanvasu. |
| `areasV2.connectPages` | Crtanje veza između stranica na kanvasu — vizuelna radnja u koordinatnom prostoru kanvasa. |
| `areasV2.disconnectPages` | Isto, obrnuta radnja. |
| `areasV2.getPageCanvasByPage` | Nije "web-only" u pravom smislu — poziva ga `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx`, DELJENI kod koji mobilni učitava kroz WebView (00-PLAN §5.2). Grep metod ga vidi kao web-only jer broji samo `apps/web/components`+`app`. |
| `activity.listForStartup` | Mobilni koristi `activity.listPaginated` (bez tvrdog limita 50, sa nastavkom) — funkcionalno superiorna zamena, ne rupa. Obrnut paritet, već objašnjeno u ZA-POPRAVKU §5.8. |
```

**PRE pisanja `areasV2.getCanvas` reda** (izostavljen iz gornje liste
namerno): potvrditi grep-om (`grep -rn "areasV2.getCanvas" apps/web`) šta ga
tačno poziva na webu — ako je to šira desktop-samo kanvas pretplata koju
mobilni embed zamenjuje užim `getAreaCanvasByArea`/`getPageCanvasByPage`,
dodati red sa tim obrazloženjem; ako poziva nešto drugo, prilagoditi razlog
stvarnom nalazu umesto kopiranja pretpostavke iz ovog plana.

**Dokaz.** Posle izmene, ponovo izmeriti grep metod iz vrha PARITET.md — broj
web-only funkcija se NE menja (17 i dalje), samo je dokumentacija potpuna;
svih 8(9) redova ima nepraznu, proverljivu vrednost u koloni Razlog.

#### 2.15 Nov zapis u `ZA-POPRAVKU.md` — `expoPushTokens.myDeviceCount`

**Fajl:** `docs/mobile/ZA-POPRAVKU.md`, nova numerisana sekcija (posle
postojeće §6).

**Šta/zašto.** `packages/backend/convex/expoPushTokens.ts:119` izvozi
`myDeviceCount` (komentar u kodu: „za ekran podešavanja"), ali `apps/mobile/src`
ga nigde ne poziva (potvrđeno grep-om na celom repou — jedini pogoci su
backend definicija, web-ov ODVOJENI `pushSubscriptions.myDeviceCount`
poziv u `notifications-panel.tsx:341`, i postojeći PARITET Z red koji govori
o TOM DRUGOM, web-push specifičnom izuzetku). Ovo je genuinski mali propust
(funkcija spremna, neiskorišćena), ali dodavanje UI reda na ekran podešavanja
je NOVA funkcionalnost — van opsega Faze 6 (nula nove funkcionalnosti).

**Izmena.** Dodati sekciju u `ZA-POPRAVKU.md`:

```markdown
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
```

**Dokaz.** Zapis postoji, ne menja kod — dovoljno da `sekcija B` stavka
„Nijedan TODO bez zapisa" ostane tačna i za ovaj naknadno otkriveni propust
(nije TODO u kodu, ali isti duh: nešto nedovršeno, sad zapisano umesto
prećutano).

---

## 3. Fajlovi koji se diraju (pregled)

| Fajl | Vrsta izmene |
|---|---|
| `apps/mobile/src/app/(app)/profil.tsx` | KAV behavior fix (2.1) |
| `apps/mobile/src/app/(auth)/prijava.tsx` | KAV behavior fix (2.1) |
| `apps/mobile/src/app/(app)/zadaci.tsx` | paddingBottom 96→160 (2.2) |
| `apps/mobile/src/components/stranica/note-editor.tsx` | hitSlop (2.3) + fontSize (2.4) |
| `apps/mobile/src/app/(app)/ideja/[id].tsx` | fontSize (2.4) |
| `apps/mobile/src/app/(app)/razgovor/[id].tsx` | accessibilityLabel (2.5) |
| `apps/mobile/src/components/full-screen-loader.tsx` | legacy theme → tokens (2.6) |
| `apps/mobile/src/components/auth/access-problem.tsx` | legacy theme → tokens (2.6) |
| `apps/mobile/src/components/prostor/area-briefing-section.tsx` | KAV/keyboard-inset (2.7) |
| `apps/mobile/src/app/(app)/(tabs)/prostor.tsx` | moguć KAV omotač (2.7, uslovno) |
| `apps/mobile/src/components/chat/message-composer.tsx` | busy brava (2.8) |
| `apps/mobile/src/app/(app)/ideje.tsx` | accessibilityActions (2.9) |
| `apps/web/app/embed/note/[id]/note-embed.tsx` | tokeni boja (2.10) |
| `apps/web/components/workspace/chat/new-conversation.tsx` | loading spinner (2.11) |
| `apps/web/components/workspace/chat/message-composer.tsx` | sr-only najava (2.12) |
| `apps/web/app/layout.tsx` | komentar (2.13) |
| `docs/mobile/PARITET.md` | 7-8 novih Z redova (2.14) |
| `docs/mobile/ZA-POPRAVKU.md` | nova sekcija 7 (2.15) |

`packages/backend/convex/**` — nula izmena. `apps/mobile/package.json` — nula
izmena. Nema novih ruta.

---

## 4. Šta NEĆU raditi i zašto

**Ide u PARITET.md sekciju Z:** pokriveno u celosti stavkom 2.14 — nema
DODATNIH funkcija van te liste koje svesno izostavljam bez zapisa.

**Van opsega ove faze (nije PARITET Z, nego granica plana):**

- **2 zatečena lint upozorenja u `packages/backend/convex/`**
  (`areasV2.ts:9`, `chat.ts:1037`) — već dokumentovano u `ZA-POPRAVKU §6` sa
  jasnim USLOV-om („prva faza kojoj je backend u opsegu"). Faza 6 ne menja
  backend ni za trivijalno mrtav kod — pravilo je apsolutno u svakoj fazi.
  Zato PARITET.md sekcija B stavka „`npm run lint` — nula grešaka i nula
  upozorenja" **ostaje NEČEKIRANA**, sa napomenom koja upućuje na ZA-POPRAVKU §6
  (vidi odeljak 5 dole).
- **`expo lint` je i dalje pokvaren** (ceo `apps/mobile/src` ignorisan) — ovo
  je poznato, veće, zasebno pitanje (verovatno nekompatibilnost Expo/ESLint
  flat-config podešavanja), ne „zero errors" mehanička ispravka. Mobilni gejt
  ostaje isključivo `tsc`, u skladu sa memorijom i sa redomom prompta (korak 1
  je `tsc`, ne `lint`).
- **Vite upozorenje o `vitest.config.ts` (ESM u CJS-loaded fajlu)** — kozmetički
  tooling nalaz iz `npm test` izlaza, NE greška, NE pad testa (321/321 prolazi).
  Nije eksplicitno u PARITET.md sekciji B (koja traži samo „svi testovi
  prolaze", što VEĆ važi). Ispravka bi tražila preimenovanje/restruktuiranje
  konfiguracije bez mogućnosti da se u OVOM koraku (bez izvršavanja koda)
  potvrdi da radna verzija workspace-a i dalje ispravno razrešava
  `apps/web`/`packages/backend` projekte — rizik nesrazmeran koristi za
  potpuno kozmetički nalaz.
- **Metro konzola tokom prolaska kroz sve ekrane** i **Convex dashboard
  logovi tokom testiranja** (PARITET.md sekcija B, poslednje dve stavke pre
  console.log/TODO/null) — zahtevaju UŽIVO sesiju na uređaju/emulatoru sa
  nekim ko prolazi kroz svaki ekran. Nijedna faza ovog lanca do sad nije to
  radila headless (`ZA-POPRAVKU §5.12`: „Ništa nije pokrenuto na uređaju ni u
  emulatoru"). Ne pretvaram se da je ovo provereno — ostaju nečekirane, sa
  napomenom da traže ljudsku sesiju sa uređajem.
- **Teža restruktuiranje `IdeaRow`-a** (razdvajanje u sestrinske accessibility
  regione umesto `accessibilityActions`) — razmotreno u 2.9 i odbačeno u
  korist manje rizične, čisto aditivne izmene; teža verzija bi menjala layout
  bez mogućnosti provere na uređaju u ovom koraku.
- **`expoPushTokens.myDeviceCount` UI na ekranu podešavanja** — genuinski
  gotova backend funkcija, ali dodavanje UI reda je NOVA funkcionalnost.
  Zapisano u `ZA-POPRAVKU.md` novom sekcijom 7 (2.15), ne implementirano.

---

## 5. Redosled provere

1. Sve izmene 2.1-2.13 (kod): posle SVAKE, `npx tsc --noEmit -p apps/mobile/tsconfig.json`
   i/ili `-p apps/web/tsconfig.json` (zavisno koji fajl je dirnut) — nula
   grešaka pre prelaska na sledeću stavku.
2. Posle svih izmena: `npm run lint` (očekivano: identično stanju sada — 0
   grešaka, ista 2 zatečena backend upozorenja), `npm run build`, `npm test` —
   sve mora ostati zeleno kao u odeljku 1.1 (nijedna regresija).
3. Emulator/uređaj, redom po stavci 2.1-2.9 (mobilni): konkretan dokaz naveden
   u svakoj — poseban naglasak na 2.6 (vidljivo na SVAKOM cold startu) i 2.7
   (jedina stavka sa nesigurnim tačnim mestom izmene).
4. Browser, redom po stavci 2.10-2.13 (web).
5. `rn-review` + `web-review` + `parity-check` PONOVO, posle koda (konvencija
   lanca) — cilj: nula NOVIH nalaza na dirnutim fajlovima; parity-check
   ponovo meri grep razliku (očekivano i dalje 17, sad sa potpunom Z tabelom).
6. PARITET.md sekcija B — čekiranje kućicu po kućicu, u ISTOM commit-u sa
   kodom:

   | Stavka | Očekivani ishod ove faze |
   |---|---|
   | `tsc` mobilni — nula grešaka | **[x]** čekirati (potvrđeno pre i posle izmena) |
   | `tsc` web — nula grešaka | **[x]** čekirati |
   | `npm run lint` — nula grešaka i nula upozorenja | **NE čekirati** — 0 grešaka, 2 upozorenja (zatečena, backend, van opsega — uputiti na ZA-POPRAVKU §6) |
   | `npm run build` — prolazi | **[x]** čekirati |
   | `npm test` — svi testovi prolaze | **[x]** čekirati |
   | Metro konzola kroz sve ekrane — nula crvenih/žutih | **NE čekirati** — zahteva uređaj/emulator sesiju uživo, van dometa ovog (headless) koraka |
   | Convex dashboard logovi — nijedan Server Error | **NE čekirati** — isto, zahteva uživo testiranje |
   | Nijedan `console.log` dijagnostike ostavljen | **[x]** čekirati — jedina 2 pogotka su `__DEV__`-gated, namerna |
   | Nijedan `TODO` bez zapisa u ZA-POPRAVKU.md | **[x]** čekirati — jedini pogodak već pokriven §2 |
   | Nijedna komponenta koja vraća `null` kao placeholder | **[x]** čekirati — svi pogoci su legitimni guard/konvencija, dokazano u 1.2 |

7. Upisati u `IZVESTAJ.md` red za Fazu 6 (skripta to radi, ne agent) — samo
   potvrditi da su `tsc mobilni`/`tsc web`/`lint`/`test` polja tačna prema
   koraku 2 gore.

---

## 6. Odstupanja od plana (upisano tokom sprovođenja)

Sve izmene 2.1–2.15 sprovedene tačno kao u planu, sa dva dodatka koje je
otkrio `rn-review`/`parity-check` posle koda (korak 5 reda provere), oba
sitna i u istom duhu kao ostatak faze (mehanička ispravka, nula nove
funkcionalnosti):

1. **`access-problem.tsx` dugme „Odjavi se" — dodat `minHeight: MIN_TOUCH_TARGET`.**
   Plan 2.6 nije eksplicitno tražio garanciju dodirne mete na ovom dugmetu
   (fokus je bio na zameni legacy teme). `rn-review` je posle prepisa fajla
   uočio da `paddingVertical: spacing.md` (12) + `fontSize: 16` bez
   `lineHeight` daje visinu ~40–44px, na ivici/ispod minimuma — dok svaki
   drugi ručni dodirni element dirnut u ovoj rundi eksplicitno nosi
   `minHeight: MIN_TOUCH_TARGET`. Dodato `minHeight: MIN_TOUCH_TARGET` +
   `justifyContent: 'center'` na `styles.button`; `tsc` i dalje 0 grešaka.
2. **`PARITET.md:224` dokazna linija ispravljena `zadaci.tsx:415` → `:427`.**
   Nije nastalo u ovoj fazi (drift od Faze 4/5, `zadaci.tsx` u Fazi 6 nije
   dirán), ali `parity-check` ga je uočio dok je proveravao da mehaničke
   izmene 2.2/2.9 ne zastarevaju postojeće citate. Pošto se `PARITET.md` već
   menja u istom koraku (2.14), ispravljeno usput umesto ostavljeno za
   sledeću fazu — `grep -n "TasksFilterSheet" zadaci.tsx` potvrđuje `:427`.
