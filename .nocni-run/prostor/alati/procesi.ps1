# Dokaz za uslov (4) iz /goal: da li radi neki dev server OVOG repoa.
# Procese drugih projekata (npr. drugi nocni run) samo prijavljuje kao tudje i NIKAD ih ne gasi.
# Pokretanje iz korena repoa:  powershell -NoProfile -ExecutionPolicy Bypass -File .nocni-run/prostor/alati/procesi.ps1
$ErrorActionPreference = 'SilentlyContinue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$rx = [regex]::Escape($repo)
$pattern = '(next|vite|convex|expo|webpack|turbo|nodemon|tsx)[^ ]*["\s]+(dev|serve|start|watch|preview)|next[\\/]dist[\\/]server|expo[\\/]bin|@expo[\\/]cli'
Write-Output "repo: $repo"
$mine = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -match $rx -and $_.CommandLine -match $pattern })
if ($mine.Count -eq 0) { Write-Output "dev procesi ovog repoa: nema" }
else { foreach ($m in $mine) { Write-Output ("dev proces OVOG repoa: PID {0} {1}" -f $m.ProcessId, $m.CommandLine) } }
$minePorts = 0
foreach ($p in 3000, 3001, 3002, 3003, 8081, 19006) {
  foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort $p)) {
    if (-not $c) { continue }
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)").CommandLine
    if ($cl -and $cl -match $rx) { $minePorts++; Write-Output ("port {0}: PID {1} je OVOG repoa - ugasi ga" -f $p, $c.OwningProcess) }
    else { Write-Output ("port {0}: PID {1} nije iz ovog repoa (tudji proces, ne diraj)" -f $p, $c.OwningProcess) }
  }
}
if (($mine.Count + $minePorts) -eq 0) { Write-Output "USLOV 4: OK - nijedan dev server ni slusalac na dev portu iz ovog repoa ne radi." }
else { Write-Output "USLOV 4: NIJE OK - ugasi gore navedene procese ovog repoa (samo njih), pa pusti ovu proveru ponovo." }
