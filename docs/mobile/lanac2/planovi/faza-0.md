# Faza 0 — plan: kanvasi vraćaju 404

> Pisano 2026-08-10 ~03:05, pre izvršenja. PID-ovi i status kodovi ispod su
> uhvaćeni uživo TOKOM PLANIRANJA — izvršilac ih obavezno snima ponovo (menjaju se).
> Kapija faze: screenshot emulatora sa vidljivim oblačićima na kanvasu.

## 1. Šta sam pročitao i šta sam zatekao

Pročitano: `PARITET.md` (sekcija 0), `ZA-POPRAVKU.md` (Z1, Z2), `00-PLAN.md` §5.2,
`PROMPT-KANVAS-GOAL.md` (K1–K5), `apps/web/app/embed/canvas/[kind]/[id]/{page,canvas-embed,embed-node}.tsx`,
`apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx`, `apps/mobile/src/lib/embed-url.ts`,
`apps/mobile/.env.local`, `apps/web/next.config.ts`, oba `package.json`, git istorija obe paritet grane.

Zatečeno (dokazi snimljeni tokom planiranja):

| Karika | Nalaz | Dokaz |
|---|---|---|
| Port 3000 | **tuđi projekat `alati`** — PID 19484, cmd `...\alati\node_modules\next\dist\server\lib\start-server.js` | `netstat -ano` + `Get-CimInstance Win32_Process` |
| Port 3001 | Devotion — tiho pobegao jer je 3000 zauzet (PID 27488, cmd sadrži `notion-clone`) | isto |
| `GET /embed/canvas/ideas/proba` | **3000 → 404, 3001 → 200** | `curl.exe -s -o NUL -w "%{http_code}" ...` |
| Emulator | `emulator-5554` živ; `com.devotion.app` instaliran; ekran 1080×2424 | `adb devices`, `pm list packages`, `wm size` |
| Metro | radi na 8081 (PID 6300) — ne dirati | `netstat` |
| `apps/mobile/.env.local` | `EXPO_PUBLIC_WEB_URL=http://10.0.2.2:3000` — ISPRAVNO, ne dirati | pročitan |
| Embed ruta | postoji, sve 4 vrste; bez injekcije renderuje „**Ovaj prikaz radi samo u Devotion aplikaciji.**" | `page.tsx:24`, `canvas-embed.tsx:181` |
| Mobilni ekran kanvasa | ispravan: gejt na zamrznuti token (`[id].tsx:242`), memoizovan `source` (:129) i `injectedAuth` (:137), `onHttpError` daje baš „Greška 404." (:299) | pročitan |

**Ključni nalaz koji menja plan.** Postoji grana `paritet-20260810-0159` (raniji,
prekinuti pokušaj lanca); njen commit `51d1a91` nosi VEĆ DOKAZANU dijagnozu i
popravku od noći 09.08. (grana `ui-nocni-20260809-0931`):

- `apps/web/next.config.ts` + **`allowedDevOrigins: ["10.0.2.2"]`** (6 linija);
- pun `KANVAS-DIJAGNOZA.md`: Next 16 dev **403-uje `/_next/webpack-hmr` websocket**
  za origin van allowlist-a; React-ov debug kanal u dev-u ide baš tim socketom,
  pa **hidracija visi zauvek** — SSR „boot" div, nula grešaka na ekranu i u konzoli.
  Čita se sa: `git show paritet-20260810-0159:docs/mobile/KANVAS-DIJAGNOZA.md`.

Trenutna grana **NEMA tu popravku** (grep `allowedDevOrigins` po repou: 0 pogodaka).
Dakle, dva uzroka, oba poznata:

1. na 3000 sluša `alati` → svaka `/embed/*` ruta 404 (poruka „Greška 404." u aplikaciji);
2. i kad Devotion stane na 3000, bez `allowedDevOrigins` kanvas je **prazan bez
   ijedne greške** (hidracija visi) — zamka koja je već pojela tri pokušaja.

Ko popravi samo (1), pada na (2) i pomisliće da je „bag u kodu". Nije.

Iz liste sekcije 0 ništa nije čekirano; korak „utvrdi šta drži port" je faktički
gotov (gore) — izvršilac ga samo ponovo snima uživo. U kodu embeda, mobilnog
ekrana i backenda **ne menja se ništa**.

Napomena: grana 0159 je i prepisala `canvas-embed.tsx` na desktop komponente i
obrisala `embed-node.tsx` (533 linije). To NIJE deo Faze 0 i ne prenosi se —
tekuća verzija (eksplicitne dimenzije čvora, ghost podrška iz `fd625ae`) crta ispravno.

## 2. Redosled koraka

Svaki korak ostavlja dokaz za `KANVAS-DIJAGNOZA.md`. Screenshotovi idu u
`docs/mobile/kanvas-dijagnoza/` (ista konvencija kao na grani 0159).
`[adb]` = `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.

**D1 — snimi zatečeno stanje (bez izmena).**
`netstat -ano | findstr ":3000 :3001"` → PID-ovi; za svaki
`Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | % CommandLine`;
`curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/ideas/proba`
(očekivano 404) i isto za 3001 (očekivano 200). Ispisi idu doslovno u dijagnozu.

**D2 — „pre" screenshot iz aplikacije** (dok je uljez još živ — bez ovoga nema para pre/posle):
`[adb] shell am force-stop com.devotion.app` → `[adb] shell monkey -p com.devotion.app 1` →
navigacija tap-petljom (§6): donji tab **Više** → stavka **Ideje** → u zaglavlju
ekrana Ideje **ikona kanvasa** (LayoutGrid, gore desno) → ekran Canvas.
Očekivano: „Canvas se ne može učitati — Greška 404." →
`[adb] shell screencap -p /sdcard/s.png` + `[adb] pull /sdcard/s.png docs/mobile/kanvas-dijagnoza/pre.png`.
Ako aplikacija traži prijavu → §4(d).

**I1 — ugasi uljeza i zalutalog Devotiona.**
`Stop-Process -Id <pid-3000> -Force` (alati) i `Stop-Process -Id <pid-3001> -Force`
(Devotion na 3001 — mora umreti da bi svež start zauzeo 3000). `alati` se NE
pokreće ponovo (tuđ dev server, gašenje bez gubitka podataka; zabeležiti u
dijagnozu da ga korisnik po potrebi sam digne na drugom portu).
Dokaz: `netstat -ano | findstr ":3000 :3001"` → prazno.

**I2 — `apps/web/next.config.ts`: dodaj `allowedDevOrigins`.** Tačan hunk
(istovetan dokazanoj popravci; uporediti sa `git show 51d1a91 -- apps/web/next.config.ts`) —
odmah posle `poweredByHeader: false,`:

```ts
  // Android emulator (canvas WebView i Chrome u njemu) prilazi dev serveru kao
  // http://10.0.2.2:3000. Bez ovog allowlist-a Next 16 vrati 403 na
  // /_next/webpack-hmr websocket, React-ov debug kanal (koji ide tim socketom)
  // nikad ne poteče i hidracija visi zauvek — prazna stranica bez greške.
  // Samo dev; detalji u docs/mobile/KANVAS-DIJAGNOZA.md.
  allowedDevOrigins: ["10.0.2.2"],
```

Razlog: bez ovoga je kanvas prazan i posle ispravnog servera (dokazano na 0159).

**I3 — `apps/web/package.json`: `"dev": "next dev"` → `"dev": "next dev -p 3000"`.**
Razlog: da sledeće otimanje porta OBORI start glasno, umesto tihog bežanja na
3001 (tihi drift je koštao noć pogrešne dijagnoze). Empirijska provera u I6;
ako Next 16 i sa eksplicitnim `-p` tiho bira drugi port — izmenu VRATITI.

**I4 — `npm run check` iz root-a** (lint + build), PRE podizanja dev servera
(build i dev da se ne preklapaju nad `.next`). Očekivano: prolazi (izmene su
6 linija konfiga + 1 linija skripte). Padne li na nečemu nevezanom → §4(b).

**I5 — digni Devotion na 3000 tako da preživi kraj agent-sesije:**
`Start-Process -FilePath cmd.exe -ArgumentList '/c cd /d "C:\Users\admin\Desktop\Web Dev Projects\notion-clone" && npm run dev' -WindowStyle Minimized`
→ petlja do 120 s: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/ideas/proba`
dok ne vrati **200** (prvi pogodak kompajlira rutu — ume da potraje).
Dokaz identiteta: `netstat` → PID na 3000 → `CommandLine` sadrži `notion-clone`.

**I6 — provera pina iz I3:** iz root-a pokreni DRUGI `npm run dev --workspace @devotion/web`
na sad zauzet 3000. Očekivano: glasna greška i izlaz (to i hoćemo). Ako tiho
startuje na 3001 → ubij ga, vrati I3, zabeleži u dijagnozu. Glavni server iz I5 ne dirati.

**P1 — A/B proba hidracije u emulatoru, BEZ aplikacije:**
`[adb] shell am start -a android.intent.action.VIEW -d "http://10.0.2.2:3000/embed/canvas/ideas/proba" com.android.chrome`
→ ~8 s → screencap → pročitaj sliku. **Mora da piše „Ovaj prikaz radi samo u
Devotion aplikaciji."** — jednim udarcem dokazuje: pravi server + emulator
dohvata host + hidracija radi. Sačuvaj kao `chrome-emulator-posle.png` (pokriva
i kvadratić „10.0.2.2 je Devotion"; po želji otvori i koren `http://10.0.2.2:3000`).
Prvi start Chrome-a ume da traži „Accept & continue" — tap pa ponovi.
Prazno/sivo umesto poruke → §4(c).

**P2 — kanvas u aplikaciji + FINALNI DOKAZ:**
`force-stop` + `monkey` relaunch → ista navigacija kao D2 → sačekaj da spiner
nestane (ruta je već topla iz I5). Očekivano: tačkasta pozadina + oblačići.
Screencap → `docs/mobile/kanvas-dijagnoza/posle.png`. **Na slici mora biti bar
jedan oblačić.**
Ako je kanvas ispravan ali PRAZAN (nema čvorova, nema greške) — to je stanje
podataka, ne kvar: na rail-u tap **„Nova ideja"** → naslov (npr. „Faza 0 dokaz")
→ sačuvaj → oblačić se pojavi → screenshot. (Autor svoju ideju vidi odmah.)
Opciono i Misli: Više → **Misli** → kanvas → `posle-misli.png`.

**P3 — dokumentacija i čekiranje (isti commit kao kod):**
1. **`docs/mobile/KANVAS-DIJAGNOZA.md`** (nov na ovoj grani): oba uzroka; ispisi
   iz D1; kako je utvrđeno; mehanizam hidracije sažeto uz uput
   `git show paritet-20260810-0159:docs/mobile/KANVAS-DIJAGNOZA.md` za pun trag;
   pre/posle slike; „provera za 10 sekundi" (dole).
2. **`docs/mobile/ZA-POPRAVKU.md`** — dve nove zamke + sitnica:
   - **Z3 — port 3000 ume da bude otet** (npr. projekat `alati`): Devotion tada
     tiho pobegne na 3001, telefon i dalje gleda u 3000 → sve `/embed/*` 404.
     Provera za 10 s: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/embed/canvas/ideas/proba`
     → `200` = Devotion; `404` = uljez; ništa = server ne radi. Dev skripta
     zakucana na `-p 3000` da otimanje pada glasno; ako `npm run dev` javi
     „port in use" a provera vraća 200 — server VEĆ radi, ne diraj.
   - **Z4 — `allowedDevOrigins` je OBAVEZAN za pristup sa emulatora**: bez
     `10.0.2.2` Next 16 dev 403-uje HMR websocket i hidracija visi (prazno,
     nula grešaka). Fizički telefon preko LAN-a → dodati i taj IP u isti niz.
     Važi samo za dev server.
   - Sitnica (ne dirano sada): docstring `apps/mobile/src/lib/embed-url.ts` još
     opisuje ukinuti `ready`/`auth` handshake — ispraviti u prvoj fazi koja dira mobilni kod.
3. **`docs/mobile/PARITET.md` sekcija 0**: na vrh sekcije red
   `**REŠENO 2026-08-10** — uzroci: (1) 'alati' na 3000, (2) bez allowedDevOrigins; vidi KANVAS-DIJAGNOZA.md; dokaz: kanvas-dijagnoza/posle.png`,
   pa čekirati svih 6 kvadratića; poslednji („ako i posle ovoga ne crta — bisektuj")
   čekirati uz dopis „— nije se steklo: kanvas crta (posle.png)".

**P4 — commit.** Jedan commit: `apps/web/next.config.ts`, `apps/web/package.json`
(ako je I3 opstao), `docs/mobile/KANVAS-DIJAGNOZA.md`, `docs/mobile/kanvas-dijagnoza/*.png`,
`docs/mobile/ZA-POPRAVKU.md`, `docs/mobile/PARITET.md`. Poruka:
`Faza 0: Devotion vraćen na 3000 + allowedDevOrigins za emulator — kanvas se crta`.
`IZVESTAJ.md`, `paritet-lanac.ps1` i `logovi/` ne dirati ručno — njih vodi skripta.

## 3. Kako se ishod postiže prstom

Faza 0 ne uvodi nijedan novi ekran ni obrazac — odčepljuje već izgrađen put:
donji tab **Više** → **Ideje** (native lista) → ikona kanvasa u zaglavlju
(44 pt meta) → kanvas u WebView-u: pan/zoom prstima, tap na oblačić → native
bottom sheet detalja, rail dole (Nova ideja / zum / uklopi sve). Za Misli:
Više → **Misli** → isti kanvas ekran. Ništa sa weba se ne prevodi u ovoj fazi —
obrasci već postoje i prate tabelu prevoda iz PARITET.md.

## 4. Šta može da pukne i šta onda

- **(a) 3000 ponovo zauzet u trenutku izvršenja** (alati restartovan): ponovi
  D1+I1. NIKAKO ne prebacivati `EXPO_PUBLIC_WEB_URL` na 3001 — traži Metro
  restart sa `--clear` i vraća tihi drift.
- **(b) `npm run check` padne** na nečemu nevezanom za ove izmene: tačan ispis
  u ZA-POPRAVKU, faza se NASTAVLJA (kapija faze je screenshot; sekcija B
  PARITET-a se zatvara na nivou lanca). Ako je pad od ovih izmena — popraviti odmah.
- **(c) P1 prazno umesto poruke**: hidracija i dalje visi → CDP bisekcija po
  receptu sa 0159 (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`,
  `Runtime.evaluate`: ima li `__reactFiber$*` ključeva; ima li `[HMR] connected`).
  HMR konektovan a boot div stoji → nov uzrok → tek tada K3–K5 iz
  `PROMPT-KANVAS-GOAL.md`, jedna izmena po koraku.
- **(d) Aplikacija traži prijavu** (sesija istekla): kredencijala u repou nema i
  NE izmišljaju se → blokator u ZA-POPRAVKU + dijagnozu, faza staje. Pre toga
  probati samo relaunch; NIKAD `pm clear` (briše i sesiju).
- **(e) „Nova ideja" mutacija padne** u P2: Convex dashboard logovi; Misli kanvas
  kao alternativni dokaz; zapisati.
- **(f) U aplikaciji i dalje 404 dok je emulator-Chrome OK**: stari WebView keš →
  još jedan force-stop + relaunch. Ne `pm clear` (vidi (d)).
- **(g) Metro mrtav**: `Start-Process` istim šablonom sa `npm run dev:mobile`, pa
  relaunch aplikacije.
- **(h) Korumpiran PNG**: PowerShell `>` je UTF-16 — isključivo
  `screencap /sdcard/s.png` + `adb pull`, nikad `exec-out >` iz PowerShell-a.

## 5. Šta NEĆU raditi i zašto

- **Ne prenosim preradu embeda sa grane 0159** (desktop komponente čvorova,
  brisanje `embed-node.tsx`): nije uslov da se kanvas vidi; sudara se sa ghost
  izmenama (`fd625ae`); pripada fazi koja se bavi kanvasom (A1/A4).
- **Ne diram `apps/mobile`** — dokazano ispravan. Zato NEMA unosa u
  `lanac2/NATIVE-BUILD.md` (package.json netaknut) i nema mobilnog `tsc`.
- **Ne diram backend** — nula izmena u `packages/backend`.
- **Ne diram `.env.local`** — `EXPO_PUBLIC_WEB_URL` je ispravan.
- **Ne gasim Metro**, ne pravim nov native build — nepotrebno.
- **Sekcija Z u PARITET.md ostaje netaknuta**: Faza 0 ne odlučuje ni o jednoj
  `api.X.Y` funkciji, pa nema kandidata za izuzetke — sve gore je odluka o obimu
  faze, zapisana ovde i u dijagnozi, ne izuzetak funkcionalnosti.

## 6. Kako dokazujem da radi

| # | Tvrdnja | Test | Prolaz |
|---|---|---|---|
| 1 | Utvrđeno šta drži 3000 | D1 ispisi u dijagnozi | cmd linija procesa imenuje projekat |
| 2 | Devotion na 3000 | `curl` embed → `200` + `CommandLine` sadrži `notion-clone` | oba uslova |
| 3 | Uljez ugašen | `netstat :3000` posle I1 prazan; posle I5 samo Devotion | ispisi |
| 4 | Emulator vidi pravi server i hidrira | P1 slika | tekst „radi samo u Devotion aplikaciji" čitljiv |
| 5 | **Kanvas crta** | P2 `posle.png` | **≥1 oblačić vidljiv — kapija cele faze** |
| 6 | Pin porta radi | I6 ispis | glasna greška na zauzet port (ili I3 vraćen + zabeleženo) |
| 7 | Buduća provera za 10 s | Z3 komanda u ZA-POPRAVKU + dijagnozi | fajlovi u diff-u |
| 8 | Bez regresije builda | `npm run check` | prolaz (ili (b) izuzetak zapisan) |
| 9 | PARITET ažuriran u istom commitu | `git show --stat` | kod + docs zajedno |

Navigaciona petlja za D2/P2 (nema computer use): `screencap` → pročitaj sliku →
nađi metu („Više" tab dole desno; stavka „Ideje"; LayoutGrid ikona gore desno;
rail dugme) → `[adb] shell input tap <x> <y>` → nova slika za potvrdu.
Koordinate se čitaju sa svake slike iznova (ekran 1080×2424); između korakā ~2 s,
posle otvaranja kanvasa do 3 pokušaja sa po ~5 s.
