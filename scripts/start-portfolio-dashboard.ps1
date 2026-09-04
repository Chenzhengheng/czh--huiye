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
  @{ port = 4321; sources = @{ overseas = @{ origin = "https://huiye-ai-diary.zhenghengchen13.chatgpt.site"; token = $token; proxy = "http://127.0.0.1:12000" }; mainland = @{ origin = "https://huiye-ai.cn"; token = $token; proxy = "" } } } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding UTF8
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if (!$config.PSObject.Properties["sources"]) {
  Add-Type -AssemblyName System.Security
  $tokenBytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $random.GetBytes($tokenBytes)
  $random.Dispose()
  $mainlandToken = [Convert]::ToBase64String($tokenBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  $overseasProxy = if ($config.PSObject.Properties["proxy"]) { $config.proxy } else { "http://127.0.0.1:12000" }
  $migrated = @{ port = [int]$config.port; sources = @{ overseas = @{ origin = $config.siteOrigin; token = $config.token; proxy = $overseasProxy }; mainland = @{ origin = "https://huiye-ai.cn"; token = $mainlandToken; proxy = "" } } }
  $migrated | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding UTF8
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
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
