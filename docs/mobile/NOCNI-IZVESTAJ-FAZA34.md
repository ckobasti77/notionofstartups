# Noćni izveštaj — Faza 3 (ostatak) i Faza 4

> Radio sam sam po `docs/mobile/zadaci/lanac-faza-3-4.md`, grana `faza-3-nocni`.
> Detaljan tok je u `NOCNI-LOG.md` (blok po koraku). Ovo je sažetak za jutro.

## Rezime

**Koraka gotovo: 6/6.** Svih šest je odrađeno; dva imaju iskren delimičan deo
(korak 4 pokriva `ideas` kanvas end-to-end, ostale vrste čekaju backend plumbing;
sitni izuzeci po koracima dole). Posle svakog koraka: `tsc --noEmit` (apps/mobile)
= 0 i `npm run check` (root, uklj. `next build`) = 0. Svaki mobilni ekran je prošao
`rn-review`, web embed `web-review`; nalazi popravljeni u zasebnim commit-ovima.

## Po koracima

1. **M3.3 Tabele i prilozi** — GOTOVO. `stranica/[id]` grana po `kind`: tabela
   (zamrznuta prva kolona + horizontalni skrol, tap ćelije → bottom sheet,
   paginacija, dodaj/obriši red i kolonu), fajlovi (upload galerija/kamera/
   dokument, pregled slike/PDF u app-u, ostalo sistemski, brisanje uz potvrdu).
   Preskočeno: uvoz Excela (web-only, spec izuzetak), reorder priloga, `note`
   editor (zaseban kolosek).

2. **M3.4 Pretraga** — GOTOVO. Full-screen ekran iz ikonice u headeru;
   `search.pages` (Zadaci + Stranice) i `chat.searchMessages` (Poruke), debounce,
   dva prazna stanja. Preskočeno: Ideje i Misli (nemaju search indeks; backend je
   bio van dozvoljenog opsega ovog koraka).

3. **M4.1 Odobrenja** — GOTOVO. Objedinjene kartice iz tri izvora (brisanje sa
   glasanjem, ugnježdavanje ideja, ugnježdavanje stranica); živi badge u „Više";
   potvrda za sve nepovratne radnje. Preskočeno: read-only pregled sopstvenih
   zahteva / istorije (web ih ima; mobilni fokusiran na ono što čeka moju odluku).

4. **W4.2 Embed rute za canvas** ⚠️ jedini web korak — GOTOVO za `ideas`,
   DELIMIČNO za ostale. `/embed/canvas/[kind]/[id]?token=&theme=` sa token-auth,
   chrome-less `@xyflow/react`, postMessage protokolom (+ zoom/fit). Verifikovano
   u browseru (token-klijent stvarno gađa backend; error boundary radi).
   DELIMIČNO: `thoughts`/`area`/`page` — infrastruktura tu, dohvat podataka za njih
   nije povezan (svaki traži svoj kontejner-nivo plumbing).

5. **M4.3 Mobilni canvas** — GOTOVO (za `ideas`). Native header + `WebView` nad
   embed rutom + native rail (zoom/centriraj/nova ideja); tap na čvor → native
   bottom sheet sa detaljem + glasanje; tema kroz postMessage; swipe-back isključen.
   Preskočeno: `[⛶]` landscape (traži `expo-screen-orientation`).

6. **M4.4 Ideje i admin** — GOTOVO. Ideje: native lista + glasanje + dugme Canvas.
   Admin (skriveno ne-adminima): Članovi tima, Pozivnice (kreiranje + opoziv).
   Preskočeno: kopiranje koda pozivnice (`expo-clipboard` nije instaliran → Alert).

## BLOKADE

Nema tvrdih blokada koje zaustavljaju rad. Stvari koje traže **tebe (Jovan)**:

- **`EXPO_PUBLIC_WEB_URL`** — dodaj u `apps/mobile/.env.local` (web origin gde je
  `/embed`; u dev-u `http://<LAN-IP>:3000`, ne localhost). Bez toga mobilni canvas
  pokaže jasnu grešku umesto belog ekrana. Placeholder nisam mogao da commit-ujem
  jer `.gitignore` ignoriše `.env*` — dokumentovan je u kodu.
- **Ostale vrste kanvasa u embed-u** (`thoughts`/`area`/`page`) — sledeći web
  posao, po uzoru na `ideas` (dohvat + mapiranje čvorova po vrsti).
- **Web paritet za pretragu poruka** — `chat.searchMessages` postoji, mobilni ga
  koristi, ali web `search-dialog.tsx` ga još ne prikazuje.

## Odluke koje sam doneo sam

- **Kamera bez `expo-camera`** — `ImagePicker.launchCameraAsync` pokriva „slikaj"
  bez teškog paketa.
- **Tabela: apsolutne pozicije na klijentu** — embed sabira relativne offsete uz
  lanac roditelja umesto ReactFlow parent/child grafike (jednostavnije, robusnije).
- **Pretraga bez ideja/misli** — umesto lažnih praznih grupa, iskreno izostavljene
  jer nemaju search indeks (backend van opsega koraka 2).
- **Odobrenja: potvrda i za „Protiv"/„Odbij"** — jer jedan takav glas trajno
  zatvara tuđi zahtev (spec: potvrda za nepovratne radnje).
- **Embed je RN-WebView-only** — iframe fallback uklonjen jer `frame-ancestors
  'none'` (globalni `next.config.ts`) i tako blokira framing.
- **Tema: native je autoritet** — WebView-u se tema šalje postMessage-om na `ready`
  (root `ThemeProvider` inače pregazi query param).

## Šta Jovan mora vizuelno da proveri

Nemam uređaj ni `EXPO_PUBLIC_WEB_URL`, pa mobilni UI nije viđen na ekranu —
proveri na telefonu:

1. **Tabela** (`stranica` tipa tabela): zamrznuta prva kolona dok skroluješ
   ostale desno; tap ćelije → sheet; dodaj/obriši red i kolonu (kao autor).
2. **Prilozi** (`stranica` tipa fajl): upload iz galerije/kamere/dokumenata;
   slika i PDF se otvore u app-u; ostalo kroz sistemski otvarač; brisanje.
3. **Pretraga**: ikona u headeru → kucaj → grupe Zadaci/Stranice/Poruke; tap vodi
   na pravi ekran; tastatura ne krije rezultate.
4. **Odobrenja** (Više): badge broj; glasanje jednim tapom; potvrde iskaču.
5. **Canvas** (Ideje → Canvas): WebView graf, pan/zoom, rail dugmad rade, tap na
   čvor → sheet sa glasanjem; tema prati aplikaciju; „nazad" dugme (nema swipe).
6. **Ideje/Pozivnice**: glasanje u listi; kreiranje pozivnice pokaže kod jednom;
   opoziv; admin stavke se ne vide ne-adminu.

## Šta bih uradio drugačije / gde sam nesiguran

- **Embed tema** — rAF re-assert je pragmatičan, ali pravo rešenje je zaseban
  layout za `/embed` bez root `ThemeProvider`-a; App Router to ne da lako
  (nested layout ne beži iz root-a). Vredi razmisliti o `route group`-i.
- **Duplo dohvatanje `ideas.list`** — i WebView i native ekran ga zovu (graf vs
  detalj čvora). Radi i realtime je, ali bi se moglo objediniti (native prosledi
  detalj kroz postMessage umesto ponovnog upita).
- **Token u URL-u** — po spec-u (§5.2), ali bezbednije bi bilo poslati ga
  postMessage-om posle učitavanja (bez tokena u URL/logu). Ostavljeno po spec-u.
- **Canvas kreiranje ideje** — trenutno bez pozicije (server bira); na grafu bi
  bilo lepše ubaciti u centar trenutnog viewporta (traži još jednu poruku iz
  WebView-a sa koordinatama).
