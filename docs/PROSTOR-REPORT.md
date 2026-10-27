# PROSTOR — završni izveštaj (27.10.2026.)

Run: `docs/PROSTOR-PLAN.md`. Ceo dnevnik: `docs/PROSTOR-PROGRESS.md`. Pravila: `.nocni-run/prostor/rules.md`.
Grana `prostor-run`, 24 koraka (K01–K24), jedan commit po koraku. Ništa nije pushovano ni deploy-ovano. Šema je proširena samo na DEV.

## 0. Ukratko

- **Model saradnje je promenjen u backendu i na oba klijenta.** Svaki član menja svaku stranicu, zadatak, oblast i ideju. Izmene idu u Istoriju izmena („Vrati ovu verziju"). Autor, vlasnik startupa i admin zaključavaju stranicu. Brisanje ide u Korpu i vraća ga svaki član. Glasanje o brisanju i odobravanje ugnežđavanja su ugašeni. Potpisani prilozi su Komentari sa @pominjanjem.
- **Ekrani startupa su novi:** Komandni centar kao početna, Zadaci tima, Ideje kao tabla po fazama, oblast sa karticama Pregled · Zadaci · Dokumenti · Mapa, stranica i zadatak kao dokument tima, Korpa, Podešavanja startupa za sve članove, Beleške u „Ja". Mapa je mirnija i nije podrazumevana. Izgled je smiren po `docs/prostor/DIZAJN-SMIRENJE.md`.
- **Provere su zelene:** tsc (backend, web, telefon), eslint, vitest 148 fajlova / 1.564 testa (pre runa 101 / 1.031), `npm run build`.
- **Telefon nije viđen na uređaju ni u emulatoru** (pravilo runa). Proveren je samo kroz `tsc`, vitest i pregled agenata. Ovo je najveći otvoren rizik.
- **Šema se samo širi.** Nema novih env varijabli ni paketa. Redosled deploy-a: Convex → web → telefon (samo JS). Posle deploy-a stari klijenti rade, ali sa razlikama u ponašanju (§6).
- **K23 revizija je delimična** u pet oblasti koje su radili pomoćni agenti (regresije, paritet, performanse, mrtav kod, stari klijenti). Prekinuti su posle 10 min i nastavljeni sa rokom „završi za 10 minuta". Dozvole i privatnost je glavni agent pregledao sam i dopisao testove. Šta nije pregledano je u §3 i §7.

## 1. Kako da pregledaš granu

```
git log --oneline main..prostor-run        # „chore: zatečene lokalne izmene“, „prostor(start)“, K01–K23 (+ K24 posle runnera)
git diff --stat main...prostor-run         # ~823 fajla, +75 k / −31 k redova
git diff main...prostor-run -- packages/backend/convex/schema.ts   # šema (samo širenje)
```

`main` je `b735a39` (merge LICNO runa). Prvi commit grane (`d0fe033`) su lokalne izmene zatečene pre runa — nisu deo PROSTOR-a, ali ulaze u `diff main...prostor-run`.

**Lokalno:**

```
npm install
npm run dev          # web na http://localhost:3000 (ako je 3000 zauzet, Next ispiše drugi port)
npx convex dev       # DEV backend (šema je već na DEV-u)
```

Telefon: postojeći development build + `npx expo start` iz `apps/mobile`. Nov native build nije potreban (nema novih native paketa).

**Izlog** (samo u razvoju, bez prijave): `http://localhost:3000/izlog?ekran=<ime>&tema=tamna|svetla[&varijanta=<ime>]`

| Ekran | Korak | Varijante |
|---|---|---|
| `ljuska-startup` | K08 | meni, clan, mobilni-meni |
| `komandni-centar` | K19 | pun, zatrpan, sredi-rokove, prazan, greska-bloka, ucitavanje, aktivnost |
| `zadaci-startup` | LICNO/K08 | tabla, brzo-pravljenje, detalj (stari detalj — pravi je `zadatak-strana`) |
| `ideje` | K16 | tabla, lista, detalj, detalj-clan, tabla-clan, prazno, ucitavanje, greska |
| `oblast` | K13 | pregled, istorija, opis-konflikt, zadaci, zadaci-tabla, dokumenti, prazna, ucitavanje, greska |
| `stranica` | K10 | clan, zakljucana-autor, zakljucana-clan, konflikt, prisustvo, tabela, fajl, ucitavanje, obrisana, greska |
| `zadatak-strana` | K11 | clan, zakljucan, sa-komentarima |
| `komentari` | K10 | lista, pominjanje, izmena, prazno, greska, ucitavanje |
| `istorija-izmena` | K10 | lista, pregled, potvrda, zakljucano, prazno, ucitavanje, greska |
| `mapa` | K15 | oblast-12, ugnezdavanje, neaktivna, prazna, pregled-fioka |
| `korpa` | K08 | stranice, ideje, prilozi, oporavljeno, prazna, ucitavanje, greska |
| `beleske` | K18 | mesano, filter-startup, izmena, prazno, pretraga-prazna, posalji, ucitavanje, greska |
| `podesavanja-startupa` | K20 | opste-admin, opste-clan, oblasti, tim, tim-clan, pozivnice, lozinke, ucitavanje, greska |
| `inbox`, `panel-zadatka`, `brzi-unos`, `moj-dan`, … | LICNO, dopunjeno u runu | „Čeka tebe" (K16), panel sa komentarima (K11), Beleška u brzom unosu (K18) |

Telefon nema izlog. Nove komponente su u `apps/mobile/src/app/(app)/dizajn-katalog.tsx`, sekcije „PROSTOR K09" … „PROSTOR K19".

## 2. Šta je urađeno, po oblasti

| Oblast | Šta | Koraci | Snimci (`docs/prostor/snimci/`) |
|---|---|---|---|
| Dozvole i Istorija izmena | Jedan modul dozvola `lib/permissions.ts` (matrica R1–R21 iz `docs/prostor/planovi/K01.md`). Svaki aktivan član menja otključano. Zaključava autor, vlasnik i admin (`pages.lock/unlock`). Izvršilac zaključanog zadatka i dalje menja status i korake (D5). Istorija izmena: tabela `contentRevisions`, bazna revizija „Zatečeno stanje", spajanje izmena istog autora u 10 min, „Vrati ovu verziju" pravi novu reviziju. Prisustvo „<Ime> uređuje" (`pagePresence`, TTL 45 s) i dijalog konflikta (Kopiraj moju verziju · Učitaj najnoviju · Prepiši). „Raniji zajednički sadržaj je zaključan" više ne postoji. | K01, K02, K10, K12, K23 | `K10-istorija-izmena-*`, `K10-stranica-zakljucana-*`, `K10-stranica-konflikt-*`, `K10-stranica-prisustvo-*` |
| Korpa | Brisanje stranice šalje celu granu (≤ 250) u Korpu. Brišu se i ideje i prilozi. Svaki član vraća. Ako je roditelj i dalje obrisan ili zaključan, stavka se vraća na vrh oblasti. „Oporavljeno" je preseljeno iz Odobrenja. Prilozi, redovi tabela i kolone se više ne brišu trajno (D8). Odobrenja vode u Korpu. | K03, K08, K09 | `K08-korpa-*`, `K24-korpa-1440-tamna`, `K24-korpa-390-svetla` |
| Slobodno premeštanje, stari tokovi | Svaki član premešta i ugnežđava (provere ciklusa, dubine i iste oblasti ostaju). `voteOnDeletion`, `approveNesting` i `resolveNesting` vraćaju `STARI_TOK`. `requestDeletion` odmah šalje u Korpu. Migracija `closeLegacyRequests` je napisana i testirana, ali nije pokrenuta. | K03 | — |
| Komentari | `comments.*` nad `contentContributions`: odmah vidljivi, izmena samo svog, uklanjanje uz „Poništi" 8 s. @pominjanje samo aktivnih članova. Obaveštenja `comment_mention` (kanal `mention`) i `comment_added` (kanal `channel`), na postojećim kanalima i zvucima. Komentari na stranici, zadatku, koraku, opisu oblasti i ideji. | K04, K10, K11, K12, K14, K17 | `K10-komentari-*`, `K22-komentari-pominjanje-*` |
| Ideje | Faze Predlog · Razmatra se · Odobreno · Odbijeno, plus izvedeno „Postalo zadatak". Glasa svaki član. Fazu menjaju autor, vlasnik i admin. „Pretvori" je moguće samo u fazi „Odobreno". Na webu: tabla, lista, Mapa i detalj u fioci. Na telefonu: lista po fazi i detalj. „Čeka tebe" su ideje u fazi „Razmatra se" za koje nisi glasao (Inbox, Moj dan, Komandni centar, bedž). | K05, K16, K17 | `K16-ideje-*`, `K16-inbox-ceka-tebe-*`, `K22-ideje-tabla-*`, `K24-ideje-*` |
| Beleške | `thoughtNodes/thoughtEdges.startupId` može biti `null` (lična beleška). Ekran Beleške u „Ja": sve tvoje beleške plus lične, filter, brzi unos, izmena, arhiva sa „Poništi". „Pošalji u startup" pravi ideju. Stara Mapa misli se otvara kad izabereš jedan startup. | K05, K18, K21 | `K18-beleske-*`, `K18-brzi-unos-beleska-*`, `K24-beleske-*` |
| Komandni centar | Šest blokova: Za tebe, Trijaža sa „Zastarelo" (rok prošao pre više od 14 dana) i „Sredi rokove" (`tasks.bulkReschedule`, ≤ 50, sa „Poništi"), Čeka tebe, Nedavne izmene (`formatActivity`), Puls nedelje, Tim. Svaki blok ima svoju granicu greške. Cron `nedeljni puls` je uklonjen. | K06, K19, K23 | `K19-*`, `K22-komandni-centar-*`, `K24-komandni-centar-*` |
| Navigacija | Web meni startupa: Komandni centar · Zadaci · Ideje · Poruke · Dokumenti (stablo sa „Prikaži još") · Korpa · Podešavanja. Jedan skrol, bez ručke. Stari linkovi rade: `home` → `today`, `my-tasks` → `tasks` (Moji), `approvals` → `trash`. Na telefonu je Prostor početna startupa, a Više ima samo nalog i administraciju. | K08, K09, K19 | `K08-ljuska-startup-*`, `K08-zadaci-*`, `K24-ljuska-startup-*` |
| Stranica i zadatak | Beleška, tabela i fajl su dokument tima (putanja, autosave, bočna kolona, podstranice, Komentari, Istorija). Zadatak na celu stranu deli raspored sa panelom (čipovi, koraci, instrukcije sa Istorijom). Stranica nema kanvas; uz podstranice postoji „Prikaži na mapi". | K10, K11, K12, K23 | `K10-stranica-*`, `K11-*`, `K22-stranica-clan-*`, `K24-stranica-*`, `K24-zadatak-strana-*` |
| Oblast | Zaglavlje (naziv menja svaki član) i kartice Pregled (opis kao dokument tima, Nedavne izmene, Komentari) · Zadaci · Dokumenti (na webu tabela, na telefonu stablo) · Mapa. | K13, K14 | `K13-oblast-*`, `K22-oblast-dokumenti-*`, `K24-oblast-*` |
| Mapa | Pravougaone kartice (`MapCard`). Točkić skroluje stranicu dok ne klikneš u mapu, Ctrl/⌘ + točkić zumira. Prevlačenje na karticu odmah ugnežđava, uz „Poništi". Bez orbita, sjaja i MiniMape. Embed protokol za telefon nije menjan. Mapa beleški je na istim karticama (K21). | K15, K21 | `K15-mapa-*` |
| Telefon | Prostor (Komandni centar sažeto i redovi Zadaci · Dokumenti · Ideje · Kanali · Korpa), Korpa, oblast `/oblast/[id]`, stranica i zadatak (komentari, istorija, zaključavanje, konflikt), Ideje, Beleške, Podešavanja startupa, „Sredi rokove". | K09, K12, K14, K17, K18, K19, K20, K23 | nema (Dizajn katalog) |
| Podešavanja, tekst i jezik | Podešavanja startupa za sve članove: Opšte, Oblasti i Tim. Pozivnice i Lozinke vidi samo admin. Novi startupi dobijaju oblasti Razvoj · Marketing · Prodaja · Ostalo. „Backlog" je sada „Neplanirano". Prošli smo kroz tekst na oba klijenta (~120 izmena). | K06, K20 | `K20-podesavanja-*`, `K22-podesavanja-lozinke-*` |
| Smirivanje i završni prolaz | Uklonjeni su nadnaslovi, velika slova, kartice u karticama, sjaj i boja kao ukras. Uvedena je jedna tipografska skala. Pokret je iz zajedničkih brojeva. Tokeni ivice polja i destruktivnog dugmeta imaju kontrast ≥ 3:1. Proverene su širine 390/768/1024/1440 u obe teme (712 kombinacija bez bočnog skrola). | K07, K08, K21, K22 | `K21-*`, `K22-*` |
| Revizija | Dozvole i privatnost (28 novih javnih funkcija, svaka sa negativnim authz testom), nepovratne radnje, P25 (stari klijenti), regresije, paritet i performanse. Popravke: web push prekidač (regresija iz K08), četiri praznine pariteta na telefonu, pretplata na Puls, granica strane komentara, ~880 redova mrtvog koda. | K23 | — |

**Završni snimci (K24, 16):** osam glavnih površina, svaka na 1440 i 390 u suprotnim temama. Snimci na 390 su cela strana.
`K24-{ljuska-startup,stranica,oblast,korpa}-1440-tamna` + `-390-svetla`, `K24-{komandni-centar,zadatak-strana,ideje,beleske}-1440-svetla` + `-390-tamna`. Ni na jednom nema bočnog skrola ni greške u konzoli.

## 3. Šta nije urađeno ili je delimično

**Van obima ovog runa (namerno):** trajno brisanje i čišćenje Korpe, reset lozinke linkom, spajanje teksta u realnom vremenu, globalna pretraga, nove uloge u bazi, deploy.

**Telefon nije pokretan.** Nijedan telefonski ekran iz K09, K12, K14, K17, K18, K19, K20, K21, K22 i K23 nije viđen na uređaju ni emulatoru. Mnoge ispravke posle `rn-review` agent nije ponovo pregledao, nego su provereni samo `tsc` i vitest (K12, K14, K17, K18). Host editora beleške ima novu logiku (K12: `prune` posle čuvanja, „Prepiši", baner zaključavanja, remontiranje editora pri zaključavanju). Poslednju izmenu tog dela agent nije pregledao.

**K23: šta nezavisna revizija NIJE pokrila.** Pet radnika je `claude -p` zaustavio posle 10 min. Glavni agent ih je nastavio porukom „završi u narednih 10 minuta i vrati izveštaj sa onim što imaš do sada". Svih pet je predalo izveštaj, ali su izveštaji delimični. Agent za paritet izričito piše: „Rok je istekao pre kraja pregleda". Tvrdnja iz K23-6 da su „svih pet oblasti nezavisno pregledane" važi samo uz sledeće rupe (iz odeljaka „Nije provereno" u izveštajima, `.nocni-run/prostor/tmp/K24/K23-radnik-*.txt`):

- **Regresije:** ništa nije pokretano. Nije pregledan web host editora i stranice (`components/workspace/page/*`; `page-editor-view.tsx` je obrisan, autosave je preseljen u `use-page-autosave.ts`), kao ni telefonski ekrani stranice i zadatka. Upiti embed-a u `thoughts.ts` i `areasV2.ts` su pročitani samo delom.
- **Paritet:** nije provereno kako telefon u prvom planu prikazuje nove tipove obaveštenja (web ima toast). Nisu provereni panel zadatka na telefonu (`me/task-panel-sheet.tsx`, staro telo zadatka), unutrašnjost `clanovi.tsx`, `pozivnice.tsx` i `lozinke.tsx`, izbor člana za @ na telefonu (`collab/comment-composer.tsx`), uslovi prikaza u `idea-convert-sheet.tsx` i `idea-stage-sheet.tsx`, sadržaj Mape i animacije.
- **Stari klijenti (P25):** nije proveren rad na živom deploymentu, ni kako produkcija serijalizuje `ConvexError` (od toga zavisi koji tekst greške stari web prikazuje). Nisu posebno prođene embed rute koje stara aplikacija učitava. Od 724 mesta poziva pregledan je samo uzorak (Aktivnost, Inbox, Odobrenja, ideje, potrošači `pages.get`, konverzija ideje).
- **Performanse:** brojevi su račun iz koda, ne merenje. Cena pretplata `myDay.overview`, `chat.unreadSummary`, `inbox.unreadCounts`, `notifications.latest` i `profiles.getCurrent` nije analizirana. CPU nije meren. Nije poznata stvarna raspodela podataka. Tekst koraka (`taskCheckpoints.text`) nema serversku granicu.
- **Mrtav kod i kvalitet:** agent nije ponovo proverio izmene koje je K23 sam uneo (telefonski `canvas/*` sheet-ovi, `perimeter-resize-control.tsx`). Te izmene je posle pregledao samo `rn-review`. Nije provereno ni da li testovi proveravaju stare serverske poruke.

**Delimično ili odloženo (sa razlogom):**

| Šta | Zašto | Korak |
|---|---|---|
| „Vrati" na ekranu obrisane stavke (umesto toga „Otvori Korpu") | nova radnja, a K22 ne dodaje funkcije | K22-3 |
| Nacrt se ne čuva kad neko arhivira stranicu dok je otvorena | traži nov tok | K22 S10 |
| Zasebne granice greške za diskusiju, panel obaveštenja, embed poruke i tabelu/priloge na webu | grešku i dalje hvata granica stranice | K22 S12–S18 |
| Tema na telefonu: `Appearance.setColorScheme`, `themeColor`, tokeni boja misli | traži proveru na uređaju | K22 T7/T8/T13 |
| Prijava i pozivnica na starom `constants/theme` (telefon) | auth tok je van obima | K22 T12 |
| Pristupačnost na telefonu sa čitačem ekrana (fokus posle uklanjanja komentara, najave pretrage i prisustva, uloge avatara) | traži čitač ekrana na uređaju | K22 A4–A17, M2–M6 |
| „Poništi" posle arhiviranja beleške-roditelja ne vraća uvlačenje podbeleški | backend (`archiveNodes`) ih prevezuje; traži odluku | K18-12 |
| Telefonski ekran Zadaci ne prosleđuje `isManager` (menadžer vidi tuđ zaključan zadatak kao zaključan, iako server dozvoljava) | van obima K19; i dalje otvoreno | K19-9 |
| Imenica „misao/misli" na web Mapi beleški (~80 stringova) | „beleška" bi se mešala sa vrstom stranice; traži odluku | K20-5 |
| Lični „Ja" ekrani zadržavaju nadnaslove | SMIRENJE važi za startup ekrane | K21-1 |
| Tekst ideje se čuva bez provere revizije (kad dvoje menjaju isto polje u istoj sekundi, pobeđuje poslednji; prethodni tekst ostaje u Istoriji) | `ideas.update` nema `expectedRevision` | K16-3, K17-5 |
| Kartica na telefonskoj Mapi nema isečak, autora ni rok | embed protokol se ne menja | K15-5 |
| „Ugnezdi u…" nudi samo učitane stranice (do 30) | nema upita za celo stablo | K13-8 |
| Telefon ne pamti poslednju karticu oblasti; lista ideja na telefonu nema sortiranje po kolonama | IZUZECI | K14-2, K23 F17/F18 |
| Konflikt pri preimenovanju tabele, fajla ili zadatka iz telefonskog sheet-a nudi samo „pokušaj ponovo" | nizak nalaz | K23 F16 |
| `ideas.list` čita najviše 500 ideja, pa detalj ideje u startupu sa više ideja može reći „nije pronađena" | zatečeno; predlog: `ideas.get` | K23 F31 |
| Mrtav kod: `circular-text-layout.ts` (+ test), paketi `@chenglou/pretext` i `framer-motion`, sitni izvozi, ~30 neiskorišćenih uvoza na telefonu | brisanje testa i izmena `package-lock.json` traže tebe | K21-7, K23-3 |
| Kopije čiste logike web ↔ telefon (`collab-model`, `trash-model`, `ideas-model`) nisu preseljene u `packages/shared` | za nadzirani rad | K23 F9 |
| Niski nalazi recenzija ostavljeni po koracima (nisu blokirajući) | obim | K08-14, K10-15, K11-12, K12-14, K13-12, K14-7, K15-10, K16-12, K17-8, K19-12, K20-7, K21-9 |

## 4. BLOKADE — traže tebe

1. **Telefon na uređaju.** Pravilo runa zabranjuje Expo, Metro i emulator, pa nijedan telefonski ekran nije viđen u radu. Ovo traži ručnu proveru (§7).
2. **`procesi.ps1` i klasifikator dozvola.** U K06, K10, K12, K17, K18, K21, K22 i K23 auto-mode klasifikator je odbio `powershell … -ExecutionPolicy Bypass -File .nocni-run/prostor/alati/procesi.ps1` (u nekim koracima i varijantu bez `Bypass`). Činjenica je svaki put dokazana `netstat`-om, bez slušalaca. Za sledeći run dodaj pravilo dozvole za tu komandu ili neka je runner pusti sam. Ishod u K24 je u §10.
3. **`npx convex codegen` je ispisao „Uploading functions to Convex"** (K20, K22). Ciljni deployment nije potvrđen jer je čitanje `.env*` zabranjeno. `_generated` je nepromenjen. Proveri da je reč o DEV deploymentu.
4. **K17: četiri `python.exe` procesa** (PID 13968, 7952, 14112, 11348) nepoznatog porekla. Nisu gašeni jer se tuđi procesi ne diraju. Ako su još živi, pogledaj ih.
5. **Odluke koje run nije smeo da donese sam:** `pageFiles.attach` zaštita (F6), brisanje mrtvog koda i paketa (F15), imenica „misao" (K20-5), `restoreNodes` (K18-12). Sve su u §5.
6. **Backend van obima (nađeno u K20):** `startups.updateArea` ne preimenuje chat kanal oblasti. `startups.listMembers` i `profiles.listAll` rade `take(50)` pre filtera arhiviranih i ne javljaju klijentu da je lista skraćena.

## 5. ODLUKE koje traže stav

**Predlozi iz plana (P1–P25).** Run ih je sproveo onako kako su napisani, osim gde kolona „Napomena" kaže drugačije.

| # | Šta | Gde se menja | Korak | Napomena |
|---|---|---|---|---|
| P1 | Uloge bez nove tabele: član menja sve otključano; autor, vlasnik i admin zaključavaju; komentar menja samo njegov autor | `lib/permissions.ts`, svi moduli | K02, K03 | tuđi komentar sklanja vlasnik startupa ili admin, ne autor stavke (K04) |
| P2 | Istorija izmena (`contentRevisions`), spajanje u 10 min, bez obrezivanja | `history.ts`, `lib/history.ts`, `lib/page_content.ts` | K02 | revizije se nikad ne brišu, pa tabela raste |
| P3 | Korpa: svaki član vraća, bez trajnog brisanja i bez roka od 30 dana | `trash.ts`, `lib/trash.ts` | K03 | ranije arhivirano se NE vidi u Korpi (D2) |
| P4 | Slobodno premeštanje, gašenje glasanja i zahteva, `closeLegacyRequests` se ne pokreće | `collaboration.ts`, `areasV2.ts`, `migrations.ts` | K03 | listići se takođe zatvaraju (`deletionBallots.vote` + `cancelled`, K03-2) |
| P5 | Komentari nad `contentContributions`, pominjanja, dva nova tipa obaveštenja | `comments.ts`, `lib/comments.ts` | K04 | granica teksta komentara spuštena na 20.000 znakova i za stari `pages.addEntry` (K04-4) |
| P6 | Faze ideja, glasa ceo tim, „Pretvori" samo u fazi „Odobreno" | `ideas.ts`, `lib/idea_stages.ts` | K05 | glas na pretvorenoj ideji se odbija (K05-3) |
| P7 | Beleške u „Ja", lična beleška `startupId: null`, „Pošalji u startup" | `thoughts.ts` | K05, K18 | šalje se samo kao IDEJA, ne kao stranica (K05-1, D10) |
| P8 | Početna startupa = Komandni centar | web `command-center/`, telefon `komandni-centar/` | K19 | `home-view.tsx` obrisan |
| P9 | Puls bez obaveštenja (cron uklonjen) | `crons.ts` | K06 | `puls_ready` ostaje u validatoru |
| P10 | „Sredi rokove", „Zastarelo" = 14 dana | `tasks.ts`, shared `stale.ts` | K06, K19 | računa samo prekoračene, ne celu grupu „Gori" (K19-1); bez obaveštenja (K06-4) |
| P11 | Meni startupa sa pet stavki, stari linkovi preusmeravaju | `workspace-sidebar.tsx`, `workspace-route.ts` | K08 | prikaz Lista/Tabla nije u URL-u (K08-2) |
| P12 | Oblast: Pregled · Zadaci · Dokumenti · Mapa, pamti karticu | `area-view.tsx`, telefon `oblast/[id].tsx` | K13, K14 | telefon ne pamti karticu (K14-2) |
| P13 | Stranica = dokument tima | `components/workspace/page/` | K10 | „Ugnezdi u…" nije u meniju dokumenta na webu (K10-2) |
| P14 | Zadatak na celu stranu = raspored panela | `task-page/`, `me/task-panel/` | K11 | osobine i instrukcije idu kroz `areasV2.updatePage` sa revizijom (K11-2) |
| P15 | Mapa: kartice, točkić, ugnežđavanje odmah | `components/map/`, `canvases/` | K15 | promena veličine je i dalje povlačenje ivice, ne ugaona ručka (K15-2) |
| P16 | Ideje: tabla po fazama, lista, Mapa, detalj | `components/workspace/ideas/` | K16 | izbor boje i veličine oblačića je uklonjen iz dijaloga (K16-4) |
| P17 | Smirivanje; oblasti Razvoj · Marketing · Prodaja · Ostalo za NOVE startupe | `DIZAJN-SMIRENJE.md`, `AREA_DEFINITIONS` | K06, K08, K21 | postojeće oblasti zadržavaju stara imena („Dev notes"…) — da li ih preimenovati? |
| P18 | Telefon: Prostor kao početna, Više samo nalog i administracija | `(tabs)/prostor.tsx`, `vise.tsx` | K09 | — |
| P19 | Tabele i fajlovi u okviru stranice, meko uklanjanje priloga | `pageFiles.ts`, `pageTables.ts` | K02, K03 | `removeColumn` čuva vrednosti u redovima (D8) |
| P20 | Chat startupa ostaje | — | — | „Diskusija u Porukama" je stavka menija stranice (K10-3) |
| P21 | Pretraga po startupu; obrisano se ne vraća | `search-dialog.tsx`, `pretraga.tsx` | K10, K16, K23 | — |
| P22 | „Čeka tebe" = ideje u fazi „Razmatra se" bez tvog glasa | `inbox.ts` | K05, K16, K17, K19 | samo uz `include: ["idea_vote"]` (D16) |
| P23 | „<Ime> uređuje" i dijalog konflikta | `presence.ts`, `collab/` | K02, K10, K12 | — |
| P24 | Nove radnje aktivnosti i srpske rečenice | schema, shared `activity-format.ts` | K02–K06 | — |
| P25 | Kompatibilnost sa starim klijentima | svi moduli | K23 | potpisi ostaju, ali ponašanje starih klijenata se menja (F7, §6) |

**ODLUKE iz koraka koje traže stav** (ostale su tehničke; vidi `PROSTOR-PROGRESS.md`):

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| 1 | Zaštita `pageFiles.attach`: pri odbijanju briše `storageId` bez provere da li blob pripada čatu, avataru ili logu. Predlog je ista provera kao `chat.ts › requireUnattachedBlob`. Zatečeno, nije od runa. | `packages/backend/convex/pageFiles.ts:181-203` | K23-1 (F6) |
| 2 | Brisanje `circular-text-layout.ts` (+ test) i paketa `@chenglou/pretext` i `framer-motion` | `apps/web`, `package.json`, `package-lock.json` | K21-7, K23-3 |
| 3 | Selidba duplirane logike web ↔ telefon u `packages/shared` | `collab-model`, `trash-model`, `ideas-model`/`ideje-model` | K23 F9 |
| 4 | Lični „Ja" ekrani: da li i oni gube nadnaslove i velika slova | `me/inbox`, `me/plan-day*`, `me/chat/hub-*`, `me/tasks/*`, `me-sidebar` | K21-1 |
| 5 | Imenica „misao/misli" na web Mapi beleški, kad je telefon već na „beleška" | `apps/web/components/workspace/thoughts/*` | K20-5 |
| 6 | `restoreNodes` da pamti prethodnog roditelja (da „Poništi" vrati uvlačenje podbeleški) | `thoughts.ts` | K18-12 |
| 7 | „Nazad" iz otvorene fioke ideje sada napušta Ideje. Da li treba da zatvara fioku? | `ideas-view.tsx` (`replace: true`) | K16-2 |
| 8 | „Poništi" posle „Sredi rokove": na telefonu radi i posle 8 s (Istorija radnji), na webu samo 8 s. Izjednačiti? | web toast, telefon `lib/undo.ts` | K19-7, K19-12 |
| 9 | `isManager` na telefonskom ekranu Zadaci | `apps/mobile/src/app/(app)/zadaci.tsx` | K19-9 |
| 10 | Tokeni ivice polja i destruktivnog dugmeta promenjeni globalno: polja imaju primetno tamniju ivicu | `apps/web/app/globals.css`, `apps/mobile/src/theme/tokens.ts` | K22-1 |
| 11 | Dvokolonski raspored dokumenta i oblasti tek od 1280 px | web `page/`, `area-view` | K22-4 |
| 12 | Tekst ideje bez provere revizije (poslednji upis pobeđuje) | `ideas.update` | K16-3, K17-5 |
| 13 | Posle „Pretvori" telefon odmah vodi na rezultat, a web daje toast sa „Otvori" | `ideja/[id].tsx` / `IdeaDetail` | K17-4, K16-7 |
| 14 | „Vrati" u Korpi nema „Poništi"; „Ukloni" iz Oporavljenog je bez potvrde | Korpa web i telefon | K08-12, K09-2 |
| 15 | Korpa na telefonu se uvek otvara na „Stranice" (nema parametra segmenta) | `korpa.tsx` | K09-11 |
| 16 | Opis oblasti: web autosave, telefon sheet sa „Sačuvaj" | `oblast/[id].tsx` | K14-1 |
| 17 | Kompaktni Komentari u panelu učitavaju celu listu. Predlog za backend: `comments.listRecent` | `comments.ts` | K11-5 |
| 18 | Tanji dokumenti za liste (`searchText`, `instructions` se čitaju u svakoj listi); pri maksimalnim poljima `commandCenter`, `getCanvas`, `listForTasks` i `getWeekly` prelaze 16 MiB | `tasks.ts`, `areasV2.ts`, `taskAssignees.ts`, `puls.ts` | K23 F8, F19 |
| 19 | Lokalna istorija Ctrl+Z/Y van Mape (ideje) nije preneta | `ideas/` | K16-5 |
| 20 | Prelaz ideje između faza na telefonu se ne animira (nema paketa) | `ideje.tsx` | K21-6 |
| 21 | Ikonice vrste stranice i oblasti na telefonu su sive | `pageKindColor`, `areaColor` | K21-3 |
| 22 | Odluke K01 D1–D20 (grana ≤ 250 u Korpu, ranije arhivirano nevidljivo, brisanje ne dira veze i komentare, zaključavanje štiti samo stranicu i spisak dece, izvršilac zaključanog menja status, admin ima moći samo gde je član, raspored i veze menja svaki član i na zaključanoj) | `docs/prostor/planovi/K01.md` | K01–K03 |

## 6. Šema, migracije i deploy

**Izmene šeme (samo širenje, proverene na DEV kroz `npx convex dev --once`):**

- **Nove tabele:**
  - `contentRevisions` (indeks `by_targetKey_and_updatedAt`)
  - `pagePresence` (indeks `by_pageId_and_profileId`)
- **`pages`:**
  - nova opciona polja `lockedAt` (`number | null`), `lockedByProfileId` (`Id | null`), `archivedByProfileId`, `trashState`, `archivedWithPageId`, `trashDescendantCount`
  - indeks `by_startupId_and_trashState_and_archivedAt`
- **`pageFiles`:**
  - nova opciona polja `archivedByProfileId`, `trashState`
  - indeks `by_startupId_and_trashState_and_archivedAt`
- **`ideaNodes`:**
  - nova opciona polja `archivedByProfileId`, `trashState`, `stage`, `stageChangedAt`, `stageChangedByProfileId`
  - indeksi `by_startupId_and_trashState_and_archivedAt` i `by_startupId_and_stage_and_archivedAt_and_stageChangedAt`
- **`thoughtNodes.startupId` i `thoughtEdges.startupId`:** `Id<"startups">` → `Id<"startups"> | null`. Za `thoughtNodes` nov indeks `by_ownerProfileId_and_archivedAt_and_updatedAt`.
- **`contentContributions`:** nova opciona polja `mentionProfileIds`, `editedAt`.
- **Unije:**
  - `deletionBallots.vote` + `cancelled`
  - `activities.action` + `page_locked`, `page_unlocked`, `revision_restored`, `page_restored`, `idea_archived`, `idea_restored`, `comment_created`, `idea_stage_changed`, `tasks_rescheduled`
  - `activities.targetType` + `area`
  - `notificationTypeValidator` + `comment_mention`, `comment_added`
  - `notificationTargetTypeValidator` + `area`
- **Bez izmena:** nijedno polje, tabela ni vrednost unije nije obrisano ni suženo. Postojeći podaci nisu menjani.

**Bez novih env varijabli.** Nema izmena `.env.example`, nema novih `process.env.*`. **Bez novih paketa** (`package.json` i `package-lock.json` nisu menjani).

**Redosled deploy-a (ništa od ovoga nije rađeno u runu):**

1. **Convex:** `npx convex deploy` (iz korena repoa). Nova polja su opciona i nema obavezne migracije.
2. **Web:** merge `prostor-run` u `main` i push. Vercel pravi produkcijski build.
3. **Telefon:** samo JS (OTA). Nov native build nije potreban.

Drži razmak između koraka kratkim. Posle 1, a pre 2 i 3, stari klijenti rade, ali drugačije (K23 F7):
- Stari web pri brisanju kaže „podstranice će biti izvučene nivo iznad", a backend šalje celu granu u Korpu, koju stari web ne prikazuje.
- „Pretvori" na staroj aplikaciji traži fazu „Odobreno", a stari klijent ne ume da je postavi.
- Stari web može da prikaže tehnički tekst `ConvexError` greške.
- „Čeka tebe" je prazan.

Nijedan stari poziv ne pada na validatoru.

**Opciono posle deploy-a: `closeLegacyRequests`.** Zatvara (`cancelled`) otvorene stare zahteve za brisanje, listiće i zahteve za ugnežđavanje, da u bazi ništa ne visi kao „na čekanju". Paketno je i idempotentno i ništa ne briše. Liste ih ionako više ne prikazuju, pa nije obavezno.

```
npx convex run migrations:closeLegacyRequests --prod
```

(Bez `--prod` ide na DEV. Pre produkcije možeš probati na DEV-u.) Migracija se oslanja na postojeću `@convex-dev/migrations` komponentu (`migrations.ts:400`).

**Vraćanje Convex-a unazad:** ne vraćaj stari backend kad u produkciji postoje revizije (`contentRevisions`), lične beleške (`thoughtNodes.startupId = null`), faze ideja ili stavke u Korpi. Stara šema ne prihvata `null` u `thoughtNodes.startupId` ni nova polja, pa bi deploy starog koda pao na validaciji šeme ili bi stari kod pogrešno video te redove. Ako nešto pođe po zlu, vraća se klijent (web na prethodni deploy, telefon na prethodni OTA), a backend ostaje.

## 7. Šta ručno proveravaš (po važnosti)

Treba ti dva naloga u istom startupu: **A** (autor ili vlasnik/admin) i **B** (običan član).

1. **Izmena tuđe stranice:** B otvara belešku koju je napravio A, menja naslov i tekst, i vidi „Sačuvano". A vidi izmenu. Dok kucate oboje, gore piše „<Ime> uređuje". Ko sačuva drugi dobija dijalog Kopiraj · Učitaj najnoviju · Prepiši.
2. **Zaključavanje:** A zaključava stranicu (meni „…" ili bočna kolona). B vidi traku „Zaključano…", može da čita i komentariše, a ne može da menja, premešta ni briše. Isto za zadatak: B kao izvršilac menja status i korake, ostali čipovi su sa katancem. Kao vlasnik/admin menjaš tuđ zaključan zadatak iz Trijaže (web; na telefonskom ekranu Zadaci vidi tačku 9 iz §5).
3. **Istorija izmena i vraćanje:** fioka „Istorija" na stranici, opisu oblasti, instrukcijama zadatka i ideji. „Vrati ovu verziju" pravi novu verziju. Na zaključanoj stranici vraća samo A.
4. **Korpa:** B briše stranicu sa podstranicama koju je napravio A. U Korpi je jedna stavka „Sa N podstranica · Obrisao/la B". „Vrati" vraća celo stablo na isto mesto i na Mapi. Probaj i da obrišeš roditelja, pa vratiš dete (ide na vrh oblasti uz poruku). Uradi isto za ideju i prilog. Na telefonu: Prostor › Korpa › „Vrati".
5. **Komentar i pominjanje:** B piše komentar sa `@A` na stranici, zadatku, koraku, opisu oblasti i ideji. A dobija obaveštenje (kanal „Pominjanja" probija tihe sate), a klik vodi na tu stavku. Autor stavke dobija „komentar" (kanal poruka). Svoj komentar menjaš i uklanjaš, uz „Poništi" 8 s. Tuđi sklanja samo vlasnik ili admin.
6. **Ideje:** B ne može da prevuče karticu između faza ni da menja fazu, ali glasa. A prebaci ideju u „Razmatra se", posle čega se kod B pojavljuje u Inbox › Čeka tebe, Moj dan, Komandnom centru i na bedžu „Ideje". B glasa i stavka nestaje. A prebaci ideju u „Odobreno", pa „Pretvori u zadatak ili belešku". Proveri prevlačenje pravim mišem i u Firefox-u (K16-10).
7. **Beleške:** Ja › Beleške: lična beleška, filter po startupu, izmena, arhiva sa „Poništi". „Pošalji u startup" pravi ideju u fazi Predlog. „Mapa" se vidi samo uz izabran startup. Telefon: Danas › ikonica „Beleške", i „Beleška" u brzom unosu.
8. **„Sredi rokove":** Komandni centar › Trijaža › „Sredi rokove · N" › izaberi › „Sutra", pa „Poništi" (web 8 s). Grupa „Zastarelo" je skupljena. Telefon: sheet sa 30+ zadataka na 360 dp i sa uvećanim fontom.
9. **Telefon na uređaju (iOS i Android), prvo:**
   - Prostor (blokovi, redovi, „Sredi rokove");
   - Korpa;
   - stranica (editor beleške: zaključavanje dok kucaš, „Prepiši", prilozi posle čuvanja);
   - Komentari sa tastaturom na malom ekranu i izbor `@` člana;
   - prelaz „…" → „Istorija izmena" na iOS-u;
   - zadatak („Podstranice" i „Dodatni kontekst" iz K23, skrol preko liste na iOS-u);
   - oblast (sheet opisa sa tastaturom);
   - Ideje (faza, glas, „Pretvori");
   - Beleške;
   - Podešavanja startupa;
   - tamna tema (`primaryText`, ivice polja).
10. **Delovi koje K23 nije nezavisno pregledao** (§3):
    - web stranica posle selidbe autosave-a u `use-page-autosave.ts`: čuvanje, Ctrl/⌘ S, napuštanje stranice sa nesačuvanim izmenama, konflikt;
    - obaveštenje o komentaru dok je aplikacija otvorena na telefonu;
    - panel zadatka na telefonu (Moj dan);
    - ekrani Članovi, Pozivnice i Lozinke na telefonu;
    - stari web i stara aplikacija protiv novog backenda na DEV-u, pre produkcije (brisanje, „Pretvori", tekst greške).
11. **Stari linkovi i obaveštenja:** `?view=home`, `?view=my-tasks`, `?view=approvals`; telefon `devotion://odobrenja` (vodi u Korpu); staro obaveštenje o glasanju; obaveštenje o komentaru na opisu oblasti (web Pregled, telefon `/oblast/[id]`); ideja iz pretrage na telefonu.
12. **Web push prekidač** (regresija iz K08, ispravljena u K23): meni profila › „Obaveštenja i zvuci" › uključi i isključi.
13. **Izgled:** polja sa tamnijom ivicom u obe teme, crveno dugme u tamnoj temi, Ideje na 768 px, dokument i oblast na 1024 px.
14. **Procesi:** `powershell -NoProfile -ExecutionPolicy Bypass -File .nocni-run/prostor/alati/procesi.ps1` i četiri `python.exe` iz K17 (§4).

## 8. Za kasnije, uz nadzor

- **Trajno brisanje i čišćenje Korpe posle 30 dana:** cron plus brisanje bloba. Prvo treba odlučiti šta se dešava sa vezama, komentarima i revizijama obrisane stavke. Tek posle toga Korpa sme da obeća rok.
- **Reset lozinke linkom (O10):** traži provajdera e-pošte, ključ i izmenu auth toka.
- **Obrezivanje Istorije izmena** (tabela raste bez granice).
- **Niske BLOKADE i nalazi:**
  - `pageFiles.attach` (F6);
  - tanji dokumenti za liste (F8, F19);
  - `ideas.get` po id-ju (F31);
  - `comments.listRecent` i indeks komentara bez tela (K04-9, K11-5);
  - `startups.updateArea` i kanal oblasti;
  - `take(50)` u `listMembers`/`listAll`;
  - granice greške po bloku (K22 S12–S18);
  - telefon `Appearance` i tema prijave (T7/T8/T12/T13);
  - pristupačnost sa čitačem ekrana (K22 A/M);
  - selidba duplikata u shared (F9);
  - brisanje mrtvog koda i paketa (F15);
  - 18 starih funkcija bez `returns` validatora (F23);
  - serverske poruke na engleskom ili starim nazivima („Checkpoint", „Canvas", „Briefing…").

## 9. Brojevi

**Testovi (vitest):** pre runa 101 fajl / 1.031 test (`b735a39`), posle runa 148 fajlova / 1.564 testa (+533). Nijedan nije padao pre runa (`baseline.txt`).

| Posle koraka | Fajlova / testova |
|---|---|
| pre runa | 101 / 1.031 |
| K02 | 104 / 1.063 |
| K06 (backend gotov) | 122 / 1.232 |
| K12 | 135 / 1.343 |
| K16 | 140 / 1.430 |
| K19 | 146 / 1.541 |
| K22 | 147 / 1.555 |
| K23, K24 (završno) | 148 / 1.564 |

Svaka od 28 novih javnih funkcija ima negativan authz test (nečlan, uklonjen član, arhiviran profil, drugi startup). Tabela je u K23 sekciji progress-a.

**Web, prvo učitavanje `/`** (`next build --webpack`, K23):

| | JS | JS gzip | CSS | CSS gzip |
|---|---|---|---|---|
| pre runa | 787,7 kB | 245,3 kB | 182,7 kB | 29,9 kB |
| posle runa | 788,3 kB | 246,0 kB | 141,5 kB | 23,6 kB |

Svi JS komadi: 3.148,8 → 3.166,7 kB (gzip +1,8 %), u lenjo učitanim ekranima.

**Najgora čitanja novih upita** (K23, scenario 6 startupa × 200 zadataka × 50 ideja × 100 revizija). Brojevi su račun iz koda, ne merenje.

| Upit | Tipično | Napomena |
|---|---|---|
| `ideas.list` | ≈ 2.000 dok. / 0,7 MB | max 500 ideja ≈ 22.000 dok. (< 32.000) |
| `inbox.pending` (6 startupa) | ≈ 780 dok. / 0,4 MB | |
| `history.list` (20) | ≈ 0,16 MB | teorijski 50 × ≤ 200 KB ≈ 10 MB (F19) |
| `trash.list` | ≈ 1,4 MB | ≤ ~3.300 index opsega pri dubini 63 |
| `tasks.bulkReschedule` (50) | ≈ 650 dok. | |
| `pages.archive` / `trash.restore` (grana 250) | ≈ 500–780 dok. | |
| `tasks.commandCenter`, `areasV2.getCanvas`, `taskAssignees.listForTasks`, `puls.getWeekly` | 1–2 MB | zatečeni; pri maksimalnim poljima 14,7 / 16,1 / 22 / 18,5 MB, a granica je 16 MiB (F8) |

Komandni centar pravi najviše jedan upit po bloku (Trijaža i Tim dele tri). Nijedan nov upit ne čita sat i nema novog `.collect()`.

## 10. Rezultat provera i zatečeno

**Provere (K24, konačno stanje grane):**

| Provera | Rezultat |
|---|---|
| `npx tsc -p packages/backend/convex/tsconfig.json --noEmit` | ✓ (izlaz 0) |
| `npx tsc -p apps/web/tsconfig.json --noEmit` | ✓ |
| `node .nocni-run/prostor/alati/expo-rute.cjs && npx tsc -p apps/mobile/tsconfig.json --noEmit` | ✓ |
| `npx eslint --ignore-pattern ".nocni-run/**" --ignore-pattern ".playwright-mcp/**"` | ✓ (bez izlaza; ne pokriva `apps/mobile`) |
| `npx vitest run --no-file-parallelism` | ✓ 148 fajlova, 1.564 testa |
| `npm run build` | ✓ (`next build --webpack`, izlaz 0) |
| Snimci izloga (16) | bez bočnog skrola, bez grešaka u konzoli |
| `procesi.ps1` | sa `-ExecutionPolicy Bypass` odbijen od klasifikatora („Security Weaken“); bez tog prekidača: „USLOV 4: OK - nijedan dev server ni slusalac na dev portu iz ovog repoa ne radi.“ |

Kod u K24 nije menjan. Logovi su u `.nocni-run/prostor/tmp/K24/`.

**Zatečeno** (nije od runa, nađeno usput, nije menjano):

- `pageFiles.attach` pri odbijanju briše blob bez provere vlasništva prema čatu, avataru i logu (F6, `pageFiles.ts:181-203`).
- Liste čitaju cele `pages` dokumente (`searchText`, `instructions`); pri maksimalnim poljima prelaze 16 MiB (F8).
- `ideas.list` vraća imejl autora i glasača (F22); čita najviše 500 ideja bez redosleda (F31).
- 18 funkcija bez `returns` validatora (F23).
- Legacy red veze `pageEdges` se tvrdo briše (F24; sada ga briše svaki član).
- `startups.updateArea` ne preimenuje chat kanal oblasti. `listMembers` i `profiles.listAll` rade `take(50)` pre filtera.
- Telefon: obrazac `router.navigate('/prostor')` u `puls.tsx`, `breadcrumbs-eyebrow.tsx`, `kanali.tsx` i `lib/notifications/navigate.ts` može da gurne drugi `(tabs)` (K09-13).
- Telefon: `useQueryTolerant` ne razlikuje grešku od učitavanja; globalni `Button size="sm"` je 14 px; prijava i pozivnica na starom `constants/theme`.
- LICNO `PanelTitle`: neuspelo preimenovanje i dvostruko slanje Enter + blur (K11).
- `archiveNodes` prevezuje podbeleške na višeg roditelja (K18).
- Serverske poruke „Briefing…" (`areasV2.ts`), „Checkpoint/Canvas"; zastareo komentar u `lib/notificationTarget.ts`.
- `canEdit` ideje ne gleda `convertedPageId`, pa se razlog „Ideja je već pretvorena." ne prikazuje (oba klijenta).

## Prilog: testovi menjani zbog novog pravila

Doslovan izvod iz redova **Testovi menjani zbog novog pravila** u `docs/PROSTOR-PROGRESS.md` (format: `fajl › test: staro → novo`). Koraci bez izmena: K06, K09, K10, K11, K12, K13, K15, K18, K21, K22, K23. Negativni slučajevi (nečlan, uklonjen član, arhiviran profil, drugi startup, zaključano, tuđi komentar, tuđa beleška) ostali su negativni.

### K02
- `packages/backend/convex/pages.security.test.ts › nepotpisan raniji sadržaj ne može naknadno da prisvoji kreator`: `canEditBody` false, update odbijen → „…menja svaki član, a zatečeno stanje ostaje u Istoriji" (član menja, bazna revizija bez autora).
- `pages.security.test.ts › samo autor pomera svoju vidljivu karticu na kanvasu oblasti`: `canMove: false`, „samo svoje kartice" → „svaki član pomera…" (`canMove: true`, pomeranje prolazi; scope ostaje).
- `areasV2.test.ts › layout i edge autorizacija su vlasnički i tenant-scope ostaje zatvoren`: pozicija/veličina tuđe kartice odbijena → prolazi (D20); veze ostaju vlasničke do K03.
- `collaboration.test.ts › tim može pomerati tuđu ideju, ali samo autor menja sadržaj i veličinu`: „samo svoju ideju"/„samo svoje kartice" → član menja tekst (ide u Istoriju) i veličinu.
- `tasks.test.ts › kreator menja task metadata, a null vrednosti ih čiste` (deo): član odbijen za status („Status menja kreator…") → odbijen samo na zaključanom („zaključana").
- `tasks.test.ts › dodeljena osoba menja status, ali ne i ostale podatke` → „zaključan zadatak: izvršilac menja status, ali ne i ostale podatke" (pojedinačne poruke „…menja samo kreator zadatka." → „zaključana"; posle otključavanja sve prolazi).
- `tasks.test.ts › dodeljen zadatak: član ne menja tuđe učešće, ali se sam priključuje` → „zaključan zadatak: …" („…menja njegov kreator" → „zaključana").
- `taskAssignees.test.ts › svaki član sam sebe dodaje i skida, tuđe učešće menja kreator` → „…tuđe učešće na zaključanom menja samo autor, vlasnik i admin".
- `taskAssignees.test.ts › spisak menja samo kreator i staje na gornjoj granici` → „spisak menja svaki član, zaključan samo autor, vlasnik i admin".
- `taskAssignees.test.ts › svaki izvršilac menja status i štiklira checkpointe` → „…i na zaključanom zadatku" (neizvršilac odbijen samo na zaključanom).
- `taskCheckpoints.test.ts › pet checkpointa je live, nezavisno od revision-a editora i uz uloge`: neizvršilac `canEdit/canToggle: false`, `canRequestDeletion: true` → `true/true`, `canRequestDeletion: false`; na zaključanom `canEdit: false`; raspored koraka svaki član.
- `taskCheckpoints.test.ts › prvi korak ne može biti vezan i lanac menja samo autor` → „…a lanac zaključanog zadatka menja samo autor" (otključan: izvršilac menja lanac).
- `pageFiles.test.ts › istekla ili tuđa dozvola ne prolazi`: „samo njegov autor" → „Dozvola za slanje fajla nije ispravna".
- `pageFiles.test.ts › tuđi oblačić ne prima fajlove, ali ih član vidi` → „član dodaje fajlove u tuđi oblačić, osim kad je zaključan".
- `pageTables.test.ts › strukturu menja autor, ćelije menja svaki član` → „strukturu i ćelije menja svaki član, zaključanu tabelu samo autor".
- `myDay.test.ts › …ključevi taskItem` (deo): lista polja + `isLocked`, `lockedForViewer`.
- `packages/shared/src/task-row.test.ts › izvršilac menja samo status…` → „nezaključan zadatak: svaki član sme sve" + „zaključan: izvršilac menja samo status…"; `› planiran tuđi zadatak…` → „zaključan tuđi zadatak…" (`PERMISSION_REASONS.status` → `lockedStatus`); `› bez dozvole za status…` → „…(zaključan)…" (otključan → poziv `tasks.updateMetadata`); `dueCall`/`priorityCall` odbijanja → uz `lockedForViewer: true`.
- `packages/shared/src/startup-tasks.test.ts › kreator sme sve` → „kreator sme sve, i na zaključanom" (`canJoinTask` kreatoru koji nije izvršilac: false → true); + „nezaključan zadatak: svaki član sme sve, menadžer i zaključan"; `› izvršilac menja samo status…`, `› član koji nije ni kreator ni izvršilac…`, `› izvršioci još nisu učitani…` → isti slučajevi uz `lockedAt: 1`.
- `apps/mobile/src/components/komandni-centar/startup-task-model.test.ts › dozvole: kreator sve, izvršilac samo status, ostali zaključano sa razlogom` → „dozvole: otključan svako sve; zaključan — …"; `› dok se izvršioci ne učitaju…` → „zaključan: dok se izvršioci ne učitaju…".
- `apps/mobile/src/components/me/row-actions.test.ts › tuđ zadatak u planu: završavanje zabranjeno sa razlogom…` → „zaključan tuđ zadatak u planu: …" (razlog „Status menja kreator zadatka ili osoba kojoj je dodeljen." → `PERMISSION_REASONS.lockedStatus`); `› bez dozvole swipe i dalje bira radnju…`: red bez dozvole = zaključan tuđ zadatak.
- `apps/mobile/src/components/me/my-day/my-day-model.test.ts › dozvola za kvačicu (shared dozvole): lično uvek, startup samo kreator ili izvršilac` → „…startup osim zaključanog tuđeg".
- `apps/web/components/workspace/startup-tasks/command-center-model.test.ts › trijaža po zonama i redovi sa oblašću, planom i dozvolama` (deo): tuđ otključan zadatak `status.allowed` false → true (zabrana proverena na zaključanim); `› dok se izvršioci učitavaju, niko osim kreatora ne menja status` → „zaključan: dok se izvršioci učitavaju…".
### K03
- `areasV2.test.ts › automatic layout separates new cards, ghosts, and migrated collisions` → „automatic layout separates new cards and migrated collisions (bez duhova)": član pod tuđim korenom `pending` + duh → `none`, kartica odmah pod korenom, `ghosts: []`.
- `areasV2.test.ts › pending auto-layout uses source card and pending ghost dimensions` → „direct nesting auto-layout uses source card dimensions": duh x:704 + `approveNesting` → direktno ugnežđavanje na x:704 sa 520×420.
- `areasV2.test.ts › archive promotion preserves card dimensions and projects its edge` → „archive sends the branch to Korpa and restore keeps dimensions and edge": deca se „podižu" → grana u Korpi netaknuta, `trash.restore` vraća decu, dimenzije i vezu.
- `areasV2.test.ts › successful cross-area move keeps all sidecars and rollback rows consistent` (deo): stari zahtevi kroz `requestNesting` → upisani direktno (`insertLegacyPageNesting`), selidba ih i dalje zatvara (`cancelled`).
- `areasV2.test.ts › relacija spaja stranice iz različitih oblasti i vidi se sa obe strane` (deo): relacija tuđa–tuđa „samo sa svojom stranicom" → prolazi.
- `areasV2.test.ts › raspored menja svaki član, veze su vlasničke do K03 i tenant-scope ostaje zatvoren` → „raspored i veze menja svaki član, a tenant-scope ostaje zatvoren": član ne uklanja tuđu vezu → uklanja; nečlan i dalje odbijen.
- `areasV2.test.ts › tuđ V2 edge i relacija se arhiviraju samo kroz jednoglasni approval` → „tuđ V2 edge i relaciju uklanja svaki član, direktno ili kroz stari requestDeletion": `canDelete:false/canRequestDeletion:true` + glasanje → `true/false`, uklanjanje odmah, nula zahteva i listića; nečlan odbijen.
- `areasV2.test.ts › nesting prolazi pending/approve, stale cancel i cycle zaštitu` → „nesting je direktan, approveNesting je STARI_TOK, ciklus ostaje zaštićen".
- `areasV2.test.ts › cross-area move odbija granu sa aktivnim stranim autorom` → „cross-area move seli tuđu granu, a odbija granu sa tuđom zaključanom stranicom" (D6).
- `areasV2.test.ts › odobrena timska arhiva koristi istu V2 sidecar semantiku` → „stari requestDeletion šalje granu u Korpu odmah, a Vrati je vraća netaknutu" (veze, relacije, raspored i stari zahtevi netaknuti).
- `areasV2.test.ts › verifier prijavljuje samo aktivna V2 ostecenja i pronalazi placement sirocad`, `› verifier otkriva cikluse, nevažeći pending target i oštećen viewport` (delovi): stari zahtev kroz `requestNesting` → upisan direktno; logika verifikatora ista.
- `areasV2.test.ts › premeštanje pod TUĐU stranicu u drugoj oblasti seli oblast i traži odobrenje` → „…seli oblast i odmah ugnežđava".
- `collaboration.test.ts › tim menja tekst, veličinu i poziciju tuđe ideje; izmena teksta ide u Istoriju` → „…i briše je u Korpu…": brisanje tuđe ideje „jednoglasnim glasanjem" odbijeno → Korpa.
- `collaboration.test.ts › cross-owner ugnježđavanje traži autora Parenta, dozvoljava izvlačenje obe strane i odbija ciklus` → „ugnežđavanje ideje je direktno, resolveNesting je STARI_TOK, izvlači svaki član i ciklus se odbija".
- `collaboration.test.ts › brisanje tuđeg sadržaja zahteva jednoglasnost, a prvi glas PROTIV odmah odbija` → „stari requestDeletion tuđe ideje je šalje u Korpu odmah; voteOnDeletion je STARI_TOK".
- `collaboration.test.ts › brisanje sopstvenog kontejnera oporavlja tuđe doprinose i izvlači dete` → „brisanje kontejnera ideje izvlači dete, a tuđi komentari ostaju uz ideju u Korpi" (Oporavljeno se više ne pravi, D3).
- `inbox.test.ts › vraća samo moje stavke iz sva tri izvora, najnovije prvo` → „stari izvori (glasanja i oba zahteva) se više ne vraćaju, ni moji" (3 stavke → prazno).
- `inbox.test.ts › samo pending: odlučeni zahtevi, odgovoreni listići i zastareli listići otpadaju` → „ni otvoreni ni odlučeni stari zahtevi i listići ne prave stavke" (1 → prazno).
- `inbox.test.ts › startup bez članstva, napušten i arhiviran su izostavljeni` → „stari zahtevi iz startupa bez članstva, napuštenog i arhiviranog se ne vraćaju" (1 → prazno; opseg kroz `idea_vote` testira K05).
- `inbox.test.ts › arhivirano dete ili roditelj se preskače` → „stari zahtevi sa živim ili arhiviranim detetom se ne vraćaju" (1 → prazno).
- `inbox.test.ts › granica po izvoru: truncated i najviše INBOX_PENDING_CAP po izvoru` → „ni više od INBOX_PENDING_CAP starih zahteva ne pravi stavke ni truncated".
- `notifications.test.ts › zahtev pita ostale, ishod javlja podnosiocu` → „stari zahtev za brisanje ne pita tim ni ne javlja ishod; stranica je u Korpi" (`vote_requested`/`request_resolved` → nijedno).
- `pageFiles.test.ts › brisanje uklanja i blob i prenumeriše preostale` → „uklanjanje ide u Korpu: blob ostaje, preostali se prenumerišu, Vrati ga vraća" (briše član).
- `pageFiles.test.ts › prune briše nereferencirane priloge starije od grace perioda` → „prune meko sklanja … i vraća ih po id-ju" (blob obrisan → ostaje; prilog nije u Korpi).
- `pageFiles.test.ts › prune odbija ne-vlasnika i stranice koje nisu beleške` → „prune radi svaki član, zaključanu belešku ne; samo za beleške".
- `pageTables.test.ts › brisanje kolone čisti njene vrednosti iz redova` → „uklanjanje kolone ostavlja vrednosti u redovima, a kolona nestaje" (član; `setCells` nad uklonjenom kolonom i dalje odbijen).
- `pages.security.test.ts › tuđi parent ne može da se zaobiđe kroz kreiranje stranice` → „član pravi podstranicu pod tuđom stranicom, a pod zaključanom ne" (ZAKLJUCANO).
- `pages.security.test.ts › arhiviranje se bezbedno zaustavlja pre nego što ostavi dete iza arhiviranog parenta` → „brisanje šalje granu do 250 stranica u Korpu, a veću odbija bez izmena" („više od 200" → 201 dete ide u Korpu; 251 → „više od 250", bez izmena).
- `pages.security.test.ts › veze kanvasa čuvaju autorstvo, scope i bezbedno uklanjanje` → „…a menja ih svaki član" („posedujete bar jednu karticu"/„samo vezu koju ste napravili" → član povezuje i uklanja; scope i tip ostaju).
- `pages.security.test.ts › legacy i aktivni Canvas API odbijaju tuđu oblast i cross-area vezu` (deo): očekivan tekst „bar jednu karticu" → greška opsega „kanvasa iste oblasti".
- `pages.security.test.ts › cross-area move odbija granu sa aktivnim stranicama drugog autora` → „cross-area move seli granu drugog autora, a odbija je dok je u njoj tuđa zaključana stranica" (D6).
- `taskCheckpoints.test.ts › arhiviranje ima Undo, član traži brisanje, a limit ostaje 100` → „…stari requestDeletion odmah arhivira…".
- `taskCheckpoints.test.ts › checkpoint veze pokrivaju checkpoint, task i note uz dozvole, approval i soft unlink` → „…: menja ih svaki član, soft unlink i Korpa" (član ne povezuje/ne uklanja tuđu → može; glasanje → odmah; brisanje stranice više ne arhivira vezu koraka — skrivena dok je stranica u Korpi, vraća se sa njom, D3).
### K04
- `collaboration.test.ts › izmene članova prolaze pending, reject, ponovno slanje i approve bez dupliranja osnove` → „komentar člana na ideji je odmah vidljiv, a stara moderacija radi samo za stare klijente": `moderationStatus` „pending" → „approved" odmah po dodavanju; izmena odbijenog komentara ga ne vraća u „pending" (ostaje „rejected"); `moderateContribution` (odbij/odobri, samo autor ideje) i vidljivost odbijenog (autor komentara) ostaju.
- `notificationSettingsCatalog.test.ts › pokriva svih 13 tipova…` → „…svih 15 tipova…" (+ tihi sati: `comment_mention` probija, `comment_added` ne).
- `lib/notificationTarget.test.ts › svaki targetType vodi na svoj ekran` (deo): `ideas` sa ideaId → `entityId` ideaId (bez id-ja i dalje null), dodat `area`.
- Nepromenjeni a relevantni: `areasV2.test.ts › članovi dodaju potpisani kontekst u briefing oblasti` (zastavice autora prolaze), `legacyFlows.test.ts` (tuđi komentar kroz stari zahtev: `NEMA_DOZVOLU`, menadžer ✓).
### K05
- `packages/backend/convex/ideas.test.ts › seeder createApprovedIdea` (deo oba testa „Ideas conversion integrity"): „odobrena" = glas „za" vlasnika → `stage: "odobreno"` (+ `stageChangedAt`, `stageChangedByProfileId`), bez glasa; vlasnik i dalje pretvara.
- `packages/backend/convex/notifications.test.ts › konverzija ideje obaveštava autora i vodi na rezultat`: član pretvara vlasnikovu ideju bez faze → autor je član, vlasnik postavlja fazu „Odobreno" i pretvara; obaveštenje dobija autor („Pretvorio/la: Owner").
- `packages/shared/src/inbox.test.ts › prazno stanje po segmentu` (dopuna): „Čeka tebe" opis „Glasanja o brisanju i predlozi za premeštanje stižu ovde." → „Ideje koje tim razmatra stižu ovde." (lično: „…nemaju odobrenja…" → „…nemaju ideje za glasanje…", test `toContain("Lične poruke")` nepromenjen).
### K08
- `apps/web/components/workspace/workspace-route.test.ts › reads Home, Ideas and Thoughts as distinct routes while bare URLs open Moj dan` → „reads Ideas and Thoughts as distinct routes, Home as the command center and bare URLs as Moj dan": `?view=home` → `{ kind: "home" }` → `{ kind: "today" }` (P8/P11).
- `› gives Home, Ideas and Thoughts unique history entries that survive Back and Forward` → „gives the command center, Ideas and Thoughts …": `home` u istoriji → `today`.
- `› preserves per-startup screens across startup switches and falls back to the command center` (deo): `home` iz liste → `trash`, `trash`(Ideje), `tasks`, `tasks`(Moji); `workspaceRouteAfterStartupSwitch({ kind: "approvals" })` → `{ kind: "activity" }` (oba → `today`).
- `› lični nivo Ja › razlikuje opseg: me-* je lični, sve ostalo startup` (deo): `my-tasks`, `home` → `tasks`, `trash`.
### K14
- `lib/notifications/navigate.test.ts › „area do K14 pada na početnu Prostora…"`: `area` → `/prostor` → `area` otvara `/oblast/[id]` (push), bez id-ja i dalje `/prostor`.
### K16
- `apps/web/components/me/my-day/side-model.test.ts › „Čeka tebe“: tekst po vrsti, ključ po izvoru` (deo sa `pendingSummary`): glasanje o brisanju i zahtev za ugnežđavanje su bili stavke desne kolone → više se ne prikazuju (`{ items: [], truncated: true }`), P22. `pendingTitle` za stare vrste i dalje proverava isti tekst.
- `apps/web/components/workspace/trash/trash-model.test.ts › cilj vraćanja i otvaranja po vrsti` (jedan red): „Otvori" posle vraćanja ideje `{ kind: "ideas" }` → `{ kind: "ideas", ideaId }` (najavljeno u K09 paritetu: „web ga dobija u K16").
### K17
- `components/prostor/prostor-hub-model.test.ts › samo Dokumenti imaju tekstualnu vrednost…`: samo Dokumenti → Dokumenti i Ideje (Ideje dobijaju broj u K17, kako je komentar modela već najavljivao).
### K19
- `apps/web/components/workspace/startup-tasks/command-center-model.test.ts › zone Komandnog centra`: 4 zone → 5 zona (nova `zastarelo` posle `gori`), indeksi `zones[1]`/`zones[3]` → `zones[2]`/`zones[4]` (P10).
- `apps/mobile/src/components/prostor/prostor-hub-model.test.ts`: uklonjena tvrdnja o privremenim redovima Puls/Aktivnost (`ProstorTempRows` više ne postoji — blokovi ih zamenjuju).
- `apps/mobile/src/components/komandni-centar/command-blocks-model.test.ts › waitingIdeas`: stavka sada nosi i `upvotes`/`downvotes` (meta „N za · M protiv").
### K20
- `packages/shared/src/task-sort.test.ts › po roku, statusu i prioritetu, bez praznih grupa`: „Backlog" → „Neplanirano" (E9).
- `packages/shared/src/inbox.test.ts › pendingTitle` i `apps/web/components/me/my-day/side-model.test.ts › Čeka tebe: tekst po vrsti`: „Glasanje o brisanju: „Stari logo“" → „Brisanje: „Stari logo“".
- `packages/shared/src/notes.test.ts` (prazno stanje): „Zapiši prvu misao gore." → „Zapiši prvu belešku gore.".
- Samo imena testova: `task-create.test.ts › Backlog, Srednji…` i `startup-tasks.test.ts › bez statusa = Backlog…` → „Neplanirano".
