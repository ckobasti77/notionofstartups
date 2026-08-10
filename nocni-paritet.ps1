# ============================================================================
#  DEVOTION - NOCNI LANAC PARITETA (preostale 4 faze)
#
#  Stanje na pocetku: razlika pariteta 35 (bilo 63).
#  Faze: 4 Zadaci+Stranica -> 5 Vracanje obrisanog -> 6 Nula gresaka -> 7 Runtime
#
#  Pokretanje:
#      powershell -ExecutionPolicy Bypass -File .\nocni-paritet.ps1
#
#  Ujutru: docs\mobile\lanac3\IZVESTAJ.md
# ============================================================================

param(
    # Jak model - faze gde se donose odluke (5 vracanje obrisanog, 7 runtime).
    # NAPOMENA: Opus 4.8 NE postoji na ovom nalogu; /model nudi Opus 5, Fable 5,
    # Sonnet 5, Haiku 4.5. Ako se 4.8 ikad pojavi, upisi ovde njegov pun ID.
    [string]$Jak = "fable",

    # Slabiji model - faze gde je uzor pred nosom i nema arhitekture (4, 6).
    [string]$Slab = "sonnet",

    # Preskoci faze pre ove. Kljucevi: faza-4, faza-5, faza-6, faza-7
    [string]$Od = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Grana       = "paritet-nocni-" + (Get-Date -Format "yyyyMMdd-HHmm")
$LanacDir    = "docs\mobile\lanac3"
$LogDir      = "$LanacDir\logovi"
$PromptDir   = "$LanacDir\promptovi"
$PlanDir     = "$LanacDir\planovi"
$Izvestaj    = "$LanacDir\IZVESTAJ.md"
$RokPlan     = 3600
$RokFaza     = 14400
$RokProvera  = 2700
$MaxPopravki = 3

if (-not (Test-Path "convex.json") -or -not (Test-Path "apps\mobile")) {
    Write-Host "GRESKA: pokreni iz root-a repoa." -ForegroundColor Red; exit 1
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "GRESKA: 'claude' nije na PATH-u." -ForegroundColor Red; exit 1
}
if (-not (Test-Path "docs\mobile\PARITET.md")) {
    Write-Host "GRESKA: nema docs\mobile\PARITET.md." -ForegroundColor Red; exit 1
}

New-Item -ItemType Directory -Force -Path $LogDir, $PromptDir, $PlanDir | Out-Null
Remove-Item "$LogDir\*" -Force -ErrorAction SilentlyContinue

$Pomoc = (& claude --help 2>&1 | Out-String)
if ($Pomoc -match "--permission-mode") { $FLAG_PERM = "--permission-mode bypassPermissions" }
else                                   { $FLAG_PERM = "--dangerously-skip-permissions" }
$FLAG_EFFORT = $null
foreach ($k in @("--effort","--reasoning-effort","--thinking-effort")) {
    if ($Pomoc -match [regex]::Escape($k)) { $FLAG_EFFORT = $k; break }
}

function Zapisi([string]$t) { Add-Content -Path $Izvestaj -Value $t -Encoding UTF8 }

function ZapisiFajl([string]$putanja, [string]$sadrzaj) {
    [System.IO.File]::WriteAllText((Join-Path (Get-Location).Path $putanja), $sadrzaj,
        (New-Object System.Text.UTF8Encoding($false)))
}

function Razlika() {
    $r = & bash -c "grep -rhoE 'api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+' apps/web/components apps/web/app 2>/dev/null | sort -u > /tmp/w.txt; grep -rhoE 'api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+' apps/mobile/src 2>/dev/null | sort -u > /tmp/m.txt; comm -23 /tmp/w.txt /tmp/m.txt | wc -l" 2>$null
    if ($r) { return ($r | Select-Object -Last 1).ToString().Trim() }
    return "?"
}

function PustiKlod {
    param([string]$PromptFajl, [string]$Log, [int]$Rok, [string]$ModelKorak, [string]$Effort)
    if (-not $Effort)     { throw "PustiKlod bez effort-a." }
    if (-not $ModelKorak) { throw "PustiKlod bez modela." }

    $lista = @("-p", "--model", $ModelKorak)
    if ($FLAG_EFFORT) { $lista += @($FLAG_EFFORT, $Effort) }
    $lista += ($FLAG_PERM -split ' ')
    Write-Host "      [model $ModelKorak | effort $Effort]" -ForegroundColor DarkGray

    $spojeni = $lista -join "`t"
    $job = Start-Job -ScriptBlock {
        param($pf, $lg, $wd, $sp)
        Set-Location $wd
        $al = $sp -split "`t"
        (Get-Content -LiteralPath $pf -Raw) | & claude @al 2>&1 |
            Out-File -FilePath $lg -Append -Encoding UTF8
        if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    } -ArgumentList $PromptFajl, $Log, (Get-Location).Path, $spojeni

    $gotov = Wait-Job $job -Timeout $Rok
    if (-not $gotov) {
        Write-Host "    !! istekao rok, prekidam" -ForegroundColor Yellow
        Stop-Job $job; Remove-Job $job -Force; return 124
    }
    $rc = Receive-Job $job; Remove-Job $job -Force
    if ($rc -is [array]) { $rc = $rc[-1] }

    $vel = 0
    if (Test-Path $Log) { $vel = (Get-Item $Log).Length }
    if ($vel -eq 0) {
        Write-Host "    !! UPOZORENJE: log je prazan" -ForegroundColor Red
        return 125
    }
    $rep = Get-Content -LiteralPath $Log -Raw -ErrorAction SilentlyContinue
    if ($rep -match "hit your weekly limit|usage limit|rate limit|Claude usage limit reached") {
        Write-Host ""
        Write-Host "PREKID: dostignut limit potrosnje." -ForegroundColor Red
        Write-Host "Napredak je sacuvan u commit-ovima i u PARITET.md." -ForegroundColor Yellow
        Write-Host "Kad se limit obnovi:  .\nocni-paritet.ps1 -Od <faza-koja-nije-gotova>" -ForegroundColor Yellow
        Zapisi ""
        Zapisi "> **PREKINUTO: dostignut limit potrosnje.** Nastavi sa ``-Od``."
        git add -A 2>&1 | Out-Null
        git commit -q -m "Lanac prekinut: limit potrosnje" 2>&1 | Out-Null
        exit 1
    }
    if ($rep -match "unknown option|unknown argument|error: unknown") {
        Write-Host ""
        Write-Host "PREKID: claude odbija argumente: claude $($lista -join ' ')" -ForegroundColor Red
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
    $d = Wait-Job $job -Timeout $Rok
    if (-not $d) { Stop-Job $job; Remove-Job $job -Force; return 124 }
    $rc = Receive-Job $job; Remove-Job $job -Force
    if ($rc -is [array]) { $rc = $rc[-1] }
    if ($null -eq $rc) { return 0 }
    return [int]$rc
}

$Zaglavlje = @"
Devotion monorepo: apps/web (Next.js), apps/mobile (Expo/React Native),
packages/backend (Convex). Sve na srpskom. Nenadzirano izvrsavanje - ne pitaj,
odlucuj i radi.

PROCITAJ PRVO:
  docs/mobile/PARITET.md      <- lista i memorija, cekiraj [x] u istom commit-u
  docs/mobile/ZA-POPRAVKU.md  <- naucene zamke, ne ponavljaj ih
  docs/mobile/00-PLAN.md      <- arhitektura, protokol WebView mosta

PRAVILA U SVAKOJ FAZI:
- Paritet je FUNKCIONALNI, ne vizuelni. Ne prekopavaj web layout - pitaj se kako
  se isti ishod postize prstom na malom ekranu. Tabela prevoda je u PARITET.md.
- Backend NE menjaj. Sve funkcije vec postoje. Ako ti nesto fali, stani i zapisi
  u docs/mobile/ZA-POPRAVKU.md umesto da izmisljas.
- Svaki novi red kroz apps/mobile/src/components/ui/row.tsx.
- Tekst min 16px osim meta. Dodirna meta min 44pt. Safe area. busy lock.
- Prazno, ucitavanje i greska - sva tri stanja na svakom novom ekranu.
- Uz svaki cekiran kvadratic napisi fajl i liniju kao dokaz.
- Ako menjas apps/mobile/package.json, zapisi u docs/mobile/lanac3/NATIVE-BUILD.md.

"@

$Kraj = @"

NA KRAJU FAZE, ovim redom:
  cd apps/mobile && npx tsc --noEmit
  cd apps/web    && npx tsc --noEmit
  npm run lint
  npm test
Popravi sve sto padne. Ne ostavljaj gresku sledecoj fazi.
"@

$Faze = @(
    @{
        k = "faza-4"; effort = "xhigh"; model = $Slab
        n = "Faza 4 - Zadaci i stranica"
        cilj = "Vidis sve zadatke startupa sa filterima, stranicu mozes arhivirati, i uvek znas gde si u stablu."
        telo = @"
FAZA 4 - ZADACI I STRANICA (sekcije A3 i A5 u PARITET.md)

Razlika pariteta je sada 35. Posle ove faze mora da padne na oko 28.

A3: mobilni danas.tsx vidi samo MOJE zadatke za danas (tasks.commandCenter).
Web ima pregled svih zadataka startupa (tasks.listForStartup) sa filterima i
tabelom. Na telefonu tabela sa mnogo kolona nema smisla - napravi listu kartica
gde je svaki red zadatak, a kolone postaju meta-podaci u redu. Filteri idu u
sheet, ne u traku. Grupisanje po statusu sa brojem u zaglavlju grupe. Izmena
statusa i prioriteta direktno iz liste kroz areasV2.updatePage.

A5: page-actions-sheet.tsx vec ima premestanje, ugnjezdavanje, izdvajanje i
povezivanje. Fali:
- areasV2.archivePage - arhiviranje stranice
- pages.getBreadcrumbs - putanja do korena u zaglavlju
- pages.addEntry - dodavanje unosa u stranicu
- areasV2.createPage - mobilni koristi pages.create; proveri da li se ponasaju
  isto i ujednaci
- pageFiles.prune - ciscenje nevezanih priloga

Breadcrumbs su vazniji nego sto izgledaju: na telefonu se posle tri nivoa
ugnjezdavanja izgubis jer nemas sidebar koji ti pokazuje gde si.

Uradi sve necekirane stavke iz A3 i A5.
"@
    },
    @{
        k = "faza-5"; effort = "xhigh"; model = $Jak
        n = "Faza 5 - Ideje, vracanje obrisanog, chat"
        cilj = "Nista se ne gubi zauvek: svaka arhivirana stvar se moze vratiti, na svakom ekranu, istim obrascem."
        telo = @"
FAZA 5 - IDEJE, VRACANJE OBRISANOG, CHAT (sekcije A4, A6, A7, A8)

Razlika pariteta posle prethodne faze je oko 28. Posle ove mora oko 12.

A6 je najvazniji deo i sistemska je rupa: mobilni ume da arhivira na vise mesta,
a NIGDE ne ume da vrati. Korisnik koji pogresi nema izlaz.
Napravi JEDAN ujednacen obrazac - posle arhiviranja traka "Ponisti" koja stoji
nekoliko sekundi - i primeni ga na sva mesta iz A6:
ideas.restoreOwn, taskCheckpoints.restoreOwn, collaboration.restoreOwnContribution.
(thoughts.restoreNodes/restoreEdges su vec uradjeni u A1 - proveri i cekiraj.)

A4: ideas.convertToPage, collaboration.requestNesting + detachIdea,
    ideas.connect / disconnect / updateEdgeLabel, ideas.restoreOwn,
    ideas.updateLayout / resetLayoutSize / updatePositions / saveViewport
    (poslednje idu kroz WebView - proveri da rade, ne pisi ih ponovo).

A7: chat.archiveChannel. Za notifications.latest sam odluci da li ima smisla kad
    vec postoji ceo ekran obavestenja - ako nema, u sekciju Z sa razlogom.

A8: checkpointi na kanvasu (saveCanvasPlacement, resetCanvasSize,
    taskCheckpointCanvasEdges.connect/disconnect). Ako procenis da to ima smisla
    samo na velikom ekranu, u sekciju Z sa razlogom - ne pravi neupotrebljivo.

Uradi sve necekirane stavke iz A4, A6, A7, A8.
"@
    },
    @{
        k = "faza-6"; effort = "high";  model = $Slab
        n = "Faza 6 - Nula gresaka"
        cilj = "tsc, lint, build i testovi prolaze bez ijedne greske i bez ijednog upozorenja."
        telo = @"
FAZA 6 - NULA GRESAKA (sekcija B u PARITET.md)

Ova faza ne dodaje funkcionalnost. Cilj je da lista B bude sva cekirana.

Redom:
1. cd apps/mobile && npx tsc --noEmit   -> nula
2. cd apps/web    && npx tsc --noEmit   -> nula
3. npm run lint                          -> nula gresaka I nula upozorenja
4. npm run build                         -> prolazi
5. npm test                              -> svi prolaze
6. Pretrazi apps/mobile/src i apps/web za:
   - console.log koji je ostao od dijagnostike
   - TODO / FIXME bez zapisa u ZA-POPRAVKU.md
   - komponente koje vracaju null kao placeholder
   - funkcije koje su prazne ili samo hvataju gresku i cute
7. Pokreni agente iz .claude/agents: rn-review, web-review, parity-check.
   Popravi sve sto nadju.

Ne ucutkuj lint pravilo da bi proslo - popravi pravi uzrok. Ako je greska
zatecena i van opsega, zapisi je u ZA-POPRAVKU.md sa razlogom.
"@
    },
    @{
        k = "faza-7"; effort = "max";   model = $Jak
        n = "Faza 7 - Runtime i responzivnost"
        cilj = "Cela lista C prodjena na ekranu, na malom i velikom telefonu, bez ijedne greske u konzoli."
        telo = @"
FAZA 7 - RUNTIME I RESPONZIVNOST (sekcije C i D u PARITET.md)

Ovo je jedina faza u kojoj gledas ekran, ne kod. Imas computer use.
Android emulator je otvoren, aplikacija radi. Web je na http://localhost:3000.
Oba gadjaju istu dev bazu.

Radi listu C stavku po stavku. Za svaku: uradi je na emulatoru, pa istu na webu,
pa uporedi ishod u bazi. Screenshot je dokaz - bez njega ne cekiraj.

Alat koji moras da koristis: chrome://inspect/#devices na hostu daje pun DevTools
nad WebView-om iz emulatora (kanvas i editor beleske su WebView-ovi). Tamo vidis
pravu konzolu i mrezu umesto da pogadjas.

Pratis sve vreme:
- Metro konzolu - nijedna crvena greska, nijedno upozorenje koje se ponavlja
- Convex dashboard logove - nijedan Server Error

Zatim lista D: promeni velicinu emulatora na 360x640 i na 430x932 i prodji kroz
sve ekrane. Tastatura, skrol u sheet-ovima, duga imena, prazna stanja,
ucitavanje, greske.

Sve sto nadjes popravi odmah, pa ponovo proveri na ekranu. Sto ne stignes - u
ZA-POPRAVKU.md, iskreno, sa razlogom.
"@
    }
)

if ($Od) {
    $kljucevi = @($Faze | ForEach-Object { $_.k })
    $idx = [array]::IndexOf($kljucevi, $Od)
    if ($idx -lt 0) {
        Write-Host "GRESKA: -Od '$Od' nije poznata faza. Dozvoljeno: $($kljucevi -join ', ')" -ForegroundColor Red
        exit 1
    }
    if ($idx -gt 0) { $Faze = $Faze[$idx..($Faze.Count - 1)] }
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  NOCNI LANAC PARITETA" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Jak model:      $Jak   (faze 5 i 7)"
Write-Host "  Slab model:     $Slab (faze 4 i 6)"
if ($FLAG_EFFORT) { Write-Host "  Effort:         preko flag-a $FLAG_EFFORT" -ForegroundColor Green }
else              { Write-Host "  Effort:         kljucnom reci 'ultrathink' u promptu" -ForegroundColor Yellow }
Write-Host "  Rezim:          $FLAG_PERM"
Write-Host "  Grana:          $Grana"
Write-Host "  Faza za rad:    $($Faze.Count)"
Write-Host "  Razlika sada:   $(Razlika)   (na pocetku bilo 63)"
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

git checkout -b $Grana 2>&1 | Select-Object -Last 1
$Pocetak = Get-Date
$RazlikaStart = Razlika

ZapisiFajl $Izvestaj @"
# Nocni lanac pariteta - izvestaj

| Stavka | Vrednost |
|---|---|
| Jak model (faze 5, 7) | ``$Jak`` |
| Slab model (faze 4, 6) | ``$Slab`` |
| Effort po fazi | 4: ``xhigh`` - 5: ``xhigh`` - 6: ``high`` - 7: ``max`` |
| Effort PLAN i REVIZIJA | ``max`` |
| Rezim | ``$FLAG_PERM`` |
| Grana | ``$Grana`` |
| Pocetak | $($Pocetak.ToString("s")) |
| Razlika pariteta na startu | **$RazlikaStart** (na pocetku svega bilo 63) |

Svaka faza ide u tri koraka sa svezim kontekstom:
**PLAN** (ne menja kod) -> **IZVRSI** -> **REVIZIJA** (trazi dokaz u diff-u).

> Ovo pise skripta, ne agent. "PAO" znaci da je stvarno palo.

---

"@

foreach ($f in $Faze) {
    $kljuc = $f.k; $naziv = $f.n; $cilj = $f.cilj; $telo = $f.telo; $eff = $f.effort; $Model = $f.model
    $log = "$LogDir\$kljuc.log"
    $planFajl = "$PlanDir\$kljuc.md"
    $t0 = Get-Date

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host "==> $naziv   ($(Get-Date -Format 'HH:mm'))" -ForegroundColor Cyan
    Write-Host "    CILJ: $cilj" -ForegroundColor White
    Write-Host "======================================================================" -ForegroundColor Cyan

    Zapisi ""
    Zapisi "## $naziv"
    Zapisi ""
    Zapisi "**Cilj:** $cilj"
    Zapisi ""
    Zapisi "| Korak | Model | Effort |"
    Zapisi "|---|---|---|"
    Zapisi "| PLAN | ``$Model`` | ``max`` |"
    Zapisi "| IZVRSI | ``$Model`` | ``$eff`` |"
    Zapisi "| REVIZIJA | ``$Model`` | ``max`` |"
    Zapisi ""
    Zapisi "- Start: $((Get-Date).ToString('s'))"
    $razPre = Razlika
    Zapisi "- Razlika pariteta pre faze: **$razPre**"

    $shaPre = (git rev-parse --short HEAD).Trim()

    Write-Host "--> [1/3] PLAN" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc-plan.txt" ("ultrathink`n`n" + $Zaglavlje + $telo + @"

=====================================================================
KORAK PLANIRANJA. NE MENJAJ NIJEDAN FAJL SA KODOM.
=====================================================================
CILJ FAZE: $cilj

Napisi plan u $planFajl. Mora da sadrzi:
1. Sta si procitao i sta si zatekao - imena fajlova i linije. Ako je nesto vec
   uradjeno, reci to i izbaci iz plana.
2. Redosled izmena, jedna po jedna, sa fajlom i razlogom.
3. Za svaku: kako se na telefonu, prstom, postize isti ishod kao na webu.
4. Sta moze da pukne i sta ces uraditi ako pukne.
5. Sta NECES raditi i zasto (ide u sekciju Z fajla PARITET.md).
6. Kako ces dokazati da svaka stavka radi - konkretan test.

Kratko i konkretno. Drugi agent ce ovo sprovesti doslovno.
"@)
    PustiKlod -PromptFajl "$PromptDir\$kljuc-plan.txt" -Log $log -Rok $RokPlan -ModelKorak $Model -Effort "max" | Out-Null
    if (Test-Path $planFajl) { Zapisi "- PLAN: napisan" } else { Zapisi "- PLAN: **nije napisan**" }
    git add -A 2>&1 | Out-Null
    git commit -q -m "Plan: $naziv" 2>&1 | Out-Null

    Write-Host "--> [2/3] IZVRSI" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc.txt" ("ultrathink`n`n" + $Zaglavlje + $telo + @"

=====================================================================
CILJ FAZE: $cilj
=====================================================================
Plan je u $planFajl - procitaj ga PRVO i sprovedi. Ako odstupis, dopisi u plan
sta si promenio i zasto.

Faza je gotova tek kad je cilj ispunjen, a ne kad si prosao kroz spisak.
"@ + $Kraj)
    $rc = PustiKlod -PromptFajl "$PromptDir\$kljuc.txt" -Log $log -Rok $RokFaza -ModelKorak $Model -Effort $eff
    if ($rc -eq 124)      { Zapisi "- IZVRSI: **PREKINUTO** - istekao rok" }
    elseif ($rc -ne 0)    { Zapisi "- IZVRSI: **PAO** (kod $rc)" }
    else                  { Zapisi "- IZVRSI: proslo" }

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

    if ($palo.Count -gt 0) {
        $spisak = $palo -join ", "
        for ($i = 1; $i -le $MaxPopravki; $i++) {
            Write-Host "--> popravka $i - $spisak" -ForegroundColor Yellow
            ZapisiFajl "$PromptDir\popravka.txt" @"
think harder

Posle faze "$naziv" padaju: $spisak

Pokreni svaku, procitaj greske i popravi ih. Ne ucutkuj pravilo da bi proslo -
popravi pravi uzrok. Ako je greska zatecena i van opsega faze, zapisi je u
docs/mobile/ZA-POPRAVKU.md sa objasnjenjem.

  cd apps/mobile && npx tsc --noEmit
  cd apps/web    && npx tsc --noEmit
  npm run lint
  npm test

Ponavljaj dok sve cetiri ne prodju.
"@
            PustiKlod -PromptFajl "$PromptDir\popravka.txt" -Log $log -Rok $RokProvera -ModelKorak $Model -Effort "high" | Out-Null
            $jos = @()
            foreach ($p in $provere) { if ((PokreniSaRokom $p.cmd $log $RokProvera) -ne 0) { $jos += $p.ime } }
            if ($jos.Count -eq 0) { Zapisi "- popravka $i : **uspela**"; break }
            Zapisi "- popravka $i : i dalje pada ($($jos -join ', '))"
            $spisak = $jos -join ", "
        }
    }

    git add -A 2>&1 | Out-Null
    git diff --cached --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Zapisi "- Commit: **NIJE BILO NIJEDNE IZMENE** - faza nije nista uradila"
    } else {
        git commit -q -m "$naziv (nocni lanac pariteta)" 2>&1 | Out-Null
        $sha = (git rev-parse --short HEAD).Trim()
        $br = (git diff --name-only $shaPre HEAD | Measure-Object).Count
        Zapisi "- Commit: ``$sha`` - dirnuto fajlova: $br"
    }

    $razPosle = Razlika
    Zapisi "- Razlika pariteta posle faze: **$razPosle** (pre: $razPre)"
    Write-Host "    razlika pariteta: $razPre -> $razPosle" -ForegroundColor Green

    Write-Host "--> [3/3] REVIZIJA" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\revizija.txt" ("ultrathink`n`n" + @"
Ti si revizor. NE popravljas nista. Samo proveravas i pises nalaz.

CILJ FAZE koji je trebalo ispuniti: $cilj
Plan:     $planFajl
Zadatak:  $PromptDir\$kljuc.txt
Izmene:   git diff $shaPre..HEAD
Lista:    docs/mobile/PARITET.md

Uradi:
1. Za svaku stavku cekiranu [x] u PARITET.md tokom ove faze nadji DOKAZ u diff-u
   - fajl i liniju. Ako dokaza nema, ODCEKIRAJ nazad na [ ] i napisi da je lazno
   prijavljena. Ovo ti je najvazniji posao.
2. Uporedi PLAN sa onim sto je stvarno uradjeno. Sta je planirano a nije uradjeno?
   Sta je uradjeno a nije planirano?
3. Je li CILJ ispunjen? DA ili NE, sa jednom recenicom obrazlozenja.
4. Razlika pariteta pre faze je bila $razPre, posle $razPosle. Ako nije pala
   koliko je faza obecala, napisi zasto.
5. Nabroj placeholder-e, prazne komponente, TODO bez zapisa, funkcije koje vracaju
   null, i console.log dijagnostike u novom kodu.
6. Proveri da nijedan novi red nije pisan rucno preko flexDirection:'row'.
7. Proveri da nije dodata nijedna nova funkcija u packages/backend.
8. Proveri da svaki novi ekran ima sva tri stanja.

Nalaz dopisi na kraj fajla $Izvestaj pod naslovom "### Revizija: $naziv".
Kratko, bez ulepsavanja. Ako cilj nije ispunjen, to ide u prvu recenicu.
"@)
    PustiKlod -PromptFajl "$PromptDir\revizija.txt" -Log $log -Rok $RokProvera -ModelKorak $Model -Effort "max" | Out-Null
    git add -A 2>&1 | Out-Null
    git commit -q -m "Revizija: $naziv" 2>&1 | Out-Null

    $min = [math]::Round(((Get-Date) - $t0).TotalMinutes)
    Zapisi "- Trajanje: $min min"
    Write-Host "==> $naziv gotovo za $min min" -ForegroundColor Green
}

$ukupno = [math]::Round(((Get-Date) - $Pocetak).TotalMinutes)
$razKraj = Razlika

Zapisi ""
Zapisi "---"
Zapisi ""
Zapisi "## Zakljucak"
Zapisi ""
Zapisi "- Kraj: $((Get-Date).ToString('s'))"
Zapisi "- Ukupno: $ukupno min"
Zapisi "- Model: ``$Model``"
Zapisi "- **Razlika pariteta: $RazlikaStart -> $razKraj** (na pocetku svega bilo 63)"
Zapisi "- Grana: ``$Grana`` (nista nije gurnuto na remote)"
Zapisi ""
if (Test-Path "$LanacDir\NATIVE-BUILD.md") {
    Zapisi "### POTREBAN NOV NATIVE BUILD"
    Zapisi ""
    Zapisi "Menjan je ``apps/mobile/package.json``. Pre testiranja: ``bash podesi-android.sh``"
} else {
    Zapisi "Native build nije potreban. Dovoljno je ``r`` u Metro terminalu."
}

git add -A 2>&1 | Out-Null
git commit -q -m "Izvestaj nocnog lanca pariteta" 2>&1 | Out-Null

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  GOTOVO za $ukupno min.  Paritet: $RazlikaStart -> $razKraj" -ForegroundColor Green
Write-Host "  Izvestaj: $Izvestaj" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
