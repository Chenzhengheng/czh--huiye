$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$assetsDir = Join-Path $projectRoot "assets"
$iconPath = Join-Path $assetsDir "huiye-connected.ico"
$iconSourcePath = Join-Path $assetsDir "huiye-connected.png"
$launcherPath = Join-Path $projectRoot "scripts\start-huiye-ui.ps1"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutName = (-join ([char[]](0x56DE, 0x9875))) + " " + [char]0x00B7 + " AI Diary.lnk"
$shortcutPath = Join-Path $desktop $shortcutName

New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
if (!(Test-Path -LiteralPath $iconSourcePath)) { throw "Missing Huiye icon source: $iconSourcePath" }
Add-Type -AssemblyName System.Drawing

$sourceImage = [System.Drawing.Image]::FromFile($iconSourcePath)
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.DrawImage($sourceImage, 0, 0, 256, 256)
$pngStream = New-Object System.IO.MemoryStream
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$iconStream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$writer = New-Object System.IO.BinaryWriter $iconStream
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length)
$writer.Write([uint32]22)
$writer.Write($pngBytes)
$writer.Close()
$pngStream.Dispose()
$graphics.Dispose(); $bitmap.Dispose(); $sourceImage.Dispose()

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Huiye local-first AI Diary"
$shortcut.Save()

Write-Output $shortcutPath
