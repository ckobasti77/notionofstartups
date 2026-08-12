# Lanac 4 — uređivanje kanvasa na telefonu · završni brief

*Grana `kanvas-lanac-20260812-1316`, 12.08.2026. Faze K1–K6.*

---

## 0. Jedna rečenica

Kanvas na telefonu se sada **uređuje** — kartice se pomeraju, menjaju veličinu i
povezuju, i to važi i za korake zadataka — a sve to iz režima koji se pali namerno, pa
niko ne pomeri nešto po bazi misleći da lista.

## 1. Broj 7 — šta znači, a šta NE znači

Razlika pariteta je **7** (cilj lanca). Komanda i način merenja: `docs/mobile/PARITET.md`
(zaglavlje). Sedam preostalih funkcija su obrazloženi izuzeci — Z-tabela u istom fajlu
ima **tačno tih 7 redova**, uparenih red po red sa ispisom komande.

**7 ne znači „sve je urađeno".** Broj meri da li se Convex funkcija **negde** poziva iz
`apps/mobile/src` — ne meri da li korisnik do te radnje može da dođe, ni na koji način.
Dva konkretna primera iz ovog lanca:

- **K5 nije urađen**, a broj je isti sa njim i bez njega: `thoughts.moveNodes`,
  `ideas.updatePositions` i drugovi se već zovu sa native **listi** („Sredi raspored"),
  ne sa kanvasa. Režim uređivanja na kanvasu ideja i misli **ne postoji**.
- **K4 je bio prebrojan a nedostupan**: sve četiri checkpoint funkcije su bile u kodu i
  kompajlirale se, ali nijedan ekran nije vodio do njih. Ispravljeno tek u K6.

Pouka za sledeće merenje pariteta: `useMutation` u fajlu **nije dokaz** da radnja postoji.

## 2. Šta je urađeno, po fazi

| Faza | Šta radi na telefonu | Funkcije | Stanje |
|---|---|---|---|
| **K1** | Režim „Uredi raspored": prst pomera **svoju** karticu, prst na pozadini pomera platno; kamera se pamti | `areasV2.movePages`, `saveViewport` | ✅ isporučeno |
| **K2** | Četiri ugaone ručke od 44pt na izabranoj svojoj kartici + „±10%" i „Vrati podrazumevanu" u sheet-u (za mali zum i čitač ekrana) | `areasV2.resizePage`, `resetPageSize` | ✅ isporučeno |
| **K3** | Veza **tapom izvor → tapom cilj** (nit sa 8px tačkice se ne povlači); raskidanje iz imenovane liste suseda | `areasV2.connectPages`, `disconnectPages` | ✅ isporučeno |
| **K4** | Oblačići koraka zadatka na platnu: potez, veličina presetima, veze korak↔korak i korak↔kartica | `taskCheckpoints.saveCanvasPlacement`, `resetCanvasSize`, `taskCheckpointCanvasEdges.connect`, `disconnect` | ⚠️ embed u `ef87e84`, **native ljuska tek u K6** |
| **K5** | Isti režim na kanvasu **ideja** i **misli** | — | ❌ **nije urađen** (`ZA-POPRAVKU §9`) |
| **K6** | Povezivanje K4 native ljuske, čišćenje lint upozorenja, test protiv desktop regresije, dokumentacija | — | ✅ isporučeno |

Svaka radnja koja piše u bazu ima traku **„Poništi"** (8 s), kroz jedan postojeći
obrazac (`apps/mobile/src/lib/undo.ts` + `components/undo-bar.tsx`). Poništavanje koje
zavisi od prethodnog stanja to i poštuje: korak koji nikad nije bio dimenzionisan vraća
se kroz `saveCanvasPlacement(x,y)` **pa** `resetCanvasSize`, ne kroz golo vraćanje
dimenzija (izmereno u bazi, `dokazi/k6-logovi.txt` T6).

## 3. Kako se do svega dolazi (da se ne traži)

- **Kanvas oblasti** → Prostor → oblast → ikonica ▦ u zaglavlju.
- **Kanvas stranice** → stranica → ikonica ▦ u zaglavlju.
- **Kanvas zadatka** → zadatak → ikonica ▦ u zaglavlju. **Novo u K6** — ranije ga sa
  telefona nije bilo kako otvoriti, a to je jedini kanvas na kom su koraci vidljivi
  odmah.
- **Režim** → četvrta ikonica u donjem rail-u („Uredi raspored"). Vidi se na prvi
  pogled: obod oko platna + pilula „Uređivanje rasporeda", a primarno dugme postaje
  „Gotovo".
- **Akcije čvora** → dugi pritisak na čvor **u režimu**, ili ista ikonica u rail-u kad
  je izabran jedan čvor (dugi pritisak je na iOS-u nepouzdan, pa uvek postoje dva puta).
- **Koraci na kanvasu oblasti/stranice** → sheet kartice zadatka → „Prikaži korake (N)".

## 4. Šta je ostalo — iskreno

| Šta | Gde je zapisano | Zašto nije urađeno |
|---|---|---|
| **K5 — režim na kanvasu ideja i misli** | `ZA-POPRAVKU §9` | Pun posao faze, ne zatvaranje. Backend je **ceo već tu**; treba handleri u `IdeasFlow`/`ThoughtsFlow`, dva sheet-a čvora i novi članovi `UndoAction`. Nosi i zamku koja tiho kvari podatke: ugnježdeni čvorovi imaju **relativne** koordinate u xyflow-u, a backend traži apsolutne. |
| **Desktop kanvas nije proveren mišem** | `ZA-POPRAVKU §10` | Nema kredencijala; lozinka naloga sa živom mobilnom sesijom nije poznata. Otvoreno četvrtu fazu zaredom — sada bar zapisano sa tačnim putem umesto da se prećutno prenosi. |
| **Beleška sa tabelom/prilogom/blokom koda je read-only na telefonu** | `ZA-POPRAVKU §2, §5.1` | Traži prepakivanje tentap bundle-a; merni gejt editora je i dalje otvoren. Nije deo ovog lanca. |
| **Nit doprinosa po checkpointu, doprinosi na oblasti** | `ZA-POPRAVKU §5.7` | Tip postoji, ekran ga ne montira. Van opsega lanca. |
| **Broj registrovanih uređaja za push** | `ZA-POPRAVKU §7` | Backend spreman, čeka sledeću izmenu ekrana podešavanja. |

Uz to: `PARITET.md` sekcije **C** (runtime provera funkcija) i **D** (responzivnost)
imaju dosta nečekiranih kvadratića koji nemaju veze sa kanvasom.

## 5. Šta čovek MORA sam da proveri na fizičkom telefonu

Sve dole je van dometa emulatora ili nije reprodukovano u ovom okruženju. Poređano po
tome koliko boli ako ne radi.

### iOS (ne postoji nijedan iOS dokaz u celom lancu)

1. **Dugi pritisak na čvor otvara sheet.** Ceo lanac se oslanja na `contextmenu` događaj
   u WebView-u. Na Androidu radi (dokazano). **WKWebView ga ume ne poslati uopšte** —
   zato svaka radnja ima i drugi put (ikonica u rail-u), ali treba znati koji od dva
   puta stvarno radi na iPhone-u. Ako `contextmenu` ne stiže, iOS korisnik ima samo
   rail — proveriti da je to podnošljivo.
2. **Potez prstom po čvoru vs pomeranje platna.** Mehanika je `nopan` klasa koju xyflow
   dodaje povlačivom čvoru; na iOS-u se `touch-action` i gesture recognizer-i ponašaju
   drugačije nego na Androidu. Proveriti da potez po **tuđoj** kartici i dalje pomera
   platno.
3. **Swipe-back sa leve ivice.** Na canvas ruti je gest isključen (`gestureEnabled:false`)
   da se ne bije sa pan-om — proveriti da izlaz kroz „‹" u zaglavlju nije jedini koji
   korisnik pronađe, i da ekran ne deluje kao ćorsokak.
4. **Safe area u položenom prikazu.** Dugme [⛶] rotira u landscape; na iPhone-u sa
   zarezom bezbedna zona ide levo/desno. Zaglavlje i rail to uračunavaju u kodu, ali
   nije viđeno na uređaju.

### Oba sistema

5. **Mali ekran (≤ 360 dp).** Rail ima 4 ikonice od 44pt + dugme sa tekstom. U kodu se
   dugme skraćuje (`flexShrink`), ali nije viđeno na uskom uređaju.
6. **Sporiji telefon.** Ceo kanvas je Tiptap-… odnosno `@xyflow/react` u WebView-u.
   Emulator na desktop CPU-u ne kaže ništa o jeftinom Androidu. Meri se isto kao editor
   (`ZA-POPRAVKU §2`) — otvaranje kanvasa i odziv poteza.
7. **Čitač ekrana (TalkBack / VoiceOver).** Traka „Izaberi karticu za vezu" nosi
   `accessibilityLiveRegion`, ulazak/uspeh/otkazivanje idu kroz
   `announceForAccessibility`, a svaka radnja ima put koji ne traži precizan prst. Nije
   slušano na uređaju.
8. **Uvećan sistemski font.** Redovi sheet-a su 56pt sa dvorednim naslovom; pri 200%
   fonta treba proveriti da se tekst ne seče.
9. **Custom zvuci obaveštenja i haptika.** Nikad nisu provereni na fizičkom uređaju
   (iOS traži `.wav`, ne `.caf` — vidi memoriju projekta). Nije deo ovog lanca, ali je
   isti tip rizika: emulator to ne dokazuje.

## 6. Stanje kapija na kraju lanca

```
apps/mobile   npx tsc --noEmit   → 0
apps/web      npx tsc --noEmit   → 0
npm run lint                     → 0 grešaka, 0 upozorenja
npm test                         → 39 fajlova, 333 testa
npm run build                    → prolazi
paritet                          → web 161 · mobilni 169 · razlika 7
```

Dva zatečena backend lint upozorenja (`areasV2.ts:9`, `chat.ts:1037`) su obrisana u K6 —
to je bio jedini dozvoljen dodir backenda i odnosio se **samo na mrtav kod**. U
`chat.ts` je obrisano isključivo destrukturisanje; `await requireStartupMember(...)`
ostaje, jer je to provera pristupa (broj pogodaka u fajlu je pre i posle 11).

## 7. Ako nešto pukne — gde prvo gledati

1. **Kanvas javlja `ERR_CONNECTION_REFUSED`** → `adb reverse tcp:3000 tcp:3000` je
   nestao sa restartom emulatora (`ZA-POPRAVKU` Z9).
2. **Kanvas javlja 404** → nešto drugo drži port 3000 (`ZA-POPRAVKU` Z3).
3. **Aplikacija stoji na „Pripremam radni prostor"** → emulatoru je pukao DNS
   (`ZA-POPRAVKU` Z8).
4. **Kanvas prestane da prikazuje tuđe izmene** → kapija gesta je ostala zaključana
   (`ZA-POPRAVKU` Z7 — zatvoreno, ali zna da se vrati).
5. **WebView se učitava u petlji** → nov objektni prop na `<WebView>` (`ZA-POPRAVKU` Z1).
6. **„Poništi" javi serversku grešku nad vezom** → grananje po `edgeKind` je izgubljeno
   (`REZIM.md`, protokol mosta).

## 8. Prateći dokumenti

- `docs/mobile/PARITET.md` — lista i memorija, sekcije K1–K5 i Z-tabela
- `docs/mobile/ZA-POPRAVKU.md` — otvorene stavke (§9, §10) i naučene zamke (Z1–Z9)
- `docs/mobile/lanac4/OSNOVA.md` — nalaz koji je pokrenuo lanac
- `docs/mobile/lanac4/REZIM.md` — protokol režima i pun protokol mosta
- `docs/mobile/lanac4/IZVESTAJ.md` — izveštaj po fazi, sa ogradama
- `docs/mobile/lanac4/dokazi/` — screenshotovi, logovi, merenja (`k1-` … `k6-`)
- `docs/mobile/00-PLAN.md` §5.2 — arhitektura WebView embeda
