#!/usr/bin/env bash
# ============================================================================
#  DEVOTION — NOĆNI LANAC 2
#  Faze 3 → 1 (editor) → 4 → 5 → 6 → 7, sa proverom posle svake faze.
#
#  Pokretanje (Git Bash, iz root-a repoa):
#      bash nocni-lanac-2.sh
#
#  Sve ide u jednu novu granu. Ništa se ne gura na remote. Ništa se ne briše.
#  Ujutru: docs/mobile/lanac/IZVESTAJ.md
# ============================================================================

set -uo pipefail   # namerno BEZ -e: pad jedne faze ne sme da obori ceo lanac

# ---------------------------------------------------------------- podešavanja
GRANA="ui-nocni-$(date +%Y%m%d-%H%M)"
LANAC_DIR="docs/mobile/lanac"
LOG_DIR="$LANAC_DIR/logovi"
PROMPT_DIR="$LANAC_DIR/promptovi"
IZVESTAJ="$LANAC_DIR/IZVESTAJ.md"
TIMEOUT_FAZA=${TIMEOUT_FAZA:-7200}    # 2h po fazi
TIMEOUT_PROVERA=${TIMEOUT_PROVERA:-1800}
MAX_POPRAVKI=2                        # koliko puta sme da pokuša da popravi `npm run check`

# ------------------------------------------------------------------- provere
if [ ! -f convex.json ] || [ ! -d apps/mobile ]; then
  echo "GREŠKA: pokreni iz root-a repoa (tamo gde je convex.json)." >&2
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "GREŠKA: 'claude' nije na PATH-u." >&2
  exit 1
fi

# Koji flag ova verzija CLI-ja razume za rad bez pitanja
if claude --help 2>&1 | grep -q -- "--permission-mode"; then
  PERM=(--permission-mode bypassPermissions)
else
  PERM=(--dangerously-skip-permissions)
fi

mkdir -p "$LOG_DIR" "$PROMPT_DIR"

echo "==> Grana: $GRANA"
git checkout -b "$GRANA" 2>&1 | tail -1
POCETAK=$(date +%s)
POCETAK_ISO=$(date -Iseconds)

# --------------------------------------------------------------- pomoćne f-je
# Portabilan timeout (Git Bash nema uvek `timeout`)
sa_rokom() {
  local secs=$1; shift
  "$@" &
  local pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null ) &
  local wd=$!
  wait "$pid"; local rc=$?
  kill -TERM "$wd" 2>/dev/null
  wait "$wd" 2>/dev/null
  return $rc
}

pusti_klod() {          # pusti_klod <fajl-sa-promptom> <log> <rok>
  sa_rokom "$3" bash -c "claude -p --model opus ${PERM[*]} < '$1'" >>"$2" 2>&1
}

zabelezi() { echo "$*" >> "$IZVESTAJ"; }

commit_fazu() {         # commit_fazu <poruka>
  git add -A
  if git diff --cached --quiet; then
    echo "NEMA-IZMENA"
  else
    git commit -q -m "$1" && git rev-parse --short HEAD
  fi
}

# ============================================================================
#  PROMPTOVI
# ============================================================================

cat > "$PROMPT_DIR/faza-3.txt" <<'PROMPT_EOF'
Radiš na Devotion monorepou (apps/web Next.js, apps/mobile Expo, packages/backend Convex).
Sve na srpskom. Ne pitaj — odlučuj i radi. Ovo je nenadzirano izvršavanje.

Mobilni može da napravi stranicu samo sa naslovom i vrstom, i ne može da je
premesti, ugnjezdi, izdvoji ni poveže. Web sve to ima. Sve backend mutacije već
postoje — ne dodaje se nijedna nova.

Prvo tri repa iz prethodne faze (tačka 0), pa paritet (tačke 1-5).

0.A UKLONI PRIVREMENU DIJAGNOSTIKU.
    apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx: funkcija logDiag i svih
    šest poziva sa `probe:` ("auth", "render", tri "view"). Ne diraj postNative —
    on nosi pravi protokol (node:open, selection).
    apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx:191: console.log dijagnostike i
    granu za {type:"debug"} u onMessage ako ostane bez svrhe.

0.B ZAPIŠI DIJAGNOZU u docs/mobile/ZA-POPRAVKU.md, sekcija „Naučene zamke", kao Z3.
    Sadržaj: insertWorkspacePage je upisivao placement na (0,0) bezuslovno; web put
    (areasV2.createPage) je maskirao kvar jer posle inserta prepiše poziciju kroz
    upsertPlacement, pa se videlo samo na direktnim pozivaocima (pages.create sa
    mobilnog kanvasa, konverzija misli). Pravilo: svaki novi put ka
    insertWorkspacePage MORA da prođe kroz canvasPlacement.getAvailableCanvasPosition.
    Četiri-pet rečenica, isti ton kao Z1 i Z2.

1. PROŠIRI apps/mobile/src/components/canvas/page-create-sheet.tsx ZA kind === 'task'.
   Sada šalje samo {startupId, areaId, parentPageId, kind, title}. pages.create već
   prima taskStatus, taskPriority, assigneeProfileIds, dueDate, instructions,
   checkpoints. Uzor: apps/web/components/workspace/create-page-dialog.tsx.
   Ne pravi formular preko celog ekrana. Naslov i vrsta ostaju odmah vidljivi;
   status, prioritet, izvršioci, rok, instrukcije i checkpointi idu iza reda
   „Više opcija" koji se razvija. Za kind === 'note' ostaje kao sada.

2. KREIRANJE OBLASTI. Mutacija je startups.createArea. Preslikaj
   apps/web/components/workspace/create-area-dialog.tsx kao bottom sheet.
   Ulaz: Prostor, pored liste oblasti.

3. IZBOR IZVRŠILACA KAO DELJENA KOMPONENTA.
   apps/mobile/src/components/danas/task-actions-sheet.tsx već ima logiku izbora
   članova sa MAX_TASK_ASSIGNEES granicom. Izvuci je u samostalan AssigneePicker
   sheet i koristi je na oba mesta: pri kreiranju (tačka 1) i u detalju zadatka.
   Ne duplirati logiku granice.

4. ORGANIZACIJA STRANICE — četiri akcije kojih mobilni uopšte nema. Dodaj ih kao
   akcije u sheet-u stranice (dugme „…" u zaglavlju stranice):
   - Premesti u oblast   -> areasV2.movePage      (uzor move-to-area-menu.tsx)
   - Ugnjezdi pod…       -> areasV2.requestNesting (uzor nesting-target-menu.tsx)
   - Izdvoji             -> areasV2.detachPage     (uzor detach-page-button.tsx)
   - Poveži sa…          -> areasV2.createRelation (uzor notes/note-link-dialog.tsx)
   Ugnježdavanje ide kroz odobrenje — posle poziva prikaži da čeka odobrenje.
   Svaka akcija: busy lock, potvrda za destruktivne, greška kroz isti obrazac kao
   ostatak aplikacije.

5. HIJERARHIJA U PROSTORU.
   prostor.tsx sada prikazuje ravnu listu vrhova. Web page-tree.tsx pokazuje stablo.
   Napravi isto: red se može razviti, deca se uvlače, stanje razvijenosti se pamti
   dok si na ekranu. Decu dohvati tek kad se red razvije.

PRAVILA:
- Nijedna nova backend mutacija. Ako ti nešto fali, stani i napiši u
  docs/mobile/ZA-POPRAVKU.md umesto da izmišljaš.
- Tekst minimum 16px, osim pravog meta-teksta (badge, vreme).
- Svaki novi red koristi apps/mobile/src/components/ui/row.tsx — ne piši nove
  flexDirection:'row' blokove ručno.
- Ako menjaš apps/mobile/package.json, dodaj red o tome u docs/mobile/lanac/NATIVE-BUILD.md
  (napravi fajl ako ne postoji) — to znači da ujutru treba nov native build.

Na kraju: npm run check. Popravi sve što padne.
PROMPT_EOF

cat > "$PROMPT_DIR/faza-1-editor.txt" <<'PROMPT_EOF'
Radiš na Devotion monorepou. Sve na srpskom. Nenadzirano izvršavanje — odlučuj sam.

NAJVEĆI NEDOSTATAK APLIKACIJE: beleška se na telefonu ne može napisati.
apps/mobile/src/app/(app)/stranica/[id].tsx za kind === 'note' prikazuje poruku
„Editor stiže uskoro". Web ima pun editor u
apps/web/components/workspace/page-editor-view.tsx.

VAŽNO O MERENJU: plan je tražio da se apps/mobile/src/app/(app)/editor-spike.tsx
prvo izmeri na fizičkom uređaju. To se ne može uraditi noću bez čoveka. Zato:
- NE izmišljaj brojeve i NE tvrdi da si merio.
- Napravi editor na @10play/tentap-editor (već je u projektu), jer je odluka
  ranije doneta u korist WebView editora.
- U docs/mobile/ZA-POPRAVKU.md, sekcija „Editor beleške — merni gejt", dopiši da
  je implementacija urađena PRE merenja i šta je plan B ako merenje padne
  (markdown u native TextInput + pregled). Budi eksplicitan da gejt i dalje stoji.

ŠTA DA NAPRAVIŠ:
1. Pun editor za kind === 'note' u stranica/[id].tsx, po uzoru na web:
   isti Convex model, isti format sadržaja, autosave sa debounce-om,
   tolerancija na gubitak veze (ne gubi kucano).
2. Minimum za paritet: podebljano, kurziv, naslovi H1-H3, liste, čekirane liste,
   linkovi, blok koda. Preko toga je bonus, ne troši vreme na to.
3. Traka sa alatima mora da prati tastaturu, ne da bude ispod nje.
4. Ne sme da izgubi fokus na svaki autosave.

ZAMKE koje su nas već koštale (docs/mobile/ZA-POPRAVKU.md, sekcija „Naučene zamke"):
- Inline objekti kao propovi WebView-a prave beskonačnu petlju učitavanja.
  `source` i sve slično MORA da bude memoizovano.
- postMessage handshake ima trku sa startom mosta — koristi
  injectedJavaScriptBeforeContentLoaded.
Pročitaj te sekcije pre nego što napišeš prvu liniju.

Na kraju: npm run check. Ako si menjao apps/mobile/package.json, zapiši to u
docs/mobile/lanac/NATIVE-BUILD.md.
PROMPT_EOF

cat > "$PROMPT_DIR/faza-4.txt" <<'PROMPT_EOF'
Radiš na Devotion monorepou. Sve na srpskom. Nenadzirano izvršavanje.

Napravi mobilne pandane ekranima koje web ima a mobilni nema. Za svaki PRVO
pročitaj web verziju, pa odluči da li ima smisla na telefonu — ako nema, napiši
to u docs/mobile/02-EKRANI.md kao IZUZETAK sa razlogom, umesto da praviš nešto
što niko neće otvoriti. Bolje pet dobrih nego sedam praznih.

Redom, commit posle svakog:
1. home-view.tsx / command-center-view.tsx -> početni pregled. Odluči: proširuješ
   „Danas" ili praviš nov ekran? Obrazloži odluku u commit poruci.
2. area-briefing-dock.tsx  -> brifing oblasti
3. workload-strip.tsx      -> opterećenje tima
4. page-relations.tsx      -> veze između stranica
5. workspace-history.tsx   -> istorija kretanja
6. profile-dialog.tsx      -> profil
7. idea-discussion-dialog.tsx -> diskusija na ideji

Sve native, bez WebView-a, sa primitivima iz apps/mobile/src/components/ui.
Svaki novi red kroz components/ui/row.tsx. Tekst min 16px osim meta.
Nijedna nova backend funkcija — ako fali podatak, zapiši u ZA-POPRAVKU.md.

Na kraju: npm run check.
PROMPT_EOF

cat > "$PROMPT_DIR/faza-5.txt" <<'PROMPT_EOF'
Radiš na Devotion monorepou. Sve na srpskom. Nenadzirano izvršavanje.

Primeni dizajn sistem na SVE ekrane apps/mobile. Tokeni su u
apps/mobile/src/theme/tokens (background #0B0B0C, surface #151517, accent #6366F1;
display 28/34/700, title 20/26/600, body 16/22/400, meta 13/18/500; mreža 4pt).

SERIJA 1 — ljuska (commit posle serije):
- SPOJI DVA ZAGLAVLJA. Traka sa imenom startupa i naslov ekrana su odvojeni i
  zajedno jedu četvrtinu ekrana. Jedno zaglavlje: naslov levo krupno (display),
  pretraga i avatar desno, prebacivač startupa iza avatara.
- Tab bar: aktivna ikonica accent, neaktivne prigušene.

SERIJA 2 — liste (prostor, ideje, odobrenja, clanovi, pozivnice, pretraga,
aktivnost, puls) (commit posle serije):
- Gustina: red nosi više informacija, manje praznog prostora.
- Prostor: ukloni dvostruku ikonicu desno (chevron i „otvori") — ostaje samo
  chevron. Dodaj meta podatak (broj podstranica, status ako je zadatak).
- Ideje: dugmad za glas su sada pune zelene trake preko pola kartice. Stiša ih:
  tint pozadina 12% alfa, boja samo na ikonici i broju. Glasanje je sekundarna
  akcija, ne primarna.
- Avatari sa inicijalima umesto sivih ikonica čoveka, svuda.

SERIJA 3 — detalji (commit posle serije): stranica, tabela, prilozi, kanvas rail,
chat, zadatak.

PRAVILA: tekst min 16px osim `meta`; dodirna meta min 44pt; safe area svuda;
koristi POSTOJEĆE primitive iz components/ui — ne pravi nove varijante ako
postojeća može da se proširi propom.

Na kraju: npm run check.
PROMPT_EOF

cat > "$PROMPT_DIR/faza-6.txt" <<'PROMPT_EOF'
Radiš na Devotion monorepou. Sve na srpskom. Nenadzirano izvršavanje.

Aplikacija je potpuno statična. react-native-reanimated i expo-haptics su
instalirani i skoro se ne koriste. Dodaj pokret — suzdržano, nikad dekorativno.

1. Sheet-ovi: spring ulaz/izlaz, backdrop koji tamni postepeno, gest prevlačenja
   nadole za zatvaranje.
2. Liste: staggered fade+slide pri prvom punjenju, ukupno max 300ms.
3. Skeleton u obliku sadržaja koji stiže (ne generični pravougaonik), prelaz na
   sadržaj je crossfade a ne skok. Dodaj ga na SVAKU listu koja čeka podatke.
4. Haptika: light na primarnu akciju, success na potvrdu, warning na destruktivnu,
   error na neuspeh.
5. Prelazi ekrana: native stack sa gestom nazad svuda osim na kanvasu.
6. Pull-to-refresh na svakoj realtime listi.
7. Poštuj reduced-motion — sve se gasi ako je uključeno. Na mobilnom to je
   AccessibilityInfo.isReduceMotionEnabled; napravi jedan hook i koristi ga svuda.

Nijedna animacija ne sme da odloži trenutak kad korisnik može da nastavi. Ako
odlaže — izbaci je.

Na kraju: npm run check.
PROMPT_EOF

cat > "$PROMPT_DIR/faza-7.txt" <<'PROMPT_EOF'
Radiš na Devotion monorepou. Sve na srpskom. Nenadzirano izvršavanje.
Ovo je završna provera celog noćnog lanca.

1. Pokreni agenta parity-check (.claude/agents/parity-check.md): uporedi CEO
   apps/web i apps/mobile, ekran po ekran. Svaka razlika je PROPUST ili IZUZETAK.
2. Pokreni agenta rn-review nad svim izmenama u apps/mobile.
3. Pokreni skill design:accessibility-review nad glavnim mobilnim ekranima.
4. Popravi sve PROPUSTE koje možeš bez novih backend funkcija.
   IZUZETKE zapiši u docs/mobile/02-EKRANI.md sa razlogom.
5. Sve što nisi stigao ili nisi smeo — u docs/mobile/ZA-POPRAVKU.md, iskreno,
   sa razlogom. Ne prećutkuj ništa.

Na kraju: npm run check i npm test.
PROMPT_EOF

# ============================================================================
#  IZVEŠTAJ — zaglavlje
# ============================================================================
cat > "$IZVESTAJ" <<EOF
# Noćni lanac 2 — izveštaj

- Grana: \`$GRANA\`
- Početak: $POCETAK_ISO
- Model: opus
- Faze: 3 (paritet) → 1 (editor) → 4 (ekrani) → 5 (redizajn) → 6 (pokret) → 7 (provera)

> Ovo piše skripta, ne agent. Ako neka faza kaže „PAO", to je stvarno pala.

---
EOF

# ============================================================================
#  GLAVNA PETLJA
# ============================================================================
FAZE=(
  "faza-3:Faza 3 — paritet kreiranja i organizacije"
  "faza-1-editor:Faza 1 — editor beleški"
  "faza-4:Faza 4 — ekrani koji fale"
  "faza-5:Faza 5 — redizajn ekrana"
  "faza-6:Faza 6 — pokret"
  "faza-7:Faza 7 — završna provera"
)

for stavka in "${FAZE[@]}"; do
  KLJUC="${stavka%%:*}"
  NAZIV="${stavka#*:}"
  LOG="$LOG_DIR/$KLJUC.log"
  T0=$(date +%s)

  echo ""
  echo "======================================================================"
  echo "==> $NAZIV   ($(date +%H:%M))"
  echo "======================================================================"

  zabelezi ""
  zabelezi "## $NAZIV"
  zabelezi ""
  zabelezi "- Start: $(date -Iseconds)"

  SHA_PRE=$(git rev-parse --short HEAD)

  # ---- 1. izvršavanje -----------------------------------------------------
  pusti_klod "$PROMPT_DIR/$KLJUC.txt" "$LOG" "$TIMEOUT_FAZA"
  RC=$?
  if [ $RC -ne 0 ]; then
    zabelezi "- **Izvršavanje: PAO** (izlazni kod $RC — 143 znači da je istekao rok od $((TIMEOUT_FAZA/60)) min)"
  else
    zabelezi "- Izvršavanje: prošlo"
  fi

  # ---- 2. mehanička provera ----------------------------------------------
  echo "--> npm run check"
  if sa_rokom "$TIMEOUT_PROVERA" npm run check >>"$LOG" 2>&1; then
    zabelezi "- \`npm run check\`: **prolazi**"
  else
    zabelezi "- \`npm run check\`: **PADA** — pokušavam popravku"
    for i in $(seq 1 $MAX_POPRAVKI); do
      cat > "$PROMPT_DIR/popravka.txt" <<EOF
\`npm run check\` pada posle faze „$NAZIV". Pokreni je, pročitaj greške i popravi
ih. Ne menjaj ponašanje aplikacije da bi ućutkao lint — popravi pravi uzrok.
Ako je greška u nečemu što si upravo napisao, ispravi to; ako je zatečena,
zapiši je u docs/mobile/ZA-POPRAVKU.md i objasni zašto je ne diraš.
Ponavljaj dok \`npm run check\` ne prođe.
EOF
      pusti_klod "$PROMPT_DIR/popravka.txt" "$LOG" "$TIMEOUT_PROVERA"
      if sa_rokom "$TIMEOUT_PROVERA" npm run check >>"$LOG" 2>&1; then
        zabelezi "- popravka $i: **uspela**"
        break
      fi
      zabelezi "- popravka $i: nije uspela"
    done
  fi

  # ---- 3. testovi ---------------------------------------------------------
  if sa_rokom "$TIMEOUT_PROVERA" npm test >>"$LOG" 2>&1; then
    zabelezi "- \`npm test\`: prolazi"
  else
    zabelezi "- \`npm test\`: **PADA** (detalji u $LOG)"
  fi

  # ---- 4. commit ----------------------------------------------------------
  SHA=$(commit_fazu "$NAZIV (noćni lanac 2)")
  if [ "$SHA" = "NEMA-IZMENA" ]; then
    zabelezi "- Commit: **NIJE BILO NIJEDNE IZMENE** — faza nije ništa uradila"
  else
    zabelezi "- Commit: \`$SHA\`"
    zabelezi "- Dirnuto fajlova: $(git diff --name-only "$SHA_PRE" HEAD | wc -l | tr -d ' ')"
  fi

  # ---- 5. nezavisni revizor (svež kontekst, ne ocenjuje sam sebe) ---------
  echo "--> revizija"
  cat > "$PROMPT_DIR/revizija.txt" <<EOF
Ti si revizor. NE popravljaš ništa, samo proveravaš i pišeš nalaz.

Faza koja je upravo završena zadata je u fajlu $PROMPT_DIR/$KLJUC.txt.
Izmene su u opsegu commit-a: git diff $SHA_PRE..HEAD

Uradi:
1. Pročitaj zadati prompt i pročitaj stvarni diff.
2. Za SVAKU numerisanu tačku prompta reci: URAĐENO / DELIMIČNO / NIJE URAĐENO,
   sa imenom fajla i linijom kao dokazom. Bez dokaza ne smeš da napišeš URAĐENO.
3. Nabroj sve što je napravljeno a nije traženo.
4. Nabroj placeholder-e, prazne komponente, TODO komentare i funkcije koje samo
   vraćaju null — to su nedovršene stvari.
5. Proveri da nijedan novi red nije napisan ručno preko flexDirection:'row'
   umesto kroz components/ui/row.tsx.
6. Proveri da nije dodata nijedna nova funkcija u packages/backend.

Nalaz dopiši na kraj fajla $IZVESTAJ, pod naslovom „### Revizija: $NAZIV".
Piši kratko i bez ulepšavanja. Ako faza nije uradila ono što je traženo, napiši
to prvom rečenicom.
EOF
  pusti_klod "$PROMPT_DIR/revizija.txt" "$LOG" "$TIMEOUT_PROVERA"

  git add -A && git commit -q -m "Revizija: $NAZIV" 2>/dev/null

  T1=$(date +%s)
  zabelezi "- Trajanje: $(( (T1-T0)/60 )) min"
  echo "==> $NAZIV gotovo za $(( (T1-T0)/60 )) min"
done

# ============================================================================
#  ZAVRŠETAK
# ============================================================================
KRAJ=$(date +%s)
UKUPNO=$(( (KRAJ-POCETAK)/60 ))

zabelezi ""
zabelezi "---"
zabelezi ""
zabelezi "## Zaključak lanca"
zabelezi ""
zabelezi "- Kraj: $(date -Iseconds)"
zabelezi "- Ukupno: $UKUPNO min"
zabelezi "- Grana: \`$GRANA\` (ništa nije gurnuto na remote)"
zabelezi "- Commit-ova: $(git rev-list --count "$GRANA" ^main 2>/dev/null || echo '?')"
zabelezi ""
if [ -f "$LANAC_DIR/NATIVE-BUILD.md" ]; then
  zabelezi "### ⚠ POTREBAN NOV NATIVE BUILD"
  zabelezi ""
  zabelezi "Menjan je \`apps/mobile/package.json\`. Pre testiranja na emulatoru:"
  zabelezi ""
  zabelezi '```'
  zabelezi 'bash podesi-android.sh'
  zabelezi '```'
  zabelezi ""
  zabelezi "Bez ovoga Metro servira stari bundle i izgledaće kao da ništa nije urađeno."
else
  zabelezi "Native build nije potreban — \`apps/mobile/package.json\` nije menjan."
  zabelezi "Dovoljno je \`r\` u Metro terminalu."
fi

git add -A && git commit -q -m "Izveštaj noćnog lanca 2" 2>/dev/null

echo ""
echo "======================================================================"
echo "  GOTOVO za $UKUPNO min. Izveštaj: $IZVESTAJ"
echo "  Grana: $GRANA"
echo "======================================================================"
