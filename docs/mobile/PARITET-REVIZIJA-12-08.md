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
   **REŠENO (lanac 6, P1):** konstante presečene u
   `packages/backend/convex/lib/chatPresence.ts` (nula uvoza — uvoze ga backend,
   web i mobilni), oba hooka je sada uvoze umesto da je dupliraju.

2. **`chat.generateUploadUrl` i dalje nema granice**, a odbijen blob se ne briše
   (`chat.ts:833-836`, zapisano u samom kodu). Klijent koji preskoči predproveru puni
   storage siročićima — poruka se odbije, fajl ostaje.
   **REŠENO (lanac 6, P3):** oba kraja, jer svaki sam zatvara pola.
   - Predprovera: `chat.generateUploadUrl` ima OBAVEZNE `name`/`contentType`/`size`
     i baca pre izdavanja URL-a (`chat.ts:2003`); klijenti ih šalju
     (`apps/mobile/src/components/chat/message-composer.tsx:327`,
     `apps/web/components/workspace/chat/use-attachment-sender.ts:93`).
   - Brisanje: `resolveAttachment` odbijanje VRAĆA umesto da baca i pre toga zove
     `ctx.storage.delete` (`chat.ts:943`); `sendMessage` zato vraća uniju
     `{ok:true,messageId} | {ok:false,reason,message}` (`chat.ts:1321`).
   - Tuđ blob se ne briše: `requireUnattachedBlob` (`chat.ts:878`) proverava
     `pageFiles.by_storageId` i nov `chatMessages.by_attachmentStorageId`
     (`schema.ts:1289`) pre svake grane koja briše.
   - Testovi: `chat.test.ts` — „odbijen prilog se VRAĆA, a blob se briše",
     „odbijanje ne briše blob koji je već zakačen negde drugde",
     „generateUploadUrl: prevelik i nepodržan fajl ne stignu do storage-a".

3. **Test dokazuje manje nego što tabela sugeriše.** `chat.test.ts:1254` tvrdi
   `attachmentType === "application/octet-stream"` jer `convex-test` ne pamti
   `contentType`. Dakle dokazano je da se **veličina** čita sa servera; „tip se čita iz
   metapodataka" počiva na čitanju koda, ne na testu.

---

## B. Velike rupe — blokiraju rad sa telefona

| # | Radnja | Web | Mobilni |
|---|---|---|---|
| B1 | **Urediti belešku koja sadrži tabelu, prilog ili blok koda** | uvek uredivo, `page-editor-view.tsx:1236` | **REŠENO (lanac 6, P2)** — sopstveni web bundle sa istom Tiptap šemom: `apps/mobile/src/lib/note-editor-bridges.ts` (lista), `apps/mobile/editor-web/` (izvor), `note-editor.tsx` (`customSource: NOTE_EDITOR_HTML`, `bodyEditable = canEditBody`). Zabranu je zamenio čuvar koji meri gubitak (`noteSignatureLoss`) |
| B2 | **Preimenovati zadatak** | `page-editor-view.tsx:694` | **REŠENO (lanac 6, P1)** — red „Preimenuj" u `page-actions-sheet.tsx`, ista `areasV2.updatePage` mutacija |
| B3 | **Preimenovati stranicu tipa Tabela ili Prilozi** | `page-editor-view.tsx:1097` | **REŠENO (lanac 6, P1)** — isti red kao B2 (`page.kind !== 'note'`), beleška namerno izuzeta (§4c plana P1) |
| B4 | **Diskusija (chat) nad idejom** | `ideas-view.tsx:646`, `:818` | **REŠENO (lanac 6, P3)** — `DiscussionLink` premešten u `apps/mobile/src/components/chat/discussion-link.tsx` i uopšten na diskriminisanu uniju `{type:'page'\|'idea'}` (`:25-27`, `:64-67`); montiran na ekranu ideje (`app/(app)/ideja/[id].tsx:283-286`, ispravljena referenca — revizija P3 §3 je pogrešno navela `:270-273`). Sekcija koja je bila dvosmisleno nazvana „Diskusija" preimenovana je u „Predlozi izmena" (`ideja/[id].tsx:272`) — isti naziv koji web koristi za doprinose |
| B5 | **Kopirati pozivnicu kao LINK** | `admin-dialog.tsx:408` (`https://…/?invite=KOD`) | **REŠENO (lanac 6, P1)** — Alert sada nosi pun link (`inviteLinkUrl` pozvan), „Podeli"/„Kopiraj link"; ako `EXPO_PUBLIC_WEB_URL` nije podešen, pada na stari tok (samo kod) |
| B6 | **Dodati članove privatnom kanalu** | `new-conversation.tsx:295-324` | **REŠENO (lanac 6, P3)** — nov upit `chat.channelMembers` (`packages/backend/convex/chat.ts:1104`) i nova mutacija `chat.setChannelMembers` (`:1616`). Mobilni: izbor članova pri kreiranju (`new-conversation-sheet.tsx`, korak „Novi kanal") i naknadna izmena kroz ⋯ → „Članovi kanala" (`components/chat/channel-members-sheet.tsx`, ulaz u `conversation-header.tsx`) uz „Poništi" (`lib/undo.ts`, `kind: 'channelMembers'`). **Ćorsokak je bio i na webu** (članovi samo pri kreiranju), pa je i web dobio izlaz: `components/workspace/chat/channel-members-dialog.tsx`, ulaz u `conversation-pane.tsx` |
| B7 | **Ubaciti sliku, prilog, tabelu ili CSV u telo beleške** | `rich-text-editor.tsx:404,409,417,429` | **REŠENO (lanac 6, P2)** — dugme „Dodaj…" u traci (`note-toolbar.tsx`, prvo dugme) otvara `note-insert-sheet.tsx`: galerija, kamera, prilog, tabela 3×3, uvoz CSV/XLSX, blok koda. Alatke tabele (red/kolona/zaglavlje/briši) se pojavljuju u traci kad je kursor u tabeli |

B1 je bio jedini nalaz u celoj reviziji gde mobilni korisnik ostaje bez pristupa
**sadržaju koji već postoji**, a ne samo bez alata. B5 pogađa baš onaj tok koji
najviše koristiš — puštanje aplikacije drugarima.

> **Napomena uz B1/B7 (P2).** Merni gejt iz `ZA-POPRAVKU.md` §2 nije zatvoren i
> nije ni mogao biti — agent nema uređaj. Bundle je posle P2 veći, pa je merenje
> na jeftinom Androidu sada važnije nego pre.

---

## C. Srednje

| # | Radnja | Mobilni |
|---|---|---|
| C1 | Tema ostaje posle restarta | **REŠENO (lanac 6, P6)** — `lib/device-prefs.ts` (`readThemePreference`/`writeThemePreference`, sinhroni `SecureStore.getItem`/`setItem`); `theme/theme-provider.tsx:40` čita u `useState` inicijalizatoru (bez treptaja), `:42` piše pre `setPreferenceState` |
| C2 | Aktivan startup ostaje posle restarta | **REŠENO (lanac 6, P6)** — zapamćen izbor je PO PROFILU (`lib/device-prefs.ts`), obnavlja se tek posle serverske potvrde članstva: nova `startups.isCurrentMember` (`packages/backend/convex/startups.ts:101`, ne baca za ne-člana), `context/active-startup.tsx` (`restoring` gejt, `:52-56`), `components/app-header.tsx` (`:54-59` ne nameće prvi startup dok `restoring`). Uklonjen iz tima → tiho pada na prvi dostupan (server vraća `false`, `restoring` se zatvara). Kapija: `packages/backend/convex/startups.test.ts` (T1–T5) |
| C3 | Boja kartice ideje | **REŠENO (lanac 6, P4)** — deljen `ui/color-row.tsx` (preseljen iz `thought-node-sheet.tsx`); `idea-create-sheet.tsx` šalje `color` pri kreiranju, `ideja/[id].tsx` (`draftColor`, `:294`) pri izmeni |
| C4 | Duplirati ideju | **REŠENO (lanac 6, P4)** — red „Dupliraj" u `idea-actions-sheet.tsx` (`duplicate()`), apsolutna pozicija preko `lib/canvas-position.ts`, undo kroz nov `ideaCreate` član (`lib/undo.ts`) |
| C5 | Oznaka veze se VIDI na kanvasu | **REŠENO (lanac 6, P4)** — upisuje se (`idea-edge-sheet.tsx:145`), embed sad renderuje (`canvas-embed.tsx`, `edge.label` u mapiranju ivica za ideje/misli/oblasti/stranice) + CSS za `.react-flow__edge-text` u `EmbedStyles` |
| C6 | Boja čvora se vidi na kanvasu | **REŠENO (lanac 6, P4)** — `embed-node.tsx` (`EmbedNodeColor`, `embedNodeColor()`, tačka pored naslova), `canvas-embed.tsx` puni `data.color` za ideje i misli |
| C7 | Filter po tipu u oblasti | **REŠENO (lanac 6, P5)** — `components/prostor/kind-filter-row.tsx` (5 `OptionChip`-a: Sve + `PAGE_KIND_KEYS`), montiran u `PageLevel` (`app/(app)/(tabs)/prostor.tsx:540`); filter ide u korenski `pages.listChildren` (`:528`), `kind` argument je postojao od ranije. Podstranice se NAMERNO ne filtriraju (`pages.childCounts` broji svu decu, pa bi red obećao „2 podstranice" i otvorio „Nema podstranica."); ispod chipova stoji „Filter važi za koren oblasti." (`:541-549`). Prazno stanje imenuje vrstu i nudi „Prikaži sve" (`:900-921`). Kapija: `pages.test.ts` — „kind filtrira samo traženu vrstu na nivou" |
| C8 | Filter/pretraga unutar ideja i misli | **REŠENO (lanac 6, P4)** — deljen `ui/search-field.tsx`; `ideje.tsx` i `misli.tsx` filtriraju uživo nad naslovom/tekstom (klijentski, kao web); misli imaju napomenu da filter važi nad učitanom stranicom dok je paginacija u toku |
| C9 | Ugnjezditi pod stranicu koja nije u korenu | **REŠENO (lanac 6, P5)** — nov `components/stranica/page-target-picker.tsx` (stablo koje se širi u mestu; nivo se montira tek na razvijanje, `MAX_PICKER_DEPTH = 8`), zamenio je listu korenskih kandidata u `page-actions-sheet.tsx:544`. Stranica koja se seli se filtrira na SVAKOM nivou, pa je i njena grana nedostupna — server nikad ne dobije „ugnjezdi pod sopstvenog potomka". „Poništi" kroz nov `pageReparent` (`lib/undo.ts:235`, `undo-bar.tsx:321`) |
| C10 | Premestiti u oblast POD određenu stranicu | **REŠENO (lanac 6, P5), ali ovo NIJE bila samo mobilna rupa.** Tvrdnja iz ove revizije („web to radi u jednom potezu, `workspace-shell.tsx:488-500`") je **netačna**: web je to POKUŠAVAO, a server je odbijao — `areasV2.ts` je za `targetParent !== null` uz promenu oblasti bacao „Premeštanje u drugu oblast je dozvoljeno samo u koren oblasti.". Rupa je dakle bila **serverska** i postojala je na obe platforme. Popravka je u backendu: `movePage` sada komponuje `movePageAcrossAreasWithSidecars` + `moveWithinArea` u istoj transakciji (`packages/backend/convex/areasV2.ts:3732-3771`), uz OBAVEZNO ponovno čitanje dokumenta između koraka (zamka Z12). Time je i web dobio funkciju bez ijedne izmene u `apps/web`. Mobilni ulaz: drugi korak `moveTarget` u `page-actions-sheet.tsx:508-541` („U koren oblasti" + `PageTargetPicker`). Kapije: tri nova testa u `areasV2.test.ts` |
| C11 | Breadcrumbs kao dugmad | **REŠENO (lanac 6, P5)** — nov `PathSheet` (`breadcrumbs-eyebrow.tsx:125`) sa redom OBLASTI (`:150`, vodi u tab Prostor na toj oblasti) i redom po pretku (`:200`, `/zadatak/[id]` za zadatak, inače `/stranica/[id]`); montiran na oba ekrana detalja (`stranica/[id].tsx:118`, `zadatak/[id].tsx:353`), otvara ga tap na putanju (`onEyebrowPress`, `:88` / `:181`). Sami segmenti u liniji ostaju nedodirljivi (13px, `ellipsizeMode="head"` — 44pt po segmentu tu fizički ne staje); cela linija je JEDNA meta od 44pt kroz `hitSlop` (`ui/screen-header.tsx:96`) |
| C12 | Redo, i undo dublji od jednog koraka | **DELIMIČNO REŠENO (lanac 6, P6).** Undo dublji od jednog koraka — URAĐENO: `lib/undo.ts` je stek (`entries[]`, `MAX_UNDO_ENTRIES = 20`, `pushUndo`/`popUndo`/`hideUndoBar`/`clearUndo`), preseljena logika poništavanja u `hooks/use-undo-runner.ts` (23 grane, deli je i traka i ekran), nov `app/(app)/istorija.tsx` („Istorija radnji", ulaz iz `vise.tsx` sa brojačem) — traka posle „Poništi" odmah nudi SLEDEĆI vrh (`popUndo(key, {advertiseNext:true})`, `undo-bar.tsx:80`), višekoračno u mestu. Kapija: `lib/undo.test.ts` (T1–T7 + `hideUndoBar`). **Redo — NAMERNO ODBIJEN**, odluka i tri razloga: `docs/mobile/ZA-POPRAVKU.md` §12. Stek ne preživljava restart aplikacije (svesno, razlog: `ZA-POPRAVKU.md` §13) |
| C13 | Nit doprinosa na checkpointu | **REŠENO (lanac 6, P5)** — nov `components/zadatak/checkpoint-contributions-sheet.tsx`, ulaz je ikonica `MessageSquareText` u redu koraka (`task-checkpoint-list.tsx:376`, prva u nizu akcija kao na webu), sheet montiran na `:441`. Dugme se prikazuje UVEK (`addContribution` traži samo članstvo). Brisanje zatvara sheet (`onDeleted`) da traka „Poništi" ne ostane ispod modala. **Izuzetak, svesno:** kanvas NE dobija drugi ulaz — `CheckpointNodeSheet` izričito ne nosi suštinu koraka, a tap na oblačić ionako vodi na `/zadatak/<taskPageId>` |
| C14 | Potpisani doprinosi na nivou oblasti | **REŠENO (lanac 6, P5)** — nov `components/prostor/area-contributions-section.tsx` (kolapsibilna sekcija po uzoru na `AreaBriefingSection`, telo se montira tek na razvijanje), montiran odmah ispod brifinga (`app/(app)/(tabs)/prostor.tsx:255`) — isti redosled kao web `area-view.tsx`. `ContributionThread` je dobio `area` član unije (`contribution-thread.tsx:54`). Nivo 2 taba je dobio i traku „Poništi" (`prostor.tsx:288`, `bottomOffset={72}`) — bez nje brisanje doprinosa nema izlaz |
| C15 | Isključiti push na ovom uređaju | **REŠENO (lanac 6, P6)** — `lib/notifications/register.ts`: nov `useDisablePushDevice` (`:240`, PRVO `expoPushTokens.remove` pa `writePushOptOut(true)`), `usePushRegistration` preskače registraciju kad je zastavica postavljena (`:223-226`, preživljava restart), ručno „Registruj" briše zastavicu (`:107`, eksplicitan pristanak). UI: `podesavanja-obavestenja.tsx` — kartica „OVAJ UREĐAJ" dobija granu `state === 'off'` (samo „Uključi na ovom uređaju", „Probno obaveštenje" sakriveno da ne prijavi lažno „Poslato") i novi red „Isključi na ovom uređaju" (samo kad `state === 'ok'`) sa `Alert` potvrdom koja objašnjava posledicu. Namerno BEZ trake „Poništi" — izlaz je trajno dugme, ne 8s traka; razlog u planu P6 §izmena 10 |
| C16 | Status odobrenja ideje se prikazuje | **REŠENO (lanac 6, P4)** — `Badge` u `ideje.tsx` (lista) i `ideja/[id].tsx` (detalj, `:227-233`); „Pretvori u stranicu" u `idea-actions-sheet.tsx` više se ne sakriva, prikazuje se onemogućen sa razlogom kad ideja nije odobrena |
| C17 | Ponovo kopirati kod postojeće pozivnice | **REŠENO (lanac 6, P1)** — sesijsko pamćenje (`lib/invite-codes.ts`, in-memory, NE na disk); dugme za deljenje u redu pozivnice dok je kod poznat u ovoj sesiji |

---

## D. Sitno

> **Brojevi D1–D20 dopisani u fazi P7** (13.08.2026). Sekcija je bila pisana u
> prozi, pa se na stavke nije moglo pokazati — a tabela ishoda na kraju dokumenta
> mora da ima red po stavci. Redosled brojeva je redosled kojim su stavke već
> bile navedene; ništa nije preuređeno.

**Zatvoreno u lancu 6, P3 (chat):**

- **D1** ~~Kopiranje teksta poruke~~ — red „Kopiraj tekst" u akcionom sheet-u
  (`message-actions-sheet.tsx`), implementacija u `message-list.tsx` (`handleCopy`).
  **`selectable` na mehuriću je svesno ODBIJENO**: na Androidu dugi pritisak nad
  `selectable` tekstom pokreće native selekciju i pojede `onLongPress` — jedini ulaz
  u taj isti sheet (odgovori, reakcije, izmeni, obriši).
- **D2** ~~Više fajlova odjednom u chatu~~ — `allowsMultipleSelection` + `multiple: true`
  i red čekanja (`message-composer.tsx`, `enqueue`): jedan upload → jedna poruka,
  redom kojim su izabrani, kao web `use-attachment-sender.ts`. Granica je **10 po
  izboru** (svesna, nije serverska). ~~**Prilozi STRANICE i dalje idu jedan po
  jedan.**~~ → **više ne, vidi D11 (P7).**
- **D3** ~~Video iz galerije u chat~~ — `mediaTypes: ['images','videos']`. Kamera namerno
  ostaje jedna slika (isti izuzetak koji `files-panel.tsx` već nosi).
  **Video se i dalje ne renderuje u mehuriću — ni na webu** (`message-row.tsx:307`
  grana samo `image/`), pa to nije rupa pariteta nego nova funkcija za obe platforme.
- **D4** ~~Pretraga članova pri otvaranju DM-a~~ — `components/chat/member-search-input.tsx`,
  montiran u oba koraka „Nove poruke" i u sheet-u „Članovi kanala".
- **D5** ~~Pomen (@) u sredini teksta~~ — `findMentionQuery` portovan u
  `apps/mobile/src/lib/chat.ts` (traži unazad OD KURSORA); umetanje čuva tekst iza
  kursora. Kapija: `apps/mobile/src/lib/chat.mention.test.ts` (8 tvrdnji).
- **D6** ~~Izmena poruke koja nosi prilog~~ — `canEdit` više ne traži `kind === 'text'`
  (`message-actions-sheet.tsx`), a kompozer dozvoljava prazno telo pri izmeni
  priloga (`submit`, `allowEmptyBody`).
- **D7** ~~Objašnjenje zašto izmena više nije moguća~~ — red „Izmeni" se više ne sakriva;
  dodir van prozora daje `Alert` sa doslovno web tekstom („…samo u prvih 15
  minuta."). Konstanta je sada jedna: obe platforme uvoze `CHAT_EDIT_WINDOW_MS`.

**Zatvoreno u lancu 6, P4 (ideje i misli):**

- **D8** ~~Datum kreiranja ideje u listi~~ — `ideje.tsx` (`IdeaItem.createdAt`),
  `formatDayHeading(startOfLocalDay(...))` u podnožju kartice, isti obrazac kao web.
- **D9** ~~„Nova grana ideje" u jednom potezu~~ — `IdeaCreateSheet` dobija opcioni `parent`
  (`ideas.create.parentIdeaId` + apsolutna pozicija preko `lib/canvas-position.ts`);
  ulaz je nov red u `idea-actions-sheet.tsx` („Nova grana ideje…").
- **D10** ~~„Nova povezana misao"~~ — `ThoughtCreateSheet` dobija opcioni `connectFrom`;
  `createNode` pa `createEdge` sa rollback-om (`archiveNodes`) ako ivica pukne, isto
  kao web `thoughts-canvas-view.tsx`. Ulaz je nov red u `thought-actions-sheet.tsx`.

**Zatvoreno u lancu 6, P7:**

- **D11** ~~više fajlova odjednom u **prilozima stranice**~~ — `files-panel.tsx`
  (`allowsMultipleSelection` + `selectionLimit: MAX_PAGE_FILES`, `multiple: true`,
  `enqueue` red čekanja, predprovera `planPageFilePicks`).
- **D12** ~~ikonica i naziv oblasti u zaglavlju kanala~~ — i u zaglavlju
  (`conversation-header.tsx`) i u listi (`conversation-row.tsx`), kroz nov
  `components/ui/area-icon.tsx` + `lib/area-meta.ts`.
- **D13** ~~rok kao pun kalendar pri kreiranju~~ — peti čip „Neki drugi dan…" u
  `page-create-sheet.tsx` otvara postojeći `DatePickerSheet` (do P7 nije bio ni
  uvezen; komentar u fajlu je tvrdio suprotno).
- **D14** ~~sadržaj beleške u dijalogu kreiranja~~ — polje „Sadržaj (opciono)" +
  `noteTextToHtml` (`lib/note-content.ts`).
- **D15** izbor oblasti pri kreiranju — **NIJE URAĐENO, svesna odluka.** Web piker
  je `disabled` kad postoji `target.areaId` (`create-page-dialog.tsx:142`), a sva
  tri mounta mobilnog sheeta prosleđuju konkretnu oblast; globalni ulaz („Novi
  zadatak") mobilni ima sa izborom oblasti (`quick-add-sheet.tsx:67-95`). Sheet
  sada bar KAŽE u kojoj oblasti pravi stavku.
- **D16** ~~pregled videa i „Preuzmi" u pregledaču priloga~~ — `file-preview.tsx`
  (video/audio kroz `WebView` sa `<video controls>`, dugme „Preuzmi", oba stanja
  greške koja web ima).
- **D17** kanban „Tabla" za zadatke — **NIJE URAĐENO, svesna odluka** (`ZA-POPRAVKU`
  §14).
- **D18** ~~„Sastav nedelje" na Pulsu~~ — nov `components/ui/pulse-bar.tsx`,
  montiran u `puls.tsx`.
- **D19** ~~spisak tima za ne-admina~~ — `vise.tsx` red bez `adminOnly`, admin
  radnje u `clanovi.tsx` gejtovane eksplicitno.
- **D20** ~~poruka da je lista zahteva odsečena na 100~~ — `odobrenja.tsx`, u oba
  segmenta.

**Ostaje otvoreno:** ništa iz sekcije D. Dve stavke (D15, D17) su zatvorene kao
odluke sa razlogom, ne kao posao. Dokazi po stavci: tabela ishoda na kraju.

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

---

# G. TABELA ISHODA — svih 44 stavke (dopisano u fazi P7, 13.08.2026)

> Zahtev faze P7: **nijedna stavka iz B, C i D ne sme da ostane neizgovorena.**
> Zato tabela ima tačno onoliko redova koliko dokument ima stavki: **B1–B7 (7) +
> C1–C17 (17) + D1–D20 (20) = 44.** Ishod je jedna od tri reči: **URAĐENO** /
> **DELIMIČNO** / **NIJE URAĐENO**, i svaka od njih nosi dokaz (fajl:linija) ili
> razlog.
>
> Linije su tačne u trenutku pisanja (commit faze P7). Kad se pomere, sudi po
> imenu simbola, ne po broju — to je pravilo koje je P5 već naučio.

## G.1 Sekcija B — velike rupe

| # | Radnja | Ishod | Dokaz / razlog |
|---|---|---|---|
| B1 | Urediti belešku sa tabelom / prilogom / blokom koda | **URAĐENO** (P2) | `apps/mobile/src/lib/note-editor-bridges.ts` (šema), `apps/mobile/editor-web/` (izvor bundle-a), `components/stranica/note-editor.tsx` (`customSource`, `bodyEditable = canEditBody`); čuvar gubitka: `lib/note-content.ts` (`noteSignatureLoss`) |
| B2 | Preimenovati zadatak | **URAĐENO** (P1) | `components/stranica/page-actions-sheet.tsx:399` (red „Preimenuj"), `:226` (`renameSubmit`), `:464`/`:477` (pod-prikaz sa unosom) |
| B3 | Preimenovati stranicu tipa Tabela / Prilozi | **URAĐENO** (P1) | isti red kao B2, uz uslov `page.kind !== 'note'`; `page-actions-sheet.tsx:44` (`rename` u meniju), `:399` |
| B4 | Diskusija (chat) nad idejom | **URAĐENO** (P3) | `components/chat/discussion-link.tsx:25-27`, `:64-67`; mount `app/(app)/ideja/[id].tsx:283-286` |
| B5 | Kopirati pozivnicu kao LINK | **URAĐENO** (P1) | `app/(app)/pozivnice.tsx` (`inviteLinkUrl` sada POZVAN), `lib/embed-url.ts`; pada na stari tok kad `EXPO_PUBLIC_WEB_URL` nije podešen |
| B6 | Dodati članove privatnom kanalu | **URAĐENO** (P3, i backend i oba klijenta) | `packages/backend/convex/chat.ts:1104` (`channelMembers`), `:1616` (`setChannelMembers`); mobilni `components/chat/channel-members-sheet.tsx`; web `components/workspace/chat/channel-members-dialog.tsx` |
| B7 | Ubaciti sliku / prilog / tabelu / CSV u telo beleške | **URAĐENO** (P2) | `components/stranica/note-insert-sheet.tsx`, ulaz „Dodaj…" u `note-toolbar.tsx`, upload u `note-editor.tsx` (`uploadAndInsert`) |

## G.2 Sekcija C — srednje

| # | Radnja | Ishod | Dokaz / razlog |
|---|---|---|---|
| C1 | Tema ostaje posle restarta | **URAĐENO** (P6) | `lib/device-prefs.ts` (`readThemePreference`/`writeThemePreference`), `theme/theme-provider.tsx:40` (čitanje u `useState` inicijalizatoru), `:42` |
| C2 | Aktivan startup ostaje posle restarta | **URAĐENO** (P6) | `packages/backend/convex/startups.ts:101` (`isCurrentMember`) + `startups.test.ts`; `context/active-startup.tsx:52-56` (`restoring`), `components/app-header.tsx:54-59` |
| C3 | Boja kartice ideje | **URAĐENO** (P4) | `components/ui/color-row.tsx`; `components/canvas/idea-create-sheet.tsx` (kreiranje), `app/(app)/ideja/[id].tsx:94` (`draftColor`), `:132` (šalje se u `update`), `:390` (`ColorRow`) |
| C4 | Duplirati ideju | **URAĐENO** (P4) | `components/ideja/idea-actions-sheet.tsx` (`duplicate()`), `lib/canvas-position.ts`, `lib/undo.ts` (`ideaCreate`) |
| C5 | Oznaka veze se VIDI na kanvasu | **URAĐENO** (P4) | `components/ideja/idea-edge-sheet.tsx:70` (`updateEdgeLabel` upis); `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` (`edge.label` u mapiranju ivica + CSS `.react-flow__edge-text` u `EmbedStyles`) |
| C6 | Boja čvora se vidi na kanvasu | **URAĐENO** (P4) | `canvas-embed.tsx` (`embedNodeColor`, `data.color` za ideje i misli) |
| C7 | Filter po tipu u oblasti | **URAĐENO** (P5) | `components/prostor/kind-filter-row.tsx`, mount `app/(app)/(tabs)/prostor.tsx:540`, filter u `pages.listChildren` (`:528`); kapija `pages.test.ts` |
| C8 | Filter/pretraga unutar ideja i misli | **URAĐENO** (P4) | `components/ui/search-field.tsx`; `app/(app)/ideje.tsx`, `app/(app)/misli.tsx` |
| C9 | Ugnjezditi pod stranicu koja nije u korenu | **URAĐENO** (P5) | `components/stranica/page-target-picker.tsx`, zamena liste u `page-actions-sheet.tsx:544`; undo `lib/undo.ts:235` (`pageReparent`), `components/undo-bar.tsx:321` |
| C10 | Premestiti u oblast POD određenu stranicu | **URAĐENO** (P5) — **bila SERVERSKA rupa, ne mobilna** | `packages/backend/convex/areasV2.ts:3738` (`movePageAcrossAreasWithSidecars`), `:3750` („Stranica nije pronađena posle premeštanja." — ponovno čitanje dokumenta, zamka Z12), `:3755` (`moveWithinArea` u istoj transakciji); mobilni ulaz `page-actions-sheet.tsx:544` (`PageTargetPicker` u koraku `moveTarget`); tri nova testa u `areasV2.test.ts` |
| C11 | Breadcrumbs kao dugmad | **URAĐENO** (P5) | `components/breadcrumbs-eyebrow.tsx:125` (`PathSheet`), `:150`, `:200`; mount `app/(app)/stranica/[id].tsx:118`, `app/(app)/zadatak/[id].tsx:353` |
| C12 | Redo, i undo dublji od jednog koraka | **DELIMIČNO** (P6) | Undo stek URAĐEN: `lib/undo.ts` (`entries[]`, `MAX_UNDO_ENTRIES`), `hooks/use-undo-runner.ts`, `app/(app)/istorija.tsx`, kapija `lib/undo.test.ts`. **Redo NIJE — svesna odluka sa tri razloga:** `ZA-POPRAVKU.md` §12. Stek ne preživljava restart, takođe svesno: §13 |
| C13 | Nit doprinosa na checkpointu | **URAĐENO** (P5) | `components/zadatak/checkpoint-contributions-sheet.tsx`; ulaz `components/zadatak/task-checkpoint-list.tsx:376`, mount `:441` |
| C14 | Potpisani doprinosi na nivou oblasti | **URAĐENO** (P5) | `components/prostor/area-contributions-section.tsx`, mount `app/(app)/(tabs)/prostor.tsx:255`; `contribution-thread.tsx:54` (`area` član unije); traka „Poništi" `prostor.tsx:288` |
| C15 | Isključiti push na ovom uređaju | **URAĐENO** (P6) | `lib/notifications/register.ts:240` (`useDisablePushDevice`), `:223-226` (preskakanje registracije), `:107`; UI `app/(app)/podesavanja-obavestenja.tsx`. Namerno bez trake „Poništi" — izlaz je trajno dugme |
| C16 | Status odobrenja ideje se prikazuje | **URAĐENO** (P4) | `app/(app)/ideje.tsx` (lista), `app/(app)/ideja/[id].tsx:227-228` (`statusRow` + `Badge` u detalju); `components/ideja/idea-actions-sheet.tsx` („Pretvori u stranicu" onemogućen sa razlogom umesto sakriven) |
| C17 | Ponovo kopirati kod postojeće pozivnice | **URAĐENO** (P1) | `lib/invite-codes.ts` (sesijsko pamćenje, NE na disk), dugme u redu `app/(app)/pozivnice.tsx` |

## G.3 Sekcija D — sitno

| # | Radnja | Ishod | Dokaz / razlog |
|---|---|---|---|
| D1 | Kopiranje teksta poruke | **URAĐENO** (P3) | `components/chat/message-actions-sheet.tsx` (red „Kopiraj tekst"), `message-list.tsx` (`handleCopy`). `selectable` na mehuriću svesno odbijeno (jede `onLongPress` na Androidu) |
| D2 | Više fajlova odjednom u chatu | **URAĐENO** (P3) | `components/chat/message-composer.tsx` (`enqueue`, `allowsMultipleSelection`, `multiple: true`), granica 10 po izboru |
| D3 | Video iz galerije u chat | **URAĐENO** (P3) | `message-composer.tsx` (`mediaTypes: ['images','videos']`). Render videa u mehuriću ne postoji **ni na webu** (`message-row.tsx:307`) → nije rupa pariteta |
| D4 | Pretraga članova pri otvaranju DM-a | **URAĐENO** (P3) | `components/chat/member-search-input.tsx`, montiran u oba koraka „Nove poruke" i u „Članovi kanala" |
| D5 | Pomen (@) u sredini teksta | **URAĐENO** (P3) | `lib/chat.ts` (`findMentionQuery`), kapija `lib/chat.mention.test.ts` (8 tvrdnji) |
| D6 | Izmena poruke koja nosi prilog | **URAĐENO** (P3) | `message-actions-sheet.tsx` (`canEdit` bez `kind === 'text'`), `message-composer.tsx` (`allowEmptyBody`) |
| D7 | Objašnjenje zašto izmena više nije moguća | **URAĐENO** (P3) | `message-actions-sheet.tsx` (`Alert`, doslovno web tekst); konstanta `CHAT_EDIT_WINDOW_MS` uvezena na obe platforme |
| D8 | Datum kreiranja ideje u listi | **URAĐENO** (P4) | `app/(app)/ideje.tsx` (`IdeaItem.createdAt` + `formatDayHeading`) |
| D9 | „Nova grana ideje" u jednom potezu | **URAĐENO** (P4) | `components/canvas/idea-create-sheet.tsx` (prop `parent`), ulaz u `components/ideja/idea-actions-sheet.tsx` |
| D10 | „Nova povezana misao" | **URAĐENO** (P4) | `components/canvas/thought-create-sheet.tsx` (prop `connectFrom`, rollback preko `archiveNodes`), ulaz u `components/misli/thought-actions-sheet.tsx` |
| D11 | Više priloga odjednom na STRANICI | **URAĐENO** (P7) | `components/stranica/files-panel.tsx:167-168` (galerija: `allowsMultipleSelection` + `selectionLimit: MAX_PAGE_FILES`), `:215` (`multiple: true`), `:125` (`enqueue`), `:144-145` (`startPicks` → `planPageFilePicks`); nov `lib/page-file-picks.ts` + `lib/page-file-picks.test.ts` (10 tvrdnji). Kamera ostaje jedan snimak (zatečen svestan izuzetak) |
| D12 | Ikonica i naziv oblasti u zaglavlju kanala | **URAĐENO** (P7) | Zaglavlje: `components/chat/conversation-header.tsx:312` (ikonica + boja oblasti), `:61` (podnaslov „Kanal oblasti · X"); lista: `components/chat/conversation-row.tsx:78`. Nov `components/ui/area-icon.tsx` + `lib/area-meta.ts` + test (5 tvrdnji); razrešavanje `lib/chat.ts` (`findChannelArea`), pozvano na `app/(app)/razgovor/[id].tsx:160` i `app/(app)/(tabs)/chat.tsx:151` |
| D13 | Rok kao pun kalendar pri kreiranju | **URAĐENO** (P7) | `components/canvas/page-create-sheet.tsx:396-400` (peti čip „Neki drugi dan…", nosi izabran datum kad nije preset), `:466-468` (`DatePickerSheet` kao BRAT sheeta), `:129` (`dueAt` u ms umesto `dueDays`). Lažan komentar iz `:52` obrisan |
| D14 | Sadržaj beleške u dijalogu kreiranja | **URAĐENO** (P7) | `page-create-sheet.tsx:307` (`Section label="Sadržaj (opciono)"`), `:189` (`content: noteTextToHtml(noteText)`); nov `noteTextToHtml` u `lib/note-content.ts` + `lib/note-content.text.test.ts` (10 tvrdnji). Namerno NIJE tentap editor u sheet-u — razlog u docstring-u funkcije |
| D15 | Izbor oblasti pri kreiranju | **NIJE URAĐENO — svesna odluka** | Web piker je `disabled` kad postoji `target.areaId` (`apps/web/components/workspace/create-page-dialog.tsx:142`), a sva tri mounta mobilnog sheeta prosleđuju konkretnu oblast (`prostor.tsx:277`, `canvas/[kind]/[id].tsx:1093`/`:1103`, `subpages-section.tsx:172`). Web-ov jedini put sa OMOGUĆENIM pikerom je globalni „Novi zadatak", a mobilni pandan to VEĆ ima (`components/danas/quick-add-sheet.tsx:67` (labela „Oblast") i `:73-95` (čipovi oblasti)). Dodati piker gde ga web zaključava = udaljiti se od weba. **Urađeno je ono što je falilo:** sheet sada kaže u kojoj oblasti pravi stavku (`page-create-sheet.tsx:251`) |
| D16 | Pregled videa i „Preuzmi" u pregledaču priloga | **URAĐENO** (P7) | `components/stranica/file-preview.tsx:28` (`kind` prima `video`/`audio`), `:42` (`mediaDocument` — `<video controls playsinline>` kroz memoizovan `source={{html}}`, Z1), `:148` (dugme „Preuzmi", `Linking.openURL` sa fallback-om), `:160` i `:166` (oba stanja greške koja web ima); grana je dostupna preko `files-panel.tsx:234` (`openFile`) |
| D17 | Kanban „Tabla" za zadatke | **NIJE URAĐENO — svesna odluka** | Tri dokaza: (1) `docs/mobile/00-PLAN.md` Faza 2 doslovno kaže „Svajp gestovi umesto drag-and-drop kanbana"; (2) funkcija POSTOJI, samo je vertikalna — `app/(app)/zadaci.tsx:173-176` (`grouped`, grupisanje po `TASK_STATUS_ORDER`), `:383` (petlja po statusima) i `:388` (`SectionHeader` sa `count`), `:248` (`applyStatus` menja status iz sheet-a), a web tabla nudi tačno te dve radnje; (3) paritet je funkcionalni — pet kolona sa horizontalnim skrolom na 360dp je prepis izgleda. Zapisano i u `ZA-POPRAVKU.md` §14 |
| D18 | „Sastav nedelje" na Pulsu | **URAĐENO** (P7) | Nov `components/ui/pulse-bar.tsx`; mount `app/(app)/puls.tsx:165-167`, segmenti `:123` (doslovno web `puls-view.tsx:99-117`), skeleton iste visine dok podaci ne stignu. Bez animacije, namerno — jedini potrošač je Puls, gde web šalje `pulseTone={null}` |
| D19 | Spisak tima za ne-admina | **URAĐENO** (P7) | `app/(app)/(tabs)/vise.tsx:72` (red bez `adminOnly`); admin radnje gejtovane unutra: `app/(app)/clanovi.tsx:116` (ulaz „Dodaj člana"), `:191` (dugme za uklanjanje se ne renderuje ne-adminu), `:231` (mount `AddMemberSheet` iza `isAdmin` — `profiles.listAll` je query iza `requireAdmin` i oborio bi ekran) |
| D20 | Poruka da je lista zahteva odsečena na 100 | **URAĐENO** (P7) | `app/(app)/odobrenja.tsx:562` (`TruncationNote`), pozvano na `:338` (segment „Čeka") i `:417` (segment „Moji") — u OBA, jer je serverski `truncated` jedna zastavica za incoming i outgoing (`areasV2.ts:3336-3338`) |

## G.4 Zbir

| Ishod | Broj | Koje |
|---|---|---|
| **URAĐENO** | 41 | B1–B7, C1–C11, C13–C17, D1–D14, D16, D18–D20 |
| **DELIMIČNO** | 1 | C12 (undo stek da, redo namerno ne) |
| **NIJE URAĐENO — odluka sa razlogom** | 2 | D15, D17 |
| **NIJE URAĐENO — propust** | 0 | — |

---

# H. Nalazi faze P7 koji NISU iz ove revizije

Nađeni tokom P7, van opsega zadatka. Zapisani da se ne izgube, **nijedan nije
urađen** (osim trećeg, koji je bio laž u komentaru).

1. **„Sastav dana" na tabu „Danas" ne postoji.** Web ima istu traku i u komandnom
   centru (`apps/web/components/workspace/command-center-view.tsx:329-332`,
   `label="Sastav dana"`), mobilni `app/(app)/(tabs)/danas.tsx` je nema. **Nije u
   sekciji D** i nije u zadatku faze; uz to `components/danas/day-summary.tsx:57-79`
   već prikazuje ista tri broja (otvoreno/kasni/hitno), pa je razlika vizuelna.
   Posle P7 primitiv postoji (`components/ui/pulse-bar.tsx`), pa je posao ~8 linija
   — **ostavljeno korisniku za odluku.** Napomena: web tamo OTKUCAVA
   (`pulseTone="danger"`), pa bi se sa tim pozivaocem dodao i otkucaj u primitiv.
2. **Navigacija između priloga u pregledaču („1 od 5", strelice) ne postoji na
   mobilnom.** Web ima (`apps/web/components/workspace/files/file-viewer-dialog.tsx:150-172`).
   Nije u sekciji D. Posao traži da `FilePreview` primi CELU listu priloga umesto
   jednog, plus gest za sledeći/prethodni — nije jednolinijska izmena.
3. **Lažan komentar u `page-create-sheet.tsx:52`** — tvrdio je da „proizvoljan datum
   nosi `DatePickerSheet`", a sheet u tom fajlu nije bio ni uvezen ni montiran.
   **Ispravljen u P7** (sada je tačan, jer sheet postoji). Pouka: komentar nije
   dokaz — dokaz je lanac uvoza.
4. **`docs/mobile/PARITET.md` brojač poziva ne vidi ništa od P7.** Sve četiri
   izmene koje pišu ili čitaju sa servera koriste funkcije koje mobilni VEĆ zove
   (`startups.get`, `pageFiles.*`, `areasV2.listNestingInbox`, `areasV2.createPage`).
   Isti nalaz kao K5 i §5.7 — brojač po imenima funkcija ne meri paritet.
