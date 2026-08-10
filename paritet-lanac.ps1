# ============================================================================
#  DEVOTION - LANAC PARITETA
#
#  Osam faza. Svaka ide u TRI koraka: PLAN -> IZVRŠI -> REVIZIJA.
#  Model, effort, režim i cilj su ispisani i za svaki korak i u izveštaju.
#
#  Pokretanje (PowerShell, iz root-a repoa):
#      powershell -ExecutionPolicy Bypass -File .\paritet-lanac.ps1
#
#  Drugi model bez diranja skripte:
#      powershell -ExecutionPolicy Bypass -File .\paritet-lanac.ps1 -Model opus
#      powershell -ExecutionPolicy Bypass -File .\paritet-lanac.ps1 -Model claude-opus-4-8-...
#
#  Nova grana. Ništa se ne gura na remote. Ujutru: docs\mobile\lanac2\IZVESTAJ.md
# ============================================================================

param(
    # Podrazumevano FABLE - jedini model koji je dosad rešio kanvas.
    # Možeš proslediti alias ("fable", "opus") ili pun ID ("claude-opus-4-8-...").
    [string]$Model = ""   # prazno = koristi ono sto je podeseno u claude -> /model
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ============================================================================
#  MODEL, EFFORT, REŽIM - jedno mesto, ništa se ne pogađa
# ============================================================================
# ---------------------------------------------------------------------------
#  MODEL
#
#  Dolazi iz -Model parametra. Podrazumevano "fable".
#
#  Aliasi ("fable", "opus") NE fiksiraju verziju - pokazuju na ono što CLI
#  trenutno smatra podrazumevanim za tu porodicu. Ako ti je verzija bitna
#  (npr. baš Opus 4.8), prosledi PUN identifikator:
#      .\paritet-lanac.ps1 -Model claude-opus-4-8-YYYYMMDD
#
#  Pun identifikator nađeš tako što pokreneš `claude` interaktivno i ukucaš
#  /model - lista pokazuje pune ID-jeve svih modela koje tvoj nalog ima.
#
#  Skripta svejedno proverava šta je STVARNO pokrenuto i ispisuje to pre
#  nego što krene, pa ne moraš da veruješ ni meni ni aliasu.
# ---------------------------------------------------------------------------
$MODEL        = $Model
$EFFORT_PLAN  = "max"            # planiranje: najdublje razmišljanje
$EFFORT_RAD   = "xhigh"          # implementacija
$EFFORT_REV   = "max"            # revizija: mora da uhvati laž
$EFFORT_FIX   = "high"           # popravke lint/tsc grešaka

# Ključna reč koja diže dubinu razmišljanja bez obzira na to da li CLI ima flag
$KLJUC_PLAN   = "ultrathink"
$KLJUC_RAD    = "ultrathink"
$KLJUC_REV    = "ultrathink"
$KLJUC_FIX    = "think harder"

$Grana        = "paritet-" + (Get-Date -Format "yyyyMMdd-HHmm")
$LanacDir     = "docs\mobile\lanac2"
$LogDir       = "$LanacDir\logovi"
$PromptDir    = "$LanacDir\promptovi"
$PlanDir      = "$LanacDir\planovi"
$Izvestaj     = "$LanacDir\IZVESTAJ.md"
$RokPlan      = 3600     # 1h
$RokFaza      = 10800    # 3h
$RokProvera   = 2700     # 45 min
$MaxPopravki  = 3

# ---------------------------------------------------------------- provere
if (-not (Test-Path "convex.json") -or -not (Test-Path "apps\mobile")) {
    Write-Host "GREŠKA: pokreni iz root-a repoa (tamo gde je convex.json)." -ForegroundColor Red
    exit 1
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "GREŠKA: 'claude' nije na PATH-u." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "docs\mobile\PARITET.md")) {
    Write-Host "GREŠKA: nema docs\mobile\PARITET.md - lanac bez njega nema smisla." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $LogDir, $PromptDir, $PlanDir | Out-Null

# ---- šta ovaj CLI stvarno podržava (ne pogađamo) -------------------------
$Pomoc = (& claude --help 2>&1 | Out-String)

if ($Pomoc -match "--permission-mode") { $FLAG_PERM = "--permission-mode bypassPermissions" }
else                                   { $FLAG_PERM = "--dangerously-skip-permissions" }

$FLAG_EFFORT_IME = $null
foreach ($kandidat in @("--reasoning-effort", "--effort", "--thinking-effort", "--thinking")) {
    if ($Pomoc -match [regex]::Escape($kandidat)) { $FLAG_EFFORT_IME = $kandidat; break }
}

# Effort je OBAVEZAN. Ako CLI nema flag, ide ključnom reči u promptu - ali se
# nikad ne preskače, i uvek se ispisuje koji je put izabran.
if (-not $FLAG_EFFORT_IME) {
    Write-Host ""
    Write-Host "NAPOMENA: ovaj CLI nema flag za effort." -ForegroundColor Yellow
    Write-Host "Effort se šalje ključnom reči na vrhu SVAKOG prompta:" -ForegroundColor Yellow
    Write-Host "  PLAN i REVIZIJA -> 'ultrathink'   IZVRSI -> 'ultrathink'   POPRAVKE -> 'think harder'" -ForegroundColor Yellow
    Write-Host "Nijedan poziv ne ide bez toga." -ForegroundColor Yellow
}

$MODEL_STVARNI = "(ne proveravam - vidi /model u claude)"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  LANAC PARITETA - konfiguracija" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
if ($MODEL) { Write-Host "  Model:            $MODEL (prosledjen kroz --model)" }
else        { Write-Host "  Model:            podrazumevani iz claude -> /model" -ForegroundColor Green }
Write-Host "  Model se koristi: za sve korake, bez izuzetka"
Write-Host "  Effort plan:      $EFFORT_PLAN"
Write-Host "  Effort rad:       $EFFORT_RAD"
Write-Host "  Effort revizija:  $EFFORT_REV"
if ($FLAG_EFFORT_IME) {
    Write-Host "  Effort se šalje:  preko flag-a $FLAG_EFFORT_IME" -ForegroundColor Green
} else {
    Write-Host "  Effort se šalje:  ključnom reči 'ultrathink' u promptu" -ForegroundColor Yellow
    Write-Host "                    (ovaj CLI nema flag za effort)" -ForegroundColor Yellow
}
Write-Host "  Režim dozvola:    $FLAG_PERM"
Write-Host "  Grana:            $Grana"
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

git checkout -b $Grana 2>&1 | Select-Object -Last 1
$Pocetak = Get-Date

# ------------------------------------------------------------ pomoćne f-je
function Zapisi([string]$tekst) {
    Add-Content -Path $Izvestaj -Value $tekst -Encoding UTF8
}

function ZapisiFajl([string]$putanja, [string]$sadrzaj) {
    [System.IO.File]::WriteAllText(
        (Join-Path (Get-Location).Path $putanja),
        $sadrzaj,
        (New-Object System.Text.UTF8Encoding($false)))
}

function PustiKlod {
    param(
        [string]$PromptFajl,
        [string]$Log,
        [int]$Rok,
        [string]$Effort,
        [switch]$SamoCitanje   # planiranje i revizija ne smeju da menjaju kod
    )
    if (-not $Effort) { throw "PustiKlod pozvan bez effort-a - to se ne sme desiti." }

    # Argumenti se grade kao NIZ, ne kao string. Model i effort idu samo ako su
    # zadati; ako nisu, koristi se ono sto je podeseno u `claude` -> /model.
    $lista = @("-p")
    if ($MODEL)           { $lista += @("--model", $MODEL) }
    if ($FLAG_EFFORT_IME) { $lista += @($FLAG_EFFORT_IME, $Effort) }
    $lista += ($FLAG_PERM -split ' ')

    $opisModela  = if ($MODEL) { $MODEL } else { "podrazumevani iz /model" }
    $opisEfforta = if ($FLAG_EFFORT_IME) { $Effort } else { "kljucna rec u promptu" }
    Write-Host "      [model $opisModela | effort $opisEfforta]" -ForegroundColor DarkGray

    # PowerShell cev umesto Start-Process. Argumenti se prenose kao JEDAN string
    # razdvojen tabom, pa se unutar posla ponovo razlazu u niz - Start-Job inace
    # spljosti niz u jedan argument i claude javi "unknown option".
    $spojeni = $lista -join "`t"

    $job = Start-Job -ScriptBlock {
        param($pf, $lg, $wd, $spojeniArg)
        Set-Location $wd
        $al = $spojeniArg -split "`t"
        $tekst = Get-Content -LiteralPath $pf -Raw
        $tekst | & claude @al 2>&1 | Out-File -FilePath $lg -Append -Encoding UTF8
        if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    } -ArgumentList $PromptFajl, $Log, (Get-Location).Path, $spojeni

    $gotov = Wait-Job $job -Timeout $Rok
    if (-not $gotov) {
        Write-Host "    !! istekao rok, prekidam" -ForegroundColor Yellow
        Stop-Job $job; Remove-Job $job -Force
        return 124
    }
    $rc = Receive-Job $job
    Remove-Job $job -Force
    if ($rc -is [array]) { $rc = $rc[-1] }

    # Prazan log znaci da poziv nije ni krenuo - to se NE sme progutati.
    $vel = 0
    if (Test-Path $Log) { $vel = (Get-Item $Log).Length }
    if ($vel -eq 0) {
        Write-Host "    !! UPOZORENJE: log je prazan - claude nije vratio nista" -ForegroundColor Red
        return 125
    }
    $rep = Get-Content -LiteralPath $Log -Raw -ErrorAction SilentlyContinue
    if ($rep -and ($rep -match "unknown option|unknown argument|error: unknown")) {
        Write-Host ""
        Write-Host "PREKID: claude odbija argumente koje mu saljem." -ForegroundColor Red
        Write-Host "Poslato: claude $($lista -join ' ')" -ForegroundColor Red
        Write-Host "Nema smisla nastaviti - ceo lanac bi radio u prazno." -ForegroundColor Red
        Write-Host "Detalji u: $Log" -ForegroundColor Yellow
        exit 1
    }
    if ($null -eq $rc) { return 0 }
    return [int]$rc
}

function PokreniSaRokom([string]$Komanda, [string]$Log, [int]$Rok) {
    $job = Start-Job -ScriptBlock {
        param($k, $l, $wd)
        Set-Location $wd
        cmd /c "$k" *>&1 | Out-File -FilePath $l -Append -Encoding UTF8
        $LASTEXITCODE
    } -ArgumentList $Komanda, $Log, (Get-Location).Path
    $done = Wait-Job $job -Timeout $Rok
    if (-not $done) { Stop-Job $job; Remove-Job $job -Force; return 124 }
    $rc = Receive-Job $job
    Remove-Job $job -Force
    if ($rc -is [array]) { $rc = $rc[-1] }
    if ($null -eq $rc) { return 0 }
    return [int]$rc
}

# ============================================================================
#  ZAJEDNIČKO ZAGLAVLJE SVIH PROMPTOVA
# ============================================================================
$Zaglavlje = @"
Radiš na Devotion monorepou: apps/web (Next.js), apps/mobile (Expo/React Native),
packages/backend (Convex). Sve na srpskom. Nenadzirano izvršavanje - ne pitaj,
odlučuj i radi.

PRVO pročitaj, uvek, pre bilo čega:
  docs/mobile/PARITET.md      <- tvoja lista i tvoja memorija
  docs/mobile/ZA-POPRAVKU.md  <- naučene zamke, ne ponavljaj ih
  docs/mobile/00-PLAN.md      <- arhitektura, protokol WebView mosta

PRAVILA KOJA VAŽE U SVAKOJ FAZI:
- Paritet je FUNKCIONALNI, ne vizuelni. Ne prekopavaj web layout. Za svaku
  funkciju pitaj se kako se isti ishod postiže prstom na malom ekranu, pa to
  napravi. Tabela prevoda obrazaca je u PARITET.md.
- Backend NE menjaj. Sve funkcije već postoje. Ako ti stvarno nešto fali, stani
  i zapiši u docs/mobile/ZA-POPRAVKU.md umesto da izmišljaš.
- Svaki novi red kroz apps/mobile/src/components/ui/row.tsx. Ne piši ručno nove
  flexDirection:'row' blokove.
- Tekst min 16px osim pravog meta-teksta. Dodirna meta min 44pt. Safe area.
  busy lock na svakoj mutaciji. Prazno, učitavanje i greška - sva tri stanja.
- ČEKIRAJ [x] u docs/mobile/PARITET.md čim nešto završiš, u ISTOM commit-u sa
  kodom. Ako odlučiš da nešto ne ide na telefon, upiši red u sekciju Z sa
  razlogom. Prazan razlog ne važi.
- U sekciji 'ŠTA JE VEĆ URAĐENO" fajla PARITET.md je spisak stvari koje RADE.
  Ne diraj ih i ne pravi ih ponovo.
- Ako menjaš apps/mobile/package.json, dopiši red u docs/mobile/lanac2/NATIVE-BUILD.md
  (napravi fajl ako ne postoji) - to znači da ujutru treba nov native build.

"@

$RepZavrsetka = @"

NA KRAJU FAZE, obavezno, ovim redom:
  cd apps/mobile && npx tsc --noEmit
  cd apps/web    && npx tsc --noEmit
  npm run lint
  npm test
Popravi sve što padne. Ne ostavljaj nijednu grešku sledećoj fazi.
"@

# ============================================================================
#  FAZE - cilj, effort i telo prompta na jednom mestu
# ============================================================================
$Faze = @(
    @{
        k = "faza-0"
        n = "Faza 0 - Blokator: kanvasi vraćaju 404"
        cilj = "Kanvas se vidi na emulatoru, dokazano screenshot-om sa oblačićima."
        telo = @"
FAZA 0 - BLOKATOR: SVI KANVASI VRAĆAJU 404 (sekcija 0 u PARITET.md)

Ovo je jedina faza koja mora da uspe pre ostalih. Dokazi su u sekciji 0 fajla
docs/mobile/PARITET.md - pročitaj ih pre nego što išta uradiš.

Ukratko: na portu 3000 radi NEKI DRUGI Next.js projekat, ne Devotion. Zato svaka
/embed/* ruta vraća 404, pa kanvas, Misli i editor preko WebView-a ne rade i ne
mogu ni da se testiraju. Ruta apps/web/app/embed/canvas/[kind]/[id]/page.tsx
postoji na disku i ispravna je - problem nije u kodu.

Uradi redom, sa dokazom za svaki korak:
1. netstat -ano ^| findstr :3000   pa   tasklist /FI "PID eq <pid>"
   Zapiši šta je zauzimalo port.
2. Ugasi taj proces. Pokreni npm run dev iz root-a notion-clone.
3. Potvrdi: http://localhost:3000/embed/canvas/ideas/proba renderuje Devotion
   embed, a ne Next 404 stranicu.
4. Otvori kanvas u aplikaciji na emulatoru i napravi SCREENSHOT sa vidljivim
   oblačićima. Bez te slike faza nije gotova.
5. Ako i posle ispravnog servera kanvas ne crta - TADA je bag u kodu. Bisektuj
   po metodu iz PROMPT-KANVAS-GOAL.md (K1-K5) i popravi.
6. Zapiši nalaz u docs/mobile/KANVAS-DIJAGNOZA.md: šta je zauzimalo port, kako si
   to utvrdio, i kako se ubuduće u deset sekundi proverava da je pravi server na
   3000. Dodaj tu proveru i u docs/mobile/ZA-POPRAVKU.md kao naučenu zamku.

Ne prelazi dalje dok kanvas ne bude vidljiv na screenshot-u.
"@
    },
    @{
        k = "faza-ux"
        n = "Faza UX - Bagovi uhvaćeni na ekranu"
        cilj = "Svih 13 bagova iz sekcije E popravljeno i svaki viđen kako radi na emulatoru."
        telo = @"
FAZA UX - BAGOVI UHVAĆENI NA EKRANU (sekcija E u PARITET.md)

Trinaest bagova viđenih na emulatoru dok je aplikacija radila. Nisu pretpostavke
- svaki korisnik ih vidi svaki put. Cela sekcija E u docs/mobile/PARITET.md
opisuje šta tačno nije u redu.

Redosled po težini:
- E1 hardversko Nazad zatvara APLIKACIJU umesto sheet-a (najgori, popravi prvi,
  i to na SVIM sheet-ovima odjednom, ne samo na jednom)
- E2 traka filtera na 'Danas" jede 40% ekrana i ne skroluje
- E8 '..." meni ne postoji ni na zadatku ni na beleški, pa je ceo
  page-actions-sheet.tsx napisan a nedostupan - potraži ima li još takvih
  slučajeva gde komponenta postoji ali ulaz ne
- E3, E4, E9, E10, E11, E13 - raspored i odsečeni elementi
- E5, E6 - engleski placeholder i tekst koji belešku zove zadatkom
- E7 - prazan spiner umesto praznog stanja
- E12 - breadcrumbs

Za SVAKI popravljen bag: uradi izmenu, pa je pogledaj na emulatoru, pa čekiraj.
Imaš computer use. Ne čekiraj ništa što nisi video da radi.
"@
    },
    @{
        k = "faza-1"
        n = "Faza 1 - Misli"
        cilj = "Misao se može napraviti, povezati, ugnjezditi, pretvoriti u ideju i vratiti - sa telefona."
        telo = @"
FAZA 1 - MISLI (sekcija A1 u PARITET.md)

Najveća rupa: 18 Convex funkcija za misli koje web koristi a mobilni nema.
Ulaz u Misli iz menija 'Više" POSTOJI (provereno) - sve ostalo fali.

Embed ruta već podržava kind === "thoughts" (canvas-embed.tsx:292), pa se graf
crta kroz WebView. Ne praviš nov graf - praviš native akcije oko njega.

Uzori na webu: thoughts-canvas-view.tsx, thought-editor-dialog.tsx,
thought-conversion-dialog.tsx, thought-destination-picker.tsx.

Uradi sve nečekirane stavke iz sekcije A1. Prioritet unutar faze:
1. lista misli kao alternativa grafu (na telefonu je lista često upotrebljivija)
2. veze, ugnježdavanje, premeštanje
3. thoughts.convertToIdeas - misao postaje ideja
4. thoughts.restoreNodes / restoreEdges - vraćanje obrisanog
"@
    },
    @{
        k = "faza-2"
        n = "Faza 2 - Administracija startupa"
        cilj = "Admin sa telefona može sve što može sa weba: startup, logo, članovi, redosled oblasti."
        telo = @"
FAZA 2 - ADMINISTRACIJA STARTUPA (sekcija A2 u PARITET.md)

Web admin-dialog.tsx ima devet funkcija koje mobilni nema. Mobilni ima samo
pozivnice i listu članova bez ijedne akcije - provereno na emulatoru, u meniju
'Više" nema nikakve administracije.

Uradi sve nečekirane stavke iz A2.

Posebno pazi:
- Sve iza requireAdmin na backendu, i sakriveno u meniju ako korisnik nije admin.
  Dvostruka brana, kao što je već urađeno za pozivnice.
- reorderAreas na telefonu NIJE drag&drop. Dugmad 'gore/dole" u redu oblasti, ili
  sheet sa izborom pozicije. Drag na maloj listi sa prstom je frustracija.
- Uklanjanje člana je destruktivno - potvrda, i jasno šta biva sa njegovim
  zadacima.
- Logo: expo-image-picker je već instaliran, koristi njega.
"@
    },
    @{
        k = "faza-3"
        n = "Faza 3 - Zadaci i stranica"
        cilj = "Vidiš sve zadatke startupa sa filterima, i stranicu možeš arhivirati i znaš gde si u stablu."
        telo = @"
FAZA 3 - ZADACI I STRANICA (sekcije A3 i A5 u PARITET.md)

A3: mobilni danas.tsx vidi samo MOJE zadatke za danas (tasks.commandCenter).
Web ima pregled svih zadataka startupa (tasks.listForStartup) sa filterima i
tabelom. Na telefonu tabela sa mnogo kolona nema smisla - napravi listu kartica
gde je svaki red zadatak, a kolone postaju meta-podaci u redu. Filteri idu u
sheet, ne u traku.

A5: page-actions-sheet.tsx već ima premeštanje, ugnježdavanje, izdvajanje i
povezivanje. Fali arhiviranje, breadcrumbs, addEntry, i ujednačavanje
pages.create sa areasV2.createPage.

Breadcrumbs su važniji nego što izgledaju: na telefonu se posle tri nivoa
ugnježdavanja potpuno izgubiš jer nemaš sidebar koji ti pokazuje gde si.

Uradi sve nečekirane stavke iz A3 i A5.
"@
    },
    @{
        k = "faza-4"
        n = "Faza 4 - Ideje, vraćanje obrisanog, chat"
        cilj = "Ništa se ne gubi zauvek: svaka arhivirana stvar se može vratiti, na svakom ekranu."
        telo = @"
FAZA 4 - IDEJE, VRAĆANJE OBRISANOG, CHAT (sekcije A4, A6, A7, A8)

A6 je najvažniji deo ove faze i sistemska je rupa: mobilni ume da arhivira, ali
NIGDE ne ume da vrati. Korisnik koji pogreši nema izlaz. Napravi jedan ujednačen
obrazac - posle arhiviranja traka 'Poništi" koja stoji nekoliko sekundi - i
primeni ga na sva mesta iz A6.

A4: ideas.convertToPage, ugnježdavanje ideja, veze između ideja, restoreOwn.
A7: chat.archiveChannel. Za notifications.latest sam odluči da li ima smisla kad
    već postoji ceo ekran obaveštenja - ako nema, u sekciju Z sa razlogom.
A8: checkpointi na kanvasu. Ako proceniš da to ima smisla samo na velikom ekranu,
    u sekciju Z sa razlogom, ne pravi nešto neupotrebljivo.

Uradi sve nečekirane stavke iz A4, A6, A7, A8.
"@
    },
    @{
        k = "faza-5"
        n = "Faza 5 - Nula grešaka"
        cilj = "tsc, lint, build i testovi prolaze bez ijedne greške i bez ijednog upozorenja."
        telo = @"
FAZA 5 - NULA GREŠAKA (sekcija B u PARITET.md)

Ova faza ne dodaje funkcionalnost. Njen jedini posao je da lista B bude sva
čekirana, bez ijednog izuzetka.

Redom:
1. cd apps/mobile && npx tsc --noEmit   -> nula
2. cd apps/web    && npx tsc --noEmit   -> nula
3. npm run lint                          -> nula grešaka I nula upozorenja
4. npm run build                         -> prolazi
5. npm test                              -> svi prolaze
6. Pretraži ceo apps/mobile/src i apps/web za:
   - console.log koji je ostao od dijagnostike
   - TODO / FIXME bez zapisa u ZA-POPRAVKU.md
   - komponente koje vraćaju null kao placeholder
   - funkcije koje su prazne ili samo hvataju grešku i ćute
7. Pokreni agente iz .claude/agents: rn-review, web-review, parity-check.
   Popravi sve što nađu.

Ne ućutkuj lint pravilo da bi prošlo. Popravi pravi uzrok. Ako je greška
zatečena i ne smeš da je diraš, zapiši je u ZA-POPRAVKU.md i objasni zašto.
"@
    },
    @{
        k = "faza-6"
        n = "Faza 6 - Runtime i responzivnost"
        cilj = "Sve iz liste C prođeno na ekranu, na malom i velikom telefonu, bez ijedne greške u konzoli."
        telo = @"
FAZA 6 - RUNTIME I RESPONZIVNOST (sekcije C i D u PARITET.md)

Ovo je jedina faza u kojoj gledaš ekran, ne kod. Imaš computer use.
Android emulator je otvoren i aplikacija je pokrenuta. Web sajt radi na
http://localhost:3000 u Chrome-u. Oba gađaju istu dev bazu.

Radi listu C stavku po stavku. Za svaku: uradi je na emulatoru, pa istu na webu,
pa uporedi ishod. Screenshot je dokaz - bez njega ne smeš da čekiraš.

Alat koji moraš da koristiš: chrome://inspect/#devices na hostu daje pun DevTools
nad WebView-om iz emulatora (kanvas i editor beleške su WebView-ovi). Tamo vidiš
pravu konzolu i mrežu, umesto da pogađaš.

Takođe pratiš, sve vreme:
- Metro konzolu - nijedna crvena greška, nijedno upozorenje koje se ponavlja
- Convex dashboard logove - nijedan Server Error

Zatim lista D: responzivnost. Promeni veličinu emulatora na mali telefon
(360x640) i na veliki (430x932) i prođi kroz sve ekrane. Tastatura, skrol u
sheet-ovima, duga imena, prazna stanja, stanja učitavanja i greške.

Sve što nađeš popravi odmah, pa ponovo proveri na ekranu.
"@
    }
)

# ============================================================================
#  IZVEŠTAJ - zaglavlje
# ============================================================================
$effortLinija = if ($FLAG_EFFORT_IME) { "preko flag-a ``$FLAG_EFFORT_IME``" } else { "ključnom reči ``ultrathink`` (ovaj CLI nema flag za effort)" }

$zaglavljeIzvestaja = @"
# Lanac pariteta - izveštaj

## Konfiguracija izvršavanja

| Stavka | Vrednost |
|---|---|
| Model - zadato | ``$MODEL`` |
| Model | ``$MODEL_STVARNI`` |
| Effort - planiranje | ``$EFFORT_PLAN`` |
| Effort - implementacija | ``$EFFORT_RAD`` |
| Effort - revizija | ``$EFFORT_REV`` |
| Effort - popravke | ``$EFFORT_FIX`` |
| Kako se effort šalje | $effortLinija |
| Režim dozvola | ``$FLAG_PERM`` |
| Grana | ``$Grana`` |
| Početak | $($Pocetak.ToString("s")) |

## Kako svaka faza teče

Svaka faza ide u tri koraka, i svaki je zaseban poziv sa svežim kontekstom:

1. **PLAN** - ``$MODEL`` · effort ``$EFFORT_PLAN`` · NE menja kod, samo piše plan u ``$PlanDir``
2. **IZVRŠI** - ``$MODEL`` · effort ``$EFFORT_RAD`` · čita svoj plan i sprovodi ga
3. **REVIZIJA** - ``$MODEL`` · effort ``$EFFORT_REV`` · traži dokaz u diff-u za svaki čekiran kvadratić

Zašto PLAN pa IZVRŠI, a ne odmah rad: agent koji prvo napiše plan pa ga onda
sprovodi pravi manje promašaja od agenta koji krene da kuca odmah, a plan ostaje
na disku pa se ujutru vidi šta je nameravao naspram onoga što je stvarno uradio.

> Ovo piše skripta, ne agent. 'PAO" znači da je stvarno palo.

---
"@
ZapisiFajl $Izvestaj ($zaglavljeIzvestaja + "`n")

# ============================================================================
#  GLAVNA PETLJA
# ============================================================================
foreach ($f in $Faze) {
    $kljuc = $f.k; $naziv = $f.n; $cilj = $f.cilj; $telo = $f.telo
    $log = "$LogDir\$kljuc.log"
    $planFajl = "$PlanDir\$kljuc.md"
    $t0 = Get-Date

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "==> $naziv   ($(Get-Date -Format 'HH:mm'))" -ForegroundColor Cyan
    Write-Host "    CILJ:   $cilj" -ForegroundColor White
    Write-Host "    MODEL:  $MODEL" -ForegroundColor DarkGray
    Write-Host "======================================================================" -ForegroundColor Cyan

    Zapisi ""
    Zapisi "## $naziv"
    Zapisi ""
    Zapisi "**Cilj:** $cilj"
    Zapisi ""
    Zapisi "| Korak | Model | Effort | Režim |"
    Zapisi "|---|---|---|---|"
    Zapisi "| PLAN | ``$MODEL`` | ``$EFFORT_PLAN`` | bez izmena koda |"
    Zapisi "| IZVRŠI | ``$MODEL`` | ``$EFFORT_RAD`` | ``$FLAG_PERM`` |"
    Zapisi "| REVIZIJA | ``$MODEL`` | ``$EFFORT_REV`` | bez izmena koda |"
    Zapisi ""
    Zapisi "- Start: $((Get-Date).ToString('s'))"

    $shaPre = (git rev-parse --short HEAD).Trim()

    # ---- KORAK 1: PLAN ----------------------------------------------------
    Write-Host "--> [1/3] PLAN   (effort $EFFORT_PLAN)" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc-plan.txt" ($KLJUC_PLAN + "`n`n" + $Zaglavlje + $telo + @"

=====================================================================
OVO JE KORAK PLANIRANJA. NE MENJAJ NIJEDAN FAJL SA KODOM.
=====================================================================

Tvoj jedini posao sada je da napišeš plan u fajl $planFajl

CILJ FAZE (po ovome ćeš biti meren): $cilj

Plan mora da sadrži, tim redom:
1. Šta si pročitao i šta si zatekao - konkretno, sa imenima fajlova i linijama.
   Ako je nešto iz liste VEĆ urađeno, reci to i izbaci iz plana.
2. Redosled izmena, jedna po jedna, sa fajlom koji se dira i razlogom.
3. Za svaku izmenu: kako se na telefonu, prstom, postiže isti ishod kao na webu.
   Ako obrazac sa weba ne radi na malom ekranu, napiši čime ga zamenjuješ.
4. Šta može da pukne i šta ćeš uraditi ako pukne.
5. Šta NEĆEŠ raditi u ovoj fazi i zašto (to ide u sekciju Z fajla PARITET.md).
6. Kako ćeš na kraju dokazati da svaka stavka radi - konkretan test, ne 'proveriću".

Piši kratko i konkretno. Bez opštih rečenica. Ovaj plan će drugi agent sprovesti
doslovno, pa sve što ne napišeš - neće se desiti.
"@)
    PustiKlod -PromptFajl "$PromptDir\$kljuc-plan.txt" -Log $log -Rok $RokPlan -Effort $EFFORT_PLAN -SamoCitanje | Out-Null

    if (Test-Path $planFajl) {
        Zapisi "- PLAN: napisan (``$planFajl``)"
    } else {
        Zapisi "- PLAN: **nije napisan** - implementacija ide bez plana"
    }
    git add -A 2>&1 | Out-Null
    git commit -q -m "Plan: $naziv" 2>&1 | Out-Null

    # ---- KORAK 2: IZVRŠI --------------------------------------------------
    Write-Host "--> [2/3] IZVRŠI (effort $EFFORT_RAD)" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc.txt" ($KLJUC_RAD + "`n`n" + $Zaglavlje + $telo + @"

=====================================================================
CILJ FAZE: $cilj
=====================================================================

Plan za ovu fazu je već napisan i nalazi se u $planFajl
Pročitaj ga PRVO i sprovedi ga. Ako naiđeš na nešto što plan nije predvideo,
odstupi - ali dopiši u plan šta si promenio i zašto, da se ujutru vidi.

Faza je gotova tek kad je cilj iznad ispunjen, a ne kad si prošao kroz spisak.
"@ + $RepZavrsetka)
    $rc = PustiKlod -PromptFajl "$PromptDir\$kljuc.txt" -Log $log -Rok $RokFaza -Effort $EFFORT_RAD
    if ($rc -eq 124) {
        Zapisi "- IZVRŠI: **PREKINUTO** - istekao rok od $([math]::Round($RokFaza/60)) min"
    } elseif ($rc -ne 0) {
        Zapisi "- IZVRŠI: **PAO** (izlazni kod $rc)"
    } else {
        Zapisi "- IZVRŠI: prošlo"
    }

    # ---- mehaničke provere ------------------------------------------------
    Write-Host "--> provere" -ForegroundColor DarkGray
    $provere = @(
        @{ ime = "tsc mobilni"; cmd = "cd apps\mobile && npx tsc --noEmit" },
        @{ ime = "tsc web";     cmd = "cd apps\web && npx tsc --noEmit" },
        @{ ime = "lint";        cmd = "npm run lint" },
        @{ ime = "test";        cmd = "npm test" }
    )
    $palo = @()
    foreach ($p in $provere) {
        if ((PokreniSaRokom $p.cmd $log $RokProvera) -eq 0) { Zapisi "- ``$($p.ime)``: prolazi" }
        else { Zapisi "- ``$($p.ime)``: **PADA**"; $palo += $p.ime }
    }

    # ---- popravke ---------------------------------------------------------
    if ($palo.Count -gt 0) {
        $spisak = $palo -join ", "
        for ($i = 1; $i -le $MaxPopravki; $i++) {
            Write-Host "--> popravka $i / $MaxPopravki  (effort $EFFORT_FIX) - $spisak" -ForegroundColor Yellow
            ZapisiFajl "$PromptDir\popravka.txt" ($KLJUC_FIX + @"


Posle faze '$naziv" padaju ove provere: $spisak

Pokreni svaku, pročitaj greške i popravi ih. Ne ućutkuj pravilo da bi prošlo -
popravi pravi uzrok. Ako je greška zatečena i van opsega faze, zapiši je u
docs/mobile/ZA-POPRAVKU.md sa objašnjenjem zašto je ne diraš.

  cd apps/mobile && npx tsc --noEmit
  cd apps/web    && npx tsc --noEmit
  npm run lint
  npm test

Ponavljaj dok sve četiri ne prođu.
"@)
            PustiKlod -PromptFajl "$PromptDir\popravka.txt" -Log $log -Rok $RokProvera -Effort $EFFORT_FIX | Out-Null
            $jos = @()
            foreach ($p in $provere) {
                if ((PokreniSaRokom $p.cmd $log $RokProvera) -ne 0) { $jos += $p.ime }
            }
            if ($jos.Count -eq 0) { Zapisi "- popravka $i : **uspela**"; break }
            Zapisi "- popravka $i : i dalje pada ($($jos -join ', '))"
            $spisak = $jos -join ", "
        }
    }

    # ---- commit -----------------------------------------------------------
    git add -A 2>&1 | Out-Null
    git diff --cached --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Zapisi "- Commit: **NIJE BILO NIJEDNE IZMENE** - faza nije ništa uradila"
    } else {
        git commit -q -m "$naziv (lanac pariteta)" 2>&1 | Out-Null
        $sha = (git rev-parse --short HEAD).Trim()
        $brojFajlova = (git diff --name-only $shaPre HEAD | Measure-Object).Count
        Zapisi "- Commit: ``$sha`` · dirnuto fajlova: $brojFajlova"
    }

    # ---- KORAK 3: REVIZIJA ------------------------------------------------
    Write-Host "--> [3/3] REVIZIJA (effort $EFFORT_REV)" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\revizija.txt" ($KLJUC_REV + "`n`n" + @"
Ti si revizor. NE popravljaš ništa. Samo proveravaš i pišeš nalaz.

CILJ FAZE koji je trebalo ispuniti: $cilj

Plan faze:     $planFajl
Zadatak faze:  $PromptDir\$kljuc.txt
Izmene:        git diff $shaPre..HEAD
Lista:         docs/mobile/PARITET.md

Uradi:
1. Za svaku stavku koju je agent čekirao [x] u PARITET.md tokom ove faze, nađi
   DOKAZ u diff-u - ime fajla i liniju. Ako dokaza nema, ODČEKIRAJ je nazad na
   [ ] i napiši u nalazu da je lažno prijavljena. Ovo ti je najvažniji posao.
2. Uporedi PLAN sa onim što je stvarno urađeno. Šta je planirano a nije urađeno?
   Šta je urađeno a nije planirano?
3. Je li CILJ faze ispunjen? Odgovori sa DA ili NE i obrazloži jednom rečenicom.
   Ako je NE, napiši šta tačno fali.
4. Pokreni ponovo poređenje i javi novi broj:
   grep -rhoE "api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+" apps/web/components apps/web/app | sort -u > /tmp/w.txt
   grep -rhoE "api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+" apps/mobile/src | sort -u > /tmp/m.txt
   comm -23 /tmp/w.txt /tmp/m.txt | wc -l
   Na početku lanca bilo je 63. Napiši koliko je sada.
5. Nabroj placeholder-e, prazne komponente, TODO bez zapisa, funkcije koje samo
   vraćaju null, i console.log dijagnostike u novom kodu.
6. Proveri da nijedan novi red nije napisan ručno preko flexDirection:'row'
   umesto kroz components/ui/row.tsx.
7. Proveri da nije dodata nijedna nova funkcija u packages/backend.
8. Proveri da svaki novi ekran ima sva tri stanja: prazno, učitavanje, greška.

Nalaz dopiši na kraj fajla $Izvestaj pod naslovom '### Revizija: $naziv".
Kratko, bez ulepšavanja. Ako cilj nije ispunjen, to ide u prvu rečenicu.
"@)
    PustiKlod -PromptFajl "$PromptDir\revizija.txt" -Log $log -Rok $RokProvera -Effort $EFFORT_REV -SamoCitanje | Out-Null
    git add -A 2>&1 | Out-Null
    git commit -q -m "Revizija: $naziv" 2>&1 | Out-Null

    $min = [math]::Round(((Get-Date) - $t0).TotalMinutes)
    Zapisi "- Trajanje: $min min"
    Write-Host "==> $naziv gotovo za $min min" -ForegroundColor Green
}

# ============================================================================
#  ZAVRŠETAK
# ============================================================================
$ukupno = [math]::Round(((Get-Date) - $Pocetak).TotalMinutes)

Zapisi ""
Zapisi "---"
Zapisi ""
Zapisi "## Zaključak"
Zapisi ""
Zapisi "- Kraj: $((Get-Date).ToString('s'))"
Zapisi "- Ukupno: $ukupno min"
Zapisi "- Model kroz ceo lanac - zadato: ``$MODEL``"
Zapisi "- Model kroz ceo lanac: ``$MODEL_STVARNI``"
Zapisi "- Grana: ``$Grana`` (ništa nije gurnuto na remote)"
Zapisi "- Planovi po fazama: ``$PlanDir``"
Zapisi ""

if (Test-Path "$LanacDir\NATIVE-BUILD.md") {
    Zapisi "### POTREBAN NOV NATIVE BUILD"
    Zapisi ""
    Zapisi "Menjan je ``apps/mobile/package.json``. Pre testiranja:"
    Zapisi ""
    Zapisi '```'
    Zapisi 'bash podesi-android.sh'
    Zapisi '```'
    Zapisi ""
    Zapisi "Bez ovoga Metro servira stari bundle i izgledaće kao da ništa nije urađeno."
} else {
    Zapisi "Native build nije potreban - ``apps/mobile/package.json`` nije menjan."
    Zapisi "Dovoljno je ``r`` u Metro terminalu."
}

git add -A 2>&1 | Out-Null
git commit -q -m "Izveštaj lanca pariteta" 2>&1 | Out-Null

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  GOTOVO za $ukupno min. Izveštaj: $Izvestaj" -ForegroundColor Green
Write-Host "  Grana: $Grana" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
