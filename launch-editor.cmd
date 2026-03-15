@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
set "EDITOR_ENTRY=%~dp0apps\editor\dist-electron\main.cjs"

set NEED_BUILD=
if not exist "apps\editor\dist-electron\main.cjs" set NEED_BUILD=1
if not exist "apps\editor\dist-electron\preload.cjs" set NEED_BUILD=1
if not exist "apps\editor\dist\index.html" set NEED_BUILD=1

if defined NEED_BUILD (
  echo Editor build not found. Building...
  call npm run build:packages
  if errorlevel 1 exit /b 1
  call npm run build --workspace @mage2/editor
  if errorlevel 1 exit /b 1
)

if not exist "%ELECTRON_EXE%" (
  echo Electron executable not found. Run npm install first.
  exit /b 1
)

start "" /d "%~dp0" "%ELECTRON_EXE%" "%EDITOR_ENTRY%"
