# Mobilna aplikacija — master plan

> Status: nacrt za odobrenje. Ništa se ne kodira dok se odluke iz sekcije
> „Otvorene odluke" ne zaključaju.
>
> Odluke donete: pun port svih funkcionalnosti · iPhone dostupan za testiranje ·
> chat po hibridnom modelu (kanali + threadovi na entitetima).

---

## 1. Cilj

Native Android i iOS aplikacija koja pokriva sve što desktop verzija radi, plus
chat između članova tima i skup funkcija koje postoje isključivo na telefonu —
pre svega **prepoznatljivo zvono po tipu događaja**.

Ovo nije "sajt upakovan u aplikaciju". Ovo je drugi klijent nad istim backendom.

---

## 2. Šta se zadržava, šta se piše iznova

### Zadržava se u potpunosti (nula izmena)

Ceo `convex/` folder. 43 tabele, sva poslovna logika, sva pravila pristupa:

- `startups`, `startupMembers`, `startupAreas`, `invites` — članstva i pozivnice
- `pages`, `pageBodies`, `taskCheckpoints`, `taskAssignees` — beleške i zadaci
- `pageTableColumns`, `pageTableRows`, `pageFiles` — tabele i prilozi
- `ideaCanvases`, `ideaNodes`, `ideaVotes`, `ideaEdges` — ideje
- `thoughtCanvases`, `thoughtNodes`, `thoughtEdges` — misli
- `pageCanvases`, `pageCanvasPlacements`, `pageCanvasEdgesV2` — canvas oblasti
- `deletionRequests`, `deletionBallots`, `nestingRequests`, `pageNestingRequests` — odobrenja
- `notifications`, `pushSubscriptions`, `activities` — obaveštenja i aktivnost

Pomoćnici `requireProfile`, `requireStartupMember`, `requireAdmin`,
`requireProfileInStartup` iz `convex/lib/auth.ts` rade identično iz mobilnog
klijenta. Nema drugog auth sloja.

**Ovo je razlog zašto je projekat izvodljiv.** Convex ima zvanični React Native
klijent sa istim `useQuery` / `useMutation` API-jem i istim realtime ponašanjem.
Backend ne zna ni ne mari ko ga zove.

### Dodaje se u backend

| Šta | Zašto |
|---|---|
| `convex/chat.ts` + 5 novih tabela | Chat sistem — detalji u `04-CHAT.md` |
| `expoPushTokens` tabela | Native push tokeni pored postojećih web push pretplata |
| `convex/expoPush.ts` | Slanje preko Expo Push API-ja, paralelno sa `push.ts` |
| Proširenje `notificationTypeValidator` | Novi tipovi: `chat_message`, `chat_mention`, `chat_dm` |

Postojeći `createNotification` u `convex/lib/notifications.ts` ostaje jedina
ulazna tačka — samo dobija još jednu granu dostave.

### Piše se iznova

Ceo UI sloj. Trenutno `components/workspace/` ima ~40 fajlova i preko 600 KB
TSX-a vezanog za DOM. To se ne prenosi — prenosi se **struktura odluka**, ne kod.

---

## 3. Struktura repozitorijuma

Preporuka: **monorepo sa npm workspaces**.

```
notion-clone/
├── apps/
│   ├── web/                 ← postojeći Next.js, pomeren netaknut
│   └── mobile/              ← novi Expo projekat
├── packages/
│   ├── backend/
│   │   └── convex/          ← jedan izvor istine za backend
│   └── shared/              ← tipovi, konstante, formatiranje, boje, kopija
├── docs/
│   └── mobile/              ← ovi dokumenti
└── package.json             ← workspaces: ["apps/*", "packages/*"]
```

**Zašto monorepo, a ne dva repozitorijuma:** `convex/_generated/api` mora da bude
bit-identičan za oba klijenta. U odvojenim repoima promeniš mutaciju na webu,
zaboraviš mobilni, TypeScript ne primeti ništa, i grešku otkriješ tek kad
korisnik klikne dugme u produkciji. U monorepou build pukne isti čas.

**Cena refaktora:**

- Vercel: Root Directory se menja na `apps/web`
- Convex: `convex.json` dobija `"functions": "packages/backend/convex"`
- `deploy-to-production` skill mora da se ažurira za nove putanje
- `tsconfig.json` path aliasi (`@/convex/*` → novi paket)

To je posao od jednog dana. Radi se na zasebnoj grani, testira se pun deploy
ciklus, pa tek onda merge. Ne dira se dok je nešto drugo u toku.

**Plan B ako je rizik neprihvatljiv:** odvojen repo `notion-clone-mobile` koji
`convex/` uvlači kao git submodule. Radi, ali svaki dan gubiš po malo na
sinhronizaciji verzija.

---

## 4. Izbor tehnologije

| Sloj | Izbor | Zašto |
|---|---|---|
| Framework | **Expo (React Native)** | Isti React + TypeScript koji već pišeš. Build u cloudu — ne treba Mac. |
| Navigacija | **expo-router** | File-based routing, radi kao App Router koji već koristiš |
| Backend klijent | **convex/react** | Isti API kao na webu, realtime radi bez dodatnog koda |
| Auth | **@convex-dev/auth** + `expo-secure-store` | Isti auth sistem, token u sigurnom skladištu umesto cookie |
| Stilovi | **NativeWind** | Tailwind sintaksa na React Native — prenosiš navike i tokene iz `globals.css` |
| Komponente | **shadcn-style, ručno** | Nema Radix na RN. Gradi se tanak sloj primitiva po uzoru na `components/ui/` |
| Rich text | **@10play/tentap-editor** | Tiptap u WebView-u sa native toolbarom — vidi 5.1 |
| Canvasi | **WebView + postojeće preview rute** | Vidi 5.2 |
| Animacije | **react-native-reanimated** | Zamena za Framer Motion; GSAP se ne prenosi |
| Ikone | **lucide-react-native** | Iste ikone kao na webu |
| Notifikacije | **expo-notifications** | Custom zvuci, kanali, timeSensitive |

### Odbačene alternative

- **Flutter** — Dart. Bacaš celo React znanje i ne možeš da deliš ništa sa webom.
- **Goli React Native (bez Expo)** — ručno konfigurisanje Xcode i Gradle build-a.
  Na Windowsu za iOS je to praktično neizvodljivo.
- **Capacitor / PWA u kutiji** — pao bi tačno na onome što je glavni razlog za
  mobilnu app: custom zvuk po tipu obaveštenja web push ne podržava ni na jednoj
  platformi.

---

## 5. Dva teška problema

Pun paritet znači da moraš da poneseš i editor i canvase. Nijedno ne postoji u
React Native ekosistemu. Evo kako se rešavaju bez šest meseci rada.

### 5.1 Rich-text editor

`components/rich-text-editor.tsx` (20 KB) je Tiptap 3 sa `starter-kit`,
`extension-table`, `extension-list`, `extensions`. Tiptap radi nad ProseMirror-om,
koji radi nad DOM-om. Na React Native DOM ne postoji.

**Rešenje: `@10play/tentap-editor`.** To je Tiptap koji se izvršava u skrivenom
WebView-u, a toolbar, tastatura i gestovi su native. Praktično:

1. Tvoje Tiptap ekstenzije se prepakuju u zaseban bundle (`editor-web/`)
2. WebView ga učita lokalno (bez mreže)
3. Sadržaj ide kroz `bridge` u oba smera
4. Autosave, revizije i konflikt-zaštita ostaju u Convexu — nedirnuto

Korisnik ne oseti razliku. Ovako rade Notion, Craft i Bear.

**Rizik:** custom node view-ovi (npr. `note-file-node.tsx`, ugrađene tabele)
moraju da se prenesu u web bundle. Procena: 1–1.5 nedelja samo za editor.

### 5.2 Canvasi

`@xyflow/react` je DOM-only i nema React Native port. Ručna reimplementacija
preko `react-native-skia` + `react-native-gesture-handler` je 4+ nedelje po
canvasu, a canvasa imaš tri (thoughts, ideas, area/page).

**Rešenje: WebView nad postojećim kodom.** U repou već postoje rute:

- `app/canvas-preview/`
- `app/codex-ideas-preview/`
- `app/codex-thought-flow-preview/`
- `app/rail-preview/`

Iz njih se izvodi `/embed/canvas/[kind]/[id]` — ista komponenta, bez sidebara,
bez chrome-a i touch-friendly kontrolama.

Mobilni ekran je onda: native header + WebView + native akcioni rail na dnu.
Komunikacija ide preko `postMessage`.

**Auth ne ide kroz URL ni kroz `postMessage` handshake.** Token bi u query stringu
završio u web access logovima i WebView istoriji, a `ready`→`auth`→`authed` handshake se
pokazao nepouzdanim (pet rundi debagovanja): most `window.ReactNativeWebView` se ubacuje
asinhrono, pa prvi `ready`/`auth` promaše pre nego što je embed-ov `message` listener
zakačen, a retry intervali samo zatrpaju log. Umesto toga native **injektuje token pre
učitavanja stranice** preko `injectedJavaScriptBeforeContentLoaded`:

```
window.__DEVOTION_AUTH__ = { token, theme }
```

Embed to pročita **sinhrono na mount-u** (SSR-safe `useLayoutEffect`) i odmah napravi
Convex klijent — bez `ready`, bez `authed`, bez timeout-a. Injekcija se izvršava pre svih
skripti stranice (WKUserScript / `evaluateJavascript`), pa nema trke. Otvoreno u običnom
browseru (nema injekcije) → jasna poruka „radi samo u aplikaciji", ne spiner. Token se
osvežava kroz most (`{type:"auth"}`) — **nekritičan** put; embed re-autentikuje u mestu
(bez rebuild-a klijenta, pa subscription i pan/zoom ostaju). Detalji: ZA-POPRAVKU Z2.

Preko mosta ostaju samo žive poruke (handshake tipovi `ready`/`authed` više ne postoje):

```
injekcija (native → web, pre učitavanja):  window.__DEVOTION_AUTH__ = { token, theme }
WebView → native:  { type: "node:open", nodeId, node }  → otvara native detalj (node = podaci čvora)
WebView → native:  { type: "selection", ids, node? }    → menja akcioni rail (node kad je izabran 1)
WebView → native:  { type: "moved", …scope, count, before } → traka „Poništi" posle pomeranja kartica
WebView → native:  { type: "resized", …scope, pageId, width, height, previous } → traka „Poništi" posle promene veličine
WebView → native:  { type: "node:actions", nodeId, node } → dugi pritisak: native sheet „Veličina kartice"
WebView → native:  { type: "viewport", …scope, x, y, zoom } → prigušen `saveViewport` (800 ms)
WebView → native:  { type: "toast", level, message }     → Alert (embed nema toast površinu)
native → WebView:  { type: "auth",  token }              → osvežavanje tokena (nekritično)
native → WebView:  { type: "theme", mode: "dark" }       → živa promena šeme
native → WebView:  { type: "mode",  value: "edit"|"view" } → režim „Uredi raspored" (lanac 4)
native → WebView:  { type: "focus", nodeId }             → centriraj čvor (na zatvaranje detalja)
native → WebView:  { type: "zoom",  direction }          → rail: uvećaj/umanji
native → WebView:  { type: "fit" }                       → rail: centriraj sve
```

`…scope` je `{ startupId, areaId, rootPageId }` — embed ga zna iz payload-a, pa native
ne mora da radi drugi upit da bi upisao poziciju ili kameru.

**Uređivanje.** Embed više nije bezuslovno read-only: u režimu „Uredi raspored"
(`mode`) čvorovi postaju povlačivi i potez se na kraju upisuje kroz `areasV2.movePages`
(jedan upis po potezu, sa „Poništi"). Izabrana **svoja** kartica uz to dobija četiri
ugaone ručke od 44pt (`areasV2.resizePage`), a dugi pritisak otvara native sheet sa
„±10%" i „Vrati podrazumevanu veličinu" (`areasV2.resetPageSize`). Van režima je sve
kao pre — pregled, navigacija i dodavanje. Pun protokol režima, uz pravila za sledeće
faze: `docs/mobile/lanac4/REZIM.md`.

`node:open` nosi i podatke čvora, pa native ne mora da radi drugi `ideas.list`
upit; `selection` sa jednim čvorom pretvara primarno dugme rail-a u „Otvori ideju".

Dobijaš pun canvas na telefonu za ~1 nedelju umesto za mesec i po. Linear, Figma
i Notion rade istu stvar za svoje najteže poglede.

**Ograničenje koje treba prihvatiti:** editovanje grafa na 6 inča je i dalje
neprijatno. Mobilni canvas je pre svega za **pregled, navigaciju i dodavanje
node-a**, ne za preuređivanje layouta. To nije tehničko ograničenje nego
ergonomsko.

---

## 6. Faze

Procene su za jednog developera sa AI asistencijom, uz postojeći backend.

### Faza 0 — Temelj · 1 nedelja

- Monorepo refaktor, Vercel i Convex deploy provereni
- Expo projekat, NativeWind, dizajn tokeni iz `globals.css`
- Convex klijent povezan, `useQuery` radi
- Auth: prijava, `expo-secure-store`, deep link za pozivnice
- Tab navigacija sa praznim ekranima
- Prvi development build na Android emulatoru i na iPhone-u

**Gotovo kad:** uloguješ se na telefonu i vidiš listu svojih startupa.

### Faza 1 — Chat i notifikacije · 3 nedelje

- Chat tabele, `convex/chat.ts`, dozvole (`04-CHAT.md`)
- Lista kanala, ekran razgovora, DM, threadovi na entitetima
- Unread badge, reakcije, prilozi
- `expoPushTokens`, `convex/expoPush.ts`
- **Finalni katalog notifikacionih kanala i zvukova** (`03-NOTIFIKACIJE.md`)
- Ekran za podešavanje obaveštenja

**Gotovo kad:** tim priča kroz aplikaciju i svako zna po zvuku šta je stiglo.

> Ovo je namerno pre taskova. Chat je jedina stvar koju desktop nema — čim
> proradi, aplikacija ima razlog da bude instalirana.

### Faza 2 — Zadaci i komandni centar · 2 nedelje

- `today` (komandni centar), `my-tasks`, `activity`
- Detalj zadatka: status, prioritet, rok, izvršioci, checkpointi
- Brzo dodavanje zadatka
- Svajp gestovi umesto drag-and-drop kanbana
- `puls` sedmični pregled

**Gotovo kad:** ceo dnevni workflow radi bez otvaranja laptopa.

### Faza 3 — Stranice i sadržaj · 3 nedelje

- Stablo oblasti i stranica (`page-tree` ekvivalent)
- Čitanje stranica
- Editor kroz tentap (5.1)
- Tabele: pregled i osnovno editovanje
- Prilozi: upload iz galerije i kamere, pregled fajlova
- Veze između stranica (`page-relations`)
- Pretraga

**Gotovo kad:** možeš da napišeš i urediš belešku na telefonu bez frustracije.

### Faza 4 — Odobrenja i canvasi · 2 nedelje

- `approvals`: deletion ballots, nesting requests, glasanje
- Canvasi kroz WebView embed (5.2)
- Ideje: lista + glasanje native, canvas u WebView-u

**Gotovo kad:** nema funkcije na desktopu koja fali na telefonu.

### Faza 5 — Mobilne supermoći · 2 nedelje

- Glasovna beleška → transkript → ideja
- Share sheet iz drugih aplikacija
- Kamera → slika table → stranica
- Home screen widget: današnji zadaci
- Face ID / otisak kao brava
- Haptika na ključnim akcijama
- iOS Live Activity za aktivan zadatak

### Faza 6 — Izlazak · 2 nedelje

- Ikone, splash, screenshotovi za obe prodavnice
- Privacy policy i data safety formulari
- TestFlight za tim, interno testiranje na Play-u
- Sentry ili sličan crash reporting
- App Store review (obično 1–3 dana, umej da bude i nedelja)

---

**Ukupno: 15 nedelja realno.** Sa razumnim buffer-om — **4 meseca** do aplikacije
u obe prodavnice. Ako se Faza 4 i 5 odlože, upotrebljiva verzija za tim postoji
posle **6 nedelja**.

---

## 7. Rizici

| Rizik | Verovatnoća | Šta radimo |
|---|---|---|
| Monorepo refaktor razbije deploy | srednja | Zasebna grana, pun deploy test pre merge-a, rollback plan |
| Editor u WebView-u je spor na starijim Androidima | srednja | Rani prototip u Fazi 0, testiranje na jeftinom uređaju |
| Android zvuk zaključan za pogrešan kanal | **visoka ako se ne isplanira** | Verzionisani ID-jevi kanala od prvog dana (`03-NOTIFIKACIJE.md`) |
| iOS custom zvuk tiho ne radi | visoka | Fiksiran format i checklist za testiranje na fizičkom uređaju |
| App Store odbije aplikaciju | niska | Nema plaćanja u aplikaciji, nema korisničkog sadržaja van tima — mala površina |
| Convex Auth na RN traži drugačiji flow | srednja | Rešava se u Fazi 0, pre nego što bilo šta zavisi od toga |
| Canvas u WebView-u se bori sa native gestovima | srednja | `nestedScrollEnabled`, jasna podela: WebView uzima pan/zoom, native uzima swipe-back |

---

## 8. Troškovi

| Stavka | Iznos |
|---|---|
| Apple Developer Program | $99 / godišnje |
| Google Play Console | $25 jednokratno |
| EAS Build | Besplatan tier je dovoljan na početku; Production plan po potrebi |
| Convex | Postojeći plan pokriva i mobilni — isti deployment |
| Expo Push Notifications | Besplatno |

---

## 9. Otvorene odluke

1. **Monorepo — potvrda.** Preporučeno, ali dira živi deploy.
2. **Veličina tima i broj startupa.** Utiče na to da li chat treba privatne
   kanale i da li je unread badge globalan ili po startupu.
3. **Ime i ikona aplikacije.** Treba pre prvog builda — bundle identifier
   (`com.nesto.app`) se posle teško menja.
4. **Da li mobilni sme da briše sadržaj**, ili brisanje ostaje samo na desktopu
   uz postojeći ballot sistem.

---

## 10. Prateći dokumenti

- `01-SETUP-WINDOWS.md` — okruženje od nule, korak po korak
- `02-EKRANI.md` — navigacija i svaki ekran
- `03-NOTIFIKACIJE.md` — kanali, zvuci, dostava
- `04-CHAT.md` — schema i logika chata
