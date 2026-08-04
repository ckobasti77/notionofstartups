# Z1.3 — Specifikacija testova za chat

> Korak **Z1.3** iz `REDOSLED.md`. Ovo je *šta se testira i kako*, ne kod.
> Implementacija ide u `packages/backend/convex/chat.test.ts` (fajl već postoji —
> ovi scenariji se dopisuju uz postojeće), po istom obrascu kao
> `packages/backend/convex/tasks.test.ts` i `notifications.test.ts`.
>
> Izvor istine za ponašanje: [chat.ts](packages/backend/convex/chat.ts) i
> [04-CHAT.md](docs/mobile/04-CHAT.md). Svaka tvrdnja ispod je vezana za konkretnu
> granu u kodu, sa referencom na liniju.

---

## 0. Okvir i konvencije

| Stavka | Vrednost |
|---|---|
| Harness | `convex-test` + `vitest` (`describe` / `test` / `expect`) |
| Šema | `import schema from "./schema"` |
| Moduli | `const modules = import.meta.glob("./**/*.ts")` |
| Identitet | `t.withIdentity({ subject: "<userId>\|test-session" })` — isto kao u `tasks.test.ts` |
| Direktan upit u bazu | `t.run(async (ctx) => …)` za arrange i za proveru internog stanja |

**Ne uvoditi novi fixture bez potrebe.** `chat.test.ts` već ima
`seedChatWorkspace()` i pomoćnik `readFor(s, channelId, profileId)`. Svi scenariji
ispod se oslanjaju na njih; gde treba entitet (misao, stranica), sejemo ga
lokalno kroz `t.run` (kao postojeći testovi „lazy thread" i „thread nad mišlju").

### Šta `seedChatWorkspace()` daje

- Profili: **Owner** (`role: "admin"`), **Member**, **Bystander** (svi članovi
  startupa), **Outsider** (postoji, ali **nije** u `startupMembers`).
- Jedan startup, jedna oblast (`areaId`).
- Ručno posejan **opšti kanal** `general` (`kind: "startup"`) — u produkciji ga
  pravi migracija, u testu se seje direktno.
- Skraćenice identiteta: `asOwner`, `asMember`, `asBystander`, `asOutsider`.

### Napomena o preklapanju

`chat.test.ts` već pokriva delove ovih invarijanti (npr. „unread raste za
primaoca, autor ostaje na nuli", „DM … zatvoren za nečlana", „lazy thread…",
„opšti kanal se ne arhivira"). Ovaj dokument ih **formalizuje u sedam ciljanih
scenarija** tako da svaki stoji sam i eksplicitno tvrdi svoju granicu. Pri
implementaciji spojiti sa postojećim testovima gde je logično, ne duplirati
identičan `expect`.

---

## 1. Član ne može da čita tuđi DM

**Cilj.** DM je zatvoren kanal: pristup zahteva eksplicitan red u `chatMembers`.
Član startupa koji nije jedan od dvoje sagovornika ne sme ni da pročita poruke ni
da išta pošalje u taj DM.

**Grana u kodu.** `requireChannelAccess` za `kind` koji nije `startup`/`area`/
`thread` traži članstvo i pada ako ga nema —
[chat.ts:288](packages/backend/convex/chat.ts) (`Nemate pristup ovom razgovoru.`).
`openDirectMessage` ubacuje u `chatMembers` samo dvoje učesnika —
[chat.ts:1425](packages/backend/convex/chat.ts).

**Priprema.**
- `asOwner` otvori DM prema `Member`: `openDirectMessage({ startupId, otherProfileId: member })` → `dmId`.
- (Opciono) `asOwner` pošalje jednu poruku u `dmId` da postoji sadržaj.

**Radnja + očekivano.**
- `asBystander.query(api.chat.messages, { channelId: dmId, paginationOpts })`
  → **odbijeno** sa `Nemate pristup ovom razgovoru.` (Bystander je član startupa,
  ali ne i DM-a → pada na channel-nivo dozvole, ne na startup-nivo.)
- `asBystander.mutation(api.chat.sendMessage, { channelId: dmId, body: "upad" })`
  → **odbijeno**, ista poruka.
- Kontrola pozitivne strane: `asOwner` i `asMember` **smeju** da čitaju `dmId`
  (`messages` vraća stranicu bez greške).

**Zašto baš Bystander, a ne Outsider.** Outsider bi pao ranije — na
`requireStartupMember` (`Nemate pristup ovom startupu.`). Bystander dokazuje da
granica drži **i za punopravnog člana startupa**, što je prava tvrdnja o DM
privatnosti.

---

## 2. Thread nasleđuje dozvole od svog entiteta

**Cilj.** Diskusija (`kind: "thread"`) nema sopstveni model dozvola — nasleđuje
pristup od entiteta za koji je zakačena. Ako korisnik ne vidi entitet, za njega
diskusija **ne postoji**: ne može da je čita ni da piše u nju.

**Grana u kodu.** `requireChannelAccess` za `kind === "thread"` poziva
`requireAnchorAccess` → `requireAnchorAccessById` —
[chat.ts:283](packages/backend/convex/chat.ts) i
[chat.ts:323](packages/backend/convex/chat.ts). Vlasnički-privatna grana je
`thought` (`doc.ownerProfileId !== profile._id` → `Nemate pristup ovom razgovoru.`) —
[chat.ts:357](packages/backend/convex/chat.ts).

Testiraju se **dve granice nasleđivanja**:

### 2a. Startup-granica (entitet = stranica/zadatak)

Zadatak (`pages`, `kind: "task"`) vidljiv je svim članovima startupa, pa se za
njega nasleđivanje svodi na članstvo u startupu.

- **Priprema.** `t.run` ubaci `pages` (task) u startup; `asOwner.sendToAnchor(...)`
  otvori thread nad njim (lazy) → dobijamo `threadId` iz `channelForAnchor`.
- **Radnja + očekivano.** `asOutsider.query(api.chat.messages, { channelId: threadId, … })`
  → **odbijeno** (`Nemate pristup ovom startupu.`). Ko ne vidi zadatak (nije u
  startupu), ne vidi ni diskusiju.

### 2b. Vlasnička granica (entitet = misao) — diskriminišući slučaj

`thought` je jedini vlasnički-privatan entitet: dva **člana istog startupa**, a
samo vlasnik vidi.

- **Priprema.** `t.run` ubaci `thoughtNodes` sa `ownerProfileId = Member`.
- **Radnja + očekivano.**
  - `asMember.sendToAnchor({ anchorType: "thought", anchorId, body })` → **prolazi**
    (vlasnik otvara i piše).
  - `asOwner.sendToAnchor({ anchorType: "thought", anchorId, body })` → **odbijeno**
    sa `Nemate pristup ovom razgovoru.` — iako je Owner član startupa (i admin),
    ne nasleđuje pristup tuđoj misli.
  - Nađi `threadId` (`channelForAnchor` kao `asMember`) pa
    `asOwner.query(api.chat.messages, { channelId: threadId, … })` → **odbijeno**
    istom porukom. Tvrdnja „ne vidi ni diskusiju" dokazana i na strani **čitanja**,
    ne samo pisanja.

**Napomena.** 2b je suština invarijante; 2a je pojas i sidro na tekst zadatka
(„ko ne vidi zadatak…"). Admin status ne zaobilazi nasleđivanje — to je bitno
proveriti jer je Owner u fixture-u admin.

---

## 3. Unread se NE povećava autoru sopstvene poruke

**Cilj.** Autor nikad ne dobija unread za poruku koju je sam poslao. Ostalim
primaocima unread raste inkrementalno.

**Grana u kodu.** U `insertMessage` petlji preskače se autor:
`if (authorProfileId !== null && recipientId === authorProfileId) continue;` —
[chat.ts:504](packages/backend/convex/chat.ts). Unread se uvećava upravo
posejanim/postojećim `chatReads` redom, ne prebrojava se pri čitanju —
[chat.ts:510](packages/backend/convex/chat.ts).

**Priprema + radnja.** `asOwner` pošalje 3 poruke u `general`
(`sendMessage` × 3).

**Očekivano** (čitaj `chatReads` preko `readFor`):
- `readFor(s, general, member)` → `unreadCount === 3`.
- `readFor(s, general, bystander)` → `unreadCount === 3` (implicitni primalac
  opšteg kanala; vidi scenario 7).
- `readFor(s, general, owner)` → **`null`** — autoru se `chatReads` red uopšte ne
  pravi. (Tvrdnja je jača od „0": red ne postoji.)

**Rizik ako padne.** Ako se autoru pravi red ili raste brojač, badge na
aplikaciji stalno svetli za sopstvene poruke — klasičan razlog zašto ljudi ugase
chat (04-CHAT.md §5).

---

## 4. `markChannelRead` nulira i `unreadCount` i `mentionCount`

**Cilj.** Otvaranje/čitanje kanala čisti **oba** brojača odjednom i pomera
`lastReadAt` / `lastReadMessageId` na poslednju poruku.

**Grana u kodu.** `markChannelRead` upisuje patch
`{ unreadCount: 0, mentionCount: 0, lastReadAt: now, lastReadMessageId: last?._id }` —
[chat.ts:1373](packages/backend/convex/chat.ts).

**Priprema.** `asOwner.sendMessage({ channelId: general, body: "hej Member", mentions: [member] })`.
- Provera pre čitanja: `readFor(s, general, member)` → `unreadCount === 1`,
  `mentionCount === 1` (pominjanje diže i jedan i drugi —
  [chat.ts:517](packages/backend/convex/chat.ts)).

**Radnja.** `asMember.mutation(api.chat.markChannelRead, { channelId: general })`.

**Očekivano** (`readFor(s, general, member)` posle):
- `unreadCount === 0`.
- `mentionCount === 0` (ne sme da ostane „zaglavljeni" mention badge).
- `lastReadMessageId` === `_id` posejane poruke (poslednja poruka kanala).
- `lastReadAt > 0`.

---

## 5. `openDirectMessage` vraća isti kanal bez obzira ko prvi pozove

**Cilj.** DM između dvoje ljudi je uvek **jedan** kanal. Redosled poziva ne
sme da napravi dva kanala.

**Grana u kodu.** `dmKeyFor(a, b)` sortira ID-jeve pa spaja
(`[a, b].sort().join(":")`) — [chat.ts:154](packages/backend/convex/chat.ts).
`openDirectMessage` prvo traži postojeći po `by_startup_and_dmKey` i vraća ga ako
postoji — [chat.ts:1399](packages/backend/convex/chat.ts).

**Radnja + očekivano.**
- `asOwner.openDirectMessage({ startupId, otherProfileId: member })` → `dm1`.
- `asMember.openDirectMessage({ startupId, otherProfileId: owner })` → `dm2`.
- **`dm1 === dm2`.**
- Dodatna provera idempotentnosti u bazi: upit nad `chatChannels` po
  `by_startup_and_dmKey` sa ključem `[owner, member].sort().join(":")` vraća
  **tačno jedan** red.

**Granični slučaji (odbijanja).**
- `openDirectMessage({ otherProfileId: self })` → `Ne možete otvoriti razgovor sa
  samim sobom.` ([chat.ts:1393](packages/backend/convex/chat.ts)).
- `asOutsider.openDirectMessage(...)` → `Nemate pristup ovom startupu.`

---

## 6. Lazy thread se pravi tek pri prvoj poruci, ne unapred

**Cilj.** Entitet nema kanal dok neko ne napiše prvu poruku. Time se izbegava
gomila praznih kanala (04-CHAT.md §4).

**Grana u kodu.** `channelForAnchor` vraća `null` kad kanal ne postoji —
[chat.ts:874](packages/backend/convex/chat.ts). `sendToAnchor` pravi kanal samo
ako `by_anchor` ne nađe postojeći — [chat.ts:1166](packages/backend/convex/chat.ts).

**Priprema.** `t.run` ubaci `pages` (task) u startup → `pageId`.

**Radnja + očekivano.**
1. **Pre poruke:** `asOwner.query(api.chat.channelForAnchor, { startupId, anchorType: "page", anchorId: pageId })`
   → **`null`**. (Dokaz da se ne pravi unapred.)
2. `asOwner.sendToAnchor({ …, anchorId: pageId, body: "prvo" })`.
3. `asMember.sendToAnchor({ …, anchorId: pageId, body: "drugo" })`.
4. **Posle poruka:** `channelForAnchor(...)` → **nije `null`** (thread postoji).
5. Upit u bazi po `by_anchor` (`anchorType: "page"`, `anchorId: pageId`) vraća
   **tačno jedan** kanal — druga poruka ne pravi drugi thread.

**Bonus tvrdnja (most ka oblasti).** Kreiranje threada okida sistemsku poruku u
kanalu oblasti/opštem (`postAnchorBridge` → `postSystemMessage`,
[chat.ts:570](packages/backend/convex/chat.ts)). Ako se testira: sistemska poruka
(`kind: "system"`) **ne** sme da digne unread nikome —
[chat.ts:498](packages/backend/convex/chat.ts). (Može biti zaseban `expect` ili se
proveri da `readFor` za članove nije porastao zbog mosta.)

---

## 7. Opšti kanal: implicitno članstvo, ne može se arhivirati

**Cilj.** Opšti kanal (`kind: "startup"`) ponaša se drugačije od svih:
- **Članstvo je implicitno** — ko je u `startupMembers`, u kanalu je; nema
  `chatMembers` redova i ne može se napustiti.
- **Ne može se arhivirati** — ni admin.

**Grane u kodu.**
- Implicitni pristup: `requireChannelAccess` vraća rano za `kind === "startup"` bez
  provere `chatMembers` — [chat.ts:279](packages/backend/convex/chat.ts).
- Implicitni primaoci: `channelRecipients` za opšti kanal nabraja `startupMembers`,
  ne `chatMembers` — [chat.ts:424](packages/backend/convex/chat.ts).
- `listChannels` uvek ubacuje opšti kanal preko `startupChannel`, nezavisno od
  članstva — [chat.ts:815](packages/backend/convex/chat.ts).
- Zabrana arhiviranja: `archiveChannel` baca na `kind === "startup"` —
  [chat.ts:1589](packages/backend/convex/chat.ts).

**Radnja + očekivano — implicitno članstvo.**
- **Nijedan** `chatMembers` red se ne seje za `general`.
- `asMember.query(api.chat.listChannels, { startupId })` → lista **sadrži**
  `general`.
- `asMember.mutation(api.chat.sendMessage, { channelId: general, body: "…" })`
  → **prolazi** (bez `chatMembers` reda), što dokazuje implicitni pristup.
- Posle slanja od `asOwner`, `readFor(s, general, member)` i
  `readFor(s, general, bystander)` su porasli → implicitni **primaoci** (potvrđuje
  scenario 3/7 zajedno).

**Radnja + očekivano — ne arhivira se.**
- `asOwner.mutation(api.chat.archiveChannel, { channelId: general })`
  → **odbijeno** sa `Opšti kanal se ne može arhivirati.` (Owner je admin — dokaz da
  ni admin ne sme.)
- Kontrola: admin **sme** da arhivira običan kanal (npr. `custom`), da se vidi da
  greška nije opšta zabrana arhiviranja nego pravilo baš za opšti kanal.

---

## 8. Mapa: scenario → funkcija → ključna tvrdnja

| # | Scenario | Funkcija(e) | Ključni `expect` |
|---|---|---|---|
| 1 | Tuđi DM zatvoren | `messages`, `sendMessage` | `rejects` `Nemate pristup ovom razgovoru.` za Bystandera |
| 2 | Thread nasleđuje dozvole | `sendToAnchor`, `messages` | Owner odbijen na tuđoj misli; Outsider odbijen na task-threadu |
| 3 | Autor bez unread-a | `sendMessage` (`insertMessage`) | `readFor(owner)` je `null`; `readFor(member).unreadCount === 3` |
| 4 | `markChannelRead` nulira oba | `markChannelRead` | `unreadCount === 0` **i** `mentionCount === 0`; `lastReadMessageId` = poslednja |
| 5 | DM idempotentan po `dmKey` | `openDirectMessage` | `dm1 === dm2`; jedan red po `by_startup_and_dmKey` |
| 6 | Lazy thread | `channelForAnchor`, `sendToAnchor` | `null` pre, ne-`null` posle; jedan red po `by_anchor` |
| 7 | Opšti kanal | `listChannels`, `sendMessage`, `archiveChannel` | pristup bez `chatMembers`; `rejects` `Opšti kanal se ne može arhivirati.` |

---

## 9. Zajednički rizici pri implementaciji

- **Vreme u testu.** `insertMessage`, `markChannelRead` i sl. zovu `Date.now()`
  interno — to je u redu (mutacija radi na serveru). Ne oslanjati se na tačnu
  vrednost `lastReadAt`, samo na `> 0` i relativni redosled.
- **Redosled poruka.** `by_channel_and_createdAt` sa `order("desc")` daje najnoviju
  prvu; za „poslednja poruka" u scenariju 4 koristiti taj isti put kao produkcija.
- **Implicitni primaoci ≠ `chatMembers`.** U scenarijima 3 i 7 ne sejati
  `chatMembers` za opšti kanal — poenta je da unread ide članovima startupa
  automatski.
- **Provere u bazi idu kroz indekse** (`readFor` već koristi
  `by_channel_and_profile`), u skladu sa `.claude/rules/convex.md`. Ne uvoditi
  `.filter()` nad tabelom.
