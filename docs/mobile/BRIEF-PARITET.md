# Devotion — šta je urađeno, faza po fazu

**Paritet: 63 → 17.** Od tih 17, **svih 17 su zapisani izuzeci** u sekciji Z fajla
`docs/mobile/PARITET.md`, svaki sa konkretnim obrazloženjem. Nema nijedne
neobjašnjene rupe.

Grana: `paritet-nocni-20260811-0711`. Ništa nije gurnuto na remote.
Native build nije potreban — `apps/mobile/package.json` nije menjan. Dovoljno `r` u Metru.

---

## Kako se merilo

Nijedna faza nije ocenjena po tome šta agent tvrdi. Merilo je bio broj Convex
funkcija koje web zove a mobilni ne:

```bash
grep -rhoE "api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+" apps/web/components apps/web/app | sort -u > /tmp/w.txt
grep -rhoE "api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+" apps/mobile/src              | sort -u > /tmp/m.txt
comm -23 /tmp/w.txt /tmp/m.txt | wc -l
```

Putanja: **63 → 62 → 44 → 35 → 31 → 17**

---

## FAZA 0 — Kanvas je vraćao 404

**Problem.** Svaki kanvas u aplikaciji javljao je „Canvas se ne može učitati —
Greška 404". Tri prethodna pokušaja popravke su prijavila uspeh i sva tri su bila
pogrešna.

**Uzrok.** Nije bio u kodu. Na portu 3000 radio je **drugi Next.js projekat
(`alati`)**, a Devotion je pri pokretanju tiho pobegao na 3001. Desktop se otvara
na „onaj port koji Next ispiše", pa niko ne primeti — ali telefon i dalje gađa
3000 i dobija tuđu 404 stranicu. Uz to je nedostajao `allowedDevOrigins` za
emulator.

**Urađeno.** Devotion vraćen na 3000, `allowedDevOrigins` dodat, kanvas potvrđen
screenshot-om sa vidljivim oblačićima (Ideje i Misli). Dijagnoza zapisana u
`docs/mobile/KANVAS-DIJAGNOZA.md` sa slikama pre i posle.

**Commit:** `8d69cfd` · 13 fajlova

---

## FAZA UX — 13 bagova sa ekrana

**Ishod: nula linija koda promenjeno, i to je tačan ishod.**

Bagove sam katalogizovao klikćući kroz aplikaciju — ali sa **zastarelog Metro
bundle-a**. Sva trinaest su već bila popravljena u ranijem lancu. Agent je svaki
proverio na svežem bundle-u i našao postojeću popravku u kodu, sa citatom:
`paddingBottom: 160` za FAB, `DiscussionLink` za pogrešan tekst, `ScrollView` sa
podrazumevanim `flexGrow: 1` kao uzrok trake koja je jela 40% ekrana. E1
(hardversko Nazad) se ne reprodukuje ni na jednom od 11 sheet-ova.

**Commit-ovi:** `3406be9` … `ec1ba2e` · kapije: tsc ×2 = 0, testovi 321/321

---

## FAZA 1 — Misli

**Problem.** Najveća rupa u paritetu: 18 Convex funkcija koje web koristi a
mobilni ne. Postojala su dva sheet-a i nijedan ekran sa kog se do njih stiže.

**Urađeno.** Lista misli kao alternativa grafu, veze između misli, ugnježdavanje,
premeštanje, pretvaranje misli u ideju, vraćanje obrisanog. Graf i dalje ide kroz
WebView — nije pisan nov, dodate su native akcije oko njega.

**Commit:** `a9cf5d7` · 13 fajlova, 2292 linije · **paritet 62 → 44**

---

## FAZA 2 — Administracija startupa

**Problem.** Sa telefona si bio samo posmatrač: nisi mogao da napraviš startup,
promeniš mu ime ili logo, dodaš ili ukloniš člana, ni da promeniš redosled oblasti.

**Urađeno.** Sve devet funkcija iz `admin-dialog.tsx` preslikane u bottom sheet-ove,
sve iza `requireAdmin` i sakriveno u meniju za ne-admine. Redosled oblasti nije
drag&drop nego dugmad gore/dole — prevlačenje prstom po maloj listi je frustracija.

**Commit:** `432e644` · **paritet 44 → 35**

---

## FAZA 3/4 — Zadaci i stranica

**Problem.** „Danas" je pokazivao samo tvoje zadatke za danas. Stranica se nije
mogla arhivirati, i posle tri nivoa ugnježdavanja nisi znao gde si.

**Urađeno.** Pregled svih zadataka startupa sa filterima u sheet-u i grupisanjem
po statusu (ne tabela — kartica po redu, kolone kao meta-podaci). Arhiviranje
stranice, breadcrumbs, doprinosi na stranici.

**Commit:** `c9ee6a2` · 10 fajlova, 912 linija · **paritet 35 → 31**

Ovde je udario nedeljni limit i lanac je stao. Zato sam ga prepravio da čeka i
nastavlja sam.

---

## FAZA 5 — Vraćanje obrisanog, ideje, chat

**Problem, i najveća UX rupa u celoj aplikaciji.** Mobilni je umeo da arhivira na
pet mesta, a **nigde nije umeo da vrati**. Ko pogreši — nema izlaz.

**Urađeno.** Jedan ujednačen obrazac: posle arhiviranja traka „Poništi" koja stoji
nekoliko sekundi. **Jedan fajl + jedan store**, pa svako mesto arhiviranja gura u
istu traku. Uz to: ideja → stranica, ugnježdavanje ideja, veze između ideja,
arhiviranje kanala.

Revizor: *„Cilj ispunjen: DA. Svih 15 čekiranih stavki ima stvaran dokaz u kodu."*

**Commit:** `febb3dd` · 21 fajl, 1660 linija · **paritet 31 → 17**

---

## FAZA 6 — Nula grešaka

**Urađeno.** `tsc` na mobilnom i webu — nula. Testovi prolaze. Očišćeni
zaostali `console.log`, TODO-ovi bez zapisa, prazne komponente.

**Nije u potpunosti ispunjeno, i revizor je to sam prijavio:**

> „Cilj NIJE u potpunosti ispunjen: `npm run lint` i dalje javlja 2 upozorenja u
> backendu… Ispravno je zapisano kao nečekirano u PARITET.md, ne lažno prijavljeno
> — ali IZVESTAJ.md red `lint: prolazi` tu nijansu briše."

To je tačno ono zbog čega revizor postoji. Dva upozorenja su u
`packages/backend` (`findAvailableCanvasPosition` i `profile` — nekorišćene
promenljive), a backend je celom lancu bio zabranjen za diranje.

**Commit:** `7b32407` · 15 fajlova

---

## FAZA 7 — Runtime i responzivnost

**Urađeno.** Prolazak kroz celu aplikaciju na emulatoru i poređenje sa webom,
stavku po stavku, sa **screenshot-om kao dokazom za svaku**. Uz slike su sačuvani
i logcat, Convex logovi i CSV korišćen za uvoz tabele.

**Commit:** `019239d` · 63 fajla, 8883 linije — pretežno dokazi u
`docs/mobile/lanac3/dokazi/`

---

# Šta ostaje

**Sedamnaest funkcija koje mobilni ne zove — i nijedna nije propust.** Sve su u
sekciji Z sa obrazloženjem. Tri grupe:

**Uređivanje layouta kanvasa** (10 funkcija) — `movePages`, `resizePage`,
`resetPageSize`, `saveViewport`, `connectPages`, `disconnectPages`,
`taskCheckpoints.saveCanvasPlacement`, `resetCanvasSize`,
`taskCheckpointCanvasEdges.connect/disconnect`. Mobilni kanvas je **pregled**, embed
je read-only. Unos koordinata prstom bez direktne manipulacije je neupotrebljiv.
Suština checkpointa — tekst, završenost, lančanje, brisanje, glasanje — već je
native na detalju zadatka.

**Web-specifični mehanizmi** (4) — `pushSubscriptions.myDeviceCount` (mobilni
koristi Expo push), `areasV2.resolveRoute` (mobilni ima expo-router),
`notifications.latest` (postoji samo za web in-app toast; na telefonu tu ulogu
igra OS baner + bedž + pun ekran), `pageFiles.prune` (čisti osirotele priloge u
telu beleške, a tentap editor ih na mobilnom ne ume ni ubaciti).

**Lažno pozitivni** (3) — `areasV2.getCanvas` i `getPageCanvasByPage` mobilni
koristi kroz WebView, ali ih grep vidi kao web-only jer broji samo
`apps/web/components` i `app`. `activity.listForStartup` — mobilni koristi
`listPaginated`, bez tvrdog limita 50 i sa nastavkom, što je **bolje** od weba.

---

# Sledeći koraci

1. **Pusti aplikaciju i klikći.** Native build ne treba, dovoljno `r` u Metru.
2. **Dva lint upozorenja** u `packages/backend` — jedini nezatvoren rep. Pet minuta
   posla, ali traži dozvolu da se dira backend.
3. **Merenje editora beleške na S22** — jedina stvar koju mora čovek, na fizičkom
   telefonu.
4. **`searchText` contract korak** u Convexu, kad `verifySearchTextBackfill` vrati
   `remaining: 0`.
5. **APK za drugare** — uputstvo je u `PUSTANJE-APLIKACIJE.md`, traži da se prvo
   digne produkcija.
