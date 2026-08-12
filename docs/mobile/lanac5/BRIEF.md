# Lanac 5 — brief

> Šta jeste, šta nije i zašto, i šta čovek mora sam da proveri.
> Plan: `docs/mobile/lanac5/PLAN.md`. Datum: 2026-08-12.

---

## Kapije

| Kapija | Ishod |
|---|---|
| `apps/mobile` `npx tsc --noEmit` | prolazi (exit 0) |
| `apps/web` `npx tsc --noEmit` | prolazi (exit 0) |
| `npm run lint` | prolazi — **0 grešaka, 0 upozorenja** |
| `npm test` | **40 fajlova, 350 testova, svi prolaze** (prethodno 337) |
| `npm run build` | prolazi — „Compiled successfully in 16.6s" |

Novi testovi: 13 (`chat.test.ts` +8, `apps/web/lib/canvas-nesting.test.ts` +9,
minus preraspodela — ukupno 350 vs 337).

---

## 1. Svaka poruka nosi obaveštenje — **URAĐENO**

**Uzrok.** `chat.ts` je pravio `dedupeKey` sa kantom od jednog kalendarskog minuta
(`chat:<kanal>:<primalac>:<minut>`). `createNotification`
(`lib/notifications.ts:213–219`) na postojeći ključ vraća `null` **pre** upisa reda i
pre oba push posla, pa je od rafala poruka zvonila samo prva.

**Šta je promenjeno**

| Šta | Gde |
|---|---|
| Ključ po PORUCI (`chat:<messageId>:<recipientId>`) | `packages/backend/convex/chat.ts` (`insertMessage`) |
| Nova tabela `chatPresence` (žig isteka, TTL 45 s) | `packages/backend/convex/schema.ts` |
| `CHAT_PRESENCE_TTL_MS` / `CHAT_PRESENCE_REFRESH_MS` | `packages/backend/convex/lib/validators.ts` |
| Mutacija `chat.setPresence({channelId, present})` | `packages/backend/convex/chat.ts` |
| Preskakanje obaveštenja za prisutnog primaoca | `chat.ts`, `isPresentInChannel`, pre `createNotification` |
| Web otkucaj | `apps/web/components/workspace/chat/use-chat-presence.ts` |
| Mobilni otkucaj | `apps/mobile/src/hooks/use-chat-presence.ts` |
| „Na dnu" → roditelju | `message-list.tsx` na oba klijenta (`onAtBottomChange`) |

**Odstupanje od predloga iz zadatka, sa razlogom.** Zadatak je predlagao žig isteka
na `chatReads`. Prisustvo je umesto toga u **zasebnoj tabeli**: `chatReads` čitaju
`unreadSummary` i `listChannels`, pa bi otkucaj na svakih 15 s prezidavao listu
razgovora i badge dok korisnik samo gleda otvoren chat. `chatPresence` ne pretplaćuje
niko, pa upis nikoga ne budi. Cena na serveru je ista (jedan indeksni `withIndex` po
primaocu, isti oblik koji `insertMessage` već radi za `getChatRead`).

**TTL je obavezan i postoji.** 45 s, uz **eksplicitno gašenje** na blur, prelazak u
pozadinu, skrol gore i napuštanje ekrana — TTL je mreža za nasilno gašenje app-a i
pucanje mreže, ne primarni mehanizam.

**Pominjanje prisutnog primaoca takođe ćuti.** Ako gledaš poruku u kojoj te neko
pomenuo, video si je. Isto pravilo kao WhatsApp; zapisano jer je odluka, ne previd.

**Nepročitano se i dalje broji** i kad je primalac prisutan — guard stoji posle
`upsertChatRead`, pa badge ostaje tačan i ako `markChannelRead` sa klijenta padne.

**ŽIVI DOKAZ (12.08., dva naloga na `localhost:3000`).** Kod Majstora je poslao pet
poruka u DM Jovanu, sve u istom kalendarskom minutu (22:33). Jovanovo zvonce je
otišlo sa **11 na 16**, a panel „Obaveštenja" je pokazao **pet zasebnih redova**:
„L5 test 1"…„L5 test 5", svih pet sa oznakom `12. avg 22:33`. Po starom ključu bi
postojao **jedan** red. To je tačno simptom iz zadatka i on je mrtav.

**Šta živi test NIJE mogao da dokaže — i zašto.** Izuzetak „prisutan na dnu" traži da
primaočev prozor bude vidljiv dok pošiljalac šalje. U automatizaciji sa dva Chrome
prozora to je nemoguće: prebacivanje na pošiljaočev prozor prekriva primaočev, pa
`document.visibilityState` postane `hidden`. Provereno u samom prozoru:

```
javascript: ({ visibility: document.visibilityState })  →  { visibility: "hidden" }
```

Klijent je tada, **ispravno**, prijavio odsustvo — i tri poruke poslate iz tog stanja
su uredno napravile tri obaveštenja (zvonce 0 → 3). To je pola pravila dokazano
uživo („drugi ekran / pozadina zvoni"); druga polovina („na dnu ćuti") ostaje na
`chat.test.ts` i na ručnoj proveri sa dva vidljiva prozora ili telefon + desktop.

**Dokaz** (`packages/backend/convex/chat.test.ts`, `describe("chat obaveštenja")`):

- 5 poruka u rafalu → **5** obaveštenja, 5 različitih `dedupeKey`;
- prisutan primalac → **0** obaveštenja, `unreadCount` i dalje 3, a drugi član dobija svoja 3;
- pominjanje prisutnog → 0;
- istekao žig → obaveštenja opet stižu;
- `setPresence(false)` → sledeća poruka zvoni;
- prisustvo u DRUGOM kanalu ne gasi obaveštenja iz ovog.

---

## 2. Slika u chat na webu — **URAĐENO**

| Šta | Gde |
|---|---|
| `Ctrl+V` sa slikom | `message-composer.tsx` (`handlePaste`) + `mention-textarea.tsx` (`onPaste` prop) |
| Drag & drop na CEO prozor razgovora + okvir „Pusti da pošalješ" | `conversation-pane.tsx` |
| Više fajlova odjednom (redom, jedna poruka po fajlu) | `use-attachment-sender.ts` (`sendFiles`) |
| Ime sa vremenskom oznakom za screenshot | `use-attachment-sender.ts` (`timestampedName`) |
| Spajalica sada prima više fajlova (`multiple`) | `message-composer.tsx` |

**Nalaz koji menja formulaciju zadatka.** Ograničenja veličine i tipa u
`chat.generateUploadUrl` **nisu postojala** — ta mutacija proverava samo pristup
kanalu, a `sendMessage` je `attachmentType`/`attachmentSize` primao od klijenta i
upisivao neproverene. Dakle: granice su **uvedene**, ne prenete.

Serverska provera je u `chat.sendMessage` → `resolveAttachment`: metapodaci se čitaju
sa servera (`ctx.db.system.get("_storage", …)`), tip i veličina se upisuju **iz njih**,
a ne iz argumenata. Spisak dozvoljenih tipova i granice su **iste** kao za priloge
stranica (`lib/page_files.ts`: 50 MB, 200 MB za video) — jedan spisak za ceo proizvod.
Isti uslov je ogledan i na klijentima pre uploada (`attachmentRejection` na webu,
`uploadAndSend` na mobilnom), da odbijen fajl ne ostavi siroč blob.

**Dokaz** (`chat.test.ts`, `describe("chat prilozi")`): `.exe` predstavljen kao
`image/png` je odbijen; prihvaćen prilog dobija veličinu 5 iz metapodataka umesto
`999_999` iz argumenata.

---

## 3. Ideje i Misli — režim „Uredi raspored" (K5) — **URAĐENO (kod), ČEKA PRST**

Faza K5 ranije nije bila ni započeta (`ZA-POPRAVKU.md` §9). Sada:

| Radnja | Ideje | Misli |
|---|---|---|
| potez prstom | `ideas.updatePositions` | `thoughts.moveNodes` |
| veličina (ručke + preseti) | `updateLayout` / `resetLayoutSize` | `updateNodeLayout` / `resetNodeLayoutSize` |
| veza (tap izvor → tap cilj) | `connect` / `disconnect` | `createEdge` / `archiveEdges` |
| kamera | `ideas.saveViewport` | `thoughts.saveViewport` |

- `apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx` — `IdeasCanvasView`,
  `ThoughtsCanvasView` (handleri + zamrznut `initialViewport`).
- `apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx` — `supportsEdit = true`,
  grananje poruka po `canvas`, dva nova sheet-a u rail-u.
- `apps/mobile/src/components/canvas/idea-node-sheet-actions.tsx`,
  `thought-node-sheet-actions.tsx` — nad **deljenim** sekcijama
  (`node-edges-section.tsx`, `node-size-section.tsx`), bez treće kopije.
- `apps/mobile/src/lib/undo.ts` + `undo-bar.tsx` — šest novih članova:
  `ideaMove`, `ideaResize`, `ideaEdgeConnect`, `thoughtMove`, `thoughtResize`,
  `thoughtEdgeConnect`. Svaki upis u bazu ima „Poništi".

**Zamka (rešena, sa testom).** Embed ugnježdene čvorove crta **apsolutno**, baza ih
čuva **relativno na roditelja**. Prevod je u `apps/web/lib/canvas-nesting.ts`
(`absolutePositions` za crtanje, `storedMovesFor` za upis), sa 9 testova u
`canvas-nesting.test.ts` — uključujući round-trip na lancu dubine 3, ciklus u lancu
roditelja i slučaj „roditelj i dete povučeni zajedno → dete se ne upisuje".

**Prihvaćeno ograničenje (nije bag).** Dok se vuče RODITELJ, njegova deca u embedu ne
prate prst — doskoče posle upisa, jer baza decu drži relativno. Krajnje stanje je
identično desktopu. Zapisano u `lanac4/REZIM.md` §3a.

**Protokol mosta** je proširen diskriminatorom `canvas` (`"page" | "ideas" | "thoughts"`);
odsustvo polja znači `"page"`, pa se K1–K4 poruke nisu menjale. Tabela u
`lanac4/REZIM.md` §3a.

**Paritet.** Razlika je i dalje **tačno 7** — ista kao pre K5. To nije znak da nešto
fali: te funkcije su se i ranije brojale preko native LISTI. Broj se ne čita kao
dokaz; dokaz su fajlovi i linije gore.

---

## 4. Desktop kanvas mišem (`ZA-POPRAVKU` §10) — **URAĐENO, ČETVRTA FAZA ZATVORENA**

Lozinku agent i dalje ne sme da unosi ni u jedno polje (pravilo je kategorično i ne
menja ga to što je korisnik ponudi). Korisnik je zato **sam** bio prijavljen u svom
Chrome-u, a agent je preuzeo tu sesiju. Sve ispod je stvarni miš, ne statička analiza.

Prijavljen nalog: Jovan Milojević, startup **ScanMe**, `localhost:3000`.

| Provera | Ideje | Misli | Oblast (Dev) |
|---|---|---|---|
| prevlačenje kartice | ✅ | ✅ | ✅ |
| `Ctrl+Z` posle poteza | ✅ „Poništeno: pomeranje ideje" | ✅ „Poništeno: pomeranje misli" | ✅ „Poništeno: pomeranje kartice" |
| promena veličine obodom | ✅ | ✅ | ✅ |
| `Ctrl+Z` posle veličine | ✅ | ✅ „Poništeno: promena veličine misli" | ✅ |
| veza (povlačenje niti) | ✅ „Ideje su povezane." | ✅ | ✅ „Kartice su povezane." |
| `Ctrl+Z` posle veze | ✅ „Poništeno: povezivanje ideja" | ✅ „Poništeno: povezivanje misli" | ✅ „Poništeno: povezivanje kartica" |
| zum (`+` / `−`) | ✅ 77% → 111% | ✅ | ✅ |
| pan | ✅ (prevlačenje po minimapi) | ✅ | ✅ |

**Nula regresija.** Svaka izmena napravljena tokom provere je odmah poništena, pa je
baza ostala u zatečenom stanju.

**Zapažanje, ne bug:** veza se pravi **iz izlazne u ULAZNU tačku** (desna tačkica →
leva tačkica ciljnog čvora). Povlačenje desna → desna ne radi ništa i ne prijavljuje
grešku — očekivano xyflow ponašanje (source → target), ali lako izgleda kao kvar.
Isto važi i na sva tri kanvasa.

**Zapažanje 2:** prevlačenje po praznom platnu je **guma-selekcija**, ne pan (hint
traka to i kaže: „Prevuci za izbor"). Pan ide space+prevlačenje ili minimapa.

**Statički dokazi i dalje stoje:** `git status --short` po
`apps/web/components/workspace/ideas-canvas-view.tsx`,
`apps/web/components/workspace/thoughts/`,
`apps/web/components/workspace/area-canvas-view.tsx` i
`apps/web/components/workspace/canvases/` je **prazan** — desktop kanvas nije dirnut u
lancu 5; jedini novi web modul (`lib/canvas-nesting.ts`) uvozi isključivo `app/embed/`.

---

## Šta čovek MORA sam da proveri na telefonu

Agent nema uređaj ni sesiju; sve ispod je proverivo samo prstom.

### Chat — obaveštenja

1. ~~Sa drugog naloga pošalji 5 poruka u 10 s~~ — **provereno uživo na desktopu**
   (11 → 16, pet redova u istom minutu). Na telefonu ostaje da se potvrdi da svih pet
   stigne kao **push**, sa pravim zvukom po tipu.
2. Otvori taj razgovor i **stoj na dnu**; neka drugi nalog pošalje 3 poruke →
   **nijedno obaveštenje**, poruke samo doskaču. **Ovo je jedina stavka koju
   automatizacija nije mogla da dokaže** (vidi §1: prebacivanje između dva prozora
   sakriva primaočev, pa klijent ispravno prijavi odsustvo). Proveri sa telefonom u
   ruci i desktopom kao pošiljaocem.
3. U istom razgovoru **skroluj gore** i neka stigne nova poruka → obaveštenje **stiže**.
4. Prebaci app u pozadinu dok je razgovor otvoren → obaveštenje **stiže odmah**
   (ne posle 45 s).
5. Otvori DRUGI razgovor i neka poruka stigne u prvi → obaveštenje **stiže**.
6. Pominjanje (`@ime`) dok gledaš dno tog kanala → **ćuti** (odluka, ne bag).

### Chat — prilozi (web)

7. `Ctrl+V` screenshot u polje za poruku → šalje se kao slika sa imenom
   `snimak-GGGG-MM-DD-HH-mm-ss.png`.
8. Prevuci 3 fajla na prozor razgovora → okvir „Pusti da pošalješ", pa **tri** poruke
   redom kojim su puštene.
9. Prevuci fajl veći od 50 MB ili `.exe` → jasna poruka o odbijanju **pre** uploada.

### Kanvas ideja i misli (K5)

10. Otvori kanvas ideja → dugme **„Uredi raspored"** postoji (ranije ga nije bilo).
11. U režimu prevuci karticu → pomeri se, stigne haptika i traka **„Poništi"**;
    tapni „Poništi" → vraća se.
12. **Pomeri UGNJEŽDENU ideju** (onu koja je u grupi), pa **osveži stranicu** →
    mora ostati tačno gde si je pustio. Ovo je najvažnija stavka na spisku: greška
    ovde je tiha i vidi je tek neko drugi.
13. Izaberi svoju ideju u režimu → ugaone ručke; povuci ugao → veličina se upiše,
    traka „Poništi" vraća i veličinu i položaj.
14. Dugi pritisak (ili četvrta ikonica rail-a) → sheet **„Akcije ideje"**: „Poveži
    sa…", lista veza, preseti veličine, „Automatska veličina".
15. „Poveži sa…" → tapni drugu ideju → linija se pojavi, traka „Poništi" je raskida.
16. Isto sve na kanvasu **misli** (sheet „Akcije misli").
17. Zumiraj ispod ~50% → ručke nestaju (očekivano, K2 pravilo); put do veličine
    ostaje kroz sheet.
18. Napusti kanvas pa se vrati → kamera je zapamćena tamo gde si je ostavio.

### Regresija (ne sme da se pokvari)

19. Kanvas oblasti i stranice: potez, veličina, veza, „Prikaži korake" — sve kao pre.
20. Chat: glasovna poruka, slanje fajla sa telefona, odgovor na poruku, reakcije.
