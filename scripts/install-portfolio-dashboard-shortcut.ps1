$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$iconPath = Join-Path $projectRoot "assets\huiye-desktop-icon-v2.ico"
$launcherPath = Join-Path $projectRoot "scripts\start-portfolio-dashboard.ps1"
$configPath = Join-Path $projectRoot "local-data\portfolio-dashboard-admin.json"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutName = -join @([char]0x56DE, [char]0x9875, ' ', [char]0x00B7, ' ', [char]0x8BBF, [char]0x95EE, [char]0x770B, [char]0x677F, '.lnk')
$shortcutPath = Join-Path $desktop $shortcutName

if (!(Test-Path -LiteralPath $configPath)) {
  $tokenBytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $random.GetBytes($tokenBytes)
  $random.Dispose()
  $token = [Convert]::ToBase64String($tokenBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  New-Item -ItemType Directory -Force -Path (Split-Path $configPath) | Out-Null
  @{ siteOrigin = "https://huiye-ai-diary.zhenghengchen13.chatgpt.site"; token = $token; port = 4321 } |
    ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Huiye portfolio visit dashboard"
$shortcut.Save()
Write-Output $shortcutPath
