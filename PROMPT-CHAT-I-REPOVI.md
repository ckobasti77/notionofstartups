# Prompt: chat kao ozbiljan chat + repovi lanca 4

```
Model:   opus            (Opus 5)
Effort:  max
Tip:     GOAL prompt — cilj i dokaz, ne spisak koraka
Pokretanje:
    Get-Content .\PROMPT-CHAT-I-REPOVI.md -Raw | claude --model opus --effort max --permission-mode bypassPermissions
```

Pre koda napiši plan u `docs/mobile/lanac5/PLAN.md`. Posle svakog cilja upiši dokaz.
**Backend SMEŠ da menjaš** — za razliku od lanca 4, ovde je izmena backenda deo posla.

---

## Šta pročitati pre svega

- `docs/mobile/ZA-POPRAVKU.md` — posebno §9 (K5 nije urađen) i §10 (desktop mišem)
- `docs/mobile/lanac4/REZIM.md` — protokol režima „Uredi raspored", pravilo 7
- `docs/mobile/04-CHAT.md` — pravila chata
- `docs/mobile/lanac4/planovi/faza-k5.md:119-127` — zamka koordinata

---

## CILJ 1 — Svaka poruka nosi obaveštenje (najvažnije)

**Simptom koji je korisnik prijavio:** stigne obaveštenje za prvu poruku, pa 3-4
poruke u sledećih 15 sekundi ne daju ništa, čak ni posle 35 sekundi.

**Uzrok je pronađen, ne traži ga ponovo.** `packages/backend/convex/chat.ts:543`:

```js
dedupeKey: `chat:${channel._id}:${recipientId}:${Math.floor(now / 60_000)}`
```

`Math.floor(now / 60_000)` je kanta od jednog kalendarskog minuta. Prva poruka u
kanti prolazi, ostale se tiho odbace u `createNotification`
(`lib/notifications.ts`, provera `by_dedupeKey`).

**Ishod koji se traži:**

1. **Svaka poruka pravi obaveštenje.** Ključ postaje po poruci
   (`chat:${messageId}:${recipientId}`), da zaštita od dvostrukog upisa ostane,
   a prigušenje nestane.

2. **Jedini izuzetak:** primalac je **u tom kanalu** i **na dnu**. Tada nema ni
   push-a ni reda u zvoncetu — pročitao je uživo, ne sme da ga čeka kao
   nepročitano. Tačno kao WhatsApp.

   Sve ostalo zvoni: drugi kanal, skrolovan gore, aplikacija u pozadini,
   ugašena, drugi ekran, drugi uređaj.

**Kako se zna da „gleda dno":** obe strane to VEĆ znaju, ne izmišljaj.
- mobilni: `apps/mobile/src/components/chat/message-list.tsx`, `atBottomRef`
- web: `apps/web/components/workspace/chat/message-list.tsx`, `nearBottomRef`

Predlog (odbij ga ako nađeš bolji, ali obrazloži): `chatReads` dobija polje sa
vremenskim žigom isteka (npr. `citaDoUnix`), klijent ga osvežava dok je ekran u
fokusu i dok je na dnu, `sendCore` preskače primaoca kome žig još važi.

**TTL je obavezan.** Bez njega ugašen ekran, zaključan telefon ili prekinuta
mreža ostavljaju korisnika zauvek „prisutnim" i on više nikad ne dobije
obaveštenje. Odjava koja zavisi od klijenta se ne dešava.

**Dokaz:** iz drugog naloga pošalji pet poruka u deset sekundi i pokaži pet
obaveštenja. Zatim otvori kanal na dnu i pokaži nula. Zatim skroluj gore u istom
kanalu i pokaži da opet stižu. Convex logovi + snimci ekrana.

---

## CILJ 2 — Slika u chat na kompjuteru

`sendAttachment(file, "file")` u `apps/web/components/workspace/chat/message-composer.tsx:117`
već prima `File` i radi ceo posao. Fali samo da mu se fajl dostavi na dva načina:

1. **Ctrl+V** — `onPaste` čita `clipboardData`. Screenshot iz clipboard-a dolazi
   kao `image/png` **bez imena**; daj mu ime sa vremenskom oznakom.
2. **Prevuci i pusti** — na celom prozoru razgovora, sa vidljivim okvirom
   „Pusti da pošalješ", i podrškom za više fajlova odjednom.

Poštuj postojeća ograničenja veličine i tipa iz `chat.generateUploadUrl`. Ako ih
nema, dodaj ih na serveru — ne samo u UI-ju.

**Dokaz:** kopiraj screenshot pa nalepi; prevuci dva fajla odjednom. Slike u oba
slučaja.

---

## CILJ 3 — Ideje i Misli dobijaju režim „Uredi raspored" (ZA-POPRAVKU §9)

Faza K5 lanca 4 **nije ni započeta**, iako commit nosi njeno ime. Dokaz je u
kodu: `canvas-embed.tsx:312-314` (`IdeasFlow`/`ThoughtsFlow` dobijaju
`editMode`/`connectSourceId` bez handlera) i `canvas/[kind]/[id].tsx:272`
(`supportsEdit = isPageKind`).

Brojač pariteta ovo NE vidi, jer se te mutacije već zovu sa native listi. Ne
oslanjaj se na broj — oslanjaj se na to da li prst radi.

Backend je ceo tu, ništa se ne dodaje: `ideas.updatePositions`,
`thoughts.moveNodes`, `ideas.updateLayout`/`resetLayoutSize`,
`thoughts.updateNodeLayout`/`resetNodeLayoutSize`, `ideas.connect`/`disconnect`,
`thoughts.createEdge`/`archiveEdges`, `saveViewport` na obe strane.

**ZAMKA koju moraš znati.** Ideje i misli imaju **ugnježdene čvorove**
(`parentId`), kartice stranica nemaju. U `@xyflow/react` čvor sa `parentId` ima
poziciju **relativnu na roditelja**, a backend očekuje **apsolutnu**. Ako
proslediš `node.position` iz `onNodeDragStop` direktno, ugnježden čvor tiho
sleti na pogrešno mesto — i to primeti tek sledeći član tima. Desktop to već
rešava; izdvoj tu logiku u zajednički modul, ne prepisuj po sećanju.

**Dokaz:** pomeren ugnježden čvor, pa osvežena stranica — mora biti tamo gde si
ga ostavio. Bez toga cilj nije ispunjen.

---

## CILJ 4 — Desktop kanvas mišem (ZA-POPRAVKU §10, otvoreno četvrtu fazu zaredom)

Do sada je ne-regresija desktopa dokazivana samo staticki, jer nijedan agent
nije imao kredencijale. **Sada ih ima:** dev nalog `jovanm028@gmail.com`,
lozinku ti daje korisnik uz ovaj prompt.

Prijavi se na `localhost:3000` i mišem proveri na kanvasu oblasti, ideja i misli:
prevlačenje kartice, promena veličine, povlačenje veze, `Ctrl+Z`, pan i zoom.
Sve mora da radi tačno kao pre lanca 4.

Ako nađeš regresiju — popravi je i to je prioritet iznad svega ostalog u ovom
promptu.

**Dokaz:** snimci ekrana pre i posle za svaku od pet radnji.

---

## Pravila

- Dodirna meta min 44pt. Tekst min 16px osim meta.
- Svaka izmena koja piše u bazu ima „Poništi" — koristi postojeći `lib/undo.ts`.
- Prazno, učitavanje i greška — sva tri stanja svuda gde ih dodaješ.
- Uz svaki dokaz napiši fajl i liniju.
- Ne čekiraj ništa što nemaš čime da dokažeš. Radije napiši „nije urađeno" —
  faza K6 lanca 4 je to uradila i zato joj se veruje.

## Kapije na kraju

```
cd apps/mobile && npx tsc --noEmit
cd apps/web    && npx tsc --noEmit
npm run lint
npm test
npm run build
```

Sve mora da prođe. Na kraju napiši `docs/mobile/lanac5/BRIEF.md`: šta je
urađeno, šta nije i zašto, i šta čovek mora sam da proveri na fizičkom telefonu.
