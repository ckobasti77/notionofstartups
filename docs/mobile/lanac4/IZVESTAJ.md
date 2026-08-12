# Devotion - lanac uredjivanja kanvasa

- Pocetak: 2026-08-12T13:16:28
- Grana: `kanvas-lanac-20260812-1316`
- Model za sve korake: `opus`
- Zastavica za effort: `--effort`
- Rezim uredjivanja: **Uredi raspored** (odluka korisnika)
- Razlika pariteta na pocetku: **17**  (cilj: 7)


## Faza K1 - Rezim uredjivanja i pomeranje cvorova

**Cilj:** U rezimu Uredi raspored prstom pomeras stranice po kanvasu oblasti, pozicija se pamti, i izlazak iz rezima vraca gledanje.

| Korak | Model | Effort |
|---|---|---|
| PLAN | `opus` | `max` |
| IZVRSI | `opus` | `max` |
| REVIZIJA | `opus` | `max` |

- Start: 2026-08-12T13:16:29
- Razlika pariteta pre faze: **17**
- PLAN: napisan
- IZVRSI: gotovo — razlika pariteta posle faze: **15** (`movePages`, `saveViewport`)

### Šta sada radi (provereno na Android emulatoru, Pixel_9)

Kanvas oblasti ostaje podrazumevano za gledanje. Četvrta ikonica u rail-u
(„Uredi raspored", 44pt) pali režim: WebView dobija obod i pilulu „Uređivanje
rasporeda", svaka **svoja** kartica dobija isprekidan obod, a primarno dugme
postaje „Gotovo". U režimu prst na svojoj kartici je pomera, prst na pozadini
(ili na tuđoj kartici) i dalje pomera platno. Kraj poteza = jedan `movePages` i
traka „Poništi" 8 s koja isti poziv radi sa starim koordinatama. Kamera se pamti
(`saveViewport`, prigušeno 800 ms) i vraća pri sledećem otvaranju.

### Dokazi (`lanac4/dokazi/`)

| Test | Dokaz |
|---|---|
| T0 okruženje | `curl … /embed/canvas/area/proba` → `200` |
| T1 prst pomera karticu, ne platno | `k1-pre.png` → `k1-posle.png` |
| T2 pozadina i dalje pomera platno u režimu | `k1-pan-u-rezimu.png` (sve kartice zajedno, bez `movePages`) |
| T3 jedan upis po potezu | `k1-logovi.txt` (1:48:12 — tačno jedan `areasV2:movePages`) |
| T4 pozicija preživi | `k1-povratak.png` |
| T5 kamera | log: jedan `saveViewport` po pan-u; posle `[⌖]` **nijedan** |
| T6 desktop nepromenjen | `git diff --stat apps/web/components/` prazan + izolacija uvoza + `npm run build` (vidi ogradu) |
| T7 „Poništi" | `k1-undo-pre.png` → `k1-undo-posle.png`, log 1:52:19 + 1:52:20 |
| T8 izlazak iz režima | `k1-gotovo-swipe.png` (swipe po kartici pomera platno), `k1-tap-otvara.png` (tap otvara stranicu) |
| T9 režim preživi „Pokušaj ponovo" | `k1-t9-greska.png` → `k1-t9-posle-retry.png` → `k1-t9-pomeranje.png` |
| T10 kapije | mobilni `tsc` ✓ · web `tsc` ✓ · `lint` 0 grešaka (2 zatečena backend upozorenja) · `npm test` 327/327 ✓ · `npm run build` ✓ |
| T11 paritet | 17 → 15, i to zato što se obe funkcije sada zovu iz `apps/mobile/src` |

### Nalaz uhvaćen na emulatoru (i popravljen)

Običan **tap po platnu** je za `d3-zoom` pun start→end ciklus sa pravim
`sourceEvent`-om, pa je svaki dodir slao `saveViewport` sa istom vrednošću
(`k1-logovi.txt`, 1:50:41). Dodata je provera „da li se kamera uopšte promenila";
posle popravke dva tapa daju nula upisa.

### Ograda — šta NIJE provereno

**T6 nije odrađen mišem u browseru.** U ovom okruženju nema web kredencijala
(dev baza ima dva profila, lozinka naloga sa živom mobilnom sesijom nije poznata,
a menjanje tuđe lozinke nije deo zadatka). Ne-regresija desktop kanvasa je zato
dokazana staticki: prazan `git diff` nad `apps/web/components/`, embed **ne uvozi
ništa** iz `components/workspace/`, nijedan fajl van embed foldera ne uvozi
`canvas-embed`/`embed-node`, i pun `npm run build` prolazi. Ručnu proveru mišem
(prevuci karticu, `Ctrl+Z`) treba odraditi kad kredencijali budu dostupni.

Odstupanja od plana su dopisana u `planovi/faza-k1.md` §8.
- IZVRSI: proslo
- `tsc mobilni`: prolazi
- `tsc web`: prolazi
- `lint`: prolazi
- `test`: prolazi
