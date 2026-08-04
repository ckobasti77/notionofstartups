---
paths: ["apps/web/**"]
---

# Web klijent (Next.js)

- Koristi shadcn/Radix primitive iz `components/ui/` i njihove postojeće konvencije.
- Rutiranje: `WorkspaceRoute` model iz `components/workspace/types.ts` + `workspace-route.ts`.
- Boje samo kroz Tailwind v4 tokene iz `app/globals.css` — nikad hardkodovane (`#fff`, `rgb(...)`).
- Svaki prikaz podataka ima prazno, učitavanje i greška stanje.
