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

REM ── Step 4: Check auth files ──

echo Step 4/7: Checking authentication files...

if exist "%SCRIPT_DIR%service-account.json" (
    for /f "tokens=2 delims=:, " %%a in ('findstr "client_email" "%SCRIPT_DIR%service-account.json"') do (
        set "SA_EMAIL=%%~a"
    )
    for /f "tokens=2 delims=:, " %%a in ('findstr "project_id" "%SCRIPT_DIR%service-account.json"') do (
        set "SA_PROJECT=%%~a"
    )
    echo   ✅ Service Account found
) else (
    echo   ❌ service-account.json not found
    echo      Ask your admin for this file and place it in: %SCRIPT_DIR%
    pause
    exit /b 1
)

if exist "%SCRIPT_DIR%credentials.json" (
    echo   ✅ OAuth credentials.json found
) else (
    echo   ❌ credentials.json not found
    echo      Ask your admin for this file and place it in: %SCRIPT_DIR%
    pause
    exit /b 1
)

echo.

REM ── Step 5: Google OAuth login ──

echo Step 5/7: Google account sign-in...
if exist "%SCRIPT_DIR%token.json" (
    echo   ✅ Already signed in (token.json exists^)
    echo      To switch accounts, delete token.json and re-run setup
) else (
    echo   A browser window will open — sign in with your Google account.
    echo   This gives the app access to Google Drive, Docs, and Sheets.
    echo.
    pause
    node scripts\google-auth.mjs --credentials .\credentials.json --token .\token.json
    echo   ✅ Google sign-in complete
)
echo.

REM ── Step 6: Choose output folder ──

echo Step 6/7: Choose where to save generated videos...
echo.

set "DEFAULT_DIR=%USERPROFILE%\Videos\EduVidGen"
echo   Default: %DEFAULT_DIR%
echo.
set /p "CUSTOM_DIR=  Press Enter to use default, or type a custom path: "

if "!CUSTOM_DIR!"=="" (
    set "OUTPUT_DIR=%DEFAULT_DIR%"
) else (
    set "OUTPUT_DIR=!CUSTOM_DIR!"
)

if not exist "!OUTPUT_DIR!" mkdir "!OUTPUT_DIR!"
echo   ✅ Output folder: !OUTPUT_DIR!
echo.

REM ── Step 7: Write .env ──

echo Step 7/7: Writing configuration...

REM Check for existing keys
set "ELEVENLABS_KEY="
set "GEMINI_KEY="
if exist "%SCRIPT_DIR%.env" (
    for /f "tokens=2 delims==" %%a in ('findstr "^ELEVENLABS_API_KEY=" "%SCRIPT_DIR%.env" 2^>nul') do set "ELEVENLABS_KEY=%%a"
    for /f "tokens=2 delims==" %%a in ('findstr "^GEMINI_API_KEY=" "%SCRIPT_DIR%.env" 2^>nul') do set "GEMINI_KEY=%%a"
)

if "!ELEVENLABS_KEY!"=="" (
    set /p "ELEVENLABS_KEY=  ElevenLabs API key (required for voiceover): "
) else (
    if "!ELEVENLABS_KEY!"=="sk_your_key_here" (
        set /p "ELEVENLABS_KEY=  ElevenLabs API key (required for voiceover): "
    ) else (
        echo   ✅ ElevenLabs key already configured
    )
)

if "!GEMINI_KEY!"=="" (
    set /p "GEMINI_KEY=  Gemini API key (optional, press Enter to skip): "
) else (
    if "!GEMINI_KEY!"=="your_key_here" (
        set /p "GEMINI_KEY=  Gemini API key (optional, press Enter to skip): "
    ) else (
        echo   ✅ Gemini key already configured
    )
)

(
echo # Edu Video Gen — Configuration
echo # Generated by setup.bat on %date%
echo.
echo # Google Cloud project
echo GCLOUD_PROJECT=!SA_PROJECT!
echo.
echo # Service Account (Vertex AI)
echo GOOGLE_APPLICATION_CREDENTIALS=%SCRIPT_DIR%service-account.json
echo GOOGLE_SERVICE_ACCOUNT_PATH=%SCRIPT_DIR%service-account.json
echo.
echo # OAuth (Google Drive, Docs, Sheets)
echo GOOGLE_CREDENTIALS_PATH=%SCRIPT_DIR%credentials.json
echo GOOGLE_TOKEN_PATH=%SCRIPT_DIR%token.json
echo.
echo # ElevenLabs (voiceover)
echo ELEVENLABS_API_KEY=!ELEVENLABS_KEY!
echo.
echo # Gemini API key (optional fallback)
echo GEMINI_API_KEY=!GEMINI_KEY!
echo.
echo # Together AI (optional)
echo TOGETHER_API_KEY=
echo.
echo # Output directory
echo OUTPUT_BASE_DIR=!OUTPUT_DIR!
echo.
echo # Exchange rate
echo USD_TO_INR=84.5
) > "%SCRIPT_DIR%.env"

echo   ✅ Configuration saved to .env
echo.

REM ── Done ──

echo ╔══════════════════════════════════════════╗
echo ║          Setup Complete!                 ║
echo ╠══════════════════════════════════════════╣
echo ║  Output: !OUTPUT_DIR!
echo ║  Auth:   Service Account + OAuth         ║
echo ╚══════════════════════════════════════════╝
echo.
echo Opening Claude Code...
echo.

start "" "claude://" 2>nul

pause
