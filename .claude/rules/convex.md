---
paths: ["packages/backend/**"]
---

# Convex backend

- Pre pisanja pročitaj `convex/_generated/ai/guidelines.md` — pravila gaze training data.
- Svaka funkcija ima `args` i `returns` validator (object-form syntax).
- Pristup uvek kroz `requireStartupMember` / `requireProfile` / `requireAdmin` iz `lib/auth.ts`.
- Upiti kroz `.withIndex()` — nikad `.filter()` nad tabelom.
- Poštuj limite definisane u `lib/validators.ts`.
