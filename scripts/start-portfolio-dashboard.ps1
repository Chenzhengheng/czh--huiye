$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$configPath = Join-Path $projectRoot "local-data\portfolio-dashboard-admin.json"
$serverPath = Join-Path $projectRoot "scripts\portfolio-dashboard-server.mjs"

if (!(Test-Path -LiteralPath $configPath)) {
  Add-Type -AssemblyName System.Security
  $tokenBytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $random.GetBytes($tokenBytes)
  $random.Dispose()
  $token = [Convert]::ToBase64String($tokenBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  New-Item -ItemType Directory -Force -Path (Split-Path $configPath) | Out-Null
  @{ siteOrigin = "https://huiye-ai-diary.zhenghengchen13.chatgpt.site"; token = $token; port = 4321; proxy = "http://127.0.0.1:12000" } |
    ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if (!$config.PSObject.Properties["proxy"]) {
  $config | Add-Member -NotePropertyName proxy -NotePropertyValue "http://127.0.0.1:12000"
  $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
}
$port = [int]$config.port
$dashboardUrl = "http://127.0.0.1:$port"
$bundledNode = "C:\Users\chenzhengheng123\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }

$existing = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (!$existing) {
  Start-Process -FilePath $nodePath -ArgumentList @($serverPath) -WorkingDirectory $projectRoot -WindowStyle Hidden
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 150
    try { Invoke-WebRequest -UseBasicParsing -Uri $dashboardUrl -TimeoutSec 1 | Out-Null; break } catch {}
  }
}
Start-Process $dashboardUrl
