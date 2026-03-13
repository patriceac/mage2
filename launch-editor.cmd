@echo off
setlocal
cd /d "%~dp0"
if not exist "apps\editor\dist-electron\main.cjs" (
  echo Editor build not found. Building...
  call npm run build --workspace @mage2/editor
  if errorlevel 1 exit /b 1
)

call ".\node_modules\.bin\electron.cmd" ".\apps\editor\dist-electron\main.cjs"
