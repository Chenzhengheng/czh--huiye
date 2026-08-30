param(
  [switch]$NoBrowser,
  [ValidateRange(1024, 65535)]
  [int]$Port = 4317,
  [ValidatePattern('^/app(?:/context)?$')]
  [string]$AppPath = "/app"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$url = "http://localhost:$Port$AppPath"
$apiUrl = "http://localhost:$Port/api/data"
$runtimeDir = Join-Path $projectRoot "local-data\runtime"
$pidFile = Join-Path $runtimeDir "server.pid"

function Find-NodeExecutable {
  $bundled = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path -LiteralPath $bundled) { return $bundled }
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw "Node.js was not found. Run Huiye from Codex or install Node.js 22+."
}

function Read-LocalStatus {
  try {
    $status = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 2
    $page = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing -TimeoutSec 5
    if ($page.StatusCode -ne 200) { return $null }
    return $status
  } catch {
    return $null
  }
}

try {
  Set-Location -LiteralPath $projectRoot
  $node = Find-NodeExecutable
  $cli = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
  if (!(Test-Path -LiteralPath $cli)) {
    $ancestorCli = Join-Path (Resolve-Path (Join-Path $projectRoot "..\..\..")).Path "node_modules\vinext\dist\cli.js"
    if (Test-Path -LiteralPath $ancestorCli) { $cli = $ancestorCli }
  }
  $verify = Join-Path $projectRoot "scripts\verify-local-data.mjs"
  if (!(Test-Path -LiteralPath $cli)) { throw "Project dependencies are incomplete: vinext is missing." }

  Write-Host "[Huiye] Verifying local diary data..." -ForegroundColor Cyan
  $verificationText = & $node $verify 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local data verification failed: $verificationText" }
  $verification = ($verificationText -join "`n") | ConvertFrom-Json
  Write-Host "[Huiye] Data is valid: $($verification.entries) entries, $($verification.uniqueEntryIds) unique IDs." -ForegroundColor Green

  $existing = Read-LocalStatus
  if ($existing -and $existing.storageKind -eq "local-folder") {
    Write-Host "[Huiye] Local server is already running with $(@($existing.data.entries).Count) entries." -ForegroundColor Green
    if (!$NoBrowser) { Start-Process $url }
    exit 0
  }

  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $node
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.Arguments = ('"{0}" dev --host 127.0.0.1 --port {1}' -f $cli, $Port)
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (!$process.Start()) { throw "The local server process could not start." }
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII

  Write-Host "[Huiye] Starting the local app..." -ForegroundColor Cyan
  $status = $null
  for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
    if ($process.HasExited) { throw "The local server exited early with code $($process.ExitCode)." }
    $status = Read-LocalStatus
    if ($status -and $status.storageKind -eq "local-folder") { break }
    Start-Sleep -Milliseconds 500
  }

  if (!$status -or $status.storageKind -ne "local-folder") {
    throw "The local server did not become ready within 60 seconds."
  }
  $entryCount = @($status.data.entries).Count
  if ($entryCount -ne $verification.entries) {
    throw "Entry count mismatch: disk has $($verification.entries), API has $entryCount."
  }

  Write-Host "[Huiye] Ready: $url ($entryCount entries)" -ForegroundColor Green
  if (!$NoBrowser) { Start-Process $url }
  exit 0
} catch {
  Write-Host "[Huiye] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
