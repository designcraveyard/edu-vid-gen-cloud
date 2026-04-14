@echo off
chcp 65001 >nul 2>&1
title Edu Video Gen - Setup Wizard
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"

echo.
echo  ========================================
echo    Edu Video Gen - Setup Wizard
echo  ========================================
echo.

REM ── Step 1: Check Prerequisites ──

echo  [Step 1/4] Checking prerequisites...
echo.

set "NEED_NODE=0"
set "NEED_PYTHON=0"
set "NEED_FFMPEG=0"

where node >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%v in ('node -v') do echo    [OK] Node.js %%v
) else (
    echo    [..] Node.js - not found
    set "NEED_NODE=1"
)

where python >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo    [OK] Python %%v
) else (
    where python3 >nul 2>&1
    if !errorlevel!==0 (
        echo    [OK] Python 3 found
    ) else (
        echo    [..] Python 3 - not found
        set "NEED_PYTHON=1"
    )
)

where ffmpeg >nul 2>&1
if %errorlevel%==0 (
    echo    [OK] ffmpeg installed
) else (
    echo    [..] ffmpeg - not found
    set "NEED_FFMPEG=1"
)

echo.

REM ── If everything is present, skip to packages ──
if "%NEED_NODE%%NEED_PYTHON%%NEED_FFMPEG%"=="000" (
    echo    All prerequisites found!
    echo.
    goto :install_packages
)

REM ── Try winget ──
where winget >nul 2>&1
if %errorlevel% neq 0 goto :manual_install

echo    Installing missing tools via winget...
echo    This may take 2-5 minutes.
echo.

if "%NEED_NODE%"=="1" (
    echo    Installing Node.js...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    echo.
)

if "%NEED_PYTHON%"=="1" (
    echo    Installing Python 3.12...
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    echo.
)

if "%NEED_FFMPEG%"=="1" (
    echo    Installing ffmpeg...
    winget install Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements
    echo.
)

echo  ------------------------------------------
echo.
echo    Tools installed! But Windows needs a
echo    fresh terminal to find them.
echo.
echo    >>> CLOSE this window
echo    >>> Open a NEW terminal
echo    >>> Double-click setup.bat again
echo.
echo  ------------------------------------------
echo.
pause
exit /b 0

:manual_install
echo  ------------------------------------------
echo.
echo    winget not available. Install manually:
echo.
if "%NEED_NODE%"=="1" echo      Node.js  :  https://nodejs.org/
if "%NEED_PYTHON%"=="1" echo      Python 3 :  https://www.python.org/downloads/
if "%NEED_FFMPEG%"=="1" echo      ffmpeg   :  https://ffmpeg.org/download.html
echo.
echo    Then double-click setup.bat again.
echo.
echo  ------------------------------------------
echo.
pause
exit /b 1

:install_packages

REM ── Step 2: Install Python packages ──

echo  [Step 2/4] Installing Python packages...
pip install google-genai moviepy Pillow requests -q 2>nul
if %errorlevel% neq 0 (
    python -m pip install google-genai moviepy Pillow requests -q 2>nul
)
echo    [OK] Python packages ready
echo.

REM ── Step 3: Install Node.js packages ──

echo  [Step 3/4] Installing Node.js packages...
cd "%SCRIPT_DIR%scripts"
call npm install --silent 2>nul
cd "%SCRIPT_DIR%"
echo    [OK] Node packages ready
echo.

REM ── Step 4: Launch setup wizard ──

echo  [Step 4/4] Opening setup wizard in browser...
echo.
echo  ------------------------------------------
echo    Upload your JSON files, paste API keys,
echo    and click Save.
echo.
echo    DO NOT close this window until done.
echo  ------------------------------------------
echo.

node scripts\setup-server.mjs

pause
