$ErrorActionPreference = "Stop"
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$url = "http://localhost:4317"
$apiUrl = "$url/api/data"
$node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (!(Test-Path -LiteralPath $node)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) { $node = $nodeCommand.Source }
}
$cli = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
$verify = Join-Path $projectRoot "scripts\verify-local-data.mjs"
$brandName = -join ([char[]](0x56DE, 0x9875))

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Width="470" Height="330" WindowStartupLocation="CenterScreen"
        WindowStyle="None" ResizeMode="NoResize" AllowsTransparency="True"
        Background="Transparent" ShowInTaskbar="True" Title="Huiye">
  <Grid Margin="18">
    <Border CornerRadius="28" Background="#F4F1E8" BorderBrush="#D9D7CC" BorderThickness="1">
      <Border.Effect><DropShadowEffect BlurRadius="28" ShadowDepth="8" Opacity="0.22" Color="#272821"/></Border.Effect>
      <Grid Margin="32,26,32,28">
        <Grid.RowDefinitions>
          <RowDefinition Height="Auto"/>
          <RowDefinition Height="*"/>
          <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        <Grid Grid.Row="0">
          <Grid.ColumnDefinitions><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
          <Border Width="54" Height="54" CornerRadius="16" Background="#5F7259">
            <Grid>
              <Border Width="30" Height="30" CornerRadius="7" Background="#F4F1E8"/>
              <Border Width="13" Height="13" CornerRadius="3" Background="#5F7259"/>
            </Grid>
          </Border>
          <StackPanel Grid.Column="1" Margin="16,3,0,0">
            <TextBlock Name="BrandText" FontFamily="Microsoft YaHei UI" FontSize="24" FontWeight="SemiBold" Foreground="#272821"/>
            <TextBlock Text="LOCAL-FIRST  AI  DIARY" Margin="1,5,0,0" FontFamily="Segoe UI" FontSize="10" Foreground="#7C826F"/>
          </StackPanel>
          <StackPanel Grid.Column="2" Orientation="Horizontal">
            <Button Name="MinimizeButton" Content="-" Width="30" Height="30" Margin="0,0,5,0" Background="Transparent" BorderThickness="0" Foreground="#77786F" FontSize="17" Cursor="Hand"/>
            <Button Name="CloseButton" Content="x" Width="30" Height="30" Background="Transparent" BorderThickness="0" Foreground="#77786F" FontSize="14" Cursor="Hand"/>
          </StackPanel>
        </Grid>

        <StackPanel Grid.Row="1" Margin="0,34,0,24">
          <TextBlock Name="StatusText" Text="Checking local diary data..." FontFamily="Segoe UI" FontSize="18" FontWeight="SemiBold" Foreground="#34372F"/>
          <TextBlock Name="DetailText" Text="Your private notes stay in the local-data folder." Margin="0,9,0,20" FontFamily="Segoe UI" FontSize="12" Foreground="#77786F"/>
          <ProgressBar Name="Progress" Height="4" IsIndeterminate="True" Foreground="#728269" Background="#E0DED4" BorderThickness="0"/>
        </StackPanel>

        <Grid Grid.Row="2">
          <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
          <Button Name="OpenButton" Content="Open Huiye" IsEnabled="False" Height="42" Padding="22,0" HorizontalAlignment="Left" Background="#5F7259" Foreground="White" BorderThickness="0" FontFamily="Segoe UI" FontSize="12" Cursor="Hand"/>
          <Button Name="StopButton" Grid.Column="1" Content="Stop and exit" Height="42" Padding="18,0" Background="Transparent" Foreground="#77786F" BorderBrush="#CFCDBF" BorderThickness="1" FontFamily="Segoe UI" FontSize="12" Cursor="Hand"/>
        </Grid>
      </Grid>
    </Border>
  </Grid>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
$brandText = $window.FindName("BrandText")
$statusText = $window.FindName("StatusText")
$detailText = $window.FindName("DetailText")
$progress = $window.FindName("Progress")
$openButton = $window.FindName("OpenButton")
$stopButton = $window.FindName("StopButton")
$closeButton = $window.FindName("CloseButton")
$minimizeButton = $window.FindName("MinimizeButton")
$brandText.Text = $brandName

$script:serverProcess = $null
$script:ownsServer = $false
$script:ready = $false
$script:opened = $false
$script:expectedEntries = 0
$script:attempts = 0
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(650)

function Read-Status {
  try { return Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 1 } catch { return $null }
}

function Show-Failure([string]$message) {
  $timer.Stop()
  $progress.IsIndeterminate = $false
  $progress.Value = 0
  $progress.Foreground = "#A4675B"
  $statusText.Text = "Huiye could not start"
  $detailText.Text = $message
  $stopButton.Content = "Close"
}

function Show-Ready($status) {
  $script:ready = $true
  $timer.Stop()
  $count = @($status.data.entries).Count
  $progress.IsIndeterminate = $false
  $progress.Value = 100
  $statusText.Text = "Huiye is ready"
  $detailText.Text = "$count entries loaded from the local-data folder. Keep this launcher open."
  $openButton.IsEnabled = $true
  if (!$script:opened) {
    $script:opened = $true
    Start-Process $url
  }
}

$timer.Add_Tick({
  try {
    $script:attempts += 1
    if ($script:serverProcess -and $script:serverProcess.HasExited) {
      Show-Failure "The local server exited with code $($script:serverProcess.ExitCode)."
      return
    }
    $status = Read-Status
    if ($status -and $status.storageKind -eq "local-folder") {
      $count = @($status.data.entries).Count
      if ($count -ne $script:expectedEntries) {
        Show-Failure "Safety check failed: disk has $script:expectedEntries entries but the app returned $count."
        return
      }
      Show-Ready $status
      return
    }
    if ($script:attempts -ge 120) { Show-Failure "Startup timed out after 60 seconds." }
  } catch { Show-Failure $_.Exception.Message }
})

$window.Add_MouseLeftButtonDown({ try { $window.DragMove() } catch {} })
$openButton.Add_Click({ Start-Process $url })
$minimizeButton.Add_Click({ $window.WindowState = "Minimized" })
$stopButton.Add_Click({ $window.Close() })
$closeButton.Add_Click({ $window.Close() })
$window.Add_Closed({
  $timer.Stop()
  if ($script:ownsServer -and $script:serverProcess -and !$script:serverProcess.HasExited) {
    try { $script:serverProcess.Kill() } catch {}
  }
})

$window.Add_ContentRendered({
  try {
    Set-Location -LiteralPath $projectRoot
    if (!(Test-Path -LiteralPath $node)) { throw "Node.js 22+ was not found." }
    if (!(Test-Path -LiteralPath $cli)) { throw "Project dependencies are incomplete." }
    $verificationText = & $node $verify 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Local data verification failed." }
    $verification = ($verificationText -join "`n") | ConvertFrom-Json
    $script:expectedEntries = [int]$verification.entries
    $statusText.Text = "Starting the local app..."
    $detailText.Text = "$script:expectedEntries verified entries. No cloud data will be loaded."

    $existing = Read-Status
    if ($existing -and $existing.storageKind -eq "local-folder") {
      Show-Ready $existing
      return
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $node
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.Arguments = ('"{0}" dev --host 127.0.0.1 --port 4317' -f $cli)
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $script:serverProcess = New-Object System.Diagnostics.Process
    $script:serverProcess.StartInfo = $startInfo
    if (!$script:serverProcess.Start()) { throw "The local server process could not start." }
    $script:ownsServer = $true
    $timer.Start()
  } catch { Show-Failure $_.Exception.Message }
})

$window.ShowDialog() | Out-Null
