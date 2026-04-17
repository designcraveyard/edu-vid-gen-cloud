@echo off
chcp 65001 >nul 2>&1
title Edu Video Gen - Installer

echo.
echo  ========================================
echo    Edu Video Gen - Installer
echo  ========================================
echo.

REM Install to a simple, predictable path
set "INSTALL_DIR=C:\EduVidGen"

echo  Install location: %INSTALL_DIR%
echo.
set /p "CUSTOM_DIR=  Press Enter to accept, or type a new path: "
if not "%CUSTOM_DIR%"=="" set "INSTALL_DIR=%CUSTOM_DIR%"

echo.
echo  Copying files to %INSTALL_DIR% ...

REM Clean old install completely to avoid stale files
if exist "%INSTALL_DIR%" (
    REM Preserve .env and token.json from previous install
    if exist "%INSTALL_DIR%\.env" copy /Y "%INSTALL_DIR%\.env" "%TEMP%\eduvidgen-env.bak" >nul 2>&1
    if exist "%INSTALL_DIR%\token.json" copy /Y "%INSTALL_DIR%\token.json" "%TEMP%\eduvidgen-token.bak" >nul 2>&1
    rmdir /S /Q "%INSTALL_DIR%" >nul 2>&1
)

mkdir "%INSTALL_DIR%"
xcopy /E /I /Y /Q "%~dp0EduVidGen" "%INSTALL_DIR%"
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Copy failed.
    echo  Try running as Administrator.
    pause
    exit /b 1
)

REM Restore preserved files
if exist "%TEMP%\eduvidgen-env.bak" (
    copy /Y "%TEMP%\eduvidgen-env.bak" "%INSTALL_DIR%\.env" >nul 2>&1
    del "%TEMP%\eduvidgen-env.bak" >nul 2>&1
)
if exist "%TEMP%\eduvidgen-token.bak" (
    copy /Y "%TEMP%\eduvidgen-token.bak" "%INSTALL_DIR%\token.json" >nul 2>&1
    del "%TEMP%\eduvidgen-token.bak" >nul 2>&1
)

echo.
echo  [OK] Files installed to %INSTALL_DIR%
echo.

REM Verify key files exist
if exist "%INSTALL_DIR%\setup.bat" (
    echo  [OK] setup.bat found
) else (
    echo  [ERROR] setup.bat missing! Install may be corrupt.
    pause
    exit /b 1
)
if exist "%INSTALL_DIR%\service-account.json" echo  [OK] service-account.json found
if exist "%INSTALL_DIR%\credentials.json" echo  [OK] credentials.json found
if exist "%INSTALL_DIR%\.env" echo  [OK] .env found
if exist "%INSTALL_DIR%\.claude-plugin\plugin.json" echo  [OK] plugin.json found
echo.

REM Desktop shortcuts — standard (interactive) + auto-mode (unattended, bypass permissions)
powershell -NoProfile -Command "try { $ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine($env:USERPROFILE, 'Desktop', 'EduVidGen.lnk')); $s.TargetPath = 'cmd.exe'; $s.Arguments = '/k cd /d %INSTALL_DIR% && claude --plugin-dir .'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = 'Open Claude Code with EduVidGen plugin (interactive mode)'; $s.Save(); Write-Host '  [OK] Desktop shortcut created: EduVidGen' } catch { Write-Host '  [..] Shortcut skipped' }"
powershell -NoProfile -Command "try { $ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine($env:USERPROFILE, 'Desktop', 'EduVidGen (Auto Mode).lnk')); $s.TargetPath = 'cmd.exe'; $s.Arguments = '/k cd /d %INSTALL_DIR% && claude --plugin-dir . --dangerously-skip-permissions'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = 'Open Claude Code with EduVidGen plugin — unattended auto-mode (bypass permissions). Answer YES when asked Auto Mode.'; $s.Save(); Write-Host '  [OK] Desktop shortcut created: EduVidGen (Auto Mode)' } catch { Write-Host '  [..] Auto-mode shortcut skipped' }"
echo.

echo  Starting setup wizard...
echo.
cd /d "%INSTALL_DIR%"
call "%INSTALL_DIR%\setup.bat"

pause
exit /b 0
