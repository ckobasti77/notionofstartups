# ============================================================================
#  DEVOTION - LANAC: UREDJIVANJE KANVASA NA TELEFONU
#
#  Stanje na pocetku: razlika pariteta 17, od cega je 10 kanvas-uredjivanje.
#  Cilj: razlika 17 -> 7. Preostalih 7 su stvarni izuzeci (web-specificni
#  mehanizmi i lazno pozitivni), oni ostaju u sekciji Z fajla PARITET.md.
#
#  ODLUKA KORISNIKA (12.08.2026):
#    - Uredjivanje ide kroz REZIM "Uredi raspored", ne uvek-ukljuceno.
#    - Svi koraci na Opus 5.
#
#  Pokretanje:
#      powershell -ExecutionPolicy Bypass -File .\kanvas-lanac.ps1
#
#  Ujutru: docs\mobile\lanac4\IZVESTAJ.md
# ============================================================================

param(
    # Model za SVE korake. "opus" je alias koji nalog razresava na Opus 5.
    # Ako hoces da nema nikakve sumnje, pusti `claude` pa /model, prepisi pun ID
    # i pokreni:  .\kanvas-lanac.ps1 -Model "<pun-id>"
    [string]$Model = "opus",

    # Preskoci faze pre ove. Kljucevi: faza-k1 ... faza-k6
    [string]$Od = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Grana       = "kanvas-lanac-" + (Get-Date -Format "yyyyMMdd-HHmm")
$LanacDir    = "docs\mobile\lanac4"
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
if (Test-Path ".git\index.lock") {
    Write-Host "Uklanjam zaostali .git\index.lock" -ForegroundColor DarkGray
    Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path $LogDir, $PromptDir, $PlanDir | Out-Null
Remove-Item "$LogDir\*" -Force -ErrorAction SilentlyContinue

git checkout -b $Grana 2>&1 | Out-Null

$Pomoc = (& claude --help 2>&1 | Out-String)
if ($Pomoc -match "--permission-mode") { $FLAG_PERM = "--permission-mode bypassPermissions" }
else                                   { $FLAG_PERM = "--dangerously-skip-permissions" }
$FLAG_EFFORT = $null
foreach ($k in @("--effort","--reasoning-effort","--thinking-effort")) {
    if ($Pomoc -match [regex]::Escape($k)) { $FLAG_EFFORT = $k; break }
}
if (-not $FLAG_EFFORT) {
    Write-Host "GRESKA: ova verzija claude CLI-ja nema zastavicu za effort." -ForegroundColor Red
    Write-Host "Lanac je trazio da effort bude uvek eksplicitan, pa necu da nagadjam." -ForegroundColor Red
    exit 1
}

function Zapisi([string]$t) { Add-Content -Path $Izvestaj -Value $t -Encoding UTF8 }

function ZapisiFajl([string]$putanja, [string]$sadrzaj) {
    [System.IO.File]::WriteAllText((Join-Path (Get-Location).Path $putanja), $sadrzaj,
        (New-Object System.Text.UTF8Encoding($false)))
}

function Razlika() {
    $r = & bash -c "grep -rhoE 'api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+' apps/web/components apps/web/app 2>/dev/null | sort -u > /tmp/w.txt; grep -rhoE 'api\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+' apps/mobile/src apps/web/app/embed 2>/dev/null | sort -u > /tmp/m.txt; comm -23 /tmp/w.txt /tmp/m.txt | wc -l" 2>$null
    if ($r) { return ($r | Select-Object -Last 1).ToString().Trim() }
    return "?"
}

function PustiKlod {
    param([string]$PromptFajl, [string]$Log, [int]$Rok, [string]$ModelKorak, [string]$Effort)
    if (-not $Effort)     { throw "PustiKlod bez effort-a." }
    if (-not $ModelKorak) { throw "PustiKlod bez modela." }

    $lista = @("-p", "--model", $ModelKorak)
    $lista += @($FLAG_EFFORT, $Effort)
    $lista += ($FLAG_PERM -split ' ')
    Write-Host "      [model $ModelKorak | effort $Effort]" -ForegroundColor DarkGray
    $spojeni = $lista -join "`t"

    # Ceka i pokusava ponovo dokle god je uzrok limit potrosnje.
    # 72 pokusaja x 20 min = do 24h cekanja. Nikad ne odustaje sam.
    for ($pokusaj = 1; $pokusaj -le 72; $pokusaj++) {

        $preRedova = 0
        if (Test-Path $Log) {
            $preRedova = @(Get-Content -LiteralPath $Log -ErrorAction SilentlyContinue).Count
        }

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
            Write-Host "    !! istekao rok, prekidam korak" -ForegroundColor Yellow
            Stop-Job $job; Remove-Job $job -Force
            return 124
        }
        $rc = Receive-Job $job; Remove-Job $job -Force
        if ($rc -is [array]) { $rc = $rc[-1] }

        $sviRedovi = @(Get-Content -LiteralPath $Log -ErrorAction SilentlyContinue)
        $novo = ($sviRedovi | Select-Object -Skip $preRedova) -join "`n"

        if ($novo -match "unknown option|unknown argument|error: unknown") {
            Write-Host ""
            Write-Host "PREKID: claude odbija argumente: claude $($lista -join ' ')" -ForegroundColor Red
            exit 1
        }

        if ($novo -match "hit your weekly limit|usage limit|rate limit|Claude usage limit reached") {
            $kad = ""
            $m = [regex]::Match($novo, "resets?\s+([^\r\n]{1,40})")
            if ($m.Success) { $kad = " (resetuje se " + $m.Groups[1].Value.Trim() + ")" }
            Write-Host ""
            Write-Host "    LIMIT u $(Get-Date -Format 'HH:mm')$kad" -ForegroundColor Yellow
            Write-Host "    Cekam 20 min pa pokusavam ISTI korak ponovo (pokusaj $pokusaj/72)." -ForegroundColor Yellow
            Zapisi "- LIMIT u $(Get-Date -Format 'HH:mm')$kad - cekam 20 min, pokusaj $pokusaj"
            git add -A 2>&1 | Out-Null
            git commit -q -m "Cekanje na limit potrosnje (pokusaj $pokusaj)" 2>&1 | Out-Null
            Start-Sleep -Seconds 1200
            continue
        }

        if ([string]::IsNullOrWhiteSpace($novo)) {
            Write-Host "    !! prazan odgovor - cekam 5 min pa ponovo (pokusaj $pokusaj/72)" -ForegroundColor Red
            Zapisi "- prazan odgovor, ponavljam (pokusaj $pokusaj)"
            Start-Sleep -Seconds 300
            continue
        }

        if ($pokusaj -gt 1) {
            Write-Host "    nastavljeno posle cekanja (pokusaj $pokusaj)" -ForegroundColor Green
            Zapisi "- nastavljeno posle cekanja u $(Get-Date -Format 'HH:mm')"
        }
        if ($null -eq $rc) { return 0 }
        return [int]$rc
    }

    Write-Host "    !! 24h cekanja i limit se nije oslobodio - odustajem od koraka" -ForegroundColor Red
    Zapisi "- **ODUSTAO** posle 24h cekanja na limit"
    return 126
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
  docs/mobile/lanac4/OSNOVA.md <- nalaz koji je pokrenuo ovaj lanac, procitaj ga

GDE SE RADI - ovo je drugacije od prethodnih lanaca:
Mobilni kanvas NIJE nativni ekran. To je WebView nad
apps/web/app/embed/canvas/[kind]/[id]/canvas-embed.tsx, koji vrti ISTI
@xyflow/react kao desktop i ima VEC autentikovan ConvexReactClient (token stize
kroz window.__DEVOTION_AUTH__). Znaci mutacije odatle rade i nista se ne
instalira. Uredjivanje je iskljuceno sa dve zastavice:
  nodesDraggable={false}
  nodesConnectable={false}

Native strana (apps/mobile/src/app/(app)/canvas/[kind]/[id].tsx i
components/canvas/canvas-rail.tsx) daje ljusku, zaglavlje i akcije, i sa
WebView-om se dogovara preko postMessage mosta.

PRAVILA U SVAKOJ FAZI:
- REZIM "Uredi raspored" je odluka korisnika i nije predmet preispitivanja.
  Kanvas je podrazumevano za gledanje: jedan prst pomera platno, dva zumiraju.
  Dugme u native rail-u pali rezim; tek u rezimu se cvorovi povlace, menja im se
  velicina i povezuju se. Izlazak iz rezima vraca gledanje. Rezim mora da se vidi
  na prvi pogled (traka ili obod), da se ne desi da neko pomera po bazi mislecu
  da lista.
- DESKTOP KANVAS NE SME DA PROMENI PONASANJE. Ako uzimas logiku iz
  apps/web/components/workspace/area-canvas-view.tsx ili ideas-canvas-view.tsx,
  izdvoji je u zajednicki modul i dokazi da desktop radi isto kao pre.
- BACKEND NE MENJAJ. Sve funkcije vec postoje. Ako ti nesto stvarno fali, stani i
  zapisi u docs/mobile/ZA-POPRAVKU.md umesto da izmisljas.
- Dodirna meta min 44pt. Ono sto je na webu 8px ruka za mis mora na telefonu da
  bude prst. Ako ne moze da se poveca, promeni interakciju - ne smanjuj prst.
- Svaka izmena koja pise u bazu mora da ima "Ponisti". Obrazac vec postoji iz
  Faze 5 prethodnog lanca - koristi njega, ne pravi drugi.
- Optimisticki potez: cvor prati prst odmah, upis u bazu ide na kraj poteza
  (onNodeDragStop), ne na svaki frejm.
- Prazno, ucitavanje i greska - sva tri stanja svuda gde ih jos nema.
- Uz svaki cekiran kvadratic napisi fajl i liniju kao dokaz.
- Ako menjas apps/mobile/package.json, zapisi u docs/mobile/lanac4/NATIVE-BUILD.md.

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
        k = "faza-k1"; effort = "max"
        n = "Faza K1 - Rezim uredjivanja i pomeranje cvorova"
        cilj = "U rezimu Uredi raspored prstom pomeras stranice po kanvasu oblasti, pozicija se pamti, i izlazak iz rezima vraca gledanje."
        telo = @"
FAZA K1 - REZIM UREDJIVANJA I POMERANJE (kanvas oblasti)

Ovo je temelj celog lanca. Sve sledece faze se kace na rezim koji ovde pravis,
pa ga uradi kako treba i zapisi njegov protokol u docs/mobile/lanac4/REZIM.md.

Sta se dobija:
- api.areasV2.movePages   - pomeranje jedne ili vise stranica
- api.areasV2.saveViewport - pamcenje pan/zoom kamere po korisniku

Posao:
1. Most: native rail dobija dugme "Uredi raspored" (i "Gotovo" kad je rezim
   upaljen). Salje WebView-u poruku {type:"mode", value:"edit"|"view"}.
   Embed slusa isti kanal na kom vec slusa {type:"auth"} i {type:"theme"} -
   iOS preko window, Android preko document. Ne izmisljaj drugi kanal.
2. U rezimu: nodesDraggable={true}, panOnDrag ostaje ali NE sme da se bije sa
   povlacenjem cvora. React Flow to resava sam kad je cvor draggable - proveri
   na emulatoru, ne veruj na rec.
3. onNodeDragStop -> movePages. Jedan upis po potezu, ne po frejmu.
4. Kamera: onMoveEnd -> saveViewport, prigusen (debounce) na oko 800ms, i SAMO
   kad je korisnik stvarno pomerio kameru - ne posle programskog fitView.
5. "Ponisti" traka posle pomeranja: vraca prethodne koordinate kroz isti
   movePages. Cuvaj prethodno stanje u memoriji, ne citaj ga ponovo iz baze.
6. Vizuelni znak rezima na WebView strani (obod ili traka), da se ne oslanja
   samo na native dugme.

Zamka koju NE smes da ponovis: swipe-back je vec iskljucen za canvas ekran
(gestureEnabled: false u (app)/_layout.tsx). Ne ukljucuj ga.

Dokaz: screenshot pre i posle pomeranja, plus red iz Convex logova da je
movePages pozvan tacno jednom po potezu.
"@
    },
    @{
        k = "faza-k2"; effort = "high"
        n = "Faza K2 - Velicina stranice"
        cilj = "U rezimu mozes prstom promeniti velicinu stranice na kanvasu i vratiti je na podrazumevanu."
        telo = @"
FAZA K2 - VELICINA (RESIZE)

Sta se dobija:
- api.areasV2.resizePage
- api.areasV2.resetPageSize

Web to radi kroz apps/web/components/workspace/canvases/perimeter-resize-control.tsx
- ruke po obodu, velicine za mis. Prstom su neupotrebljive.

Posao:
1. Kad je cvor izabran u rezimu, prikazi CETIRI ugaone ruke od min 44pt
   (vizuelno mogu biti manje, ali dodirna zona mora biti 44). Bocne ruke
   preskoci - na telefonu se ne pogadjaju.
2. Povlacenje ruke menja velicinu uzivo, upis ide na kraj poteza -> resizePage.
3. Minimalna i maksimalna velicina: uzmi ista ogranicenja koja web vec ima, ne
   izmisljaj nova. Ako su u desktop komponenti, izdvoj ih u zajednicki modul.
4. "Vrati podrazumevanu velicinu" -> resetPageSize. Mesto: dugi pritisak na cvor
   otvara native sheet sa akcijama (taj obrazac vec postoji u
   apps/mobile/src/components/canvas/), tamo dodaj stavku.
5. "Ponisti" i za velicinu.

Dokaz: screenshot pre/posle, i provera da desktop resize radi isto kao pre.
"@
    },
    @{
        k = "faza-k3"; effort = "high"
        n = "Faza K3 - Povezivanje i raskidanje veza"
        cilj = "Prstom povezujes dve stranice i raskidas vezu, bez povlacenja niti koje na telefonu ne radi."
        telo = @"
FAZA K3 - VEZE

Sta se dobija:
- api.areasV2.connectPages
- api.areasV2.disconnectPages

Web povlaci nit sa handle tackice. Tackica je nekoliko piksela - prstom je to
promasaj za promasajem. NE pokusavaj da povecas handle i zadrzis povlacenje.

Obrazac koji radi na telefonu:
1. U rezimu, u sheet-u cvora stavka "Povezi sa...".
2. Tap na nju: kanvas ulazi u stanje biranja cilja, gornja traka kaze
   "Izaberi stranicu za vezu" i ima "Otkazi". Izvor je vidno oznacen.
3. Tap na drugi cvor -> connectPages. Traka nestaje.
4. Tap na vec postojecu vezu (liniju) je takodje promasaj-materijal, pa
   raskidanje ide iz sheet-a cvora: "Veze" -> lista suseda -> brisanje reda
   svajpom ili dugmetom -> disconnectPages.
5. Ako veza vec postoji izmedju ta dva cvora, ne pravi duplikat - reci to
   korisniku i ne zovi mutaciju.
6. "Ponisti" i za vezu i za raskid.

Dokaz: napravljena i raskinuta veza, oba puta vidljiva u bazi.
"@
    },
    @{
        k = "faza-k4"; effort = "high"
        n = "Faza K4 - Checkpointi zadataka na kanvasu"
        cilj = "Checkpointi zadatka se na telefonu razmestaju i lancaju isto kao na webu."
        telo = @"
FAZA K4 - CHECKPOINTI

Sta se dobija:
- api.taskCheckpoints.saveCanvasPlacement
- api.taskCheckpoints.resetCanvasSize
- api.taskCheckpointCanvasEdges.connect
- api.taskCheckpointCanvasEdges.disconnect

Ovo je isti posao kao K1-K3, ali nad drugim tipom kanvasa. Ako si K1-K3 uradio
kako treba, ovde ponovo koristis rezim, ruke i obrazac biranja cilja - i ovde se
vidi da li si ih napravio kao zajednicke delove ili prekopirao. Ako si
prekopirao, izdvoj sada u zajednicki modul.

Vazno: sustina checkpointa - tekst, zavrsenost, lancanje, brisanje, glasanje -
vec je nativna na detalju zadatka. Ne dupliraj je na kanvasu. Kanvas dodaje samo
razmestaj i vezu.

Dokaz: checkpoint pomeren i povezan sa telefona, promena vidljiva na webu.
"@
    },
    @{
        k = "faza-k5"; effort = "high"
        n = "Faza K5 - Ideje i Misli u istom rezimu"
        cilj = "Kanvas ideja i kanvas misli imaju isti rezim uredjivanja kao kanvas oblasti."
        telo = @"
FAZA K5 - IDEJE I MISLI

Ove dve grane su blize nego oblasti: mutacije za pomeranje vec postoje i mobilni
ih ponegde vec zove (npr. thoughts.moveNodes iz misli.tsx). Ono sto fali je da se
isto radi IZ KANVASA, u rezimu, prstom.

Posao:
1. Prosiri rezim na kind = "ideas" i kind = "thoughts" u embed-u.
2. Pomeranje, velicina (gde postoji), veze i oznake veza - sve kroz vec
   postojece mutacije. Ne dodaj nijednu novu backend funkciju.
3. Proveri da list-prikaz i kanvas-prikaz pokazuju isto stanje posle izmene.

Ako za neku od ovih grana neka radnja na webu ne postoji, NE izmisljaj je -
zapisi u sekciju Z fajla PARITET.md sa razlogom.

Dokaz: po jedan potez u obe grane, sa screenshotom.
"@
    },
    @{
        k = "faza-k6"; effort = "xhigh"
        n = "Faza K6 - Zatvaranje: paritet, nula gresaka, dokumentacija"
        cilj = "Razlika pariteta je 7 i svih 7 su obrazlozeni izuzeci; tsc, lint i testovi su cisti."
        telo = @"
FAZA K6 - ZATVARANJE

1. Izmeri paritet komandom iz docs/mobile/PARITET.md. Mora da bude 7.
   Ako je vise od 7, dovrsi sta fali. Ako je manje - proveri da nisi obrisao
   nesto sa web strane da bi broj pao. To bi bila prevara, ne posao.
2. Preostalih 7 (activity.listForStartup, areasV2.getCanvas,
   areasV2.getPageCanvasByPage, areasV2.resolveRoute, notifications.latest,
   pageFiles.prune, pushSubscriptions.myDeviceCount) prepisi u sekciju Z sa
   svezim obrazlozenjem. Ako se za neki ispostavi da vise NIJE izuzetak, uradi ga.
3. Sve cetiri kapije moraju da prodju:
   cd apps/mobile && npx tsc --noEmit
   cd apps/web    && npx tsc --noEmit
   npm run lint
   npm test
   Dva zaostala lint upozorenja u packages/backend
   (findAvailableCanvasPosition, profile - nekoriscene promenljive) SMES da
   ocistis u ovoj fazi. To je jedini izuzetak od zabrane diranja backenda i
   odnosi se samo na brisanje mrtvog koda, ne na logiku.
4. Napisi docs/mobile/lanac4/BRIEF.md: sta je uradjeno po fazi, sta je ostalo,
   i sta covek mora sam da proveri na fizickom telefonu.
5. Proveri da desktop kanvas radi kao pre - to je jedina regresija koje se ovaj
   lanac stvarno plasi.
"@
    }
)

if (Test-Path $Izvestaj) { Remove-Item $Izvestaj -Force }
Zapisi "# Devotion - lanac uredjivanja kanvasa"
Zapisi ""
Zapisi "- Pocetak: $((Get-Date).ToString('s'))"
Zapisi "- Grana: ``$Grana``"
Zapisi "- Model za sve korake: ``$Model``"
Zapisi "- Zastavica za effort: ``$FLAG_EFFORT``"
Zapisi "- Rezim uredjivanja: **Uredi raspored** (odluka korisnika)"
Zapisi "- Razlika pariteta na pocetku: **$(Razlika)**  (cilj: 7)"
Zapisi ""

Write-Host ""
Write-Host "LANAC KANVASA - grana $Grana" -ForegroundColor Cyan
Write-Host "Model: $Model   Effort zastavica: $FLAG_EFFORT" -ForegroundColor Cyan
Write-Host ""

$preskoci = ($Od -ne "")

foreach ($f in $Faze) {
    $kljuc = $f.k; $naziv = $f.n; $cilj = $f.cilj; $telo = $f.telo; $eff = $f.effort

    if ($preskoci) {
        if ($kljuc -eq $Od) { $preskoci = $false }
        else { Write-Host "(preskacem $kljuc)" -ForegroundColor DarkGray; continue }
    }

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
3. Za svaku: kako se prstom, u rezimu Uredi raspored, postize isti ishod kao
   misem na webu.
4. Sta moze da pukne i sta ces uraditi ako pukne. Posebno: gde se povlacenje
   cvora bije sa pomeranjem platna.
5. Sta NECES raditi i zasto (ide u sekciju Z fajla PARITET.md).
6. Kako ces dokazati da svaka stavka radi - konkretan test, ne tvrdnja.

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
"@
            PustiKlod -PromptFajl "$PromptDir\popravka.txt" -Log $log -Rok $RokProvera -ModelKorak $Model -Effort "high" | Out-Null
            $jos = @()
            foreach ($p in $provere) {
                if ((PokreniSaRokom $p.cmd $log $RokProvera) -ne 0) { $jos += $p.ime }
            }
            if ($jos.Count -eq 0) { Zapisi "- popravka $i: sve kapije prolaze"; break }
            $spisak = $jos -join ", "
            Zapisi "- popravka $i: jos pada $spisak"
        }
    }

    git add -A 2>&1 | Out-Null
    git commit -q -m "$naziv" 2>&1 | Out-Null

    Write-Host "--> [3/3] REVIZIJA" -ForegroundColor Magenta
    ZapisiFajl "$PromptDir\$kljuc-revizija.txt" ("ultrathink`n`n" + @"
Ti si revizor, ne izvrsilac. Faza koja je upravo zavrsena:

  $naziv
  CILJ: $cilj

Pogledaj sta je stvarno promenjeno:
  git diff $shaPre..HEAD --stat
  git diff $shaPre..HEAD

Odgovori kratko i bez ulepsavanja:
1. Je li CILJ ispunjen? DA / NE / DELIMICNO - i zasto tako mislis.
2. Za svaki kvadratic cekiran u PARITET.md u ovoj fazi: postoji li stvarni dokaz
   u kodu? Navedi fajl i liniju. Ako je cekiran a koda nema, to je lazan izvestaj
   i mora se odcekirati.
3. Je li desktop kanvas ostao netaknut u ponasanju? Ovo je najveci rizik lanca.
4. Je li rezim "Uredi raspored" zaista rezim - moze li se slucajno pomeriti cvor
   dok je kanvas u gledanju?
5. Ima li dodirne mete manje od 44pt u onome sto je dodato?
6. Sta je NAJSLABIJE u ovoj fazi i sta bi sledeca morala da popravi?

Ne popravljaj kod. Rezultat upisi u $planFajl na kraj, pod naslovom "REVIZIJA".
"@)
    PustiKlod -PromptFajl "$PromptDir\$kljuc-revizija.txt" -Log $log -Rok $RokProvera -ModelKorak $Model -Effort "max" | Out-Null

    git add -A 2>&1 | Out-Null
    git commit -q -m "Revizija: $naziv" 2>&1 | Out-Null

    $razPosle = Razlika
    $trajanje = [int]((Get-Date) - $t0).TotalMinutes
    Zapisi "- Razlika pariteta posle faze: **$razPosle**"
    Zapisi "- Trajanje: $trajanje min"
    Write-Host "    gotovo za $trajanje min, razlika $razPre -> $razPosle" -ForegroundColor Green
}

Zapisi ""
Zapisi "---"
Zapisi ""
Zapisi "- Kraj: $((Get-Date).ToString('s'))"
Zapisi "- Razlika pariteta na kraju: **$(Razlika)**  (cilj je bio 7)"
Zapisi "- Grana: ``$Grana`` - nista nije gurnuto na remote."

Write-Host ""
Write-Host "LANAC ZAVRSEN. Izvestaj: $Izvestaj" -ForegroundColor Green
Write-Host "Grana: $Grana (nije gurnuta na remote)" -ForegroundColor Green
