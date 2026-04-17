@echo off
chcp 65001 >nul 2>&1
title Edu Video Gen - Setup Wizard
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"

echo.
echo  ========================================
echo    Edu Video Gen - One-Click Setup
echo  ========================================
echo.
echo  This will install everything you need.
echo  Just sit back — takes about 5-10 minutes.
echo.
echo  ========================================
echo.

REM ════════════════════════════════════════════
REM  STEP 1: Chocolatey (package manager)
REM ════════════════════════════════════════════

echo  [Step 1/7] Checking Chocolatey...

where choco >nul 2>&1
if %errorlevel%==0 (
    echo    [OK] Chocolatey already installed
) else (
    echo    Installing Chocolatey...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    if exist "C:\ProgramData\chocolatey\bin\choco.exe" set "PATH=C:\ProgramData\chocolatey\bin;%PATH%"
)
echo.

REM ════════════════════════════════════════════
REM  STEP 2: Install all system tools via choco
REM ════════════════════════════════════════════

echo  [Step 2/7] Installing system tools...
echo.

where node >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do echo    [OK] Node.js %%v
) else (
    echo    Installing Node.js...
    choco install nodejs-lts -y
    echo.
)

REM Check for real Python (not Microsoft Store stub)
set "HAVE_PYTHON=0"
python --version >nul 2>&1
if %errorlevel%==0 (
    python -c "import sys" >nul 2>&1
    if %errorlevel%==0 (
        for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo    [OK] Python %%v
        set "HAVE_PYTHON=1"
    )
)
if "%HAVE_PYTHON%"=="0" (
    echo    [..] Python not found (or Microsoft Store stub)
    echo    Installing real Python via Chocolatey...
    choco install python3 -y
    echo.
)

where ffmpeg >nul 2>&1
if %errorlevel%==0 (
    echo    [OK] ffmpeg already installed
) else (
    echo    Installing ffmpeg...
    choco install ffmpeg -y
    echo.
)

where git >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=3" %%v in ('git --version 2^>nul') do echo    [OK] Git %%v
) else (
    echo    Installing Git...
    choco install git -y
    echo.
)

REM Refresh PATH from Chocolatey
call refreshenv >nul 2>&1

REM Also manually add common paths in case refreshenv didn't work
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
for /f "usebackq tokens=*" %%p in (`powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')" 2^>nul`) do set "PATH=%%p"

echo.

REM Verify node is available (critical for rest of setup)
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!!] Node.js installed but not in PATH yet.
    echo      Close this window, open a new terminal,
    echo      and run setup.bat again.
    echo.
    pause
    exit /b 0
)

REM ════════════════════════════════════════════
REM  STEP 3: Python packages
REM ════════════════════════════════════════════

echo  [Step 3/7] Installing Python packages...
echo.

set "PY_CMD="
where python >nul 2>&1
if %errorlevel%==0 (
    set "PY_CMD=python"
) else (
    where python3 >nul 2>&1
    if %errorlevel%==0 set "PY_CMD=python3"
)

if defined PY_CMD (
    %PY_CMD% -m pip install google-genai moviepy Pillow requests
    echo.
    echo    [OK] Python packages installed
) else (
    echo    [!!] Python not in PATH — packages skipped.
    echo        Run manually later: pip install google-genai moviepy Pillow requests
)
echo.

REM ════════════════════════════════════════════
REM  STEP 4: Node.js packages
REM ════════════════════════════════════════════

echo  [Step 4/7] Installing Node.js packages...

if exist "%SCRIPT_DIR%scripts\package.json" (
    pushd "%SCRIPT_DIR%scripts"
    call npm install
    popd
    echo    [OK] Node packages installed
) else (
    echo    [!!] scripts/package.json not found — skipped
)
echo.

REM ════════════════════════════════════════════
REM  STEP 5: Claude Code
REM ════════════════════════════════════════════

echo  [Step 5/7] Installing Claude Code...

where claude >nul 2>&1
if %errorlevel%==0 (
    echo    [OK] Claude Code already installed
) else (
    echo    Installing Claude Code via npm...
    call npm install -g @anthropic-ai/claude-code
    echo.
    where claude >nul 2>&1
    if %errorlevel%==0 (
        echo    [OK] Claude Code installed
    ) else (
        echo    [!!] Claude Code install may need a terminal restart.
    )
)
echo.

REM ════════════════════════════════════════════
REM  STEP 6: Setup wizard (API keys, auth)
REM ════════════════════════════════════════════

echo  [Step 6/7] Opening setup wizard in browser...
echo.
echo  ------------------------------------------
echo    Upload your JSON files, paste API keys,
echo    pick your output folder, and sign into
echo    Google.
echo.
echo    DO NOT close this window until done.
echo  ------------------------------------------
echo.

if exist "%SCRIPT_DIR%scripts\setup-server.mjs" (
    node "%SCRIPT_DIR%scripts\setup-server.mjs"
) else (
    echo    [!!] setup-server.mjs not found — skipping wizard.
    echo        Run manually: node scripts\setup-server.mjs
)
echo.

REM ════════════════════════════════════════════
REM  STEP 7: Git repo + Claude plugin
REM ════════════════════════════════════════════

echo  [Step 7/7] Preparing Claude Code...
echo.

cd /d "%SCRIPT_DIR%"

REM Initialize git repo (Claude Code requires it)
where git >nul 2>&1
if %errorlevel%==0 (
    if not exist "%SCRIPT_DIR%.git" (
        git init >nul 2>&1
        git add -A >nul 2>&1
        git commit -m "Initial setup" >nul 2>&1
        echo    [OK] Git repo initialized
    ) else (
        echo    [OK] Git repo exists
    )
) else (
    echo    [!!] Git not found — skipping repo init
)

REM Clean up any old marketplace cache from previous installs
where claude >nul 2>&1
if %errorlevel%==0 (
    claude plugin marketplace remove edu-vid-gen-local >nul 2>&1
    echo    [OK] Cleaned old plugin cache
)

echo.
echo  ========================================
echo.
echo    SETUP COMPLETE!
echo.
echo    Type /generate-video in Claude Code to
echo    generate your first video.
echo.
echo  ========================================
echo.

REM Open Claude Code with plugin loaded in-place (not cached)
cd /d "%SCRIPT_DIR%"
where claude >nul 2>&1
if %errorlevel%==0 (
    echo  Opening Claude Code...
    echo  Plugin: %SCRIPT_DIR%
    echo.
    start "" cmd /k "cd /d %SCRIPT_DIR% && claude --plugin-dir ."
) else (
    echo    Claude Code not found in PATH.
    echo    Open a new terminal and run:
    echo.
    echo      cd %SCRIPT_DIR%
    echo      claude --plugin-dir .
)

pause
exit /b 0
