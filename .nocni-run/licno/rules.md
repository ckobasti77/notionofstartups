# Pravila noćnog runa LICNO — važe za svaki korak

Radiš nenadzirano dok Jovan spava i niko ne može da ti odgovori na pitanje. Kad naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Zapiši je** u svojoj sekciji u `docs/LICNO-PROGRESS.md`, u redu **ODLUKE:** (šta si izabrao i zašto).
3. Nastavi.

Ne improvizuj tiho.

## Kontekst
Devotion je privatni radni prostor za mali tim (10–15 ljudi) koji vodi više startupa: monorepo sa `apps/web` (Next.js 16, React 19, Tailwind 4, shadcn/Radix), `apps/mobile` (Expo 57, expo-router, Reanimated 4) i `packages/backend` (Convex), plus `packages/shared` (čiste funkcije za oba klijenta). Ovaj run pravi **lični nivo „Ja"** iznad startupova (Moj dan, Moji zadaci iz svih startupa, lični zadaci, Inbox, globalne Poruke sa ličnim DM-ovima i grupama), poboljšava UX zadataka unutar startupa i daje celoj aplikaciji fluidan pokret kao na telefonu (web: GSAP, telefon: Reanimated). Cilj NIJE: novi auth, komercijalni multi-tenant, promena editora ili kanvasa, deploy.

Izvori istine:
- `docs/LICNO-PLAN.md`: odluke (O1…), predlozi (P1…), obim, granice i koraci.
- `docs/licno/planovi/<ID>.md`: tehnički planovi koje pišu plan koraci (K01 arhitektura i backend, K07 ekrani i pokret).
- `docs/LICNO-PROGRESS.md`: šta su prethodni koraci uradili, ODLUKE i BLOKADE.
- `docs/licno/DIZAJN-DNK.md` (posle K03): vizuelni jezik i pokret.

## Obavezno pročitaj pre pisanja koda
1. `CLAUDE.md`, `AGENTS.md`, `.claude/rules/convex.md`, `.claude/rules/web.md`, `.claude/rules/mobile.md` (vidi napomenu o stilu ispod), `apps/mobile/AGENTS.md`.
2. Za Convex: `packages/backend/convex/_generated/ai/guidelines.md` — pravila gaze tvoje znanje iz treninga.
3. Za Next.js 16 API koji nisi siguran da poznaješ: odgovarajući vodič u `node_modules/next/dist/docs/`. Za Expo 57 / Reanimated 4: tipovi i README u `node_modules/` (ne nagađaj API).
4. `docs/LICNO-PLAN.md` i planove iz `docs/licno/planovi/` koje tvoj korak pominje.
5. `docs/LICNO-PROGRESS.md` (posebno ODLUKE i BLOKADE prethodnih koraka).

## Skillovi (pročitaj fajlove, ne pretpostavljaj sadržaj)
Lokalne kopije su u `.nocni-run/licno/vestine/`; GSAP, motion-design i design-dna su već u repou pod `.agents/skills/`. Kad se savet skilla sudari sa pravilima repoa ili ovim planom, **pobeđuju pravila repoa i plan** (npr. ikone ostaju lucide, nema novih fontova, boje samo kroz tokene, bez emodžija).
- **Pre svakog novog ekrana ili komponente:** `.nocni-run/licno/vestine/design-taste-frontend/SKILL.md` (za ovaj proizvod koristi DESIGN_VARIANCE 4, MOTION_INTENSITY 7, VISUAL_DENSITY 6 — radni alat, gust ali miran) i `docs/licno/DIZAJN-DNK.md`.
- **Hijerarhija, pristupačnost, interakcije:** `.nocni-run/licno/vestine/ui-ux-pro-max/SKILL.md`; pravila traži grep-om u `.nocni-run/licno/vestine/ui-ux-pro-max/data/` (`ux-guidelines.csv`, `web-interface.csv`, `stacks/`). Skripte u tom folderu traže Python — nisu obavezne.
- **Plan, kritika, polish, stanja:** `.nocni-run/licno/vestine/impeccable/SKILL.md` + jedan playbook koji odgovara poslu: `reference/shape.md` (plan ekrana), `reference/animate.md` (pokret), `reference/polish.md`, `reference/critique.md`, `reference/harden.md` (prazna/greška stanja), `reference/adapt.md` i `reference/adapt.native.md` (širine, telefon), `reference/ios.md`, `reference/android.md`, `reference/audit.md` (revizija). Skripte impeccable-a (`context.mjs`, live režim) NISU uključene — koristi samo tekst.
- **Pokret:** `.agents/skills/motion-design/SKILL.md` (+ `director/`, `patterns/`, `reference/`), `.nocni-run/licno/vestine/apple-design/SKILL.md` (springovi, prekidivost, gestovi), a na webu `.agents/skills/gsap-core/SKILL.md`, `gsap-react`, `gsap-timeline`, `gsap-plugins` (Flip, CustomEase, Draggable, Inertia), `gsap-performance`, `gsap-utils`.
- **Dizajn DNK:** `.agents/skills/design-dna/SKILL.md` + `references/schema.md`.
- **Convex:** `.claude/skills/convex-reviewer`, `convex-authz`, `convex-test`, `convex-migration-helper`, `convex-performance-audit` (putanje u njima su `convex/...` → mapiraj na `packages/backend/convex/...`).

## Radnici (subagenti)
Glavne odluke i ključni kod radiš ti. Sitne, nezavisne poslove možeš dati radnicima preko alata `Agent`, paralelno kad su nezavisni:
- `model: "sonnet"`: pregled ekrana, snimci, provera stringova, pretraga po repou, testovi po tvom opisu. Projektni agenti `web-review` i `rn-review` (`.claude/agents/`) su dobri za pregled posle UI koraka; `parity-check` za paritet web/telefon.
- `model: "haiku"`: najsitnije mehaničke provere (spisak fajlova, grep, prebrojavanje).

Rezultat radnika uvek proveriš pre nego što ga prihvatiš.

## Apsolutne zabrane
- **Git:** NE radi `git push`, `git commit`, `git reset`, `git clean`, `git checkout`, `git switch`, `git stash`, `git rebase`, `git merge`. Runner sam pravi commit posle koraka.
- **Produkcija i deploy:** NE radi `npx convex deploy`, `npx convex env`, `npx convex run`, `npx convex import`, `npx convex export`, `vercel`, `eas`, `expo publish`, `eas update`, ništa sa `--prod`. Ništa nad produkcionom bazom, nalozima ni plaćanjima. **Dozvoljeno:** `npx convex codegen` i, samo da proveriš šemu na DEV deploymentu, `npx convex dev --once` (nikad bez `--once`; nikad migracije ni mutacije iz komandne linije).
- **Tajne:** NE postavljaj env varijable i NE upisuj tajne ni ključeve u kod ili dokumente. NE čitaj ni ne prepisuj `.env*` fajlove.
- **Van obima:** auth tok (prijava, pozivnice, lozinke, `convex/auth.ts`, `auth.config.ts`), push ključevi i ID-jevi kanala/zvuka (`lib/notificationChannels.ts`), unutrašnjost editora (`apps/mobile/editor-web/`, Tiptap ekstenzije) i kanvasa (`@xyflow` čvorovi, embed protokol), AI provajderi, `next.config.ts`, `apps/mobile/app.json`, `eas.json`, verzije postojećih paketa. Šema se samo **širi** (nova tabela, novi indeks, `X` → `X | null`, novo opciono polje) — nikad ne sužava i ne menja postojeće podatke.
- **Paketi:** na telefonu **nijedan nov native paket** (nema novog builda). Na webu nov paket samo uz ODLUKU sa licencom (MIT/Apache) i veličinom. GSAP pluginovi iz postojećeg `gsap` paketa su dozvoljeni. Bez `@gsap/react`.
- **Procesi:** ne pokreći Expo/Metro (`expo start`, `npx expo start --web`, emulator) — telefon se proverava kroz `tsc`, vitest i pregled agenata. Web dev server samo za snimke izloga i uvek ga ugasi.
- **Disciplina:**
  - NE „popravljaj" susedni kod koji nema veze sa zadatkom i ne briši tuđi kod.
  - NE gasi, ne preskači i ne briši testove ni assertion-e da bi provera prošla.
  - NE ostavljaj pokrenut dev server ni druge procese na kraju koraka.
  - Privremene fajlove drži u `.nocni-run/licno/tmp/`. Ne briši fajlove van njega osim kad to zadatak traži.

## Konvencije repoa
- **Komande iz korena repoa** (npm workspaces). `npx convex …` samo iz korena (root `convex.json` pokazuje na `packages/backend/convex`). Posle izmene u `packages/backend/convex/` pokreni `npx convex codegen` da `_generated/api.d.ts` vidi nove funkcije.
- **Convex:** svaka funkcija ima `args` i `returns` validator; pristup kroz `requireProfile` / `requireStartupMember` / `requireProfileInStartup` iz `lib/auth.ts`; upiti kroz `.withIndex()` (nikad `.filter()` nad tabelom); granice iz `lib/validators.ts`; upiti ne čitaju sat — klijent šalje `now`/`dayKey`; `returns` validator mora nabrojati SVAKO polje koje vraćaš (višak obara ekran tek u produkciji, vidi `pageDocumentValidator` i `pages.validator.test.ts`). Testovi: `convex-test`, po uzoru na `tasks.test.ts` i `chat.test.ts`, uključujući negativne authz slučajeve.
- **Shared:** čiste funkcije bez React-a i bez platformskih API-ja, izvoz kroz `packages/shared/src/index.ts`, testovi `*.test.ts` pored fajla (vitest projekat `shared`). Rok se čuva u **lokalno podne** (`new Date("YYYY-MM-DDT12:00:00").getTime()`, kao `fromDateInputValue` u `apps/web/lib/workspace.ts`).
- **Web:** rutiranje kroz `WorkspaceRoute` (`apps/web/components/workspace/types.ts`) + `workspace-route.ts`; primitivi iz `apps/web/components/ui/`; ikone `lucide-react` (ikonica bez teksta ima `aria-label`); boje samo kroz tokene iz `apps/web/app/globals.css` (nikad `#fff`, `rgb(...)`); svaki prikaz podataka ima prazno, učitavanje i greška stanje; `"use client"` na najmanjoj granici; teški prikazi se učitavaju kroz `next/dynamic` kao postojeći. Toastovi kroz `sonner`.
- **Telefon:** rute u `apps/mobile/src/app/` (expo-router, `typedRoutes` uključen) — posle svakog dodavanja, brisanja ili preimenovanja fajla rute pokreni `node .nocni-run/licno/alati/expo-rute.cjs` (osvežava `apps/mobile/.expo/types/router.d.ts` bez Expo servera); nikad ne zaobilazi tipove ruta kastovanjem (`as Href`, `as any`); **stil kao postojeći kod**: `StyleSheet.create` + tokeni iz `@/theme/tokens` i `useThemeColors()` (`.claude/rules/mobile.md` pominje NativeWind, ali ga stvarni kod ne koristi — sledi kod); animacije samo `react-native-reanimated` (nikad Framer Motion); bez `window`/`document`/`localStorage`; dodir ≥ 44 pt (`MIN_TOUCH_TARGET`), osnovni tekst ≥ 16 px, safe area gore i dole, tastatura ne prekriva unos; haptika kroz `@/lib/haptics`; smanjen pokret kroz `useReducedMotion`.
- **Paritet:** svaka nova funkcija mora da postoji i na webu i na telefonu (pravilo repoa). U ovom runu koraci idu u **parovima web → telefon**: K08↔K09 (ljuska/tabovi), K10↔K12 (Moj dan, brzi unos), K11↔K13 (Moji zadaci, panel, datum), K14 (Inbox, oba), K15↔K16 (Poruke), K17↔K18 (zadaci u startupu). Web korak ne pravi telefonsku verziju (dolazi u svom paru), ali ne sme ništa da uradi što je onemogućava. Ako nešto namerno postoji samo na jednoj strani (npr. tastaturne prečice samo na webu, haptika samo na telefonu), zapiši to kao IZUZETAK u progress.
- **Jezik:** sav tekst u UI-ju je srpski latinicom, kratko, „ti" oblik; datumi u srpskom formatu (`packages/shared` posle K02). Komentari u kodu na srpskom kao postojeći.
- **Teme:** svaki nov ekran radi u svetloj i tamnoj temi (web i telefon).
- **Pokret:** brojevi samo iz `packages/shared/src/motion.ts` (posle K02); web kroz `apps/web/lib/motion/` (posle K03), telefon kroz `apps/mobile/src/theme/motion.ts` i `apps/mobile/src/components/motion/` (posle K09). Isti element ne animiraju dve biblioteke. Animacija nikad ne blokira unos. Smanjen pokret: samo promena neprozirnosti.
- **Poznate zamke:** lint se pušta sa `--ignore-pattern ".nocni-run/**"` jer runner u `.nocni-run/` piše svoje pomoćne `.cjs` skripte (tvoje privremene skripte idu u `.nocni-run/licno/tmp/`); `api.x.y` je Proxy koji na svaki pristup daje NOVU referencu — ne stavljaj ga u `useMemo`/`useEffect` zavisnosti (ključ preko `getFunctionName`); mobilni nema linter — `tsc` je jedina statička provera; vitest pod opterećenjem pada na timeout — pokreći ga sa `--no-file-parallelism`.

## Vizuelna provera (koraci koji menjaju web UI)
- **Sa Playwright MCP-om:**
  1. Pusti `npm run dev` u pozadini (port 3000; ako Turbopack padne, `npx next dev --webpack -p 3000` iz `apps/web`).
  2. Otvori izlog `http://localhost:3000/izlog?ekran=<ime>&tema=tamna` i `&tema=svetla`; proveri izmenjene ekrane na 390 × 844 i 1440 × 900, u obe teme.
  3. Snimci idu u `docs/licno/snimci/<ID>-*.png`.
  4. Na kraju UGASI dev server.
- **Ekrani iza prijave** se proveravaju kroz izlog `/izlog` (samo dev, u produkciji 404, noindex). UI pravi kao prezentacione komponente (podaci kroz props); svaki korak koji menja UI dodaje svoje ekrane u izlog.
- **Telefon** nema snimke u ovom runu: nove komponente dodaj u `apps/mobile/src/app/(app)/dizajn-katalog.tsx` (Jovan ih gleda na uređaju), a proveri ih kroz `rn-review` agenta.
- **Bez Playwright-a:** upiši to u progress i osloni se na testove.

## Definicija završenog koraka
Korak nije gotov dok ne prođu:

    npx tsc -p packages/backend/convex/tsconfig.json --noEmit
    npx tsc -p apps/web/tsconfig.json --noEmit
    node .nocni-run/licno/alati/expo-rute.cjs && npx tsc -p apps/mobile/tsconfig.json --noEmit
    npx eslint --ignore-pattern ".nocni-run/**" --ignore-pattern ".playwright-mcp/**"
    npx vitest run --no-file-parallelism

Runner posle tebe ponovo pušta provere i `npm run build` (i `npx convex codegen` kad se backend menjao); ako padnu, vratiće ti grešku u istoj sesiji. Provera ili test koji su padali i PRE runa (`.nocni-run/licno/baseline.txt`) nisu tvoja odgovornost, ali ih ne kvari dodatno.

Ako nešto realno ne može (ograničenje platforme, fali podatak, traži odluku vlasnika), napravi ostatak i upiši `BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/LICNO-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3–8 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** ime@verzija — licenca (ili „nema")
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Paritet:** šta postoji na webu, šta na telefonu, IZUZECI
**Rezultat provere:** tsc (3), lint, vitest — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno
```
Dopisuješ na kraj i ne brišeš tuđe sekcije.
