@echo off
title Karma Fire Protection LLP - Project Runner
setlocal EnableDelayedExpansion

:: ==========================================================================
:: Configuration
:: ==========================================================================
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="." set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "BACKEND_DIR=%PROJECT_ROOT%\backend\telegram-leads"
set "FRONTEND_DIR=%PROJECT_ROOT%"
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=8080"

:: ==========================================================================
:: Help / Usage
:: ==========================================================================
if "%~1"=="" (
    echo.
    echo ============================================================================
    echo  Karma Fire Protection LLP - Project Runner
    echo ============================================================================
    echo.
    echo  Usage: run-project.bat ^<command^>
    echo.
    echo  Available commands:
    echo    setup     - Install dependencies and create .env from template
    echo    run       - Start backend (port %BACKEND_PORT%) and frontend (port %FRONTEND_PORT%)
    echo    stop      - Stop all running servers
    echo    status    - Check server status
    echo    logs      - View recent server logs
    echo.
    echo  Example:
    echo    run-project.bat setup
    echo    :: Edit backend/telegram-leads\.env with your Telegram credentials
    echo    run-project.bat run
    echo.
    goto :eof
)

echo.
echo ============================================================================
echo Running command: %~1
echo ============================================================================

:: -------------------------------------------------------------------------
:: Setup command: Install deps, create .env, verify configuration
:: -------------------------------------------------------------------------
if /i "%~1"=="setup" (
    echo.
    echo [1/5] Checking Node.js...
    node --version >nul 2>&1
    if errorlevel 1 (
        echo  ERROR: Node.js not found. Install from https://nodejs.org
        goto :eof
    )
    for /f "tokens=*" %%v in ('node --version 2^>nul') do echo  OK: %%v

    echo.
    echo [2/5] Checking backend dependencies...
    cd /d "%BACKEND_DIR%"
    if not exist "package.json" (
        echo  ERROR: package.json not found in backend/
        goto :eof
    )

    if not exist "node_modules\" (
        echo  Installing npm packages...
        npm install 2>&1 | findstr /i "error" >nul
        if errorlevel 1 (
            echo  ERROR: npm install failed
            goto :eof
        )
        echo  OK: Dependencies installed
    ) else (
        echo  OK: Dependencies already installed
    )

    echo.
    echo [3/5] Creating .env from template...
    if not exist ".env" (
        if exist "%PROJECT_ROOT%\config\.env-example" (
            copy "%PROJECT_ROOT%\config\.env-example" ".env" >nul
            echo  OK: Created .env from template
            echo  ^>^>^> IMPORTANT: Edit %BACKEND_DIR%\.env with Telegram credentials!
        ) else (
            echo  ERROR: config/.env.example not found
            goto :eof
        )
    ) else (
        echo  OK: .env already exists
    )

    echo.
    echo [4/5] Verifying environment variables...
    findstr /R "^TELEGRAM_BOT_TOKEN=" ".env" >nul 2>&1
    if errorlevel 1 echo  WARN: TELEGRAM_BOT_TOKEN not set in .env
    findstr /R "^TELEGRAM_CHAT_ID=" ".env" >nul 2>&1
    if errorlevel 1 echo  WARN: TELEGRAM_CHAT_ID not set in .env
    findstr /R "^ADMIN_TELEGRAM_IDS=" ".env" >nul 2>&1
    if errorlevel 1 echo  WARN: ADMIN_TELEGRAM_IDS not set in .env

    echo.
    echo [5/5] Frontend check...
    echo  OK: Frontend uses vanilla HTML/CSS/JS - no build step required

    echo.
    echo  Setup complete!
    echo.
    echo  Next:
    echo    1. Edit %BACKEND_DIR%\.env with your Telegram Bot Token and Chat ID
    echo    2. Run: run-project.bat run
    echo.
    goto :eof

:: -------------------------------------------------------------------------
:: Run command: Start backend and frontend servers
:: -------------------------------------------------------------------------
if /i "%~1"=="run" (
    call :do_run
    goto :eof
)

:: -------------------------------------------------------------------------
:: Stop command: Stop all servers
:: -------------------------------------------------------------------------
if /i "%~1"=="stop" (
    call :do_stop
    goto :eof
)

:: -------------------------------------------------------------------------
:: Status command: Check server status
:: -------------------------------------------------------------------------
if /i "%~1"=="status" (
    call :do_status
    goto :eof
)

:: -------------------------------------------------------------------------
:: Logs command: View recent logs
:: -------------------------------------------------------------------------
if /i "%~1"=="logs" (
    call :do_logs
    goto :eof
)

echo.
echo ERROR: Unknown command "%~1"
echo.
echo Usage: run-project.bat ^<command^>
goto :eof

:: -------------------------------------------------------------------------
:: :do_run - Start backend and frontend
:: -------------------------------------------------------------------------
:do_run
echo.
echo Starting Karma Fire Protection servers...
echo.

:: --- Backend ---
echo [Backend] Port %BACKEND_PORT%...
netstat -n | findstr /i ":!BACKEND_PORT!  LISTENING" >nul
if errorlevel 0 (
    echo  SKIP: Already running on port %BACKEND_PORT%
) else (
    echo  Starting backend server...
    cd /d "%BACKEND_DIR%"
    start "Karma Backend API" cmd /c "node server.js"
    ping -n 3 127.0.0.1 >nul 2>&1
    netstat -n | findstr /i ":!BACKEND_PORT!  LISTENING" >nul
    if errorlevel 0 (
        echo  OK: Backend running at http://localhost:%BACKEND_PORT%
    ) else (
        echo  WARNING: Backend may not have started successfully
    )
)

echo.

:: --- Frontend ---
echo [Frontend] Port %FRONTEND_PORT%...
netstat -n | findstr /i ":!FRONTEND_PORT!  LISTENING" >nul
if errorlevel 0 (
    echo  SKIP: Already running on port %FRONTEND_PORT%
) else (
    echo  Starting frontend server...
    cd /d "%FRONTEND_DIR%"
    python --version >nul 2>&1
    if errorlevel 0 (
        start "Karma Frontend Python" cmd /c "python -m http.server %FRONTEND_PORT%"
        echo  Using: Python http.server
    ) else (
        npx --version >nul 2>&1
        if errorlevel 0 (
            start "Karma Frontend npx" cmd /c "npx serve . -p %FRONTEND_PORT%"
            echo  Using: npx serve
        ) else (
            echo  ERROR: Neither Python nor npx found
            echo  Install Python (https://python.org) or Node.js with npx
            goto :eof
        )
    )
    ping -n 3 127.0.0.1 >nul 2>&1
    netstat -n | findstr /i ":!FRONTEND_PORT!  LISTENING" >nul
    if errorlevel 0 (
        echo  OK: Frontend running at http://localhost:%FRONTEND_PORT%
    ) else (
        echo  WARNING: Frontend may not have started successfully
    )
)

echo.
echo ============================================================================
echo  All servers started!
echo  Frontend: http://localhost:%FRONTEND_PORT%
echo  Backend:  http://localhost:%BACKEND_PORT%
echo  Health:   http://localhost:%BACKEND_PORT%/api/health
echo ============================================================================
echo.
echo  To stop:    run-project.bat stop
echo  To view logs: run-project.bat logs
echo.
goto :eof

:: -------------------------------------------------------------------------
:: :do_stop - Stop all servers
:: -------------------------------------------------------------------------
:do_stop
echo.
echo Stopping all servers...
echo.

echo [Backend] Port %BACKEND_PORT%...
for /f "tokens=5" %%a in ('netstat -n ^| findstr /i ":!BACKEND_PORT!  LISTENING"') do (
    echo    Killing PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo [Frontend] Port %FRONTEND_PORT%...
for /f "tokens=5" %%a in ('netstat -n ^| findstr /i ":!FRONTEND_PORT!  LISTENING"') do (
    echo    Killing PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo  All servers stopped.
goto :eof

:: -------------------------------------------------------------------------
:: :do_status - Check server status
:: -------------------------------------------------------------------------
:do_status
echo.
echo Server Status:
echo ==========================================

netstat -n | findstr /i ":!BACKEND_PORT!  LISTENING" >nul
if errorlevel 0 (
    echo  [OK]  Backend running on port %BACKEND_PORT%
    for /f "tokens=5" %%a in ('netstat -n ^| findstr /i ":!BACKEND_PORT!  LISTENING"') do echo        PID: %%a
) else (
    echo  [OFF] Backend on port %BACKEND_PORT%
)

netstat -n | findstr /i ":!FRONTEND_PORT!  LISTENING" >nul
if errorlevel 0 (
    echo  [OK]  Frontend on port %FRONTEND_PORT%
    for /f "tokens=5" %%a in ('netstat -n ^| findstr /i ":!FRONTEND_PORT!  LISTENING"') do echo        PID: %%a
) else (
    echo  [OFF] Frontend on port %FRONTEND_PORT%
)

echo ==========================================
echo.
echo URLs:
echo  Frontend: http://localhost:%FRONTEND_PORT%
echo  Backend:  http://localhost:%BACKEND_PORT%
echo  Health:   http://localhost:%BACKEND_PORT%/api/health
goto :eof

:: -------------------------------------------------------------------------
:: :do_logs - Show recent logs
:: -------------------------------------------------------------------------
:do_logs
echo.
echo --- Backend Log (last 30 lines) ---
if exist "%BACKEND_DIR%\backend.log" (
    powershell -Command "Get-Content '%BACKEND_DIR%\backend.log' -Tail 30 2^>^&1"
) else (
    echo  (no backend.log found)
)
echo.
echo --- Frontend Log (last 30 lines) ---
if exist "%FRONTEND_DIR%\frontend.log" (
    powershell -Command "Get-Content '%FRONTEND_DIR%\frontend.log' -Tail 30 2^>^&1"
) else (
    echo  (no frontend.log found)
)
goto :eof