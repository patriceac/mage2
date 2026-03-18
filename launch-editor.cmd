@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0node.exe" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js executable not found. Run npm install first.
    exit /b 1
  )
)

node "%~dp0scripts\launch-editor-shortcut.mjs"
if errorlevel 1 (
  exit /b 1
)
