# Nov development build — kada je obavezan

> Nastalo u fazi **P2 (lanac 6)**, jer je `apps/mobile/package.json` menjan.
> Pravilo lanca: svaka izmena tog fajla ide u ovaj dokument, jer Metro reload
> tada nije dovoljan i korisnik to mora da zna.

---

## Šta je dodato (P2, 13.08.2026)

Sve verzije su **pinovane tačno** na ono što `apps/web` već koristi. Dve kopije
`@tiptap/core` u istom bundle-u znače dve ProseMirror šeme i tih kvar, pa raspon
verzija (`^`) ovde nije prihvatljiv.

### `dependencies`

| Paket | Verzija | Zašto |
|---|---|---|
| `@tiptap/core` | `3.29.2` | `noteFile` čvor (`Node.create`, `mergeAttributes`) |
| `@tiptap/extension-table` | `3.29.2` | tabela u telu beleške (`TableKit`) |
| `@tiptap/extension-code-block` | `3.29.2` | blok koda |
| `@tiptap/extension-horizontal-rule` | `3.29.2` | `<hr>` — web ga ima kroz StarterKit |
| `@tiptap/extensions` | `3.29.2` | `Gapcursor` (kursor oko tabele), `TrailingNode` |

### `devDependencies`

| Paket | Verzija | Zašto |
|---|---|---|
| `vite` | `8.2.0` | build sopstvenog editor bundle-a (`npm run editor:build`) |
| `@tiptap/react` | `3.29.2` | `EditorContent` u web bundle-u |
| `@types/react-dom` | `19.2.4` | `react-dom/client` u `editor-web/index.ts` |

Uz to, u korenu: `jsdom@^30` (devDep) — vitest projekat `mobile` meri round-trip
tela kroz pravi ProseMirror `DOMParser`.

---

## Da li je nov native build obavezan?

**Iskreno: verovatno ne, ali uradi ga.**

Nijedan od dodatih paketa **nema native deo** — svi su čist JavaScript (proveri:
nema `android/`, `ios/` ni `*.podspec` ni u jednom). Tehnički bi
`npx expo start --clear` bio dovoljan da Metro pokupi nove module.

Ali dev build je jedini put koji **ne laže**: ako je dev build na uređaju stariji
od commita `3efa76c` (kad je `@10play/tentap-editor` prvi put ušao), on ima native
deo (`android/build.gradle`, `ios/TentapUtils.m`) i editor bez novog builda uopšte
ne radi. Umesto procene ko šta ima na telefonu — jedna komanda.

```bash
# posle git pull
npm install                        # iz KORENA repoa (npm workspaces)

# pa nov development build
npx expo run:android               # ili: npm run android --workspace @devotion/mobile
npx expo run:ios                   # samo na Mac-u
```

Ako se ipak bira brži put: `npx expo start --clear` iz `apps/mobile` **i** provera
da se beleška sa tabelom otvara za uređivanje (ne u režimu čitanja).

---

## `editor:build` — kada se pokreće

Web bundle editora je **generisan i commitovan** fajl
`apps/mobile/src/lib/note-editor-html.ts` (~680 KB). Metro ga pakuje kao običan
string; isto što `@10play/tentap-editor` radi sa svojim `editorHtml.js`.

Regeneracija je potrebna kad se menja **bilo šta** u:

- `apps/mobile/editor-web/**`
- `apps/mobile/src/lib/note-editor-bridges.ts`
- `apps/mobile/src/lib/note-table.ts` (bundle ga uvozi kroz bridge)

```bash
npm run editor:build --workspace @devotion/mobile
```

Skripta odbija da upiše bundle koji ne sadrži `tableRow`, `codeBlock`,
`data-note-file` i `horizontalRule` (`editor-web/inline.mjs`) — bolje pasti na
build-u nego isporučiti editor koji tiho briše tabele.

**Bundle se commituje.** `editor-web/dist/` je ignorisan (`apps/mobile/.gitignore`
ima `dist/`), `src/lib/note-editor-html.ts` nije.

---

## Zamka koja je već koštala jedan build

`@10play/tentap-editor/src/utils/misc.ts#isExpo()` proverava postoji li
`expo-constants` i po tome bira da li su `focusListener` i `contentHeightListener`
**pravi ili prazni shim-ovi**. Rolldown (Vite 8) taj `require()` RAZREŠAVA — što
povuče ceo `react-native` (Flow sintaksa, build pukne), a da nije pukao,
`isExpo()` bi vratio `true` i **traka alata se ne bi prikazivala nikad**
(`note-toolbar.tsx` je uslovljena sa `state.isFocused`).

Rešenje: `editor-web/expo-constants-absent.cjs` + alias u `vite.config.ts`.
Ne diraj to bez čitanja komentara u tom fajlu.
