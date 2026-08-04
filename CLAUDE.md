@AGENTS.md

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`packages/backend/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Devotion — mobilna aplikacija i web paritet

- **Monorepo:** `apps/web` (Next.js) · `apps/mobile` (Expo) · `packages/backend` (Convex).
- **Backend je deljen** — Convex funkcija se piše jednom, troši dvaput. Piše se klijent-neutralno, bez pretpostavki o platformi.
- **Svaka nova funkcija mora da postoji i na webu i na mobilnom.** Korak nije gotov dok ne radi na oba. Izuzetak (npr. custom zvuci, haptika, widget) se **izričito zapisuje**, ne prećutno preskače.
- **Mobilne rute** su u `apps/mobile/src/app/` (expo-router — **ne** `app/`).
- **Za Convex posao koristi postojeće `/convex-*` skillove** iz `.claude/skills/` (npr. `/convex-reviewer`, `/convex-authz`, `/convex-test`) — ne pravi svoje.
- **Detaljni planovi:** `docs/mobile/` (`00-PLAN.md` master plan, `05-PLAYBOOK.md` korak-po-korak).

@docs/mobile/00-PLAN.md
