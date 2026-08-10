# Lanac pariteta - izveštaj

## Konfiguracija izvršavanja

| Stavka | Vrednost |
|---|---|
| Model - zadato | `` |
| Model | `(ne proveravam - vidi /model u claude)` |
| Effort - planiranje | `max` |
| Effort - implementacija | `xhigh` |
| Effort - revizija | `max` |
| Effort - popravke | `high` |
| Kako se effort šalje | preko flag-a `--effort` |
| Režim dozvola | `--permission-mode bypassPermissions` |
| Grana | `paritet-20260810-0252` |
| Početak | 2026-08-10T02:52:42 |

## Kako svaka faza teče

Svaka faza ide u tri koraka, i svaki je zaseban poziv sa svežim kontekstom:

1. **PLAN** - `` · effort `max` · NE menja kod, samo piše plan u `docs\mobile\lanac2\planovi`
2. **IZVRŠI** - `` · effort `xhigh` · čita svoj plan i sprovodi ga
3. **REVIZIJA** - `` · effort `max` · traži dokaz u diff-u za svaki čekiran kvadratić

Zašto PLAN pa IZVRŠI, a ne odmah rad: agent koji prvo napiše plan pa ga onda
sprovodi pravi manje promašaja od agenta koji krene da kuca odmah, a plan ostaje
na disku pa se ujutru vidi šta je nameravao naspram onoga što je stvarno uradio.

> Ovo piše skripta, ne agent. 'PAO" znači da je stvarno palo.

---

## Faza 0 - Blokator: kanvasi vraćaju 404

**Cilj:** Kanvas se vidi na emulatoru, dokazano screenshot-om sa oblačićima.

| Korak | Model | Effort | Režim |
|---|---|---|---|
| PLAN | `` | `max` | bez izmena koda |
| IZVRŠI | `` | `xhigh` | `--permission-mode bypassPermissions` |
| REVIZIJA | `` | `max` | bez izmena koda |

- Start: 2026-08-10T02:52:42
- PLAN: napisan (`docs\mobile\lanac2\planovi\faza-0.md`)
