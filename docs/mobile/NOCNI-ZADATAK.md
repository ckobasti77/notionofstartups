# Noćni zadatak — koraci 0.4 i 0.5

> Ovaj fajl je zadatak za autonomnu `/goal` petlju. Radim sam, korisnika nema da
> odgovara na pitanja. Ako nešto nije jasno — izaberi razumnu opciju i zapiši je
> u izveštaj umesto da čekaš odgovor.

---

## Pre svega — provera preduslova

Proveri redom i **zapiši nalaz**:

1. Postoji li `apps/mobile` sa Expo projektom (`app.json`, `package.json` sa `expo`)
2. Postoji li NativeWind / Tailwind setup u `apps/mobile`
3. Je li Convex klijent povezan — postoji li `ConvexReactClient` i radi li `useQuery`
4. Postoji li `EXPO_PUBLIC_CONVEX_URL` u `apps/mobile/.env.local`

**Ako nešto fali:** uradi minimum potreban da nastaviš. Ako ne možeš sam
(potreban nalog, ključ, ručna radnja) — upiši **BLOKADA** u
`docs/mobile/NOCNI-IZVESTAJ.md`, commit-uj, i stani. Ne preskači korak i ne
pravi lažni placeholder da bi provera prošla.

---

## KORAK 0.4 — Dizajn tokeni

Pročitaj `apps/web/app/globals.css` i `docs/mobile/02-EKRANI.md` sekciju 11.

**Uradi:**

1. `apps/mobile/tailwind.config.js` — iste boje, radijusi i tipografska skala kao
   na webu. Svetla i tamna tema.
2. Hook za temu sa tri stanja: `svetlo` / `tamno` / `sistemsko`. Sistemsko prati
   `useColorScheme` iz React Native.
3. Primitivne komponente u `apps/mobile/components/ui/`, po uzoru na
   `apps/web/components/ui/` ali native:
   - `Button` — varijante: default, secondary, ghost, destructive; veličine sm/md/lg
   - `Card`
   - `Input`
   - `Badge`
   - `Avatar` — sa fallback inicijalima
   - `Skeleton`

**Zabranjeno:** Radix, `class-variance-authority` ako ne radi na RN, bilo koji
web API (`window`, `document`, `localStorage`).

---

## KORAK 0.5 — Navigacija

Pročitaj `docs/mobile/02-EKRANI.md` sekcije 2 i 3.

**Uradi:**

1. expo-router struktura:

```
app/
├── _layout.tsx           ← ConvexAuthProvider, tema
├── (auth)/
│   ├── _layout.tsx
│   └── prijava.tsx
└── (app)/
    ├── _layout.tsx       ← header sa startup switcher-om
    └── (tabs)/
        ├── _layout.tsx   ← tab bar
        ├── danas.tsx
        ├── prostor.tsx
        ├── chat.tsx
        ├── obavestenja.tsx
        └── vise.tsx
```

2. Tab bar sa pet tabova: **Danas · Prostor · Chat · Obaveštenja · Više**.
   Ikone iz `lucide-react-native`.

3. Header: logo, naziv startupa sa strelicom (otvara bottom sheet sa listom),
   ikonica pretrage, avatar. Podaci iz `startups.listForCurrent`.

4. Svaki tab je placeholder — naslov + prazno stanje iz
   `docs/mobile/02-EKRANI.md` sekcije 10. Nije potrebna funkcionalnost, samo da
   navigacija radi i da se vidi lista startupa.

---

## Pravila

- **Ne diraj `apps/web` ni `packages/backend`.** Ako misliš da moraš — nemoj,
  upiši u izveštaj zašto.
- Dodirna meta minimum **44×44 pt**, osnovni tekst minimum **16 px**, safe area
  gore i dole. (`docs/mobile/02-EKRANI.md` sekcija 11)
- Svaka komponenta ima prazno stanje ili fallback — ne ostavljaj beli ekran.
- Commit posle svakog završenog koraka. Poruka na srpskom, u imperativu.
- Ako paket fali, instaliraj ga sa `npx expo install`, **nikad `npm install`**.

---

## Na kraju — `docs/mobile/NOCNI-IZVESTAJ.md`

Napiši izveštaj sa četiri sekcije:

```markdown
# Noćni izveštaj — koraci 0.4 i 0.5

## Urađeno
(lista, sa putanjama fajlova)

## Nije urađeno i zašto
(sve što je preskočeno, sa razlogom)

## BLOKADE
(sve gde ti treba korisnik — nalog, ključ, ručna radnja. Ako nema, napiši "nema")

## Šta Jovan mora ručno ujutru
(konkretni koraci, redom)

## Odluke koje sam doneo sam
(sve gde specifikacija nije bila jasna pa sam birao)
```

Commit-uj i izveštaj.
