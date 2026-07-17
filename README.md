# Notion Clone

Privatni operativni prostor za mali tim koji vodi više startupa. Aplikacija spaja hijerarhijske beleške, zadatke, odgovornosti i aktivnost tima u jedan miran, pregledan interfejs.

## Šta je uključeno

- startup članstva i privatne pozivnice vezane za email;
- jedan glavni admin, članovi tima i profilne slike;
- oblasti Dev, Marketing, Sales i Ostalo za svaki startup;
- neograničeno ugnježdene stranice i task stranice;
- rich-text editor sa autosave-om i zaštitom od konflikta pri paralelnom radu;
- status, prioritet, rok i odgovorna osoba za svaki zadatak;
- Početna, Danas, Moji zadaci, Kanban, pretraga i aktivnost;
- responsive web interfejs za desktop i telefon;
- svetla i tamna tema, Framer Motion mikrointerakcije i pažljivo ograničen GSAP ulaz prikaza.

Codex planiranje i obaveštenja su namerno ostavljeni za drugu fazu, nakon što tim potvrdi svakodnevni workflow jezgra aplikacije.

## Lokalno pokretanje

Potreban je Node.js 20.9 ili noviji.

```bash
npm ci
```

Pokreni dva terminala:

```bash
# Terminal 1
npm run dev:convex

# Terminal 2
npm run dev
```

Otvori [http://localhost:3100](http://localhost:3100). Notion Clone namerno koristi svoj port kako ne bi nasledio service worker i sačuvane rute drugih lokalnih aplikacija na portu 3000. `npm run dev` koristi podrazumevani Turbopack iz Next.js 16, ograničava Node heap i automatski gasi samo svoj procesni lanac ako slobodna sistemska memorija duže ostane ispod bezbednog praga. Za dijagnostički Webpack fallback postoji `npm run dev:webpack`.

`npm run dev:convex` odbija drugi paralelni Convex watcher i ne ponavlja skupi TypeScript check pri svakoj filesystem promeni; kompletan TypeScript check ostaje deo `npm run check`.

Nemoj dodatno pokretati `npx convex dev` dok `npm run dev:convex` već radi.
Nemoj ni preusmeravati Convex izlaz u `.log` fajl unutar ovog foldera, jer promena tog fajla može ponovo aktivirati watcher; za logove koristi sistemski temp folder.

Aktuelno lokalno Convex okruženje je već povezano kroz `.env.local`. Za potpuno nov Convex deployment prvo pokreni:

```bash
npx convex dev --once
npx @convex-dev/auth --web-server-url http://localhost:3100
npx convex env set BOOTSTRAP_ADMIN_CODE "izaberi-dug-slucajan-kod"
```

`BOOTSTRAP_ADMIN_CODE` se unosi samo pri kreiranju prvog administratorskog naloga. Posle toga registracija radi isključivo preko pozivnog linka koji admin pravi unutar aplikacije. Tajne se podešavaju kao Convex environment variables i ne upisuju se u git.

## Provera

```bash
npm run check
```

Komanda pokreće ESLint i production build. Convex funkcije i schema se proveravaju i objavljuju na dev deployment komandom:

```bash
npm run convex:push
```

## Tehnologije

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/Radix, Convex + Convex Auth, Tiptap, Framer Motion i GSAP.
