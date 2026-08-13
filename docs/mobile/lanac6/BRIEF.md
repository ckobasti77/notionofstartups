# Lanac 6 — brief

Grana: `paritet6-20260812-2324` · Osnova: `docs/mobile/PARITET-REVIZIJA-12-08.md`
(6 nezavisnih revizora, ~40 stvarnih rupa iza brojača koji je pokazivao 6).

**Ishod u jednoj rečenici:** svih **44 stavke** iz sekcija B, C i D revizije su
zatvorene — **41 urađeno**, **1 delimično** (undo stek da, redo namerno ne),
**2 odbijene kao odluka sa razlogom** (kanban, piker oblasti), **0 propusta**.
Red-po-red dokazi: `docs/mobile/PARITET-REVIZIJA-12-08.md`, sekcija **G**.

---

## Kapije (mereno na kraju P7)

```
apps/mobile        npx tsc --noEmit                → exit 0
apps/web           npx tsc --noEmit                → exit 0
packages/backend   npx tsc -p convex/tsconfig.json → exit 0
npm run lint                                       → exit 0, nijedna linija ispisa
npm test                                           → 50 fajlova / 434 testa, sve prolazi
npm run build                                      → uspešno
skript za mrtve uvoze (206 fajlova)                → „NEMA mrtvih uvoza."
skript dostupnosti do ekrana (25 novih modula)     → „SVI LANCI POSTOJE."
```

> `npm run lint` **ne pokriva `apps/mobile/**`** (`eslint.config.mjs:25`). Za
> mobilni „lint čist" znači `tsc` i ništa više. Ograda važi za ceo lanac.

Testovi kroz lanac: **350 → 434** (+84).

`rn-review` je pušten nad svim izmenjenim ekranima P7: **7 nalaza, 4 popravljena**
(reset nacrta u sheet-u kreiranja, `onError` na PDF grani pregleda, „Pokušaj
ponovo" u greška-stanju pregleda, `profile` u loading gejtu ekrana članova),
**3 zapisana sa razlogom** (treptaj ikonice oblasti, pomeranje linije „U oblasti X",
indikator učitavanja slike). Detalji: `IZVESTAJ.md`, P7 §7.

---

## 1. Šta je urađeno, po fazi

### P1 — Preimenovanje, pozivnica kao link, mrtav kod (`1798294`, revizija `1b946f7`)

Preimenovanje bilo čega sa telefona (zadatak, tabela, prilozi) kroz jedan red u
`PageActionsSheet`. Pozivnica se kopira kao **link** koji se otvara, ne kao goli
kod — `inviteLinkUrl` je do tada bio uvezen i nikad pozvan. Kod postojeće
pozivnice se može ponovo kopirati (sesijsko pamćenje, ne na disk). Očišćeno 6
mrtvih uvoza i uvedena deljena konstanta prisustva chata
(`packages/backend/convex/lib/chatPresence.ts`) — dotle su oba klijenta
hardkodovala svoju vrednost, a serverski export bio dekoracija.

### P2 — Editor beleške: tabela, slika, prilog, blok koda (`91e4c51`, revizija `0911704`)

Najveća rupa lanca (B1): beleška sa tabelom, prilogom ili blokom koda se na
telefonu **nije mogla urediti**. Rešeno **sopstvenim web bundle-om** editora
(`apps/mobile/editor-web/`, vite) sa istom Tiptap šemom kao web. Zabranu je
zamenio čuvar koji **meri stvaran gubitak** (`noteSignatureLoss`) — pa preživi i
sledeću promenu šeme na webu. Dodato ubacivanje slike, kamere, priloga, tabele
3×3, uvoza CSV/XLSX i bloka koda u telo beleške.

Ovde je i zamka `Z10`: build je pao na `react-native` Flow izvoru, a **da nije
pao — tiho bi ugasio traku alata** (`isExpo()` bi vratio `true`).

### P3 — Chat: diskusija nad idejom, članovi kanala, prilozi (`a3f8791`, revizija `f71a02e`)

Diskusija (chat) nad idejom. **Članovi privatnog kanala** — ćorsokak je bio i na
webu (članovi samo pri kreiranju), pa je i web dobio izlaz; backend je dobio nov
upit `chat.channelMembers` i mutaciju `chat.setChannelMembers`. Zatvorene i dve
serverske rupe: `chat.generateUploadUrl` sada ima obavezne `name`/`contentType`/`size`
i baca **pre** izdavanja URL-a, a odbijen prilog se VRAĆA (ne baca) pa se blob
briše u istoj transakciji — dotle je klijent koji preskoči predproveru punio
storage siročićima. Plus sedam sitnica (kopiranje teksta, više fajlova, video iz
galerije, pretraga članova, `@` u sredini, izmena priloga, objašnjenje isteka).

### P4 — Ideje i misli: doslednost i kanvas prikaz (`ed639c1`, revizija `9a712f0`)

Boja kartice ideje (kreiranje i izmena), dupliranje ideje, filter/pretraga u
listama, status odobrenja. Na kanvasu: oznaka veze i boja čvora se sada **vide**
— dotle su se upisivali a nisu renderovali. „Nova grana ideje" i „Nova povezana
misao" u jednom potezu.

### P5 — Struktura: ugnježdavanje, premeštanje, putanja, doprinosi (`972f2a4`, revizija `d80fa60`)

Ugnježdavanje pod stranicu koja nije u korenu (nov `PageTargetPicker` — stablo
koje se širi u mestu). Putanja u zaglavlju postala dodirljiva (`PathSheet`).
Potpisani doprinosi na **oblasti** i na **checkpointu** — dve grane `target` unije
koje su postojale u tipu a nijedan ekran ih nije koristio.

**Najvažniji nalaz faze:** C10 („premesti u drugu oblast pod određenu stranicu")
**nije bila mobilna rupa nego SERVERSKA** — web je to pokušavao, a `areasV2` je
bacao. Popravka je u backendu, pa je i web dobio funkciju bez ijedne izmene u
`apps/web`. Uz nju i zamka `Z12` (ustajao `pages` dokument posle selidbe grane).

### P6 — Pamćenje stanja, undo/redo, kontrola push-a (`cf7c3b7`, revizija `f6c839f`)

Tema i aktivan startup preživljavaju restart (`lib/device-prefs.ts`,
`SecureStore`); zapamćen startup se obnavlja **tek posle serverske potvrde
članstva** (nova `startups.isCurrentMember`, koja za ne-člana ne baca). Undo je
postao **stek** (20 stavki) sa ekranom „Istorija radnji". Push se može isključiti
na uređaju, trajno, i to preživi restart.

### P7 — Ostatak sitnog, revizija cele liste, zatvaranje (ova faza)

Osam preostalih sitnica: više priloga odjednom na stranici, ikonica i naziv
oblasti u kanalu (zaglavlje **i** lista), pun kalendar za rok pri kreiranju,
sadržaj beleške pri kreiranju, pregled videa/audia i „Preuzmi" u pregledaču
priloga, „Sastav nedelje" na Pulsu, spisak tima za ne-admina, poruka o odsecanju
na 100 zahteva. Plus tabela ishoda za svih 44 stavke i dvostruki lov na mrtav kod
nad celim lancem.

---

## 2. Šta NIJE urađeno i zašto

| Šta | Zašto | Gde je zapisano |
|---|---|---|
| **Kanban „Tabla" za zadatke** (D17) | `00-PLAN.md` Faza 2 doslovno kaže „svajp gestovi umesto drag-and-drop kanbana"; funkcija (grupisanje po statusu sa brojačem + promena statusa) POSTOJI, samo je vertikalna (`zadaci.tsx:173`, `:388`, `:248`); pet kolona sa horizontalnim skrolom na 360dp je prepis IZGLEDA, ne funkcije | `ZA-POPRAVKU.md` §14 |
| **Piker oblasti u sheet-u kreiranja** (D15) | Web piker je `disabled` kad postoji `target.areaId`, a sva tri mounta mobilnog sheeta prosleđuju konkretnu oblast. Globalni ulaz („Novi zadatak") mobilni VEĆ ima sa izborom oblasti. Dodati piker gde ga web zaključava = udaljiti se od weba. Urađeno je ono što je falilo: sheet sada KAŽE u kojoj oblasti pravi stavku | revizija, red D15 |
| **Redo („vrati poništeno")** (C12) | Tri razloga: gest koji redo leči (`Ctrl+Z` u prazno) na telefonu ne postoji — svako poništavanje je tap na IMENOVANO dugme; tačan redo traži da se inverz gradi iz odgovora servera za svaki od 23 člana `UndoAction`; web sam nema globalan redo u UI-ju | `ZA-POPRAVKU.md` §12 |
| **Undo stek ne preživljava restart** | Postojanost je za POSTAVKE (idempotentne), ne za nameru („poništi baš OVU radnju") — posle restarta bi dugme izgledalo ispravno pa dalo grešku bez konteksta. Web undo isto ne preživljava reload | `ZA-POPRAVKU.md` §13 |
| **Merni gejt editora beleške** | Agent nema uređaj. Gejt je od P2 **važniji**, ne manje važan — bundle je porastao (~680 KB) | `ZA-POPRAVKU.md` §2 |
| **„Sastav dana" na tabu „Danas"** | Nov nalaz P7, van sekcije D i van zadatka faze. `DaySummary` već prikazuje ista tri broja, pa je razlika vizuelna. Posle P7 primitiv postoji, pa je posao ~8 linija — **odluka je korisnikova** | revizija, sekcija H |
| **Navigacija između priloga u pregledaču („1 od 5")** | Nov nalaz P7, van sekcije D. Traži da `FilePreview` primi celu listu umesto jednog priloga + gest — nije jednolinijska izmena | revizija, sekcija H |
| **`expo-video`** | Dodavanje native modula čini nov development build obaveznim za ceo ostatak faze — dev klijent bez modula pukne na `import`, pa korisnik ne bi mogao da isproba **ni jednu drugu** izmenu dok ne prebildruje. `WebView` sa `<video controls>` radi u postojećem buildu | `ZA-POPRAVKU.md` §15 |

---

## 3. Native build — kada je obavezan

**Zbog P7: NIJE.** `apps/mobile/package.json` u P7 nije menjan, pa je Metro reload
dovoljan za sve P7 izmene.

**Zbog P2: JESTE, ako dev build na uređaju potiče od pre P2.** P2 je dodao pinovane
Tiptap pakete i vite (spisak: `docs/mobile/lanac6/NATIVE-BUILD.md`). Uz to tentap
ima native deo (`android/build.gradle`, `ios/TentapUtils.m`) — ako dev build
potiče od pre commit-a `3efa76c`, nov build je potreban i zbog toga.

Provera u jednoj rečenici: ako se ekran beleške otvori i traka alata se pojavi kad
klikneš u telo — build je dovoljno nov.

---

## 4. Šta čovek MORA sam da proveri na fizičkom telefonu

**Nijedna T-lista iz ovog lanca nije čekirana.** Ništa nije pokrenuto ni na
uređaju ni u emulatoru — verifikacija je bila `tsc` + `lint` + `npm test` +
`build` + dve skripte za mrtav kod. To hvata „ne kompajlira" i „nedostupno je", ne
hvata „ne radi na uređaju".

### 4.1 Prvo i najvažnije — merni gejt editora (`ZA-POPRAVKU.md` §2)

Na fizičkom iPhone-u **i** na jeftinom/starijem Androidu, nad **pravim ekranom
beleške** („Prostor" → bilo koja beleška, ne proba):

| Mera | Prag |
|---|---|
| cold `Ready` (od navigacije do editora) | < 1.5 s (ili prihvatljivo uz skeleton) |
| `Warm` (re-init bez reload-a stranice) | < 500 ms |
| keystroke → slovo na ekranu | neprimetno |
| tastatura ne prekriva kursor na dnu (~2000 reči) | da |

Ako **padne** → plan B je markdown u native `TextInput` (opisan u §2), i to je
odluka koja se donosi zajedno, ne prećutno.

### 4.2 P7 — nove površine (T1–T16, `IZVESTAJ.md` sekcija P7 §6)

Najrizičnije prvo:

1. **Video prilog** → tap u fajl-oblačiću mora dati plejer **u aplikaciji** sa
   kontrolama, ne sistemski browser i ne crn pravougaonik. Ako ne radi: „Preuzmi"
   u zaglavlju je izlaz, a odluka o `expo-video` se otvara kao zaseban zadatak.
2. **Serija priloga** → izaberi 3 fajla iz galerije: sva tri stižu, redom,
   indikator ne trepće. Sa fajlom > 50 MB: Alert imenuje BAŠ taj fajl.
3. **Kalendar iznad sheeta kreiranja** → sistemsko „nazad" na Androidu mora da
   zatvori SAMO kalendar, a sheet da ostane sa unetim podacima.
3b. **Sheet kreiranja → upiši naslov → „Otkaži" → otvori ponovo** → obrazac mora
   biti PRAZAN. (Promena iz `rn-review`-a: do P7 je nacrt preživljavao zatvaranje
   i iskakao pod pogrešnim zaglavljem. Cena je da dodir po backdrop-u gubi nacrt —
   ako se to u upotrebi pokaže kao problem, reci, jer je to onda odluka a ne bug.)
4. **Sadržaj beleške pri kreiranju** → posle „Dodaj" beleška se otvara sa TIM
   tekstom, a web ga vidi kao pasuse.
5. **Ne-admin nalog** → tab „Više" ima „Članovi tima", a NEMA „Pozivnice",
   „Lozinke", „Administracija"; unutra nema ni dugmeta za brisanje ni „Dodaj
   člana".
6. **Kanal oblasti** → ikonica i boja oblasti, podnaslov „Kanal oblasti · Dev",
   ista ikonica i u listi razgovora.
7. **Puls** → traka ispod navigacije nedelje, udeli odgovaraju karticama ispod.
8. **> 100 zahteva za ugnježdavanje** → poruka u OBA segmenta.

### 4.3 P1–P6 — T-liste koje su ostale neoznačene

Sve su u `docs/mobile/lanac6/IZVESTAJ.md`, po fazi (sekcija „Provera prstom").
Redom po riziku:

- **P2 (editor):** beleška sa tabelom se uređuje i tabela **preživi** snimanje;
  ubacivanje slike iz galerije i priloga u telo; blok koda; uvoz CSV/XLSX; alatke
  tabele u traci kad je kursor u ćeliji.
- **P3 (chat):** članovi privatnog kanala (dodaj/ukloni + „Poništi"); serija
  priloga; video iz galerije; `@` u sredini teksta; izmena poruke sa prilogom
  posle 15 min (mora dati objašnjenje, ne tišinu).
- **P6 (stanje):** ubij aplikaciju i pokreni je — tema i aktivan startup ostaju,
  bez treptaja. Isključi push na uređaju, restartuj — ostaje isključen.
- **P5 (struktura):** premeštanje stranice u drugu oblast POD određenu stranicu —
  kartica mora da sleti u NOVU oblast (zamka Z12); „Poništi" posle toga.
- **P4 (kanvas):** oznaka veze i boja čvora se vide na kanvasu.

### 4.4 Okruženje — dve stvari koje su već koštale po noć

- **`EXPO_PUBLIC_WEB_URL`** mora biti dostupan **sa uređaja**: LAN IP za fizički
  telefon (`10.0.2.2` važi samo za Android emulator, `localhost` samo uz
  `adb reverse`). Bez toga kanvasi i pozivnica-kao-link ne rade van emulatora.
- **Port 3000** ume da bude otet od drugog projekta, i tada svaki kanvas javlja
  404 dok kod izgleda ispravan. Provera za 10 sekundi i pun postupak:
  `ZA-POPRAVKU.md` Z3, Z9.

---

## 5. Nove zamke i odluke koje ovaj lanac ostavlja

| # | Šta | Gde |
|---|---|---|
| Z10 | `try { require(...) } catch` u tuđem izvoru menja ISHOD kad ga gradi drugi bundler — pad build-a je bio sreća, jer bi uspeh tiho ugasio traku alata | `ZA-POPRAVKU.md` Z10 |
| Z11 | Punjenje forme iz živog Convex upita: `setState` u efektu je **lint greška** na webu; rešenje je `draft ?? initial` bez efekta | `ZA-POPRAVKU.md` Z11 |
| Z12 | Posle helpera koji patchuje dokument, **pročitaj dokument ponovo** — tip je isti pre i posle, pa ni `tsc` ni lint ne vide ustajao sadržaj | `ZA-POPRAVKU.md` Z12 |
| §12 | Redo na telefonu: odluka, ne propust | `ZA-POPRAVKU.md` §12 |
| §13 | Undo stek ne preživljava restart: odluka | `ZA-POPRAVKU.md` §13 |
| §14 | Kanban na telefonu: odluka, ne propust | `ZA-POPRAVKU.md` §14 |
| §15 | Video u pregledu ide kroz `WebView`, ne `expo-video` | `ZA-POPRAVKU.md` §15 |

**Metodološka pouka lanca, u jednoj rečenici:** brojač pozvanih Convex funkcija je
kroz ceo lanac ostao praktično nepromenjen, a zatvoreno je ~40 stvarnih rupa — jer
brojač ne vidi ni funkciju pozvanu samo za neke `target.kind` vrednosti (§5.7), ni
funkciju pozvanu sa pogrešne površine (K5), ni polje koje server vraća a klijent
nikad ne čita (D20). Meri se **radnja**, ne ime funkcije.
