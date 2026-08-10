# Promptovi pariteta — puštaj ih ručno, jedan po jedan

Model: **Fable** (u `/model`). Effort: **max** ako CLI nudi, inače prompt već
počinje sa `ultrathink`. Režim: Accept Edits ili puna autonomija.
**`/clear` između svakog prompta.**

Posle svakog mi javi da je gotov — proveriću šta je stvarno sleteo pre nego što
ti dam sledeći. Ne puštaj dva zaredom bez provere; tako smo i dobili sedam
praznih commit-ova.

---

## PROMPT 1 — UX bagovi

```
ultrathink

Radiš na Devotion monorepou: apps/web (Next.js), apps/mobile (Expo/React Native),
packages/backend (Convex). Sve na srpskom. Odlučuj sam, ne pitaj.

PROČITAJ PRVO:
  docs/mobile/PARITET.md      <- tvoja lista i memorija, sekcija E
  docs/mobile/ZA-POPRAVKU.md  <- naučene zamke
  docs/mobile/lanac2/planovi/faza-ux.md  <- plan napisan sinoć, koristan ali
                                             ima jednu grešku, vidi ISPRAVKU u PARITET.md

CILJ: svih 13 bagova iz sekcije E popravljeno, i svaki viđen kako radi na
emulatoru. Screenshot je dokaz. Bez screenshot-a ne smeš da čekiraš.

VAŽNO, pročitaj ISPRAVKU na vrhu sekcije E:
- Grana ui-nocni JE već u istoriji. NE radi merge.
- Bagovi su snimljeni sa zastarelog Metro bundle-a. Za svaki prvo proveri da li
  i dalje postoji. E5, E8 i E10 su verovatno već popravljeni — potvrdi na ekranu
  i čekiraj bez izmene koda ako rade.
- E2 ima poznat uzrok: ScrollView u RN ima podrazumevani flexGrow:1. Jedna linija.
  E3 i E11 su verovatno posledice E2 — proveri ih tek posle nje.

Redosled: E1 (hardversko Nazad zatvara aplikaciju umesto sheet-a, na SVIM
sheet-ovima) → E2 → provera da li su E3 i E11 nestali → E4, E9, E12, E13 →
E6, E7 → potvrda za E5, E8, E10.

PRAVILA:
- Backend NE menjaj.
- Svaki novi red kroz apps/mobile/src/components/ui/row.tsx.
- Tekst min 16px osim meta. Dodirna meta min 44pt. Safe area.
- Prazno, učitavanje i greška — sva tri stanja na svakom novom ekranu.
- Čekiraj [x] u docs/mobile/PARITET.md u ISTOM commit-u sa kodom.
- Ako menjaš apps/mobile/package.json, zapiši to u docs/mobile/lanac2/NATIVE-BUILD.md.

NA KRAJU:
  cd apps/mobile && npx tsc --noEmit
  cd apps/web    && npx tsc --noEmit
  npm run lint
  npm test
Popravi sve što padne.
```

---

## PROMPT 2 — Misli

```
ultrathink

Devotion monorepo. Sve na srpskom. Odlučuj sam.
Pročitaj prvo docs/mobile/PARITET.md (sekcija A1) i docs/mobile/ZA-POPRAVKU.md.

CILJ: misao se sa telefona može napraviti, povezati, ugnjezditi, pretvoriti u
ideju i vratiti iz arhive.

Najveća rupa u paritetu: 18 Convex funkcija za misli koje web koristi a mobilni
nema. Ulaz u Misli iz menija „Više" POSTOJI. Kanvas radi (Faza 0 ga je popravila).
Embed ruta podržava kind === "thoughts", pa se graf crta kroz WebView — ne praviš
nov graf, praviš native akcije oko njega.

Uzori na webu: thoughts-canvas-view.tsx, thought-editor-dialog.tsx,
thought-conversion-dialog.tsx, thought-destination-picker.tsx.

Uradi sve nečekirane stavke iz A1, ovim redom:
1. lista misli kao alternativa grafu (na telefonu je lista upotrebljivija)
2. veze između misli, ugnježdavanje, premeštanje
3. thoughts.convertToIdeas — misao postaje ideja
4. thoughts.restoreNodes / restoreEdges — vraćanje obrisanog

PRAVILA: backend ne diraj; svaki red kroz components/ui/row.tsx; tekst min 16px
osim meta; sva tri stanja; čekiraj [x] u PARITET.md u istom commit-u.

NA KRAJU: tsc mobilni, tsc web, npm run lint, npm test. Popravi sve što padne.
```

---

## PROMPT 3 — Administracija startupa

```
ultrathink

Devotion monorepo. Sve na srpskom. Odlučuj sam.
Pročitaj prvo docs/mobile/PARITET.md (sekcija A2).

CILJ: admin sa telefona može sve što može sa weba — napraviti startup, promeniti
mu ime i logo, dodati i ukloniti člana, promeniti redosled oblasti.

Web admin-dialog.tsx ima devet funkcija koje mobilni nema. Mobilni ima samo
pozivnice i listu članova bez ijedne akcije — u meniju „Više" nema administracije.

Uradi sve nečekirane stavke iz A2.

Posebno pazi:
- Sve iza requireAdmin na backendu, i sakriveno u meniju ako korisnik nije admin.
  Dvostruka brana, kao što je već urađeno za pozivnice.
- reorderAreas na telefonu NIJE drag&drop. Dugmad „gore/dole" u redu oblasti, ili
  sheet sa izborom pozicije.
- Uklanjanje člana je destruktivno — potvrda, i jasno šta biva sa njegovim zadacima.
- Logo: expo-image-picker je već instaliran.

PRAVILA: backend ne diraj; red kroz components/ui/row.tsx; min 16px osim meta;
sva tri stanja; čekiraj [x] u PARITET.md u istom commit-u.

NA KRAJU: tsc mobilni, tsc web, npm run lint, npm test.
```

---

## PROMPT 4 — Zadaci i stranica

```
ultrathink

Devotion monorepo. Sve na srpskom. Odlučuj sam.
Pročitaj prvo docs/mobile/PARITET.md (sekcije A3 i A5).

CILJ: vidiš sve zadatke startupa sa filterima, stranicu možeš arhivirati, i uvek
znaš gde si u stablu.

A3: mobilni danas.tsx vidi samo MOJE zadatke za danas (tasks.commandCenter).
Web ima pregled svih zadataka (tasks.listForStartup) sa filterima i tabelom.
Na telefonu tabela sa mnogo kolona nema smisla — napravi listu kartica gde je
svaki red zadatak, a kolone postaju meta-podaci u redu. Filteri idu u sheet.

A5: page-actions-sheet.tsx već ima premeštanje, ugnježdavanje, izdvajanje i
povezivanje. Fali arhiviranje, breadcrumbs, addEntry, i ujednačavanje
pages.create sa areasV2.createPage.

Breadcrumbs su važniji nego što izgledaju: na telefonu se posle tri nivoa
ugnježdavanja izgubiš jer nemaš sidebar.

Uradi sve nečekirane stavke iz A3 i A5.

PRAVILA: backend ne diraj; red kroz components/ui/row.tsx; min 16px osim meta;
sva tri stanja; čekiraj [x] u PARITET.md u istom commit-u.

NA KRAJU: tsc mobilni, tsc web, npm run lint, npm test.
```

---

## PROMPT 5 — Ideje, vraćanje obrisanog, chat

```
ultrathink

Devotion monorepo. Sve na srpskom. Odlučuj sam.
Pročitaj prvo docs/mobile/PARITET.md (sekcije A4, A6, A7, A8).

CILJ: ništa se ne gubi zauvek — svaka arhivirana stvar se može vratiti, na svakom
ekranu, istim obrascem.

A6 je najvažniji deo i sistemska je rupa: mobilni ume da arhivira na pet mesta, a
NIGDE ne ume da vrati. Korisnik koji pogreši nema izlaz. Napravi JEDAN ujednačen
obrazac — posle arhiviranja traka „Poništi" koja stoji nekoliko sekundi — i
primeni ga na sva mesta iz A6.

A4: ideas.convertToPage, ugnježdavanje ideja, veze između ideja, restoreOwn.
A7: chat.archiveChannel. Za notifications.latest sam odluči da li ima smisla kad
    već postoji ceo ekran obaveštenja — ako nema, u sekciju Z sa razlogom.
A8: checkpointi na kanvasu. Ako proceniš da to ima smisla samo na velikom ekranu,
    u sekciju Z sa razlogom — ne pravi nešto neupotrebljivo.

PRAVILA: backend ne diraj; red kroz components/ui/row.tsx; min 16px osim meta;
sva tri stanja; čekiraj [x] u PARITET.md u istom commit-u.

NA KRAJU: tsc mobilni, tsc web, npm run lint, npm test.
```

---

## PROMPT 6 — Nula grešaka

```
ultrathink

Devotion monorepo. Sve na srpskom. Odlučuj sam.
Pročitaj prvo docs/mobile/PARITET.md (sekcija B).

CILJ: cela lista B čekirana, bez ijednog izuzetka. Ova faza ne dodaje
funkcionalnost.

Redom:
1. cd apps/mobile && npx tsc --noEmit   -> nula
2. cd apps/web    && npx tsc --noEmit   -> nula
3. npm run lint                          -> nula grešaka I nula upozorenja
4. npm run build                         -> prolazi
5. npm test                              -> svi prolaze
6. Pretraži apps/mobile/src i apps/web za:
   - console.log koji je ostao od dijagnostike
   - TODO / FIXME bez zapisa u ZA-POPRAVKU.md
   - komponente koje vraćaju null kao placeholder
   - funkcije koje su prazne ili samo hvataju grešku i ćute
7. Pokreni agente iz .claude/agents: rn-review, web-review, parity-check.
   Popravi sve što nađu.

Ne ućutkuj lint pravilo da bi prošlo — popravi pravi uzrok. Ako je greška
zatečena i ne smeš da je diraš, zapiši je u ZA-POPRAVKU.md sa razlogom.

Čekiraj [x] u PARITET.md u istom commit-u.
```

---

## PROMPT 7 — Runtime i responzivnost

```
ultrathink

Devotion monorepo. Sve na srpskom. Odlučuj sam.
Pročitaj prvo docs/mobile/PARITET.md (sekcije C i D).

CILJ: cela lista C prođena na ekranu, na malom i velikom telefonu, bez ijedne
greške u konzoli.

Ovo je jedina faza u kojoj gledaš ekran, ne kod. Imaš computer use. Emulator je
otvoren, web radi na http://localhost:3000, oba gađaju istu dev bazu.

Radi listu C stavku po stavku. Za svaku: uradi je na emulatoru, pa istu na webu,
pa uporedi ishod u bazi. Screenshot je dokaz — bez njega ne čekiraj.

Alat koji moraš da koristiš: chrome://inspect/#devices na hostu daje pun DevTools
nad WebView-om iz emulatora (kanvas i editor beleške su WebView-ovi). Tamo vidiš
pravu konzolu i mrežu umesto da pogađaš.

Pratiš sve vreme:
- Metro konzolu — nijedna crvena greška, nijedno upozorenje koje se ponavlja
- Convex dashboard logove — nijedan Server Error

Zatim lista D: promeni veličinu emulatora na 360x640 i na 430x932 i prođi kroz
sve ekrane. Tastatura, skrol u sheet-ovima, duga imena, prazna stanja, učitavanje,
greške.

Sve što nađeš popravi odmah, pa ponovo proveri na ekranu. Šta ne stigneš — u
ZA-POPRAVKU.md, iskreno, sa razlogom.

Čekiraj [x] u PARITET.md u istom commit-u.
```

---

## Posle svakog prompta — proveri sam, za deset sekundi

```powershell
git log --oneline -3
git show --stat HEAD
```

Ako je commit dirnuo **2 fajla i ~60 linija**, to je samo log — faza nije ništa
uradila. Ako je dirnuo desetak fajlova sa pravim izmenama, radila je.

I broj koji jedini stvarno meri napredak (na početku 63):

```powershell
bash -c "grep -rhoE 'api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+' apps/web/components apps/web/app | sort -u > /tmp/w.txt; grep -rhoE 'api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+' apps/mobile/src | sort -u > /tmp/m.txt; comm -23 /tmp/w.txt /tmp/m.txt | wc -l"
```
