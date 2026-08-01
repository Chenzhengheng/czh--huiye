$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$assetsDir = Join-Path $projectRoot "assets"
$iconPath = Join-Path $assetsDir "huiye.ico"
$launcherPath = Join-Path $projectRoot "scripts\start-huiye-ui.ps1"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop ((-join ([char[]](0x56DE, 0x9875))) + ".lnk")

New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class HuiyeNativeIcon {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool DestroyIcon(IntPtr handle);
}
"@

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$sage = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#5F7259"))
$paper = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#F4F1E8"))
$gold = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#B48952"))
$outer = New-RoundedPath 14 14 228 228 54
$middle = New-RoundedPath 61 61 134 134 26
$inner = New-RoundedPath 97 97 62 62 13
$graphics.FillPath($sage, $outer)
$graphics.FillPath($paper, $middle)
$graphics.FillPath($sage, $inner)
$graphics.FillEllipse($gold, 202, 39, 16, 16)
$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
[HuiyeNativeIcon]::DestroyIcon($handle) | Out-Null
$outer.Dispose(); $middle.Dispose(); $inner.Dispose(); $sage.Dispose(); $paper.Dispose(); $gold.Dispose(); $graphics.Dispose(); $bitmap.Dispose()

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Huiye local-first AI Diary"
$shortcut.Save()

Write-Output $shortcutPath
