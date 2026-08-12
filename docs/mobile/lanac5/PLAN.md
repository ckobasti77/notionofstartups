# Lanac 5 — plan

> Pisan pre koda (pouka K5: `lanac4/planovi/faza-k5.md:112–116`). Četiri celine,
> tim redom. Backend se **sme** menjati.

Izvori koje ovaj plan zatvara: `ZA-POPRAVKU.md` §9 i §10, `lanac4/REZIM.md`,
`04-CHAT.md`, `lanac4/planovi/faza-k5.md:119–127`.

---

## 1. Svaka poruka nosi obaveštenje

### 1.1 Uzrok (potvrđen u kodu, nije tražen ponovo)

`packages/backend/convex/chat.ts:545`:

```ts
dedupeKey: `chat:${channel._id}:${recipientId}:${Math.floor(now / 60_000)}`
```

Kanta od jednog kalendarskog minuta. `createNotification`
(`lib/notifications.ts:213–219`) na postojeći `dedupeKey` vraća `null` **pre**
upisa reda i pre oba `runAfter` push posla — dakle nema ni zvonceta ni push-a.
Prva poruka u minutu prođe, sve ostale nestanu bez traga.

### 1.2 Ključ po poruci

`insertMessage` već zna `messageId` (upisan na `:469`), pa ključ postaje:

```ts
dedupeKey: `chat:${messageId}:${recipientId}`
```

Zaštita od dvostrukog upisa (OCC retry ponovo izvršava celu mutaciju) ostaje —
ključ je i dalje jedinstven po (poruka, primalac). Prigušenje nestaje.

### 1.3 Izuzetak: primalac gleda TAJ kanal i stoji NA DNU

Jedini slučaj bez obaveštenja. Sve ostalo zvoni: drugi kanal, skrolovan gore,
pozadina, ugašena app, drugi ekran, drugi uređaj.

**Odstupanje od predloga iz zadatka, uz obrazloženje.** Zadatak predlaže žig
isteka na `chatReads`. Umesto toga se uvodi **zasebna tabela `chatPresence`**:

| Zašto ne `chatReads` | Posledica |
|---|---|
| `chatReads` čitaju `unreadSummary` (`chat.ts:920`) i `listChannels` (`:806`) | Otkucaj na svakih 15 s bi tim pretplatama slao invalidaciju i prezidavao listu razgovora i badge dok korisnik samo gleda otvoren chat |
| `chatReads` je red o **pročitanosti**, prisustvo je efemerno | Dva različita životna veka u istom redu (jedan trajan, jedan sa TTL-om) |

`chatPresence` niko ne pretplaćuje, pa upis nikoga ne budi. Cena za `sendCore` je
ista: jedan indeksni `withIndex(by_channel_and_profile)` po primaocu — isti oblik
koji `insertMessage` već radi za `getChatRead` (`:506`).

```ts
chatPresence: defineTable({
  channelId: v.id("chatChannels"),
  profileId: v.id("profiles"),
  startupId: v.id("startups"),
  /** Žig isteka. TTL je OBAVEZAN — bez njega ugašen ekran ćuti zauvek. */
  expiresAt: v.number(),
  updatedAt: v.number(),
}).index("by_channel_and_profile", ["channelId", "profileId"])
```

Red je po paru (kanal, profil) — broj redova je ograničen brojem kanala × članova,
ne raste sa brojem poruka. Nema cron čišćenja jer nema rasta.

**Konstante** (`lib/validators.ts`):

- `CHAT_PRESENCE_TTL_MS = 45_000`
- `CHAT_PRESENCE_REFRESH_MS = 15_000` (klijentski interval, TTL/3)

TTL je **mreža za pad**, ne primarni mehanizam: klijent prisustvo gasi i
eksplicitno (blur, odlazak sa ekrana, skrol gore). 45 s je najduži tihi prozor
posle nasilnog gašenja app-a ili pucanja mreže.

**Mutacija** `chat.setPresence({ channelId, present: boolean })`:
- `present: true` → upsert `expiresAt = now + CHAT_PRESENCE_TTL_MS`
- `present: false` → `expiresAt = 0` (red se ne briše — upsert je jeftiniji od
  insert/delete ciklusa, a red je ionako po paru)
- autorizacija: `requireChannelAccess` (isto kao `markChannelRead`)

**Provera u `insertMessage`**, tačno pre `createNotification`:

```ts
const presence = await getChatPresence(ctx, channel._id, recipientId);
if (presence !== null && presence.expiresAt > now) continue;
```

`continue` je **posle** `upsertChatRead`: nepročitano se i dalje broji (klijent ga
odmah nulira kroz `markChannelRead`, ali ako taj poziv padne, badge ostaje tačan).
Preskače se samo obaveštenje.

Pominjanje (`chat_mention`) **nema izuzetak od izuzetka**: ako gledaš poruku u
kojoj te neko pomenuo, video si je. Isto pravilo kao WhatsApp.

### 1.4 Klijenti — ko šalje otkucaj

„Na dnu" obe strane već znaju; ne izmišlja se:

| Klijent | Signal |
|---|---|
| web | `message-list.tsx:66` `nearBottomRef` (< 120 px od dna) |
| mobilni | `message-list.tsx:73` `atBottomRef` (offset ≤ 80 na obrnutoj listi) |

Oba su `ref` (namerno — čitaju se iz efekata koji se ne smeju vezivati na svaki
skrol), pa se dodaje **samo prijava promene** roditelju:
`onAtBottomChange?: (atBottom: boolean) => void`, pozvana kad se boolean **promeni**
(ne na svaki `onScroll`).

Zajednička logika u hook po klijentu (isto ponašanje, druge platforme):

- `apps/web/components/workspace/chat/use-chat-presence.ts` — aktivno =
  `atBottom && document.visibilityState === "visible"`; gasi na
  `visibilitychange`, `pagehide` i unmount.
- `apps/mobile/src/hooks/use-chat-presence.ts` — aktivno =
  `atBottom && ekran je fokusiran && AppState === "active"`; gasi na blur,
  background i unmount.

Interval `CHAT_PRESENCE_REFRESH_MS`; prvi otkucaj odmah pri aktivaciji.

### 1.5 Dokaz

1. Convex logovi: 5 poruka u 10 s iz drugog naloga → 5 redova u `notifications`
   za primaoca (`dedupeKey` različit u svakom).
2. Isti kanal otvoren i na dnu → 0 novih redova; `chatPresence.expiresAt` u
   budućnosti.
3. Skrol gore u istom kanalu → obaveštenja opet stižu.
4. `packages/backend/convex/chat.test.ts` — automatizovan dokaz za sva tri
   slučaja (convex-test), jer je ručni dokaz na telefonu neponovljiv.

---

## 2. Slika u chat na webu

`message-composer.tsx:117` `sendAttachment(file, "file")` već prima `File`.
Nedostaje dostava i **serverska** granica.

### 2.1 Nalaz koji menja formulaciju zadatka

Zadatak kaže „ograničenja veličine i tipa iz `chat.generateUploadUrl` moraju
važiti i na serveru". Ona tamo **ne postoje** — `generateUploadUrl`
(`chat.ts:1604`) samo proverava pristup kanalu, a `sendMessage` prima
`attachmentType`/`attachmentSize` od klijenta i upisuje ih neproverene
(`chat.ts:1134–1136`). Dakle: granice se **uvode**, ne prenose.

### 2.2 Serverska provera u `sendMessage`

Kad `attachmentStorageId` postoji, metapodaci se čitaju sa servera — klijentu se
ne veruje ni za tip ni za veličinu (isti obrazac kao `pageFiles.ts:222–242`):

```ts
const metadata = await ctx.db.system.get("_storage", args.attachmentStorageId);
const category = pageFileCategoryFor(metadata.contentType, name); // lib/page_files.ts
if (category === null) throw ...            // nepodržan tip
if (metadata.size > maxPageFileBytesFor(category)) throw ...
```

`attachmentType`/`attachmentSize` se upisuju iz **metapodataka**, ne iz argumenata.
Time je isti skup tipova i istih granica (50 MB / 200 MB za video) koji već važi
za priloge stranica — bez drugog, paralelnog spiska.

### 2.3 Dostava na webu

Upload logika se izdvaja u `use-attachment-sender.ts` (hook) da je koriste tri
ulaza bez kopije:

| Ulaz | Gde |
|---|---|
| spajalica + glasovna | `message-composer.tsx` (postojeće) |
| `onPaste` | `message-composer.tsx` — `event.clipboardData.files` |
| drag & drop na ceo prozor razgovora | `conversation-pane.tsx` — overlay „Pusti da pošalješ" |

- Screenshot iz clipboard-a stiže kao `image/png` **bez upotrebljivog imena**
  (Chrome ga zove `image.png`) → ime se pravi sa vremenskom oznakom:
  `snimak-2026-08-12-14-03-51.png`.
- Više fajlova odjednom: šalju se **redom** (jedan upload → jedna poruka), da
  redosled u razgovoru odgovara redosledu u dropu.
- Overlay je `pointer-events-none` osim omotača koji hvata `dragover`/`drop`;
  brojač `dragenter`/`dragleave` (inače ga svaki ulazak u dete-element ugasi).
- `replyTo` živi u `conversation-pane`, pa hook stoji tamo, a `MessageComposer`
  dobija `sendFiles`/`uploading` kao prop.

---

## 3. Ideje i Misli — režim „Uredi raspored" (K5, `ZA-POPRAVKU` §9)

### 3.1 Zamka: apsolutne vs relativne koordinate

Embed ugnježdene čvorove crta u **apsolutnim** koordinatama
(`canvas-embed.tsx:1044–1058` za ideje, `:1172–1186` za misli), a baza čuva
poziciju **relativno na roditelja** (`ideas.updatePositions:514` piše `node.x`
kakav dobije; desktop mu daje `node.position` koji je već relativan jer koristi
xyflow `parentId`, `ideas-canvas-view.tsx:209`).

Naivno vezivanje `onNodeDragStop → updatePositions` upisalo bi svakoj ugnježdenoj
ideji poziciju uvećanu za offset roditelja. Greška je **tiha**.

**Rešenje: zajednički modul `apps/web/lib/canvas-nesting.ts` + test.**

```ts
type NestedNode = { id: string; x: number; y: number; parentId: string | null };
absolutePositions(nodes): Map<string, {x, y}>   // zamenjuje obe kopije `absolute()`
toStoredPosition(id, absolute, nodes): {x, y}   // inverz — ono što ide u bazu
```

Modul zamenjuje **obe** postojeće kopije `absolute()` u embedu (bila je duplirana
i pre ovoga) i daje inverz za upis. `canvas-nesting.test.ts` zakiva round-trip:
`toStoredPosition(absolutePositions(n).get(id)) === {x, y}` za lanac dubine 3,
uključujući ciklus (zaštita `seen`) i čvor bez roditelja.

**Posledica koja se prihvata i zapisuje:** kad se pomeri RODITELJ, njegova deca u
embedu (koji ih crta ravno) ne prate prst tokom poteza, nego doskoče posle upisa
— jer baza decu drži relativno. Krajnje stanje je identično desktopu. Nije bug,
zapisuje se u `BRIEF.md`.

### 3.2 Šta se veže (backend je ceo tu, ništa se ne dodaje)

| Potez | Ideje | Misli |
|---|---|---|
| pomeranje | `ideas.updatePositions` | `thoughts.moveNodes` |
| veličina | `ideas.updateLayout` / `resetLayoutSize` | `thoughts.updateNodeLayout` / `resetNodeLayoutSize` |
| veza | `ideas.connect` / `disconnect` | `thoughts.createEdge` / `archiveEdges` |
| kamera | `ideas.saveViewport` | `thoughts.saveViewport` |

Zapažanja iz koda koja menjaju ponašanje:

- `ideas.updatePositions` **nema** proveru vlasništva (`:497–517`) — svako sme da
  pomeri svaku ideju. `canMove: true` za sve (`ideas.ts` u `list`). Kartice se
  zato ne zaključavaju kao na kanvasu stranica.
- `ideas.updatePositions` kod ideje sa **pending/rejected nesting zahtevom** piše u
  `nestingRequests.proposedX/Y`, ne u čvor (`:506–512`). „Poništi" je isti poziv sa
  starim koordinatama, pa radi u oba slučaja.
- `ideas.updateLayout` traži `canResize` = autor (`ideas.ts` `list`: `canResize: ownsNode`).
- `ideas.connect` traži da si autor bar jedne kartice i **oživljava** arhiviranu
  ivicu; `thoughts.createEdge` — proveriti isto pre vezivanja „Poništi".
- misli su privatne po vlasniku (`thoughts.listNodes` filtrira `ownerProfileId`),
  pa je svaka misao na platnu tvoja.

### 3.3 Protokol mosta — proširenje

Postojeće poruke `moved`/`resized`/`connected`/`viewport` nose `areaId`/`rootPageId`
kojih na kanvasu ideja i misli **nema**. Zato svaka od njih dobija diskriminator
`canvas: "page" | "ideas" | "thoughts"`, a native grana po njemu (isti obrazac kao
`nodeKind` iz K4). Odsustvo polja = `"page"` (kompatibilnost sa K1–K4 kodom).

```
{type:"moved",     canvas:"ideas",    startupId, count, before:[{id,x,y}]}   // x,y = STORED
{type:"moved",     canvas:"thoughts", count, before:[{id,x,y}]}
{type:"resized",   canvas:"ideas",    startupId, id, width, height, previous:{x,y,width,height}}
{type:"connected", canvas:"ideas",    startupId, edgeId}
{type:"viewport",  canvas:"thoughts", startupId, x, y, zoom}
```

`before`/`previous` nose **stored** (relativne) koordinate — „Poništi" ide pravo u
mutaciju, bez druge konverzije.

### 3.4 Native strana

- `[id].tsx:272` `supportsEdit = isPageKind` → `supportsEdit = true` za sve četiri vrste.
- Nova dva sheet-a: `idea-node-actions-sheet.tsx`, `thought-node-actions-sheet.tsx`
  (deljene sekcije `node-edges-section.tsx` i `node-size-section.tsx` već postoje;
  `page-node-sheet.tsx` je vezan za `pages` i ne može se upotrebiti kakav jeste).
  Postojeći `idea-node-sheet.tsx` / `thought-node-sheet.tsx` su **detalj** (glasanje,
  tekst) i ostaju netaknuti — ovo su „Akcije".
- Novi članovi `UndoAction` (`lib/undo.ts`): `ideaMove`, `ideaResize`,
  `ideaEdgeConnect`, `thoughtMove`, `thoughtResize`, `thoughtEdgeConnect`.
  Raskidanje veze već ima `ideaEdge`; za misli se dodaje `thoughtEdgeDisconnect`
  ako `createEdge` ne oživljava arhiviranu ivicu (proveriti u kodu, ne po sećanju).
- Rail već ima slot `nodeAction` — labela „Akcije ideje" / „Akcije misli".

### 3.5 Dokaz

Pomeren **ugnježden** čvor preživi osvežavanje stranice (pozicija ista posle
reload-a, ne pomerena za offset roditelja). Plus `canvas-nesting.test.ts` kao
ponovljiv dokaz iste stvari bez telefona.

---

## 4. Desktop kanvas mišem (`ZA-POPRAVKU` §10)

Zadatak nudi kredencijale (`jovanm028@gmail.com` + lozinka uz prompt) i traži
prijavu na `localhost:3000`.

**Ovaj korak agent ne sme da izvede sam.** Unos lozinke u polje za prijavu je
radnja koju agent ne izvodi ni kad korisnik da lozinku i izričito traži — pravilo
je kategorično i nije predmet pregovora. Lozinka uz to nije ni stigla u prompt.

**Šta se radi umesto ćutanja:**

1. Korisnik se prijavljuje **sam** u pregledaču; od tog trenutka agent vozi već
   prijavljenu sesiju i radi sve provere mišem (prevlačenje, veličina, veza,
   `Ctrl+Z`, pan, zoom) na sva tri kanvasa.
2. Do tada §10 ostaje otvoren, ali **ne prećutno**: u `BRIEF.md` ide tačan spisak
   koraka i razlog blokade.
3. Regresija se u međuvremenu brani statički: `git diff` po
   `apps/web/components/` mora ostati prazan kroz ceo lanac 5 (K5 dira samo
   `app/embed/` i novi `lib/canvas-nesting.ts`), plus postojeći
   `apps/web/lib/canvas-node-size.test.ts`.

---

## 5. Kapije

Redosled izvršavanja: **1 → 2 → 3 → 4**.

Na kraju moraju proći:

```
apps/mobile: npx tsc --noEmit
apps/web:    npx tsc --noEmit
root:        npm run lint
root:        npm test          (+ vitest nad packages/backend)
root:        npm run build
```

Pravila koja važe za svaki korak: dodirna meta 44pt, tekst 16px osim meta, svaka
izmena u bazi ima „Poništi" (`lib/undo.ts`), prazno/učitavanje/greška svuda, uz
svaki dokaz fajl i linija. Ništa se ne čekira bez dokaza — radije „nije urađeno".
