@echo off
setlocal

title F1 Geovisual Atlas launcher
set "SITE_URL=http://127.0.0.1:3000/"
set "ADMIN_URL=http://127.0.0.1:3102/health"
set "WEB_DIR=%~dp0apps\web"
set "ROOT_DIR=%~dp0"

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo pnpm is not installed or is not available in PATH.
  echo Install it with: npm.cmd install -g pnpm
  pause
  exit /b 1
)

curl.exe --silent --fail --output NUL "%SITE_URL%" >nul 2>&1
if errorlevel 1 (set "SITE_RUNNING=0") else (set "SITE_RUNNING=1")
curl.exe --silent --fail --output NUL "%ADMIN_URL%" >nul 2>&1
if errorlevel 1 (set "ADMIN_RUNNING=0") else (set "ADMIN_RUNNING=1")

if "%SITE_RUNNING%"=="1" if "%ADMIN_RUNNING%"=="1" goto open_site

echo Starting F1 Geovisual Atlas...
if "%SITE_RUNNING%"=="0" if "%ADMIN_RUNNING%"=="0" (
  start "F1 Geovisual Atlas server" /D "%WEB_DIR%" cmd /k "pnpm.cmd run dev"
) else (
  if "%SITE_RUNNING%"=="0" start "F1 Geovisual Atlas web" /D "%WEB_DIR%" cmd /k "pnpm.cmd run dev:web"
  if "%ADMIN_RUNNING%"=="0" start "F1 Geovisual Atlas database" /D "%ROOT_DIR%" cmd /k "node --watch --env-file=.env.database.local --env-file=apps/web/.dev.vars scripts/admin-database-server.mjs"
)

for /L %%I in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  curl.exe --silent --fail --output NUL "%SITE_URL%" >nul 2>&1
  if not errorlevel 1 (
    curl.exe --silent --fail --output NUL "%ADMIN_URL%" >nul 2>&1
    if not errorlevel 1 goto open_site
  )
)

echo The site did not start within 30 seconds.
echo Check the F1 Geovisual Atlas server windows for an error.
pause
exit /b 1

:open_site
start "" "%SITE_URL%"
exit /b 0
