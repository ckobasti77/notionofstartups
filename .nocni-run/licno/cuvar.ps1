<#
  =====================================================================
   CUVAR za nocni run (dodatak; nocni-run.ps1 ostaje netaknut)
  ---------------------------------------------------------------------
   Windows zakazani zadatak pokrece ovaj fajl na svakih 15 min (samo dok
   si prijavljen na Windows). Ako je run pukao USRED koraka (zatvoren
   prozor, pad PowerShell-a, restart racunara posle kog si se prijavio),
   cuvar ponovo pokrece pokreni.cmd. Runner sam nastavlja od prekinutog
   koraka (status U_TOKU, ista sesija).

   Cuvar NE dira run kada:
     - postoji STOP fajl (namerno zaustavljanje),
     - state.json kaze da je run gotov (finishedAt) - tada se cuvar sam uklanja,
     - runner je stao sam, sa porukom koja trazi coveka (current = null:
       STOP, budzet, 72 h bez prijave, selftest, kit...),
     - prozor runnera je i dalje otvoren (powershell sa nocni-run.ps1 za ovaj folder).
   Ogranicenja: najvise 6 ponovnih pokretanja po runu, najmanje 15 min izmedju.

   Komande (dupli klik):
     cuvar-ukljuci.cmd       registruje zadatak "NocniRun-Cuvar-<folder>" (bez admin prava)
     cuvar-iskljuci.cmd      uklanja zadatak
     pokreni-sa-cuvarom.cmd  ukljuci cuvara + pokreni run
   Log: logs\cuvar.log    Stanje: cuvar.json

   Fajl je namerno cist ASCII (Windows PowerShell 5.1).
  =====================================================================
#>
param(
  [switch] $Install,
  [switch] $Uninstall,
  [int] $EveryMin = 15,
  [int] $MaxRestarts = 6,
  [int] $MinGapMin = 15
)

$ErrorActionPreference = "Continue"
$RunDir = $PSScriptRoot
if (-not $RunDir) { $RunDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$RunDir = [System.IO.Path]::GetFullPath($RunDir).TrimEnd('\', '/')
$Leaf = Split-Path $RunDir -Leaf
$TaskName = "NocniRun-Cuvar-$Leaf"
$LogDir = Join-Path $RunDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "cuvar.log"
$CuvarState = Join-Path $RunDir "cuvar.json"
$StateFile = Join-Path $RunDir "state.json"
$StopFile = Join-Path $RunDir "STOP"
$Launcher = Join-Path $RunDir "pokreni.cmd"

function Write-CuvarLog([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch { }
  Write-Host $line
}

# -- iskljucivanje ------------------------------------------------------------
if ($Uninstall) {
  try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-CuvarLog "cuvar iskljucen ($TaskName)"
  } catch {
    Write-CuvarLog "cuvar nije bio ukljucen ($TaskName)"
  }
  exit 0
}

# -- ukljucivanje ---------------------------------------------------------------
if ($Install) {
  $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunDir\cuvar.ps1`""
  try {
    $action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $RunDir
    $trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes($EveryMin)) -RepetitionInterval (New-TimeSpan -Minutes $EveryMin) -RepetitionDuration (New-TimeSpan -Hours 36)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $user = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Nocni run cuvar: ponovo pokrece run '$Leaf' ako pukne usred koraka" -Force -ErrorAction Stop | Out-Null
    Write-CuvarLog "cuvar UKLJUCEN: zadatak '$TaskName', provera na svakih $EveryMin min, najduze 36 h"
  } catch {
    Write-CuvarLog "GRESKA: ne mogu da registrujem zadatak: $($_.Exception.Message)"
    exit 1
  }
  try { Set-Content -LiteralPath $CuvarState -Value '{"restarts":[]}' -Encoding ASCII } catch { }
  exit 0
}

# -- provera (pokrece je Task Scheduler) ----------------------------------------
if (-not (Test-Path -LiteralPath $StateFile)) {
  Write-CuvarLog "run jos nije poceo (nema state.json) - cekam"
  exit 0
}
$state = $null
try {
  $state = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Write-CuvarLog "state.json se trenutno ne cita (verovatno se upisuje) - sledeci put"
  exit 0
}

if ($state.finishedAt) {
  Write-CuvarLog "run je GOTOV ($($state.finishedAt)) - uklanjam cuvara"
  try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch { }
  exit 0
}
if (Test-Path -LiteralPath $StopFile) {
  Write-CuvarLog "STOP fajl postoji - ne diram run"
  exit 0
}

$alive = @()
try {
  $needle = $RunDir.ToLower()
  $alive = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction Stop | Where-Object {
      $_.CommandLine -and
      ($_.CommandLine.ToLower().Contains("nocni-run.ps1")) -and
      ($_.CommandLine.ToLower().Contains($needle)) -and
      ($_.CommandLine -notmatch "SelfTestOnly|DryRun")
    })
} catch {
  Write-CuvarLog "ne mogu da procitam procese: $($_.Exception.Message)"
  exit 0
}
if ($alive.Count -gt 0) { exit 0 }

if ($null -eq $state.current) {
  Write-CuvarLog "runner ne radi, ali nije bio usred koraka (stao je sam - vidi poslednji logs\run-*.log) - ne diram"
  exit 0
}

$restarts = @()
try {
  $cs = Get-Content -LiteralPath $CuvarState -Raw | ConvertFrom-Json
  if ($cs -and $cs.restarts) { $restarts = @($cs.restarts) }
} catch { }

if ($restarts.Count -ge $MaxRestarts) {
  Write-CuvarLog "runner ne radi (korak $($state.current.id)), ali je vec $($restarts.Count) puta ponovo pokretan - odustajem"
  exit 0
}
if ($restarts.Count -gt 0) {
  try {
    $last = [datetime]::Parse([string]$restarts[$restarts.Count - 1])
    if (((Get-Date) - $last).TotalMinutes -lt $MinGapMin) {
      Write-CuvarLog "runner ne radi, ali je poslednje pokretanje bilo pre manje od $MinGapMin min - cekam"
      exit 0
    }
  } catch { }
}

Write-CuvarLog "runner NE RADI usred koraka $($state.current.id) (faza: $($state.current.phase)) - pokrecem pokreni.cmd"
try {
  Start-Process -FilePath $Launcher -WorkingDirectory $RunDir | Out-Null
  $restarts += (Get-Date).ToString("s")
  $obj = [pscustomobject]@{ restarts = @($restarts) }
  Set-Content -LiteralPath $CuvarState -Value ($obj | ConvertTo-Json -Compress) -Encoding ASCII
  Write-CuvarLog "pokrenuto ponovo (ukupno ponovnih pokretanja: $($restarts.Count))"
} catch {
  Write-CuvarLog "GRESKA pri pokretanju: $($_.Exception.Message)"
}
exit 0
