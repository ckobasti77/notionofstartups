# Pravila noćnog runa PROSTOR — važe za svaki korak

Radiš nenadzirano dok Jovan spava i niko ne može da ti odgovori na pitanje. Kad naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Zapiši je** u svojoj sekciji u `docs/PROSTOR-PROGRESS.md`, u redu **ODLUKE:** (šta si izabrao i zašto).
3. Nastavi.

Ne improvizuj tiho.

## Kontekst
Devotion je privatni radni prostor za mali tim (10–15 ljudi) koji vodi više startupa: monorepo sa `apps/web` (Next.js 16, React 19, Tailwind 4, shadcn/Radix, GSAP), `apps/mobile` (Expo 57, expo-router, Reanimated 4), `packages/backend` (Convex) i `packages/shared` (čiste funkcije za oba klijenta). Prethodni run (LICNO, u produkciji) je napravio lični nivo „Ja" (Moj dan, Moji zadaci, Inbox, Poruke). **Ovaj run menja unutrašnjost svakog startupa:** tim uređuje sve uz Istoriju izmena, Korpu i zaključavanje stranice; glasanje o brisanju i odobravanje ugnežđavanja se gase; potpisani prilozi postaju komentari; dokumenti, zadaci i ideje su liste i table, a kanvas je opcioni prikaz „Mapa"; početna startupa je Komandni centar; „Moje misli" postaju Beleške u „Ja"; izgled postaje mirniji. Cilj NIJE: novi auth ni reset lozinke, nove uloge u bazi, spajanje teksta u realnom vremenu, trajno brisanje, deploy.

Izvori istine:
- `docs/PROSTOR-PLAN.md`: odluke (O1…), predlozi (P1…), obim, granice i koraci.
- `docs/prostor/planovi/<ID>.md`: tehnički planovi koje pišu plan koraci (K01 backend i shared, K07 ekrani, navigacija i smirivanje). Kad se ime funkcije ili tabele u K01 razlikuje od PLAN-a, važi tabela „PLAN → K01" iz `K01.md`; prompt koji pominje ime iz PLAN-a znači njegov par iz te tabele.
- `docs/PROSTOR-PROGRESS.md`: šta su prethodni koraci uradili, ODLUKE i BLOKADE.
- `docs/licno/DIZAJN-DNK.md` (vizuelni jezik i pokret) i, posle K07/K08, `docs/prostor/DIZAJN-SMIRENJE.md`.
- `docs/areas-system-blueprint.md` opisuje STARI model vlasništva koji ovaj run menja — čitaj ga da znaš šta postoji, ne da ga sprovodiš.

## Obavezno pročitaj pre pisanja koda
1. `CLAUDE.md`, `AGENTS.md`, `.claude/rules/convex.md`, `.claude/rules/web.md`, `.claude/rules/mobile.md` (vidi napomenu o stilu ispod), `apps/mobile/AGENTS.md`.
2. Za Convex: `packages/backend/convex/_generated/ai/guidelines.md` — pravila gaze tvoje znanje iz treninga.
3. Za Next.js 16 API koji nisi siguran da poznaješ: odgovarajući vodič u `node_modules/next/dist/docs/`. Za Expo 57 / Reanimated 4: tipovi i README u `node_modules/` (ne nagađaj API).
4. `docs/PROSTOR-PLAN.md` i planove iz `docs/prostor/planovi/` koje tvoj korak pominje.
5. `docs/PROSTOR-PROGRESS.md` (posebno ODLUKE, BLOKADE i NAPOMENE prethodnih koraka).

## Skillovi (pročitaj fajlove, ne pretpostavljaj sadržaj)
Lokalne kopije su u `.nocni-run/licno/vestine/` (ostaju iz prethodnog runa); GSAP, motion-design i design-dna su u repou pod `.agents/skills/`. Kad se savet skilla sudari sa pravilima repoa ili ovim planom, **pobeđuju pravila repoa i plan** (ikone ostaju lucide, nema novih fontova, boje samo kroz tokene, bez emodžija).
- **Pre svakog novog ekrana ili komponente:** `.nocni-run/licno/vestine/design-taste-frontend/SKILL.md` (za ovaj run **DESIGN_VARIANCE 3, MOTION_INTENSITY 5, VISUAL_DENSITY 6** — radni alat, gust, miran), `docs/licno/DIZAJN-DNK.md` i (posle K07/K08) `docs/prostor/DIZAJN-SMIRENJE.md`.
- **Hijerarhija, pristupačnost, interakcije:** `.nocni-run/licno/vestine/ui-ux-pro-max/SKILL.md`; pravila traži grep-om u `.nocni-run/licno/vestine/ui-ux-pro-max/data/` (`ux-guidelines.csv`, `web-interface.csv`, `stacks/`). Skripte u tom folderu traže Python — nisu obavezne.
- **Plan, kritika, smirivanje, stanja:** `.nocni-run/licno/vestine/impeccable/SKILL.md` + playbook koji odgovara poslu: `reference/shape.md` (plan ekrana), `reference/quieter.md` i `reference/distill.md` (smirivanje, uklanjanje viška), `reference/layout.md` i `reference/typeset.md` (raspored, tipografska skala), `reference/clarify.md` (tekst u UI-ju), `reference/polish.md`, `reference/critique.md`, `reference/harden.md` (prazna/greška stanja), `reference/adapt.md` i `reference/adapt.native.md` (širine, telefon), `reference/animate.md`, `reference/audit.md` i `reference/audit.native.md` (revizija). Skripte impeccable-a NISU uključene — koristi samo tekst.
- **Pokret:** `.agents/skills/motion-design/SKILL.md`, `.nocni-run/licno/vestine/apple-design/SKILL.md`, a na webu `.agents/skills/gsap-core/SKILL.md`, `gsap-react`, `gsap-timeline`, `gsap-plugins` (Flip), `gsap-performance`.
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
- **Van obima:** auth tok (prijava, pozivnice, lozinke, reset lozinke, `convex/auth.ts`, `auth.config.ts`); ID-jevi kanala i zvukova obaveštenja (`lib/notificationChannels.ts` sme samo da dobije mapiranje NOVOG tipa na POSTOJEĆI kanal); unutrašnjost editora (`apps/mobile/editor-web/`, Tiptap ekstenzije); **embed protokol kanvasa** (poruke telefon ↔ WebView iz `docs/mobile/00-PLAN.md` §5.2 ostaju iste); AI provajderi; `next.config.ts`; `apps/mobile/app.json`; `eas.json`; verzije postojećih paketa.
- **Šema se samo širi:** nova tabela, nov indeks, novo opciono polje, `X` → `X | null`, nova vrednost u uniji. Nikad ne briši polje, tabelu ni vrednost unije, ne sužavaj tip i ne menjaj postojeće podatke.
- **Nepovratne radnje:** NE piši trajno brisanje sadržaja (stranica, ideja, priloga, komentara, revizija) ni automatsko čišćenje korpe. Brisanje u ovom runu je uvek arhiviranje koje se vraća. Migracije (npr. `closeLegacyRequests`) se pišu kao `internalMutation` sa testovima i **nikad se ne pokreću**.
- **Privatnost:** misli/Beleške su vidljive samo vlasniku; sadržaj startupa samo aktivnim članovima tog startupa; uklonjen član (`startupMembers.archivedAt`) i arhiviran profil (`profiles.archivedAt`) ne vide ništa i ne mogu ništa da menjaju.
- **Paketi:** na telefonu **nijedan nov native paket** (nema novog builda). Na webu nov paket samo uz ODLUKU sa licencom (MIT/Apache) i veličinom. GSAP pluginovi iz postojećeg `gsap` paketa su dozvoljeni. Bez `@gsap/react`.
- **Procesi:** ne pokreći Expo/Metro (`expo start`, `npx expo start --web`, emulator) — telefon se proverava kroz `tsc`, vitest i pregled agenata. Web dev server samo za snimke izloga i uvek ga ugasi.
- **Disciplina:**
  - NE „popravljaj" susedni kod koji nema veze sa zadatkom.
  - NE gasi, ne preskači i ne briši testove ni assertion-e da bi provera prošla (izuzetak je samo namerna promena pravila — sledeća sekcija).
  - NE ostavljaj pokrenut dev server ni druge procese na kraju koraka.
  - Privremene fajlove drži u `.nocni-run/prostor/tmp/`. Ne briši fajlove van njega osim kad to zadatak traži (stari ekran se briše tek kad ga ništa ne uvozi i kad je njegova korisna funkcija preneta — ODLUKA).

## Namerna promena pravila (testovi)
Ovaj run namerno menja pravila koja postojeći testovi štite (vlasništvo, glasanje, odobrenja, „samo autor glasa", moderacija). Kad test proverava STARO pravilo:
1. Izmeni ga da proverava NOVO pravilo iz `docs/PROSTOR-PLAN.md` (P1–P6) — ne briši ga bez zamene. Negativni slučajevi ostaju negativni gde novo pravilo i dalje zabranjuje (nečlan, uklonjen član, arhiviran profil, drugi startup, zaključana stranica, tuđi komentar, tuđa beleška).
2. Svaku takvu izmenu upiši u progress, red **Testovi menjani zbog novog pravila:** `fajl › ime testa: staro → novo`.
3. Test koji pada iz bilo kog drugog razloga je greška u tvom kodu.

## Konvencije repoa
- **Komande iz korena repoa** (npm workspaces). `npx convex …` samo iz korena (root `convex.json` pokazuje na `packages/backend/convex`). Posle izmene u `packages/backend/convex/` pokreni `npx convex codegen` da `_generated/api.d.ts` vidi nove funkcije.
- **Convex:** svaka funkcija ima `args` i `returns` validator; pristup kroz `requireProfile` / `requireStartupMember` / `requireProfileInStartup` iz `lib/auth.ts` i, posle K02, kroz `lib/permissions.ts`; upiti kroz `.withIndex()` (nikad `.filter()` nad tabelom); granice iz `lib/validators.ts`; **upiti ne čitaju sat** — klijent šalje `now`/`dayKey`/`since`, a TTL i „pre N dana" računa klijent; `returns` validator mora nabrojati SVAKO polje koje vraćaš (vidi `pageDocumentValidator` i `pages.validator.test.ts`). Testovi: `convex-test`, po uzoru na `tasks.test.ts`, `chat.test.ts`, `pages.security.test.ts`, uključujući negativne authz slučajeve.
- **Kompatibilnost (P25):** backend ide u produkciju pre klijenata. Ne menjaj potpis postojeće javne funkcije na način koji obara stari klijent; polja u `permissions` i `returns` se samo dodaju.
- **Shared:** čiste funkcije bez React-a i bez platformskih API-ja, izvoz kroz `packages/shared/src/index.ts`, testovi `*.test.ts` pored fajla. Rok se čuva u **lokalno podne**. Backend NE uvozi `@devotion/shared` — kad ista logika treba i serveru, drži kopiju u `packages/backend/convex/lib/` uz test poklapanja (obrazac `day-key-parity.test.ts`).
- **Web:** rutiranje kroz `WorkspaceRoute` (`apps/web/components/workspace/types.ts`) + `workspace-route.ts` (+ test); primitivi iz `apps/web/components/ui/`; ikone `lucide-react` (ikonica bez teksta ima `aria-label`); boje samo kroz tokene iz `apps/web/app/globals.css`; svaki prikaz podataka ima prazno, učitavanje i greška stanje; `"use client"` na najmanjoj granici; teški prikazi kroz `next/dynamic` kao postojeći; toastovi kroz `sonner`. UI pravi kao **prezentacione komponente** (podaci kroz props) + tanak kontejner sa upitima, da bi izlog mogao da ih prikaže.
- **Telefon:** rute u `apps/mobile/src/app/` (expo-router, `typedRoutes`) — posle svakog dodavanja, brisanja ili preimenovanja fajla rute pokreni `node .nocni-run/prostor/alati/expo-rute.cjs`; nikad ne zaobilazi tipove ruta kastovanjem (`as Href`, `as any`); **stil kao postojeći kod**: `StyleSheet.create` + tokeni iz `@/theme/tokens` i `useThemeColors()` (`.claude/rules/mobile.md` pominje NativeWind, ali ga stvarni kod ne koristi — sledi kod); animacije samo `react-native-reanimated`; bez `window`/`document`/`localStorage`; dodir ≥ 44 pt (`MIN_TOUCH_TARGET`), osnovni tekst ≥ 16 px, safe area, tastatura ne prekriva unos; haptika kroz `@/lib/haptics`; smanjen pokret kroz `useReducedMotion`. Stare rute ostaju kao preusmerenja dok ih koriste deep linkovi i obaveštenja.
- **Jezik:** sav tekst u UI-ju je srpski latinicom, kratko, „ti" oblik, bez marketinga; datumi kroz `packages/shared`. Komentari u kodu na srpskom kao postojeći. Nazivi: Korpa, Istorija izmena, Zaključaj/Otključaj, Komentari, Beleške, Mapa, Pregled, Dokumenti, Zadaci, Komandni centar, Čeka tebe, Nedavne izmene, Sredi rokove, Zastarelo, faze Predlog · Razmatra se · Odobreno · Postalo zadatak · Odbijeno.
- **Teme:** svaki nov ekran radi u svetloj i tamnoj temi (web i telefon).
- **Pokret:** brojevi samo iz `packages/shared/src/motion.ts`; web kroz `apps/web/lib/motion/` i `apps/web/components/motion/`, telefon kroz `apps/mobile/src/theme/motion.ts` i `apps/mobile/src/components/motion/`. Isti element ne animiraju dve biblioteke. Animacija nikad ne blokira unos. Smanjen pokret: samo neprozirnost.
- **Poznate zamke:** lint se pušta sa `--ignore-pattern ".nocni-run/**"`; `api.x.y` je Proxy koji na svaki pristup daje NOVU referencu — ne stavljaj ga u zavisnosti `useMemo`/`useEffect` (ključ preko `getFunctionName`); mobilni nema linter — `tsc` je jedina statička provera; vitest pokreći sa `--no-file-parallelism`; tela stranica i ideja postoje i kao prilozi (`sourceKind: page_body | idea_original`) i nikad se ne prikazuju kao komentari; `inbox.pending` hrani „Čeka tebe" u Inbox-u i u Moj dan na oba klijenta.

## Paritet
Svaka nova funkcija mora da postoji i na webu i na telefonu (pravilo repoa). Parovi: K08↔K09 (temelj, Korpa), K10/K11↔K12 (stranica, zadatak), K13↔K14 (oblast), K16↔K17 (Ideje); K18 i K19 rade oba klijenta. Web korak ne pravi telefonsku verziju (dolazi u svom paru), ali ne sme ništa da uradi što je onemogućava. Ako nešto namerno postoji samo na jednoj strani (npr. Mapa za uređivanje je web, tastaturne prečice su web, haptika je telefon), zapiši to kao IZUZETAK u progress.

## Vizuelna provera (koraci koji menjaju web UI)
- **Sa Playwright MCP-om:**
  1. Pusti `npm run dev` u pozadini (ako Turbopack padne, `npx next dev --webpack -p 3000` iz `apps/web`). Port 3000 može biti zauzet tuđim procesom — NE gasi ga; koristi port koji Next ispiše.
  2. Otvori izlog `http://localhost:<port>/izlog?ekran=<ime>&tema=tamna` i `&tema=svetla`; proveri izmenjene ekrane na 390 × 844 i 1440 × 900, u obe teme.
  3. Snimci idu u `docs/prostor/snimci/<ID>-*.png`. Playwright ponekad sačuva stablo stranice kao `docs/prostor/snimci/page-*.yml` — to nisu snimci: obriši ih pre kraja koraka.
  4. Na kraju UGASI dev server koji si pokrenuo.
- **Ekrani iza prijave** se proveravaju kroz izlog `/izlog` (samo dev, u produkciji 404, noindex). Svaki korak koji menja UI dodaje svoje ekrane u `apps/web/app/izlog/` (jedan red u `registry.tsx`, fixture bez `useQuery`).
- **Telefon** nema snimke: nove komponente dodaj u `apps/mobile/src/app/(app)/dizajn-katalog.tsx` (Jovan ih gleda na uređaju) i proveri ih kroz `rn-review` agenta.
- **Bez Playwright-a:** upiši to u progress i osloni se na testove.

## Procesi i druge sesije na mašini
- Na mašini može istovremeno da radi drugi noćni run ili dev server drugog projekta. Njegovi procesi nisu tvoji i **nikad ih ne gasi**. Ne listaj sve `node.exe` procese na mašini i ne prati stabla procesa.
- Na samom kraju (posle snimaka i gašenja svog dev servera) proveri procese jednom komandom iz korena repoa:
  `powershell -NoProfile -ExecutionPolicy Bypass -File .nocni-run/prostor/alati/procesi.ps1`
  Skripta gleda samo procese čija komandna linija sadrži putanju ovog repoa i slušaoce na portovima 3000–3003, 8081 i 19006; tuđe samo prijavi. Red `USLOV 4: OK` navedi u završnom odgovoru.
- Playwright MCP sa `docs/prostor/snimci` pokreće harness ove sesije i gasi ga sa sesijom — nisi ga ti pokrenuo i ne gasi ga dok ti treba za snimke. Ako provera uslova ipak traži njegovo gašenje, tek posle svih snimaka ugasi samo stablo procesa čija komandna linija sadrži `docs/prostor/snimci`.

## Definicija završenog koraka
Korak nije gotov dok ne prođu:

    npx tsc -p packages/backend/convex/tsconfig.json --noEmit
    npx tsc -p apps/web/tsconfig.json --noEmit
    node .nocni-run/prostor/alati/expo-rute.cjs && npx tsc -p apps/mobile/tsconfig.json --noEmit
    npx eslint --ignore-pattern ".nocni-run/**" --ignore-pattern ".playwright-mcp/**"
    npx vitest run --no-file-parallelism

Runner posle tebe ponovo pušta provere i `npm run build` (i `npx convex codegen` kad se backend menjao); ako padnu, vratiće ti grešku u istoj sesiji. Provera ili test koji su padali i PRE runa (`.nocni-run/prostor/baseline.txt`) nisu tvoja odgovornost, ali ih ne kvari dodatno.

Ako nešto realno ne može (ograničenje platforme, fali podatak, traži odluku vlasnika), napravi ostatak i upiši `BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, hak nije. Ako prethodni korak nije uspeo i nešto što tvoj korak koristi ne postoji, uradi minimum toga sam (ODLUKA) ili upiši BLOKADU — ne pretpostavljaj da je sve ranije prošlo.

**Završni odgovor** svakog goal koraka sadrži tabelu „stavka iz Prihvatanja → dokaz" (fajl:red, ime testa, putanja snimka), rezultat provera i red `USLOV 4: OK` iz `procesi.ps1`. Dokazne fajlove ne briši (`.nocni-run/prostor/tmp/` je u redu). U progress ne prepisuj dnevnike procesa.

## Na kraju SVAKOG koraka dopiši u `docs/PROSTOR-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih/obrisanih
**Šta je urađeno:** 3–8 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** ime@verzija — licenca (ili „nema")
**Šema:** šta je prošireno (ili „nema")
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Testovi menjani zbog novog pravila:** fajl › test: staro → novo (ili „nema")
**Paritet:** šta postoji na webu, šta na telefonu, IZUZECI
**Rezultat provere:** tsc (3), lint, vitest — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno
```
Dopisuješ na kraj i ne brišeš tuđe sekcije.
