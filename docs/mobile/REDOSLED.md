# Redosled — šta radim sledeće

> Živi checklist. Štikliraj kako ide. Prompt tekst je u `05-PLAYBOOK.md`,
> ovde je samo **redosled** i komande.

---

## ✅ Gotovo

- [x] Faza 0 — monorepo, Expo, Convex + auth, tokeni, navigacija
- [x] Root `package.json` popravljen (workspaces)
- [x] Dokumentacija: plan, ekrani, notifikacije, chat, agent, playbook

---

## ✅ Korak 1 — Očisti git lock

```bash
cd "/c/Users/admin/Desktop/Web Dev Projects/notion-clone"
rm -f .git/index.lock
git status
```

Prazan lock fajl, ništa se ne gubi brisanjem. Ako `git status` posle ovoga radi,
gotovo.

- [ ] Urađeno

---

## ▶️ Korak 2 — Spoji Fazu 0 u main

```bash
git checkout main
git merge mobile-faza0-tokeni-navigacija
git push
```

- [ ] Urađeno

---

## ▶️ Korak 3 — Deo B, priprema (~30 min)

Tri prompta. Između svakog `/clear`.

```
/model → Opus 4.8
/effort xhigh
Shift+Tab Shift+Tab → Accept Edits
```

### B1 — CLAUDE.md

> Pročitaj `docs/mobile/00-PLAN.md` i `docs/mobile/05-PLAYBOOK.md`. Dopuni
> `CLAUDE.md` sekcijom „Devotion — mobilna aplikacija i web paritet", maksimum
> 20 redova:
>
> - Monorepo: `apps/web`, `apps/mobile`, `packages/backend`
> - Backend je deljen — Convex funkcija se piše jednom, troši dvaput
> - Svaka nova funkcija mora da postoji i na webu i na mobilnom; izuzeci se
>   izričito zapisuju, ne prećutno preskaču
> - Mobilne rute su u `apps/mobile/src/app/`
> - Za Convex posao koristi postojeće `/convex-*` skillove iz `.claude/skills/`
> - Detaljni planovi u `docs/mobile/`
>
> Dodaj `@docs/mobile/00-PLAN.md` import. Ne duplicaj sadržaj planova —
> `CLAUDE.md` se učitava u svaku sesiju.

- [ ] B1

### B2 — Pravila po tipu fajla

> Napravi tri fajla u `.claude/rules/`:
>
> `mobile.md` sa `paths: ["apps/mobile/**"]` — NativeWind, expo-router,
> `npx expo install` umesto `npm install`, dodirna meta 44pt, tekst min 16px,
> obavezan safe area, `react-native-reanimated` umesto Framer Motion, nikad web
> API-ji (`window`, `document`, `localStorage`).
>
> `web.md` sa `paths: ["apps/web/**"]` — postojeće shadcn/Radix konvencije,
> `WorkspaceRoute` model rutiranja iz `components/workspace/types.ts`, Tailwind
> v4 tokeni iz `globals.css`, nikad hardkodovane boje.
>
> `convex.md` sa `paths: ["packages/backend/**"]` — pre pisanja pročitaj
> `convex/_generated/ai/guidelines.md`, svaka funkcija ima `returns` validator,
> pristup uvek kroz `requireStartupMember` / `requireProfile` / `requireAdmin`,
> `.withIndex()` umesto `.filter()`, limiti iz `lib/validators.ts`.
>
> Kratko i konkretno, bez opštih mesta.

- [ ] B2

### B3 — Tri subagenta

> Napravi tri fajla u `.claude/agents/`, tačno po specifikaciji iz
> `docs/mobile/05-PLAYBOOK.md` sekcija B3: `rn-review.md`, `web-review.md` i
> `parity-check.md`.
>
> **Ne pravi `convex-review`** — u `.claude/skills/` već postoji Convex plugin
> sa `/convex-reviewer`, `/convex-authz`, `/convex-design` i ostalima.
>
> Posle provere sa `/agents` reci mi da li se sva tri vide.

- [ ] B3

---

## ▶️ Korak 4 — Preimenovanje u Devotion

```bash
git checkout -b preimenovanje-devotion
```

```
/clear · Opus 4.8 · effort xhigh · Plan mode
```

Prompt: `05-PLAYBOOK.md` → **KORAK 0**

⚠️ Pitaće te za bundle identifier. Odluči unapred — npr.
`com.tvojefirma.devotion`. Posle prvog builda se teško menja.

Posle izvršenja:

```bash
npm install        # imena workspace paketa su se promenila
npm run check
```

- [ ] Urađeno
- [ ] Ručno: ime foldera i git remote (kad budeš hteo)
- [ ] Ručno: Vercel → Settings → General → Project Name

---

## ▶️ Korak 5 — Faza 1: chat i obaveštenja

Svi promptovi u `05-PLAYBOOK.md`, sekcija **FAZA 1**. `/clear` između svakog.

| # | Korak | Effort | Režim | Posle |
|---|---|---|---|---|
| 1 | **Z1.1** Chat schema | `max` | Plan | `/convex-design` |
| 2 | **Z1.2** Chat backend | `xhigh` | Plan | `/convex-reviewer` |
| 3 | **Z1.3** Testovi | `xhigh` | Accept + `/goal` | — |
| 4 | **Z1.4** Migracija kanala | `xhigh` | Plan | `/convex-migrate` |
| 5 | **W1.5** Web: chat prikaz | `xhigh` | Plan | `@web-review` |
| 6 | **W1.6** Web: threadovi na entitetima | `xhigh` | Accept | `@web-review` |
| 7 | **M1.7** Mobilni: lista razgovora | `xhigh` | Accept | `@rn-review` |
| 8 | **M1.8** Mobilni: ekran razgovora | `xhigh` | Plan | `@rn-review` |
| 9 | **Z1.8b** Pretvaranje poruke u entitet | `xhigh` | Plan | oba review |
| 10 | **Z1.9** Expo push infrastruktura | `xhigh` | Plan | `/convex-reviewer` |
| 11 | **M1.10** Kanali i zvuci ⚠️ | `max` | Plan | — |
| 12 | **Z1.11** Rutiranje na tap | `xhigh` | Accept | oba review |
| 13 | **Z1.12** Podešavanja obaveštenja | `xhigh` | Accept | oba review |

Na kraju: `@parity-check uporedi chat i obaveštenja između apps/web i apps/mobile`

- [ ] Faza 1 gotova

---

## ▶️ Korak 6 — Faza 1B: AI agent

`05-PLAYBOOK.md`, sekcija **FAZA 1B**.

| # | Korak | Posle |
|---|---|---|
| 1 | **Z1B.1** Registar modela | `/convex-authz` ⚠️ |
| 2 | **Z1B.2** OpenAI-kompatibilan klijent | — |
| 3 | **Z1B.3** Alati za čitanje | `/convex-authz` ⚠️ **obavezno** |
| 4 | **Z1B.4** Petlja agenta | — |
| 5 | **Z1B.5** Agent u chatu, oba klijenta | oba review |
| 6 | **Z1B.6** `@agent` u kanalima | `/convex-authz` |
| 7 | **Z1B.7** Alati za pisanje + potvrda | `/convex-reviewer` |
| 8 | **Z1B.8** Podešavanja AI | oba review |

- [ ] Faza 1B gotova

---

## Dalje

- [ ] Faza 2 — zadaci na mobilnom (M2.1–M2.3)
- [ ] Faza 3 — stranice na mobilnom (M3.1–M3.4)
- [ ] Faza 4 — odobrenja i canvasi (M4.1, W4.2, M4.3, M4.4)
- [ ] Faza 5 — nove mogućnosti
- [ ] Faza 6 — distribucija timu

---

## Podsetnik za svaki dan

```bash
npx convex dev                              # Terminal 1
cd apps/mobile && npx expo start            # Terminal 2
npm run dev                                 # Terminal 3
claude                                      # Terminal 4
```

U sesiji: `/model` → **Opus 4.8**, `/effort xhigh`.

Posle svakog koraka: review → `npm run check` → test → commit → **`/clear`**.

---

## Otvorene odluke

- [ ] **Bundle identifier** — treba pre Koraka 4
- [ ] **`@agent` u zajedničkom kanalu** — čiji podaci? (vidi `06-AGENT.md`)
- [ ] **Diskusija na idejama** — zameniti chat threadom ili paralelno? (W1.6)
- [ ] **iOS** — $99 kad/ako zatreba
