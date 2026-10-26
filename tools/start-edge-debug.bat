@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem === Edge debug launcher (CDP port 9222) ===
rem 注意：路径里含 (x86)，括号在 for/if 块内会打断 cmd 解析 ⇒ 必须开延迟展开用 !BASE!
set "BASE=C:\Program Files (x86)\Microsoft\EdgeCore"
set "UDD=%~dp0..\.edge-debug"

set "EDGE="
for /f "delims=" %%d in ('dir /b /ad /o-n "%BASE%" 2^>nul') do (
  if not defined EDGE if exist "!BASE!\%%d\msedge.exe" set "EDGE=!BASE!\%%d\msedge.exe"
)

if not defined EDGE (
  echo [ERROR] msedge.exe not found under !BASE!
  pause
  exit /b 1
)

echo Using: !EDGE!

rem --- 只收拾「上次遗留的调试实例」（命令行带 .edge-debug 的那些），
rem     绝不动用户自己正常打开的 Edge（旧版是 taskkill /f /im msedge.exe，会把正常浏览器一起杀掉）。
rem     传 nokill 可跳过这步（自动化脚本从受限环境调用时用，那里 powershell 会被安全策略拦）。
if /i "%~1"=="nokill" goto skipkill
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*.edge-debug*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 1 /nobreak >nul
:skipkill

rem --- start "" 让 Edge 脱离本脚本独立运行，关掉这个黑窗口也不影响它 ---
start "" "!EDGE!" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%UDD%" --no-first-run --no-default-browser-check "https://gps51.com" "https://man.bbxhc.com"

echo Debug port: http://127.0.0.1:9222/json/version
