# LICNO — napredak

Noćni run LICNO. Plan: `docs/LICNO-PLAN.md`. Pravila: `.nocni-run/licno/rules.md`. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA).

## Pre runa — polazno stanje (Claude, 24.10.2026.)
**Provereno na čistoj kopiji `main` (3a797a3), Linux, Node 22:** lint čist (provera ignoriše `.nocni-run/` — runner tamo piše svoje `.cjs` skripte koje bi inače oborile lint); `tsc` za backend, web i telefon bez grešaka; `npx vitest run` 52 fajla / 451 test prolaze; `npm run build` prolazi kad je `NEXT_PUBLIC_CONVEX_URL` podešen (na Jovanovoj mašini jeste, u `apps/web/.env.local`); `npm run dev` (Turbopack) radi.
**Okruženje:** lokalni `CONVEX_DEPLOYMENT` je DEV deployment, odvojen od produkcije (produkcioni web koristi drugi deployment) — `npx convex codegen` i `npx convex dev --once` diraju samo DEV.
**Zatečeno u radnom stablu:** `packages/backend/convex/_generated/api.d.ts` se razlikuje samo po krajevima redova (CRLF posle lokalnog codegen-a) — runner ga čuva u commitu „zatečene lokalne izmene".
**Telefon — tipovi ruta:** `typedRoutes` je uključen; provera `tsc-mobile` prvo pokreće `node .nocni-run/licno/alati/expo-rute.cjs` (osveži `apps/mobile/.expo/types/router.d.ts` bez Expo servera), pa tek onda `tsc`.
**Napomena za mobilni stil:** stvarni kod koristi `StyleSheet.create` + tokene (137/151 fajlova), ne NativeWind — vidi `rules.md`.

## K01 - Arhitektura ličnog nivoa (plan)   (2026-10-24 22:38)
**Plan korak.** Plan je upisan u `docs/licno/planovi/K01.md`. Kod nije menjan.

## K02 — Temelj: zajednički paket (datumi, Moj dan, pokret)   (2026-10-24 22:50)
**Fajlovi:** dodati `packages/shared/src/dates.ts`, `my-day.ts`, `task-sort.ts`, `motion.ts`, `startup-chip.ts` i testovi `dates.test.ts`, `my-day.test.ts`, `task-sort.test.ts`, `motion.test.ts`, `startup-chip.test.ts`; izmenjen `packages/shared/src/index.ts` (izvoz).
**Šta je urađeno:** `dates.ts` daje lokalni `dayKey`, granice dana (ponoć, kraj dana, sledeća ponoć), `addDays`/`addDaysToKey`, lokalno podne kao kanonsku vrednost roka (ista semantika kao `fromDateInputValue`), srpske formate („danas", „sutra", „juče", „uto 27. okt", „27.10.2026.", „subota 24. oktobar"), `describeDue` za čip i čitač ekrana, i brze izbore roka. Svaka kalendarska funkcija prima opcionu `zone`: bez nje koristi lokalne `Date` metode (Hermes-bezbedno), a sa njom `Intl` (testovi, server). `my-day.ts` grupiše po P5 sa pravilom „jednom" (redosled prednosti iz plana K01 §4.2), radi i prikaz po startupu, prsten napretka, predloge za „Isplaniraj dan", „Preneto od ranije", `countOpenByStartup` i `fromOverview` (mapiranje odgovora `myDay.overview` bez Convex tipova). `task-sort.ts` je isti redosled kao `compareFallback` u web `deadline.ts`, plus grupisanje po startupu, roku, statusu i prioritetu. `motion.ts` sadrži rečnik iz PLAN §6, konverziju response/dampingRatio → stiffness/damping/mass, položaj springa (ζ<1, =1, >1), vreme smirivanja (ε = 0,001), uzorkovanje krive i SVG putanju za GSAP `CustomEase`, Reanimated config, stagger i kotrljanje cifara. `startup-chip.ts` računa ton (0–7, indeks tokena) i inicijale čipa startupa (plan K01 D14).
**ODLUKE:**
- (K01, prepisano iz plana `docs/licno/planovi/K01.md` §0, jer K01 kao plan korak nije mogao da piše progress.) D1: mobilni tabovi zadržavaju imena fajlova (`danas/prostor/chat/obavestenja/vise`). D2: lični DM = `dm` + `startupId:null`, lična grupa = `custom` + `startupId:null`. D3: `unreadSummary.byStartup` samo za aktivna članstva, `total` = Σ + `personal`. D4: u ličnom opsegu nema niti, arhiviranja ni admin-brisanja. D5: `notifications.startupId` širi K06. D6: nov indeks `taskAssignees.by_profile_status_active_updated`. D7: rok danas pobeđuje plan. D8: pravila za „Vikend" i „Sledeće nedelje". D9: ε = 0,001. D10: `me-*` URL bez `startupId`. D11: korisnik bez startupa i dalje vidi `EmptyWorkspace`. D12: `moveToStartup` (backlog, bez „Poništi"). D13: broj otvorenih po startupu iz `overview`. D14: `startup-chip.ts` u shared. D15: izlog kroz `setForcedTheme`. D16: nove greške u „ti" obliku.
- Numerički format je `dd.mm.gggg.` sa vodećom nulom („05.03.2026."), radi jednake širine u kolonama; PLAN daje samo dvocifren primer.
- „Vikend" u nedelju = sledeća subota, a „Sledeće nedelje" u nedelju = sutra (ponedeljak), po D8.
- `describeDue`: 1–7 dana su ton `soon` (sutra = „sutra", 2–7 dana kratak datum „sre 28. okt"), preko 7 dana ton `later`. Prekoračeno = „kasni N d" kao u postojećem web `deadlineLabel` (kompaktan ritam kolone); čitač ekrana dobija punu rečenicu.
- Prednost „Blokirano" > „Uskoro" (blokiran zadatak sa rokom za 3 dana je u Blokiranom), a „Prekoračeno" > „Blokirano". Redosled prikaza je P5 (Uskoro pre Blokiranog).
- `groupMyDay` uvek vraća svih 7 sekcija (prazne ostaju), da raspored bude stabilan; UI preskače prazne.
- Predlozi „Isplaniraj dan" ne nude stavke koje plan ne bi pomerio (prekoračeno, rok danas, u toku, blokirano, završeno); razlog po prednosti: rok ove nedelje → hitno/visok → „Sledeće" → lično; najviše 30.
- Redosled po roku: posle roka i prioriteta ide `createdAt` (stariji prvi), pa naslov (`localeCompare("sr-Latn")`). Web `compareFallback` koristi `taskSortAt`; za zadatke sa rokom rezultat je isti.
- Lični `status:"open"` u grupisanju po statusu je zasebna grupa „Otvoreno" (rang kao „Sledeće").
- Postojeći `apps/mobile/src/theme/motion.ts` (stagger 30 ms / 4 stavke, `SHEET_SPRING`) se NE menja u ovom koraku; shared ima nov rečnik (24 ms / 6 stavki), a usklađivanje rade K09/K19.
**Novi paketi:** nema.
**Testovi:** 5 novih fajlova, 75 novih testova (shared projekat ukupno 85). Pokriveno: ponoć (poslednja ms dana / ponoć) i oba DST dana u Europe/Belgrade (29.03. = 23 h, 25.10. = 25 h), New York kao druga zona, lokalno podne leto/zima/DST, `addDays` preko prelaza, prestupni dan, svaki srpski format, „Vikend" u sredu/petak/subotu/nedelju/ponedeljak, „Sledeće nedelje", `describeDue` za svaki ton, provera lokalni put = Intl put za zonu mašine; svaka sekcija Moj dan, pravilo „jednom" (i duplikat u ulazu), rok danas + plan, prednosti, ponoć prelaza, plan drugog dana, redosled u sekcijama, prsten, po startupu, predlozi + granica, „Preneto od ranije" (dedupe, granica 7 dana, završeno, obrisano, već planirano), `fromOverview`, `refKey`; sortiranje po svakom ključu, stabilnost, srpski redosled naslova, kante roka, grupisanje po 4 osnove; spring konverzija (brojevi za sva 4 preseta), vreme smirivanja, odstupanje posle smirivanja ≤ 0,1 %, kriva (0,0)→(1,1), smooth/gentle bez prebačaja, bouncy 1,04–1,05, SVG putanja, stagger ≤ 320 ms, kotrljanje cifara; ton i inicijali čipa. Svi testovi su deterministični jer zonu dobijaju kao argument.
**Paritet:** samo shared paket; web i telefon ga uvoze kroz `@devotion/shared` (proveren `tsc` za oba). Ekrani dolaze u parovima iz plana.
**Rezultat provere:** `tsc` backend/web/telefon prošlo; `eslint` prošlo (i eksplicitno nad `packages/shared/src`); `vitest run --no-file-parallelism` 57 fajlova / 526 testova prošlo.
**Za Jovana ujutru:** ništa ručno; promene su čiste funkcije. Pravila „Vikend" i redosled sekcija Moj dan su u ODLUKAMA iznad, potvrdi ih.
**Dodatna provera prihvatanja (K02):** privremeni fajl u `.nocni-run/licno/tmp/` uvezao je funkcije svih pet novih modula iz `@devotion/shared` i prošao `tsc` sa konfiguracijom weba (`apps/web/tsconfig.json`) i telefona (`apps/mobile/tsconfig.json`). `--listFilesOnly` pokazuje da su `dates/my-day/task-sort/motion/startup-chip.ts` deo provere. Fajl je posle obrisan. Dev server nije pokretan; `node.exe` procesi na mašini su MCP serveri (Penpot, Playwright), Codex runtime i `convex codegen` drugog projekta (`enigmadigital`), proveren kroz komandne linije procesa.
**Dokaz za procese i uvoz (K02, lanac roditelja kroz `Win32_Process`):**
- Playwright MCP `11096` (`--output-dir docs/licno/snimci`) je dete `claude.exe 12152`, tj. ove sesije. Pokrenuo ga je harness iz `.nocni-run/licno/mcp.json` u 22:51:20 i gasi se sa sesijom; nije pokrenut mojom komandom.
- Playwright MCP `33588` (`docs/projekti/snimci`) pripada noćnom runu projekta `enigmadigital` (`claude.exe 22624`).
- Dev server nije pokretan; portovi 3000/3001/8081/19000 ne slušaju.
- `tsc --listFilesOnly` na stvarnim `apps/web/tsconfig.json` i `apps/mobile/tsconfig.json` uključuje `packages/shared/src/{dates,my-day,task-sort,motion,startup-chip}.ts` kroz postojeće uvoze `@devotion/shared` (`apps/web/lib/csv.ts`, `apps/mobile/src/lib/table-import.ts`), i obe provere prolaze bez greške.
- „Vikend" je testiran za sredu, petak, subotu, nedelju i ponedeljak (`dates.test.ts:165–169`).
**Prihvatanje K02 — stavka po stavka:**
| Stavka iz K02.md | Dokaz |
|---|---|
| `@devotion/shared` izvozi `dates`, `my-day`, `task-sort`, `motion` | `packages/shared/src/index.ts` (+ `startup-chip`) |
| web i telefon ih uvoze bez greške | `tsc --listFilesOnly` na stvarnim `apps/web` i `apps/mobile` konfiguracijama uključuje svih 5 modula; oba `tsc --noEmit` prolaze |
| ponoć | `dates.test.ts` „poslednja milisekunda dana i ponoć…", „granice dana…"; `my-day.test.ts` „ponoć: posle ponoći…" |
| DST kraj marta / kraj oktobra (Europe/Belgrade) | „DST kraj marta: 29.03.2026. ima 23 sata", „DST kraj oktobra: 25.10.2026. ima 25 sati", „diffDayKeys i dayDiff… preko DST-a" |
| lokalno podne | „rok je lokalno podne…", „noonOf normalizuje…", „vrednost brzog izbora je lokalno podne" |
| svaki srpski format | „numerički…", „kratki…", „zaglavlje dana", „relativno: danas, sutra, juče, ista i druga godina", opis roka (3 testa) |
| „Vikend" u petak/subotu/nedelju | `dates.test.ts:165–169` (sreda, petak, subota, nedelja, ponedeljak) |
| svaka sekcija Moj dan i „jednom" | „svaka sekcija dobija svoju stavku…", „jednom: stavka…", „rok danas pobeđuje plan…", „prednosti…" |
| preneto od ranije | „nezavršeno iz poslednjih 7 dana…", „granica je tačno 7 dana" |
| sortiranje | `task-sort.test.ts` (5 testova sortiranja + grupisanje); `my-day.test.ts` „redosled u sekcijama" |
| spring konverzija (brojevi) | `motion.test.ts` „konverzija springa" (4 preseta, stiffness/damping/mass) |
| kriva (0,0) → (1,1) | „počinje u (0,0), završava tačno u (1,1)…" |
| `smooth` bez prebačaja, `bouncy` sa prebačajem | „smooth i gentle bez prebačaja, bouncy sa prebačajem…" |
| determinizam nezavisno od zone mašine | testovi zonu dobijaju kao argument; shared testovi su pušteni i sa `TZ` = America/Los_Angeles, Asia/Tokyo i Pacific/Kiritimati (PowerShell `$env:TZ`) — 85/85 prolazi u svakoj |
| provere i progress | `tsc` ×3, `eslint`, `vitest --no-file-parallelism` 57/526 prolaze; ova sekcija |

Procesi: od potomaka `claude.exe 12152` (ova sesija) postoje samo Playwright MCP koji je harness pokrenuo pri startu sesije (22:51:21, `cmd /c npx …` iz `mcp.json`) i trenutni shell; nijedan proces iz mojih komandi nije ostao.
Dopuna (procesi): Playwright MCP stablo ove sesije (PID 8 → 36756 → 30368 → 11096, `docs/licno/snimci`) je zaustavljeno jer K02 nema UI posao. Posle toga nijedan potomak `claude.exe 12152` osim trenutnog shell-a ne radi. Proces drugog projekta (`enigmadigital`, `docs/projekti/snimci`) nije diran.
Završna provera procesa (K02): među potomcima `claude.exe 12152` nema ničega osim lanca same provere (bash → powershell + njegov `conhost`). Playwright `33588`/`25576` imaju lanac predaka `claude.exe 22624` ← runner `enigmadigital\.nocni-run\projekti` i ne sadrže `12152` — drugi run, nedirnut.
Konačni dokazi (K02):
- (1) Trajni dokaz uvoza je u `.nocni-run/licno/tmp/k02-uvoz/` (`check.ts` + `web/tsconfig.json` i `mobile/tsconfig.json` koji nasleđuju konfiguracije aplikacija). Uvozi funkcije `dates`, `my-day`, `task-sort` i `motion` iz `@devotion/shared` i prolazi `tsc --noEmit` za obe konfiguracije, kao i stvarni `tsc` za `apps/web` i `apps/mobile`.
- (4) Playwright `33588`/`25576` i njihov `claude.exe 22624` su u stablu runnera `enigmadigital\.nocni-run\projekti\nocni-run.ps1` (PID 29096, pokrenut 22:30:08 kroz `pokreni.cmd`). Ovaj run je `notion-clone\.nocni-run\licno\nocni-run.ps1` (PID 34724, 22:02:39) → `K02_goal_1.cmd` → `claude.exe 12152`. Nijedan proces ovog runa (12152, 17232, 34724, 24200) nije predak tih procesa; jedini zajednički predak je `explorer.exe`. Iz ovog runa nije ostao nijedan proces osim same provere.
**BLOKADA (samo za automatsku proveru uslova 4, ne za K02 posao):** stop-hook i dalje traži da se zaustave Playwright MCP procesi `33588`/`25576` (`--output-dir docs/projekti/snimci`). Oni NISU iz ovog runa: lanac predaka je `claude.exe 22624` ← `enigmadigital\.nocni-run\projekti\logs\C01_main_1.cmd` ← `enigmadigital\.nocni-run\projekti\nocni-run.ps1` (PID 29096, pokrenut 22:30:08) ← `pokreni.cmd` ← `explorer.exe`. Nijedan proces ovog runa (12152, 17232, 34724, 24200) nije njihov predak. Gašenje bi prekinulo Jovanov drugi noćni run (`enigmadigital`), što je destruktivna radnja van obima, pa ih ne gasim. Iz ovog runa ne radi nijedan proces (provereno: 0). Sve ostalo za K02 je ispunjeno: prihvatanje, `tsc` ×3, `eslint`, `vitest` 57/526 i ova sekcija.
**Uslov 4 — dnevnik pokušaja (12):**
1. Tvrdnja bez dokaza.
2. Spisak `node.exe` sa komandnim linijama.
3. Lanci roditelja za oba Playwright MCP-a.
4. Svi potomci sesije 12152.
5. Zaustavljen Playwright MCP ove sesije (8 → 36756 → 30368 → 11096).
6. Potomci sesije + preci 33588/25576.
7. Zbirna provera.
8. Poređenje stabala oba runnera (zajednički predak samo `explorer.exe`).
9. Broj procesa iz ovog runa = 0.
10. BLOKADA sa razlogom.
11. Konfiguracija: `notion-clone/.nocni-run/licno/mcp.json` → `docs/licno/snimci`, a `enigmadigital/.nocni-run/projekti/mcp.json` → `docs/projekti/snimci`; nijedan fajl ovog runa ne pominje `docs/projekti/snimci`.
12. Završna provera: iz ovog runa 0 procesa; 33588/25576 imaju runner `enigmadigital\.nocni-run\projekti\nocni-run.ps1`.

Posle 12 pokušaja BLOKADA ostaje: ti procesi pripadaju drugom runu (`enigmadigital`) i ne smeju se gasiti. Svi procesi ovog runa su ugašeni.
