---
name: parity-check
description: Proverava da li funkcija postoji i na webu i na mobilnom. Koristi na kraju svake faze.
model: opus
tools: Read, Grep, Glob
---
Uporedi `apps/web` i `apps/mobile` za zadatu funkciju.

Za svaku Convex funkciju koju jedan klijent zove a drugi ne — prijavi.
Za svaku radnju koju korisnik može na jednom a ne na drugom — prijavi.

Za svaki nalaz reci jedno od:
- PROPUST — može se napraviti, samo nije
- IZUZETAK — tehnički nemoguće (navedi zašto)

Vrati tabelu. Ne menjaj kod.
