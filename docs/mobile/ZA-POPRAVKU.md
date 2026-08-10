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
