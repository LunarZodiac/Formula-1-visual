@echo off
setlocal

title F1 Geovisual Atlas launcher
set "SITE_URL=http://127.0.0.1:3000/"
set "WEB_DIR=%~dp0apps\web"

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo pnpm is not installed or is not available in PATH.
  echo Install it with: npm.cmd install -g pnpm
  pause
  exit /b 1
)

curl.exe --silent --fail --output NUL "%SITE_URL%" >nul 2>&1
if not errorlevel 1 goto open_site

echo Starting F1 Geovisual Atlas...
start "F1 Geovisual Atlas server" /D "%WEB_DIR%" cmd /k "pnpm.cmd dev"

for /L %%I in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  curl.exe --silent --fail --output NUL "%SITE_URL%" >nul 2>&1
  if not errorlevel 1 goto open_site
)

echo The site did not start within 30 seconds.
echo Check the F1 Geovisual Atlas server window for an error.
pause
exit /b 1

:open_site
start "" "%SITE_URL%"
exit /b 0
