# Noćni zadatak — ostatak Faze 3 (M3.3 i M3.4)

> Radim sam, korisnika nema da odgovara. Ako nešto nije jasno — izaberi razumnu
> opciju, zapiši je u izveštaj, nastavi. Ne čekaj odgovor.
>
> Redosled je obavezan: prvo M3.3, pa M3.4. Commit posle svakog.

---

## Preduslovi — proveri pre nego što kreneš

1. `apps/mobile/src/app/(app)/(tabs)/prostor.tsx` postoji (M3.1)
2. Mobilni editor stranice postoji (M3.2)
3. `npm run check` iz korena prolazi **pre** nego što išta diraš

Ako `npm run check` već puca pre tvoje izmene — **stani**, upiši u izveštaj šta
puca, i ne kreni dalje. Ne gradi na pokvarenom.

---

## M3.3 — Tabele i prilozi

Pročitaj `docs/mobile/02-EKRANI.md` sekciju 9.4, pa
`packages/backend/convex/pageTables.ts` i `pageFiles.ts`, pa web pandane
`apps/web/components/workspace/tables/page-table-panel.tsx` i
`files/page-files-panel.tsx`.

### Tabele

- **Zamrznuta prva kolona** uz horizontalno skrolovanje ostatka. Bez toga se
  korisnik izgubi u tabeli od 20 kolona.
- **Tap na ćeliju otvara bottom sheet** za izmenu — ne inline editovanje.
  Inline na 6 inča ne radi.
- Paginacija redova (`MAX_TABLE_PAGE_SIZE` = 200), ne učitavanje svih odjednom.
- Poštuj limite iz `lib/validators.ts`: `MAX_TABLE_COLUMNS` 64,
  `MAX_TABLE_ROWS` 5000, `MAX_TABLE_CELL_LENGTH` 2000.
- Dodavanje i brisanje reda. Dodavanje kolone opciono — ako je komplikovano na
  telefonu, preskoči i zapiši kao izuzetak.

### Prilozi

- Upload iz galerije preko `expo-image-picker`
- Upload iz kamere preko `expo-camera`
- Kategorije iz `pageFileCategoryValidator`: `image`, `video`, `pdf`, `audio`,
  `sheet`, `document`
- **Slike i PDF** se otvaraju u aplikaciji; ostalo kroz sistemski otvarač
  (`Linking` / `expo-sharing`)
- Brisanje priloga uz potvrdu

### Izuzetak — zapiši ga u kod kao komentar

Uvoz Excel fajlova (`read-excel-file`) ostaje **web-only**. Na telefonu se
preskače. Napiši komentar iznad mesta gde bi stajao, sa razlogom.

---

## M3.4 — Pretraga

Pročitaj `packages/backend/convex/search.ts` i
`apps/web/components/workspace/search-dialog.tsx`.

- Ekran pretrage preko celog ekrana, otvara se iz ikonice u headeru
- Rezultati **grupisani po tipu**: stranice, zadaci, ideje, misli, poruke
- Debounce na unosu — ne šalji upit na svaki pritisak tastera
- Tap na rezultat vodi na odgovarajući ekran
- Prazno stanje pre kucanja: „Pretraži stranice, zadatke i poruke"
- Prazno stanje bez rezultata: „Nema rezultata za …"
- Autofokus na polje pri otvaranju

---

## Pravila

- **Ne diraj `apps/web` ni `packages/backend`.** Ako misliš da moraš — nemoj,
  upiši u izveštaj zašto.
- Dodirna meta minimum **44 pt**, osnovni tekst minimum **16 px**, safe area.
- Svaki ekran ima **prazno, učitavanje i greška** stanje. Sva tri.
- Koristi postojeće primitive iz `src/components/ui/`, ne pravi nove varijante.
- Instalacija paketa isključivo `npx expo install`, nikad `npm install`.
- **Commit posle svakog koraka**, poruka na srpskom u imperativu.

### ⚠️ Zabranjeno

**Ne praviti prazne placeholder komponente da bi provera prošla.** Ako ne umeš
da uradiš neki deo, ostavi ga neurađenim i **napiši to u izveštaj** — to je
pošteno. Prazna komponenta koja se kompajlira je gore od nedostajuće, jer je
sutra niko neće primetiti.

---

## Na kraju — `docs/mobile/NOCNI-IZVESTAJ-FAZA3.md`

```markdown
# Noćni izveštaj — Faza 3 (M3.3, M3.4)

## Urađeno
(lista sa putanjama fajlova)

## Nije urađeno i zašto
(sve preskočeno, sa razlogom — pošteno, bez ulepšavanja)

## BLOKADE
(gde mi treba Jovan. Ako nema, napiši „nema")

## Odluke koje sam doneo sam
(gde specifikacija nije bila jasna pa sam birao)

## Šta Jovan mora vizuelno da proveri ujutru
(konkretna lista ekrana i šta na njima da pogleda)
```

Commit-uj i izveštaj.
