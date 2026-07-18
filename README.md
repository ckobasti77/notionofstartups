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
npm run dev

# Terminal 2
npx convex dev
```

Otvori [http://localhost:3000](http://localhost:3000). `npm run dev` pokreće standardni Next.js razvojni server sa podrazumevanim Turbopack bundlerom i portom 3000. `npx convex dev` zasebno pokreće standardni Convex watcher.

Aktuelno lokalno Convex okruženje je već povezano kroz `.env.local`. Za potpuno nov Convex deployment prvo pokreni:

```bash
npx convex dev --once
npx @convex-dev/auth --web-server-url http://localhost:3000
npx convex env set BOOTSTRAP_ADMIN_CODE "izaberi-dug-slucajan-kod"
```

`BOOTSTRAP_ADMIN_CODE` se unosi samo pri kreiranju prvog administratorskog naloga. Posle toga registracija radi isključivo preko pozivnog linka koji admin pravi unutar aplikacije. Tajne se podešavaju kao Convex environment variables i ne upisuju se u git.

## Provera

```bash
npm run check
```

Komanda pokreće ESLint i production build. Convex funkcije i schema se proveravaju i objavljuju na dev deployment komandom:

```bash
npx convex dev --once
```

## Tehnologije

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/Radix, Convex + Convex Auth, Tiptap, Framer Motion i GSAP.
