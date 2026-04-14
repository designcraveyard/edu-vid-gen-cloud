@echo off
chcp 65001 >nul 2>&1
REM -----------------------------------------------------------
REM Edu Video Gen - One-Click Setup (Windows)
REM Double-click this file to install everything
REM -----------------------------------------------------------

setlocal enabledelayedexpansion
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"

title Edu Video Gen - Setup Wizard

echo.
echo  ========================================
echo    Edu Video Gen - Setup Wizard
echo  ========================================
echo.
echo  This will:
echo    1. Install Node.js, Python, ffmpeg (if missing)
echo    2. Install required packages
echo    3. Open a browser to configure API keys
echo.
echo  ------------------------------------------
echo.

REM ── Step 1: Check Prerequisites ──

echo  [Step 1/4] Checking prerequisites...
echo.

set "NEED_NODE=0"
set "NEED_PYTHON=0"
set "NEED_FFMPEG=0"
set "INSTALL_COUNT=0"

where node >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%v in ('node -v') do echo    [OK] Node.js %%v
) else (
    echo    [..] Node.js - not found
    set "NEED_NODE=1"
    set /a INSTALL_COUNT+=1
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
        set /a INSTALL_COUNT+=1
    )
)

where ffmpeg >nul 2>&1
if %errorlevel%==0 (
    echo    [OK] ffmpeg installed
) else (
    echo    [..] ffmpeg - not found
    set "NEED_FFMPEG=1"
    set /a INSTALL_COUNT+=1
)

echo.

REM ── Skip install if everything present ──
if "%NEED_NODE%%NEED_PYTHON%%NEED_FFMPEG%"=="000" (
    echo    All prerequisites found!
    echo.
    goto :install_packages
)

REM ── Try winget ──
where winget >nul 2>&1
if %errorlevel% neq 0 goto :manual_install

echo    Installing %INSTALL_COUNT% missing tool(s) via winget...
echo    (This may take 2-5 minutes depending on your connection)
echo.

set "STEP=0"

if "%NEED_NODE%"=="1" (
    set /a STEP+=1
    echo    [!STEP!/%INSTALL_COUNT%] Installing Node.js...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel!==0 (
        echo            Installed successfully.
    ) else (
        echo            Install may have failed - will check later.
    )
    echo.
)

if "%NEED_PYTHON%"=="1" (
    set /a STEP+=1
    echo    [!STEP!/%INSTALL_COUNT%] Installing Python 3.12...
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel!==0 (
        echo            Installed successfully.
    ) else (
        echo            Install may have failed - will check later.
    )
    echo.
)

if "%NEED_FFMPEG%"=="1" (
    set /a STEP+=1
    echo    [!STEP!/%INSTALL_COUNT%] Installing ffmpeg...
    winget install Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel!==0 (
        echo            Installed successfully.
    ) else (
        echo            Install may have failed - will check later.
    )
    echo.
)

REM ── Refresh PATH from registry so we pick up new installs ──
echo    Refreshing PATH...
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%b"
set "PATH=%SYS_PATH%;%USR_PATH%"
echo.

REM ── Re-check after install ──
set "STILL_MISSING="
where node >nul 2>&1 || set "STILL_MISSING=!STILL_MISSING! Node.js"
where python >nul 2>&1 || set "STILL_MISSING=!STILL_MISSING! Python"
where ffmpeg >nul 2>&1 || set "STILL_MISSING=!STILL_MISSING! ffmpeg"

if not "!STILL_MISSING!"=="" (
    echo  ------------------------------------------
    echo.
    echo    Some tools installed but aren't on PATH yet.
    echo    Missing:!STILL_MISSING!
    echo.
    echo    Please CLOSE this window, open a NEW
    echo    terminal, and double-click setup.bat again.
    echo.
    echo  ------------------------------------------
    echo.
    pause
    exit /b 0
)

echo    All prerequisites ready!
echo.
goto :install_packages

:manual_install
echo  ------------------------------------------
echo.
echo    Cannot auto-install (winget not available).
echo    Please install these manually:
echo.
if "%NEED_NODE%"=="1" echo      Node.js  :  https://nodejs.org/
if "%NEED_PYTHON%"=="1" echo      Python 3 :  https://www.python.org/downloads/
if "%NEED_FFMPEG%"=="1" echo      ffmpeg   :  https://ffmpeg.org/download.html
echo.
echo    After installing, double-click setup.bat again.
echo.
echo  ------------------------------------------
echo.
pause
exit /b 1

:install_packages

REM ── Step 2: Install Python packages ──

echo  [Step 2/4] Installing Python packages...
echo            google-genai, moviepy, Pillow, requests
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

REM ── Step 4: Launch setup wizard in browser ──

echo  [Step 4/4] Opening setup wizard in your browser...
echo.
echo  ------------------------------------------
echo    A browser window will open.
echo    Upload your JSON files, paste API keys,
echo    and click Save.
echo.
echo    DO NOT close this window until setup
echo    is complete.
echo  ------------------------------------------
echo.

node scripts\setup-server.mjs

pause
