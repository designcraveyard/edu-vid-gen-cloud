@echo off
REM ═══════════════════════════════════════════════════════════════
REM Edu Video Gen — One-Click Setup (Windows)
REM Double-click this file to install
REM ═══════════════════════════════════════════════════════════════

setlocal enabledelayedexpansion
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"

echo.
echo ╔══════════════════════════════════════════╗
echo ║     Edu Video Gen — Setup Wizard         ║
echo ╚══════════════════════════════════════════╝
echo.

REM ── Step 1: Check Prerequisites ──

echo Step 1/7: Checking prerequisites...
echo.

set "NEED_NODE=0"
set "NEED_PYTHON=0"
set "NEED_FFMPEG=0"

where node >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%v in ('node -v') do echo   ✅ Node.js %%v
) else (
    echo   ❌ Node.js — not found
    set "NEED_NODE=1"
)

where python >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo   ✅ Python %%v
) else (
    where python3 >nul 2>&1
    if !errorlevel!==0 (
        echo   ✅ Python 3 found
    ) else (
        echo   ❌ Python 3 — not found
        set "NEED_PYTHON=1"
    )
)

where ffmpeg >nul 2>&1
if %errorlevel%==0 (
    echo   ✅ ffmpeg installed
) else (
    echo   ❌ ffmpeg — not found
    set "NEED_FFMPEG=1"
)

echo.

REM Install missing via winget if available
where winget >nul 2>&1
if %errorlevel%==0 (
    if "%NEED_NODE%"=="1" (
        echo   Installing Node.js...
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    )
    if "%NEED_PYTHON%"=="1" (
        echo   Installing Python...
        winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    )
    if "%NEED_FFMPEG%"=="1" (
        echo   Installing ffmpeg...
        winget install Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements
    )
    if not "%NEED_NODE%%NEED_PYTHON%%NEED_FFMPEG%"=="000" (
        echo.
        echo   ⚠️  New tools installed. Please CLOSE this window, open a NEW terminal,
        echo      and run setup.bat again so the new tools are in your PATH.
        echo.
        pause
        exit /b 0
    )
) else (
    if not "%NEED_NODE%%NEED_PYTHON%%NEED_FFMPEG%"=="000" (
        echo   ⚠️  Cannot auto-install. Please install manually:
        if "%NEED_NODE%"=="1" echo      - Node.js: https://nodejs.org/
        if "%NEED_PYTHON%"=="1" echo      - Python 3: https://www.python.org/downloads/
        if "%NEED_FFMPEG%"=="1" echo      - ffmpeg: https://ffmpeg.org/download.html
        echo.
        echo   After installing, re-run this script.
        pause
        exit /b 1
    )
)

REM ── Step 2: Install Python packages ──

echo Step 2/7: Installing Python packages...
pip install google-genai moviepy Pillow requests -q 2>nul
if %errorlevel% neq 0 (
    python -m pip install google-genai moviepy Pillow requests -q 2>nul
)
echo   ✅ Python packages ready
echo.

REM ── Step 3: Install Node.js packages ──

echo Step 3/7: Installing Node.js packages...
cd "%SCRIPT_DIR%scripts" && npm install --silent 2>nul
cd "%SCRIPT_DIR%"
echo   ✅ Node packages ready
echo.

REM ── Step 4: Launch setup wizard in browser ──

echo Step 4/4: Opening setup wizard...
echo.
echo   A browser window will open with the setup page.
echo   Upload your JSON files, paste API keys, and click Save.
echo.

node scripts\setup-server.mjs

pause
