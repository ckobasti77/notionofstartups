# Revizija pariteta — 12.08.2026, posle lanca 5

> Šest nezavisnih revizora, po oblastima. Metod je **radnja**, ne ime Convex
> funkcije — brojač po imenima je iscrpljen i dokazano laže (slučaj K5: mutacije
> su se zvale sa native liste, pa je kanvas ispao „pokriven" iako režim
> uređivanja nije postojao).
>
> Razlika po brojaču: **6**. Stvarnih rupa nađenih ovom revizijom: **~40**.
> Odnos ta dva broja je poenta ovog dokumenta.

---

## A. Provera tvrdnji lanca 5

| Tvrdnja | Ishod |
|---|---|
| Svaka poruka nosi obaveštenje | **POTVRĐENO** — stari ključ nestao (`grep 60_000` prazan), `chat.ts:594` novi ključ po poruci; `chatPresence` + TTL 45 s u `schema.ts:1338`; guard je POSLE `upsertChatRead` (`chat.ts:545` → `:565`), pa nepročitano ostaje tačno; gašenje pokriva blur, pozadinu, skrol gore i napuštanje ekrana |
| Slika u chat na webu | **POTVRĐENO** — `attachmentType`/`attachmentSize` se stvarno čitaju sa servera (`chat.ts:854`, `:874-875`), argumenti se koriste samo kad priloga nema; drag&drop je na CELOM prozoru (`conversation-pane.tsx:152-175`), ne samo na composeru |
| Ideje i Misli imaju „Uredi raspored" | **POTVRĐENO** — `supportsEdit` više nije `isPageKind` nego `true` (`canvas/[kind]/[id].tsx:297`); handleri stvarno prosleđeni (`canvas-embed.tsx:1370`, `:1740`), ne samo propovi kao ranije; `canvas-nesting.ts` prevodi u oba smera |
| Kapije (tsc, lint, 350 testova, build) | **DELIMIČNO** — testovi postoje i testiraju ono što se tvrdi (9 + 8), ali se brojevi ne mogu potvrditi bez pokretanja. Brief kaže „+8 i +9" a pomera 337→350 (+13), razliku pokriva sa „minus preraspodela" bez objašnjenja |

### Tri nalaza koje je lanac propustio da prijavi

1. **`CHAT_PRESENCE_REFRESH_MS` je mrtav export.** `validators.ts:189` ga izvozi, ali
   ga niko ne uvozi — oba hook-a hardkoduju svoj `REFRESH_MS = 15_000`
   (`use-chat-presence.ts:14` na webu, `:13` na mobilnom). Promeniš TTL na serveru,
   klijenti ne prate. Deljena konstanta postoji samo kao dekoracija.

2. **`chat.generateUploadUrl` i dalje nema granice**, a odbijen blob se ne briše
   (`chat.ts:833-836`, zapisano u samom kodu). Klijent koji preskoči predproveru puni
   storage siročićima — poruka se odbije, fajl ostaje.

3. **Test dokazuje manje nego što tabela sugeriše.** `chat.test.ts:1254` tvrdi
   `attachmentType === "application/octet-stream"` jer `convex-test` ne pamti
   `contentType`. Dakle dokazano je da se **veličina** čita sa servera; „tip se čita iz
   metapodataka" počiva na čitanju koda, ne na testu.

---

## B. Velike rupe — blokiraju rad sa telefona

| # | Radnja | Web | Mobilni |
|---|---|---|---|
| B1 | **Urediti belešku koja sadrži tabelu, prilog ili blok koda** | uvek uredivo, `page-editor-view.tsx:1236` | `note-editor.tsx:167` — `bodyEditable=false`, pada na `NoteReader` |
| B2 | **Preimenovati zadatak** | `page-editor-view.tsx:694` | nema — naslov je čist tekst (`zadatak/[id].tsx:168`) |
| B3 | **Preimenovati stranicu tipa Tabela ili Prilozi** | `page-editor-view.tsx:1097` | nema — rename postoji samo za belešku |
| B4 | **Diskusija (chat) nad idejom** | `ideas-view.tsx:646`, `:818` | nema — `anchorType` se na mobilnom zove isključivo sa `'page'` (`discussion-link.tsx:48`) |
| B5 | **Kopirati pozivnicu kao LINK** | `admin-dialog.tsx:408` (`https://…/?invite=KOD`) | `pozivnice.tsx:258` kopira goli kod; helper `inviteLinkUrl` je **uvezen** (`:33`) i **nikad pozvan** |
| B6 | **Dodati članove privatnom kanalu** | `new-conversation.tsx:295-324` | `new-conversation-sheet.tsx:117` ne šalje članove, a `chat.setChannelMembers` **ne postoji uopšte** → privatan kanal sa telefona ostaje trajno prazan |
| B7 | **Ubaciti sliku, prilog, tabelu ili CSV u telo beleške** | `rich-text-editor.tsx:404,409,417,429` | nema — `note-toolbar.tsx:85` nema te alatke |

B1 je jedini nalaz u celoj reviziji gde mobilni korisnik ostaje bez pristupa
**sadržaju koji već postoji**, a ne samo bez alata. B5 pogađa baš onaj tok koji
najviše koristiš — puštanje aplikacije drugarima.

---

## C. Srednje

| # | Radnja | Mobilni |
|---|---|---|
| C1 | Tema ostaje posle restarta | `theme-provider.tsx:35` — `useState('system')`, bez `AsyncStorage` |
| C2 | Aktivan startup ostaje posle restarta | `active-startup.tsx:17` — uvek pada na `startups[0]` |
| C3 | Boja kartice ideje | nema (misli je imaju — nedoslednost, ne platforma) |
| C4 | Duplirati ideju | nema (misli imaju) |
| C5 | Oznaka veze se VIDI na kanvasu | upisuje se (`idea-edge-sheet.tsx:145`), ali embed je ne renderuje (`canvas-embed.tsx:1353`) |
| C6 | Boja čvora se vidi na kanvasu | podatak stiže, `embed-node.tsx:186` crta samo tekst |
| C7 | Filter po tipu u oblasti | nema (`prostor.tsx`) |
| C8 | Filter/pretraga unutar ideja i misli | nema |
| C9 | Ugnjezditi pod stranicu koja nije u korenu | `page-actions-sheet.tsx:94` nudi samo korenske |
| C10 | Premestiti u oblast POD određenu stranicu | `:129` uvek `targetParentPageId: null` |
| C11 | Breadcrumbs kao dugmad | `breadcrumbs-eyebrow.tsx:74` — nedodirljiv tekst |
| C12 | Redo, i undo dublji od jednog koraka | `undo.ts:210` pregazi prethodnu stavku, traka nestaje za 8 s |
| C13 | Nit doprinosa na checkpointu | nema |
| C14 | Potpisani doprinosi na nivou oblasti | nema |
| C15 | Isključiti push na ovom uređaju | `expoPushTokens.remove` postoji, mobilni ga ne zove |
| C16 | Status odobrenja ideje se prikazuje | `isApproved` je skriven uslov, stavka se pojavljuje bez objašnjenja |
| C17 | Ponovo kopirati kod postojeće pozivnice | kod živi samo u jednokratnom `Alert`-u |

---

## D. Sitno

Kopiranje teksta poruke (`message-bubble.tsx:193` bez `selectable`) · više fajlova
odjednom u chatu i u prilozima · video iz galerije u chat (`mediaTypes: ['images']`,
a `files-panel.tsx:112` istog tima koristi `['images','videos']`) · pretraga članova
pri otvaranju DM-a · pomen (@) u sredini teksta · izmena poruke koja nosi prilog ·
objašnjenje zašto izmena više nije moguća · ikonica i naziv oblasti u zaglavlju kanala ·
datum kreiranja ideje u listi · „nova grana ideje" u jednom potezu · „nova povezana
misao" · rok kao pun kalendar pri kreiranju · sadržaj beleške u dijalogu kreiranja ·
izbor oblasti pri kreiranju · pregled videa i „Preuzmi" u pregledaču priloga ·
kanban „Tabla" za zadatke · „Sastav nedelje" na Pulsu · spisak tima za ne-admina ·
poruka da je lista zahteva odsečena na 100.

---

## E. Gde je mobilni ISPRED weba

- Aktivnost je paginirana i grupisana po danu; web tvrdo staje na 50 bez „učitaj još"
- Pretraga vodi pravo na detalj misli; web samo otvori sekciju
- Odobrenja traže potvrdu za nepovratan glas; web ne
- Tema ima „sistemsko"; web `theme-toggle.tsx:93` posle prvog klika više ne može nazad na sistemsko
- `zadaci.tsx` ima bogatije filtere od bilo čega što web STVARNO prikazuje —
  `task-table-view.tsx` je **mrtav kod**, nije uvezen nigde

---

## F. Ne postoji ni na jednoj platformi (nije rupa pariteta)

`profiles.setRole`, `profiles.archive`, `startups.archive` postoje u backendu i
nijedan klijent ih ne zove. Promena sopstvene lozinke, odjava sa svih uređaja,
brisanje naloga, izbor jezika — ne postoje nigde, ni u UI ni u backendu.
Vraćanje arhivirane stranice ne postoji kao mutacija uopšte.
`createChannel({fromMessageId})` („diskusija iz poruke") nije pozvan ni na jednoj
platformi.
