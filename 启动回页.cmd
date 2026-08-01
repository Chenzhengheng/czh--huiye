@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%NODE_EXE%" goto node_ready

for /f "delims=" %%I in ('where node 2^>nul') do (
  set "NODE_EXE=%%I"
  goto node_ready
)

echo [回页] 没有找到 Node.js，无法启动本地应用。
echo 请在 Codex 中运行，或先安装 Node.js 22 以上版本。
pause
exit /b 1

:node_ready
echo [回页] 私人数据目录：%CD%\local-data
echo [回页] 正在启动本地应用：http://localhost:4317
start "回页本地服务" /min "%NODE_EXE%" "node_modules\vinext\dist\cli.js" dev --host 127.0.0.1 --port 4317

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url='http://localhost:4317'; for($i=0;$i -lt 60;$i++){ try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1 | Out-Null; Start-Process $url; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; Write-Host '[回页] 启动超时，请保留窗口并在 Codex 中检查。'; exit 1"
endlocal
