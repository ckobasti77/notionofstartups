<#
 deploy-produkcija.ps1 - Devotion: grana licno-run -> main -> produkcija (Convex baza + Vercel web)

 Pokretanje (PowerShell, iz bilo kog foldera):
   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\admin\Desktop\Web Dev Projects\notion-clone\.nocni-run\licno\tmp\deploy-produkcija.ps1"

 Opcije:
   -Provere         pre deploy-a pusti tsc x3, eslint, vitest i build. Bez ove opcije se
                    pustaju samo ako licno-run vise nije commit 80d3d9c (njega je K22 vec proverio).
   -SkloniNocniRun  pre merge-a skini .nocni-run/ iz gita (fajlovi ostaju na disku, folder ide u .gitignore).

 Redosled: provera repoa -> (provere) -> potvrda "DA" -> merge licno-run u main (lokalno)
           -> npx convex deploy (produkcija quirky-vulture-47) -> git push origin main (Vercel gradi web).
 Ako bilo sta padne pre push-a, web na produkciji ostaje netaknut. Skripta sme da se pusti ponovo.
#>
param(
  [switch]$Provere,
  [switch]$SkloniNocniRun,
  [string]$Repo = 'C:\Users\admin\Desktop\Web Dev Projects\notion-clone'
)

$ErrorActionPreference = 'Continue'
$Grana      = 'licno-run'
$Provereno  = '80d3d9c'            # commit na kome je K22 pustio sve provere
$ConvexProd = 'quirky-vulture-47'  # produkcijski Convex; isti URL koristi i produkcijski web
$WebUrl     = 'https://notionofstartups.vercel.app'
$StariMain  = '3a797a3'

function Korak([string]$t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Stani([string]$t) { Write-Host ''; Write-Host "STOP: $t" -ForegroundColor Red; exit 1 }
function Exec([string]$opis, [scriptblock]$cmd) {
  Write-Host "> $opis" -ForegroundColor DarkGray
  & $cmd
  if ($LASTEXITCODE -ne 0) { Stani "$opis nije uspelo (izlazni kod $LASTEXITCODE)." }
}
function JePredak([string]$a, [string]$b) {
  git merge-base --is-ancestor $a $b 2>$null
  return ($LASTEXITCODE -eq 0)
}

if (-not (Test-Path -LiteralPath $Repo)) { Stani "Nema foldera $Repo" }
Set-Location -LiteralPath $Repo
if (-not (Test-Path -LiteralPath '.git')) { Stani "Nije git repo: $Repo" }

# ---------------------------------------------------------------- 1
Korak '1/5 Provera repoa'
$stanje = Join-Path '.nocni-run' (Join-Path 'licno' 'state.json')
if (Test-Path -LiteralPath $stanje) {
  $s = Get-Content -LiteralPath $stanje -Raw | ConvertFrom-Json
  if ($s.current) { Stani 'Nocni run jos radi (state.json ima current). Sacekaj da zavrsi.' }
}
$tok = (git rev-parse --abbrev-ref HEAD | Out-String).Trim()
if ($tok -ne $Grana -and $tok -ne 'main') { Stani "Trenutna grana je '$tok'. Prebaci se na $Grana (git checkout $Grana) pa pokreni ponovo." }
$izmene = git status --porcelain --untracked-files=no
if ($izmene) { $izmene | ForEach-Object { Write-Host "  $_" }; Stani 'Imas necommitovane izmene (gore). Commituj ih ili ih skloni, pa pokreni ponovo.' }

Exec 'git fetch origin' { git fetch origin }
$main   = (git rev-parse main | Out-String).Trim()
$origin = (git rev-parse origin/main | Out-String).Trim()
$glava  = (git rev-parse $Grana | Out-String).Trim()
$vecMergovano = JePredak $Grana 'main'

if ($main -ne $origin) {
  if ($vecMergovano -and (JePredak 'origin/main' 'main')) {
    Write-Host 'main je vec mergovan lokalno (prethodni pokusaj), samo jos nije pushovan - nastavljam.' -ForegroundColor Yellow
  } elseif (JePredak 'main' 'origin/main') {
    Stani 'Na origin/main ima novih commita kojih nema lokalno. Ne diram nista - javi mi (treba pravi merge).'
  } else {
    Stani 'Lokalni main i origin/main su se razisli. Ne diram nista - javi mi.'
  }
}
if (-not $vecMergovano -and -not (JePredak 'main' $Grana)) { Stani "$Grana nije napravljena na vrhu main-a. Ne diram nista - javi mi." }
Write-Host ("{0} = {1}   main = {2}   origin/main = {3}" -f $Grana, $glava.Substring(0,7), $main.Substring(0,7), $origin.Substring(0,7))

# ---------------------------------------------------------------- 2
if ($SkloniNocniRun -and -not $vecMergovano) {
  Korak '2/5 Skidam .nocni-run/ iz gita'
  if ($tok -ne $Grana) { Exec "git checkout $Grana" { git checkout -q $Grana }; $tok = $Grana }
  $prati = git ls-files -- .nocni-run
  if ($prati) {
    Exec 'git rm --cached .nocni-run' { git rm -r -q --cached -- .nocni-run }
    $gi = @()
    if (Test-Path -LiteralPath '.gitignore') { $gi = Get-Content -LiteralPath '.gitignore' }
    if (-not ($gi -contains '.nocni-run/')) {
      Add-Content -LiteralPath '.gitignore' -Value @('', '# alati nocnog runa (samo lokalno)', '.nocni-run/') -Encoding ascii
    }
    Exec 'git add .gitignore' { git add .gitignore }
    Exec 'git commit' { git commit -q -m "Skloni alate nocnog runa iz gita (.nocni-run/ ostaje lokalno)" }
  } else {
    Write-Host '.nocni-run/ vec nije u gitu.'
  }
} else {
  Korak '2/5 .nocni-run/'
  Write-Host 'Ostaje u gitu (za skidanje pokreni sa -SkloniNocniRun).'
}

# ---------------------------------------------------------------- 3
$moraProvere = $Provere -or (-not $glava.StartsWith($Provereno))
if ($moraProvere -and -not $vecMergovano) {
  Korak '3/5 Provere (tsc x3, eslint, vitest, build) - par minuta'
  if ($tok -ne $Grana) { Exec "git checkout $Grana" { git checkout -q $Grana }; $tok = $Grana }
  Exec 'tsc backend'  { npx tsc -p packages/backend/convex/tsconfig.json --noEmit }
  Exec 'tsc web'      { npx tsc -p apps/web/tsconfig.json --noEmit }
  if (Test-Path -LiteralPath '.nocni-run/licno/alati/expo-rute.cjs') { Exec 'expo rute' { node .nocni-run/licno/alati/expo-rute.cjs } }
  Exec 'tsc telefon'  { npx tsc -p apps/mobile/tsconfig.json --noEmit }
  Exec 'eslint'       { npx eslint }
  Exec 'vitest'       { npx vitest run --no-file-parallelism }
  Exec 'build'        { npm run build }
  Write-Host 'Sve provere prosle.' -ForegroundColor Green
} elseif ($vecMergovano) {
  Korak '3/5 Provere'
  Write-Host 'Preskacem: main vec sadrzi licno-run (prethodni pokusaj).'
} else {
  Korak '3/5 Provere'
  Write-Host "Preskacem: commit $Provereno je K22 vec proverio (tsc x3, eslint, vitest 1031/1031, build, codegen). Ponovo: -Provere"
}

# ---------------------------------------------------------------- 4
Korak '4/5 Potvrda'
Write-Host 'Sledece ide na PRODUKCIJU:' -ForegroundColor Yellow
Write-Host "  1. merge $Grana -> main (lokalno, jedan merge commit; fajlovi na disku se ne menjaju)"
Write-Host "  2. npx convex deploy -> $ConvexProd (2 nove tabele, 5 novih indeksa, startupId -> null u 6 tabela; bez migracija, bez novih env varijabli)"
Write-Host "  3. git push origin main -> Vercel gradi $WebUrl"
$odg = Read-Host 'Upisi DA za nastavak'
if ($odg -ne 'DA') { Stani 'Prekinuto. Na produkciji nista nije promenjeno.' }

# ---------------------------------------------------------------- 5
Korak '5/5 Deploy'
if (-not $vecMergovano) {
  # Isto kao "git merge --no-ff licno-run" (main je predak grane), ali bez prebacivanja stotina fajlova na disku.
  $staroMain = (git rev-parse main | Out-String).Trim()
  $stablo = (git rev-parse "$Grana^{tree}" | Out-String).Trim()
  $novi = (git commit-tree $stablo -p main -p $Grana -m "Merge licno-run: licni nivo Ja (Moj dan, Moji zadaci, Inbox, Poruke)" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $novi) { Stani 'Nisam uspeo da napravim merge commit. Na produkciji nista nije promenjeno.' }
  Exec 'merge licno-run -> main' { git update-ref refs/heads/main $novi $staroMain }
}
if ($tok -ne 'main') { Exec 'git checkout main' { git checkout -q main } }
$mergeCommit = (git rev-parse --short HEAD | Out-String).Trim()
Write-Host "main = $mergeCommit (lokalno, jos nije pushovan)"

Write-Host "> npx convex deploy -y   (produkcija $ConvexProd)" -ForegroundColor DarkGray
cmd /c "npx convex deploy -y 2>&1" | Tee-Object -Variable convexLog | Out-Host
$kod = $LASTEXITCODE
if ($kod -ne 0) {
  Stani "Convex deploy nije uspeo (kod $kod). main je mergovan lokalno ali NIJE pushovan - web na produkciji je netaknut. Ako trazi prijavu: npx convex login, pa pokreni skriptu ponovo."
}
if (-not (($convexLog | Out-String) -match [regex]::Escape($ConvexProd))) {
  Stani "Convex deploy je prosao, ali u izlazu ne vidim $ConvexProd. Proveri na dashboard.convex.dev gde je otisao. main NIJE pushovan - javi mi."
}
Write-Host "Convex produkcija ($ConvexProd) je azurirana." -ForegroundColor Green

Exec 'git push origin main' { git push origin main }

Korak 'GOTOVO'
Write-Host "main ($mergeCommit) je na GitHub-u; Vercel sada gradi web (obicno 2-4 min)." -ForegroundColor Green
Write-Host '  Prati build:  https://vercel.com/dashboard -> notionofstartups -> Deployments'
Write-Host "  Produkcija:   $WebUrl  (posle builda osvezi stranicu; prvi ekran je Moj dan)"
Write-Host ''
Write-Host 'Ako web ne valja:' -ForegroundColor Yellow
Write-Host '  Vercel -> Deployments -> prethodni deploy -> Instant Rollback (stari web radi i sa novim backendom).'
Write-Host "  Kod: git revert -m 1 $mergeCommit ; git push origin main"
Write-Host "  Convex se ne vraca na $StariMain kad novi podaci (licni zadaci, licni razgovori) postoje - popravka ide unapred."
try { Start-Process 'https://vercel.com/dashboard' } catch { }
