# Devotion

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

## Struktura repozitorijuma

npm workspaces monorepo:

- `apps/web` — Next.js aplikacija
- `apps/mobile` — rezervisano za Expo aplikaciju (vidi `docs/mobile/`)
- `packages/backend` — Convex backend (`packages/backend/convex`)

Sve komande se pokreću iz korena repozitorijuma: root skripte delegiraju u
`apps/web`, a root `convex.json` usmerava Convex CLI na
`packages/backend/convex`. Convex CLI (`npx convex ...`) se pokreće
**isključivo iz korena** — pokrenut iz `apps/web` pogrešno bi zaključio gde je
functions direktorijum.

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

Otvori [http://localhost:3000](http://localhost:3000). `npm run dev` pokreće standardni Next.js razvojni server (Turbopack) na portu 3000. `npx convex dev` zasebno pokreće standardni Convex watcher. Production build (`npm run build`) koristi webpack.

Env fajlovi žive na dva mesta: root `.env.local` je dom Convex CLI-ja
(`CONVEX_DEPLOYMENT` i vrednosti koje CLI sam upisuje), a `apps/web/.env.local`
drži `NEXT_PUBLIC_*` varijable koje Next čita u build-u. Na svežem clone-u:

```bash
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
```

pa posle prvog `npx convex dev` prekopiraj `NEXT_PUBLIC_*` vrednosti iz root
`.env.local` u `apps/web/.env.local`.

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

Komanda pokreće ESLint (ceo repo) i production build za `apps/web`. Testovi
oba workspace-a: `npm test`. Convex funkcije i schema se proveravaju i objavljuju na dev deployment komandom (iz korena):

```bash
npx convex dev --once
```

## Tehnologije

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/Radix, Convex + Convex Auth, Tiptap, Framer Motion i GSAP.
