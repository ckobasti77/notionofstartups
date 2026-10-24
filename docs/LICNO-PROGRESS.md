# LICNO — napredak

Noćni run LICNO. Plan: `docs/LICNO-PLAN.md`. Pravila: `.nocni-run/licno/rules.md`. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA).

## Pre runa — polazno stanje (Claude, 24.10.2026.)
**Provereno na čistoj kopiji `main` (3a797a3), Linux, Node 22:** lint čist (provera ignoriše `.nocni-run/` — runner tamo piše svoje `.cjs` skripte koje bi inače oborile lint); `tsc` za backend, web i telefon bez grešaka; `npx vitest run` 52 fajla / 451 test prolaze; `npm run build` prolazi kad je `NEXT_PUBLIC_CONVEX_URL` podešen (na Jovanovoj mašini jeste, u `apps/web/.env.local`); `npm run dev` (Turbopack) radi.
**Okruženje:** lokalni `CONVEX_DEPLOYMENT` je DEV deployment, odvojen od produkcije (produkcioni web koristi drugi deployment) — `npx convex codegen` i `npx convex dev --once` diraju samo DEV.
**Zatečeno u radnom stablu:** `packages/backend/convex/_generated/api.d.ts` se razlikuje samo po krajevima redova (CRLF posle lokalnog codegen-a) — runner ga čuva u commitu „zatečene lokalne izmene".
**Telefon — tipovi ruta:** `typedRoutes` je uključen; provera `tsc-mobile` prvo pokreće `node .nocni-run/licno/alati/expo-rute.cjs` (osveži `apps/mobile/.expo/types/router.d.ts` bez Expo servera), pa tek onda `tsc`.
**Napomena za mobilni stil:** stvarni kod koristi `StyleSheet.create` + tokene (137/151 fajlova), ne NativeWind — vidi `rules.md`.

## K01 - Arhitektura ličnog nivoa (plan)   (2026-10-24 22:38)
**Plan korak.** Plan je upisan u `docs/licno/planovi/K01.md`. Kod nije menjan.
