# Oblasti v2 — odobren model

Status: **odobreno 27. jula 2026. za implementaciju**.

Korisnik je uz preporučeni model eksplicitno potvrdio i Note↔Task veze unutar
iste oblasti.

Ovaj dokument opisuje ciljni sistem „Oblasti“ bez menjanja postojećih tokova
„Ideje“ i „Moje misli“. Ne sadrži kredencijale, produkcione identifikatore niti
drugi tajni materijal.

## 1. Posao koji ekran mora da uradi

Publika je mali startup tim u kom više ljudi paralelno razrađuje beleške i
izvršava zadatke.

Jedini glavni posao svakog Area/page ekrana je:

> pokaži gde se nalazim, šta je glavni sadržaj ove stavke i koje su njene
> direktne sledeće stavke — bez gubljenja vlasništva ili statusa odobrenja.

## 2. Preporučeni produkt ugovor

1. Oblast je koren jednog rekurzivnog stabla.
2. Svaka stavka u stablu je ili `note` ili `task`.
3. Area kanvas prikazuje samo direktne root stavke oblasti.
4. Kanvas taska ili beleške prikazuje samo njihovu direktnu decu.
5. Task i note mogu sadržati i taskove i beleške.
6. Kartica zadržava istog autora kada promeni roditelja.
7. Autor deteta može direktno da ga premesti pod svoj sadržaj.
8. Smeštanje pod tuđi sadržaj zahteva odobrenje autora ciljnog roditelja.
9. Odbijanje ne briše dete i ne menja mu postojeću lokaciju.
10. Arhiviranje roditelja ne briše tuđi aktivni sadržaj; njegova direktna deca
    vraćaju se jedan nivo naviše.
11. Bilo koje dve stranice istog startupa — i iz različitih oblasti — mogu biti
    povezane relacijom bez promene parenta, autora ili statusa odobrenja.
    Relacija preživljava premeštanje jednog kraja u drugu oblast.

## 3. Navigacija

Preporučeni URL ugovor:

- `/?view=area&areaId=<id>` — root kanvas oblasti;
- `/?view=page&pageId=<id>` — kanvas taska ili beleške;
- browser Back/Forward prati prethodno otvorene kanvase;
- dugme „Nazad” u breadcrumb-u i taster `Esc` vode jedan nivo hijerarhije
  naviše: na roditeljski oblačić, odnosno na koren oblasti; Esc pre toga
  poštuje otvorene slojeve (dijalozi, meniji, selekcija na kanvasu);
- nevažeći, arhiviran ili nedostupan ID vraća korisnika na pripadajuću oblast
  uz jasnu poruku.

Breadcrumb:

`Startup / Oblast / Roditelj / Trenutna stavka`

Klik na karticu je selekcija. Akcija **Otvori kanvas**, dvoklik i Enter otvaraju
kanvas te stavke. Akcija **Detalji** otvara editor/modal bez promene kanvasa.

## 4. Vizuelni pravac

Zadržava se postojeći „radni sto“ jezik aplikacije, bez novog dashboard stila.

- osnovna površina: postojeći `--background` i `--card`;
- navigacija i fokus: postojeći violet `--primary`;
- beleška: plavi akcenat `oklch(0.64 0.13 232)`;
- zadatak: zeleni akcenat `oklch(0.63 0.14 155)`;
- upozorenje/pending: postojeći `--warning`;
- greška/odbijeno: postojeći `--destructive`.

Tipografija ostaje Geist/Segoe UI iz postojećeg sistema. Mono se ne koristi za
običan interfejs.

Potpis sistema je **Briefing dock**: mirna, fiksna površina iznad kanvasa koja
uvek prikazuje glavni sadržaj trenutne oblasti/taska/beleške. Deca su na
kanvasu ispod njega; glavni sadržaj nikada nije još jedna plutajuća kartica.

### Desktop

```text
┌ breadcrumb ───────────────────────── owner / status / pending ┐
├ Briefing dock: naslov + glavni sadržaj/instrukcija + akcije ──┤
├ filter: Sve | Beleške | Zadaci          + Beleška  + Zadatak ┤
│                                                              │
│                   kanvas direktne dece                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Mobilni prikaz

```text
┌ breadcrumb + meni ┐
├ naslov + status   ┤
├ Briefing dock     ┤
├ filter + Dodaj    ┤
│ kanvas (pan/zoom) │
└───────────────────┘
```

Na telefonu detalji taska otvaraju gotovo ceo ekran (`dvh`) sa jednim
vertikalnim tokom. Minimap je skriven, touch mete su najmanje 44 px, a
horizontalni overflow postoji samo unutar samog kanvasa.

## 5. Task i beleška nisu isti ekran

### Beleška

- glavni sadržaj je rich-text `pageBodies.content`;
- Briefing dock prikazuje/edituje rich text;
- modal je opcioni prošireni editor;
- kartica koristi ikonu beleške, plavi akcenat i sadržajni excerpt.

### Zadatak

- glavni sadržaj je `pages.instructions`;
- legacy/konvertovani task koji ima samo `pageBodies.content` prikazuje taj body
  kao **Dodatni kontekst** dok ga vlasnik ne prebaci u instrukciju;
- kartica uvek prikazuje status, prioritet, rok i assignee stanje;
- Briefing dock prikazuje instrukciju i sažetak izvršenja;
- optimizovan modal ima:
  1. sticky naslov/status;
  2. instrukciju;
  3. checkpointe;
  4. assignee, prioritet i rok;
  5. potpisane izmene članova i istoriju.

Task modal ne prikazuje prazan note editor. Beleška ne dobija task kontrole.

## 6. Ugnježđavanje i odobrenje

Za stranice se uvodi odvojen `pageNestingRequests` tok. Postojeći
`nestingRequests` za Ideje se ne menja.

### Stanja

```text
source
  │ zahtev za tuđi parent
  ▼
pending ── odobri ──► approved / dete menja parent
   │
   ├── odbij ───────► rejected / dete ostaje u source
   └── povuci ──────► withdrawn / dete ostaje u source
```

Pravila:

- zahtev može poslati samo autor aktivnog deteta;
- odobrava/odbija samo autor aktivnog ciljnog roditelja;
- pri odobravanju server ponovo proverava startup, oblast, autorstvo, ciklus i
  dubinu hijerarhije;
- pending dete ostaje potpuno upotrebljivo u izvornom kanvasu;
- ciljni kanvas prikazuje nenametljivu ghost karticu sa statusom
  **Čeka odobrenje**;
- autor deteta može povući zahtev;
- autor roditelja ili autor deteta mogu kasnije odvojiti odobreno dete; ono se
  vraća u root oblasti;
- kreiranje sadržaja iz tuđeg kanvasa kreira autorsku stavku u rootu oblasti i
  u istoj transakciji šalje nesting zahtev.

## 7. Convex v2 model bez destruktivne migracije

Preporučene su nove, Areas-only sidecar tabele kako bi stari Area prikaz mogao da radi
tokom rollouta i kako „Ideje“/„Moje misli“ ne bi delile nove ugovore.

### `areaBodies`

- `startupId`, `areaId`
- `content`, `revision`
- `updatedByProfileId`, `createdAt`, `updatedAt`
- jedinstveni lookup preko `by_areaId`

Invariant: samo kreator startupa uređuje Briefing oblasti; svi aktivni članovi
ga čitaju.

### `pageCanvasPlacements`

- `startupId`
- `areaId`
- `rootPageId: Id<"pages"> | null` (`null` = Area root)
- `pageId`
- `x`, `y`, opcioni `width`, `height`
- `updatedAt`
- indeksi:
  - `by_pageId`
  - `by_areaId_and_rootPageId`

Invariant: `page.parentPageId === placement.rootPageId`.

### `pageCanvasEdgesV2`

- `startupId`
- `areaId`
- `rootPageId: Id<"pages"> | null`
- `nodeAId`, `nodeBId`, `pairKey`
- `authorProfileId`
- `archivedAt`, `createdAt`, `updatedAt`
- indeksi:
  - `by_areaId_and_rootPageId`
  - `by_areaId_and_rootPageId_and_pairKey`
  - `by_authorProfileId_and_archivedAt`

Invariant: oba endpointa su aktivna direktna deca istog `rootPageId`.

### `pageCanvasViewports`

- `startupId`
- `areaId`
- `rootPageId: Id<"pages"> | null`
- `ownerProfileId`
- `x`, `y`, `zoom`, `createdAt`, `updatedAt`
- jedinstveni lookup preko
  `by_ownerProfileId_and_areaId_and_rootPageId`.

### `pageNestingRequests`

- `startupId`, `areaId`
- `childPageId`
- `sourceParentPageId`
- `targetParentPageId`
- `requesterProfileId`
- `targetOwnerProfileId`
- opcioni `proposedX`, `proposedY`
- `status: pending | approved | rejected | withdrawn`
- opcioni `resolvedByProfileId`, `resolvedAt`
- `createdAt`, `updatedAt`

Indeksi moraju pokriti pending zahtev po detetu, inbox ciljnog vlasnika i
startup approvals pregled.

### `pageRelations`

- `startupId`, `areaId`
- `nodeAId`, `nodeBId`, kanonski `pairKey`
- `authorProfileId`
- `archivedAt`, `createdAt`, `updatedAt`
- indeksi po oblasti/pair-u, oba endpointa i autoru

Invariant: endpointi su aktivne stranice istog startupa, bilo koje vrste i iz
bilo kojih oblasti; `pairKey` je jedinstven na nivou startupa, a `areaId` reda
je samo kanvas-scope (oblast u kojoj red nastaje, odnosno ciljna oblast kada se
oba kraja presele zajedno). Relacija ne menja `parentPageId`. Kada su obe
kartice direktna deca trenutno otvorenog kanvasa, relacija se vidi kao
isprekidana linija na kanvasu; u suprotnom je dostupna u odeljku **Povezane
stavke** u detaljima obe stranice, sa oznakom oblasti druge strane kada se
oblasti razlikuju.

Na `pages` se tokom widen faze opciono dodaju:

- `treeRevision`, za odbijanje stale approval-a;
- `canvasPreview`, za bounded canvas query bez čitanja stotina punih body-ja.

## 8. Rollout i migracija

1. **Backend A — kompatibilan**
   - dodati v2 tabele i nove internal migracije/verifiere;
   - dodati opcione `treeRevision` i `canvasPreview`;
   - stari API ostaje aktivan;
   - postojeći root layout/edge write tok privremeno dual-write u v2.
2. **Backfill**
   - kreirati prazan `areaBodies` red za svaku aktivnu oblast;
   - popuniti `treeRevision` i bounded `canvasPreview`;
   - `pageCanvasNodes` → `pageCanvasPlacements` koristeći trenutni
     `page.parentPageId`;
   - validni `pageEdges` → v2 samo ako endpointi imaju isti parent;
   - za root viewport uzeti noviji od postojećih note/task viewporta;
   - nijedan legacy red se tada ne briše.
3. **Verifier**
   - nema aktivnog page-a bez tačno jednog placement reda;
   - nema edge-a čiji endpointi nisu u istom kanvasu;
   - nema cross-startup/cross-area reference;
   - nema više od jednog pending zahteva po detetu;
   - nema ciklusa do maksimalne podržane dubine.
4. **Frontend**
   - uključiti v2 Area/page kanvase i URL navigaciju;
   - stari backend ugovori ostaju kompatibilni za Vercel rollback.
5. **Produkcioni smoke test**
   - owner i member tokovi na desktopu i telefonu;
   - čista konzola i mreža;
   - tek posle toga razmotriti uklanjanje legacy API-ja/tabela.

Rollback Vercela vraća prethodni UI bez vraćanja baze. V2 tabele ostaju
nedestruktivne i mogu se ponovo koristiti pri sledećem deployu.

## 9. Acceptance matrica

### Funkcionalno

- Area root prikazuje mešovite direktne task/note kartice.
- Note i Task iz iste oblasti mogu da se povežu i otvore jedan iz drugog.
- Svaka kartica otvara svoj kanvas i ispravan breadcrumb.
- Back/Forward i direktan URL vraćaju isti kanvas.
- Task i note imaju različite kartice i različite detail površine.
- Glavni sadržaj ostaje iznad kanvasa pri pan/zoom radu.
- Create u sopstvenom kanvasu je odmah vidljiv.
- Create/nest u tuđem kanvasu daje pending status bez promene parenta.
- Approve menja parent jednom; reject/withdraw ga ne menja.
- Detach ne menja autora.
- Arhiviranje parenta reparentuje aktivnu decu i čuva njihov sadržaj.

### Autorizacija

- nečlan ne može da čita ni menja Area/page canvas;
- startup A ID ne može da se koristi sa startupom B;
- samo autor menja body/instruction, metadata, veličinu i parent svog sadržaja;
- samo autor menja poziciju i veličinu svoje kartice;
- samo ciljni owner rešava nesting zahtev;
- edge pripada autoru veze; drugi član traži brisanje kroz postojeći approval
  tok umesto direktnog brisanja;
- ciklus, self-parent i prekoračenje dubine se odbijaju server-side;
- Ideas/My Thoughts testovi ostaju nepromenjeni i zeleni.

### Responsive i pristupačnost

- 1440×900, 1024×768, 390×844 i 360×800;
- keyboard selekcija, Enter za otvaranje, Escape za modal;
- vidljiv focus, čitljiv kontrast i reduced motion;
- nema page-level horizontalnog overflowa;
- canvas kontrole ne prekrivaju kartice ni Briefing dock;
- loading, empty, truncated, pending, rejected i error stanja imaju jasnu akciju.

### Produkcija

- Convex codegen, testovi, `npm run check`, dependency audit;
- prod Convex verifieri posle migracije;
- Vercel deploy tačno verifikovanog commita;
- signed-in owner/member smoke test na `notionofstartups.vercel.app`;
- desktop/mobile konzola bez novih error/warning poruka;
- sign-in/sign-out i session persistence posle Auth/Next dependency izmene.

## 10. Potvrđene odluke

Korisnik je 27. jula 2026. potvrdio „da“ za svih osam:

1. Jedan mešovit kanvas, sa filterom Sve/Beleške/Zadaci, umesto dva odvojena
   kanvasa.
2. Pending ghost se vidi u ciljnom kanvasu, dok original ostaje u source.
3. Parent owner i child owner mogu da detach-uju odobreno dete u Area root.
4. Arhiviranje parenta reparentuje direktnu decu jedan nivo naviše.
5. URL pamti Area/page kanvas i podržava Back/Forward.
6. Poziciju/veličinu kartice menja njen autor; vezu uklanja njen autor, a drugi
   član šalje zahtev za brisanje.
7. Briefing oblasti uređuje kreator startupa; članovi ga čitaju i dodaju svoj
   potpisani sadržaj kroz postojeći contribution tok.
8. Cross-area move cele grane se odbija ako grana sadrži aktivne stranice
   drugih autora; prvo se one detach-uju/rehome-uju bez promene autorstva.
9. Postojeća kartica može direktno mišem/touch gestom da se prevuče preko
   druge kartice i pusti radi ugnježđavanja; isti autor dobija trenutni move, a
   tuđi parent pending zahtev.
10. Svi veliki modalni tokovi imaju odvojeno skrolabilno telo i uvek vidljive
    akcije/zatvaranje na desktopu i mobilnom prikazu.
11. Svaka aktivno ugnežđena kartica nudi **Odvoji u oblast** autoru kartice i
    autoru njenog roditeljskog kanvasa; akcija je dostupna na kartici/listi i u
    detaljima, bez slabljenja vlasničkih pravila.

Potvrda je data bez izuzetaka, uz dodatni zahtev za Note↔Task relacije unutar
iste oblasti.
