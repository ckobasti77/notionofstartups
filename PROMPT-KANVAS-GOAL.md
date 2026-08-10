# GOAL PROMPT — kanvas mora da se vidi

**Model:** onaj najjači koji imaš, sa vizijom i computer use. Ako je to Fable 5 — Fable 5.
**Effort:** `xhigh` (ili `max` ako postoji). Ovo je dijagnoza pod neizvesnošću, ne prepisivanje koda — tu effort stvarno menja ishod.
**Režim:** puna autonomija, bez pitanja (`--dangerously-skip-permissions` ili ekvivalent).

---

```
CILJ (jedini): na Android emulatoru, u aplikaciji Devotion, na kanvas ekranu
mora da se VIDI najmanje jedan oblačić čvora. Isti kanvas na
http://localhost:3000 u browseru pokazuje četiri oblačića — na telefonu je
prazno. Tvoj posao je da to izjednačiš.

Nisi gotov dok ne napraviš screenshot emulatora na kome se oblačići vide.
Screenshot je jedini dokaz. „Popravio sam uzrok" bez screenshot-a ne važi.
Tri prethodna pokušaja su prijavila uspeh bez vizuelne potvrde i sva tri su
bila pogrešna.

--------------------------------------------------------------------------
ŠTA IMAŠ NA RASPOLAGANJU
--------------------------------------------------------------------------
- Computer use. Emulator je već otvoren na ekranu. Klikći, skroluj, pravi
  screenshot-e, restartuj aplikaciju, otvaraj terminale — radi sve sam.
- Repo: ~/Desktop/Web Dev Projects/notion-clone
- Chrome na hostu. `chrome://inspect/#devices` ti daje PUN DevTools nad
  WebView-om u emulatoru — DOM, konzola, mreža. To je najvažniji alat u ovom
  zadatku, koristi ga pre nego što išta menjaš.

--------------------------------------------------------------------------
KAKO KANVAS RADI (pročitaj pre nego što nagađaš)
--------------------------------------------------------------------------
Mobilni kanvas NIJE native. To je `WebView` nad Next.js rutom:

  apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx
      -> apps/mobile/src/lib/embed-url.ts  (gradi URL)
      -> EXPO_PUBLIC_WEB_URL + /embed/canvas/{kind}/{id}?theme=dark
      -> apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx

`apps/mobile/.env.local` ima `EXPO_PUBLIC_WEB_URL=http://10.0.2.2:3000`.
`10.0.2.2` je host mašina gledano iz emulatora.

Auth NE ide kroz URL. Native injektuje Convex token u `window.__DEVOTION_AUTH__`
kroz `injectedJavaScriptBeforeContentLoaded`, PRE učitavanja stranice. Native
zamrzava PRVI ne-null token.

--------------------------------------------------------------------------
METOD: BISEKCIJA, NE NAGAĐANJE
--------------------------------------------------------------------------
Lanac ima pet karika. Utvrdi TAČNO na kojoj puca, pa tek onda popravljaj.
Za svaku kariku zapiši dokaz (ispis komande ili screenshot). Ne prelazi na
sledeću dok prethodnu nisi dokazao.

K1. Da li Next dev server uopšte radi?
    `npm run dev` mora da bude pokrenut na hostu. Ako nije — kanvas je prazan
    i nema tu šta da se popravlja u kodu. Proveri, i pokreni ga ako treba.

K2. Da li emulator dohvata host?
    `adb shell curl -sS -o /dev/null -w "%{http_code}" http://10.0.2.2:3000`
    Ako curl ne postoji na uređaju, otvori Chrome U EMULATORU i ukucaj
    http://10.0.2.2:3000 — mora da se otvori aplikacija.
    Ako ovo padne, sumnjaj na cleartext HTTP: Android od API 28 blokira
    nešifrovani saobraćaj ako `usesCleartextTraffic` nije uključen.
    Proveri android/app/src/main/AndroidManifest.xml i network_security_config.

K3. Da li se embed stranica UOPŠTE učitava u WebView-u?
    chrome://inspect -> inspect WebView -> pogledaj DOM i Network.
    Da li je HTML stigao? Da li ima grešku u konzoli? Da li je `<body>` prazan?
    Ako se stranica ne učitava, problem je u K1/K2, vrati se.

K4. Da li embed IMA token?
    U konzoli inspektovanog WebView-a: `window.__DEVOTION_AUTH__`
    Ako je `undefined` ili `null` — TO JE UZROK. Native zamrzava prvi ne-null
    token, ali ako je `useAuthToken()` još uvek `null` u trenutku kad se WebView
    montira, zamrzne se `null` i embed nikad ne dobije auth. Convex upit tada
    vraća prazno, i kanvas je prazan — bez ijedne greške na ekranu.
    Popravka u tom slučaju: ne montiraj `WebView` dok token nije stigao
    (rani return sa spinerom), ili ga ponovo pošalji kroz most kad stigne.

K5. Da li upit vraća podatke a čvorovi se ne crtaju?
    Ako token postoji: u konzoli pogledaj šta vraća Convex upit i koliko je
    `nodes.length` u ReactFlow store-u. Ako podataka ima a ništa se ne vidi,
    problem je viewport/mere: `fitView` se izvršio pre nego što je xyflow izmerio
    čvorove, pa je kamera van grafa. Postoji `useNodesInitialized` + `didFitRef`
    u canvas-embed.tsx — proveri da li stvarno okida i da li kontejner ima visinu
    različitu od nule (WebView bez `flex:1` je visok 0px, a graf tada nema gde
    da se nacrta).

--------------------------------------------------------------------------
KAD MENJAŠ KOD
--------------------------------------------------------------------------
- Menjaj JEDNU stvar, pa odmah proveri na emulatoru. Ne pakuj pet izmena pa
  gledaj — ako uspe, nećeš znati šta je bilo.
- Posle izmene u apps/web: dovoljno je osvežiti WebView (Next ima HMR).
- Posle izmene u apps/mobile: `r` u Metro terminalu.
- Posle izmene `apps/mobile/.env.local`: Metro se MORA restartovati sa `--clear`,
  inače Expo drži staru vrednost u kešu.
- Posle izmene `apps/mobile/package.json`: potreban je NOV native build
  (`bash podesi-android.sh`), reload nije dovoljan. Ovo nas je već koštalo pola
  dana — Metro je servirao bundle napravljen pre nego što su native paketi ušli.

--------------------------------------------------------------------------
ZABRANJENO
--------------------------------------------------------------------------
- Ne dodaji nove funkcije u packages/backend. Sve mutacije već postoje.
- Ne prijavljuj uspeh bez screenshot-a emulatora sa vidljivim oblačićima.
- Ne piši „trebalo bi da sada radi". Ili radi i imaš sliku, ili ne radi.
- Ne uklanjaj postojeće funkcionalnosti da bi „pojednostavio" ekran.

--------------------------------------------------------------------------
KAD ZAVRŠIŠ
--------------------------------------------------------------------------
Napiši docs/mobile/KANVAS-DIJAGNOZA.md:
1. Na kojoj karici (K1-K5) je lanac pucao i kojim dokazom si to utvrdio.
2. Šta si tačno promenio, fajl po fajl.
3. Zašto prethodni pokušaji nisu uspeli — šta su promašili.
4. Kako da se ovo ubuduće brzo proveri (konkretne komande).

Priloži i screenshot pre i posle.
```
