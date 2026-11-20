@echo off
title Karma Fire Protection LLP - Run Program
setlocal

:: ==========================================================================
:: Project Runner - Starts backend + frontend for Karma Fire Protection
:: ==========================================================================

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
:: SET TELEGRAM CREDENTIALS (provided by user)
:: ==========================================================================
set "TELEGRAM_BOT_TOKEN=9239303763:AAHsC23U6gkuInGCEg60h-S9tbavOpPosGQ"
set "TELEGRAM_CHAT_ID="
set "ADMIN_TELEGRAM_IDS="
set "PORT=3000"

:: Export env vars for Node.js (node server.js reads process.env)
set "TELEGRAM_BOT_TOKEN"
set "TELEGRAM_CHAT_ID"
set "ADMIN_TELEGRAM_IDS"

echo.
echo ============================================================================
echo  Karma Fire Protection LLP - Running Program
echo ============================================================================
echo.

:: ==========================================================================
:: Step 1: Verify Node.js
:: ==========================================================================
echo [1/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found. Install from https://nodejs.org
    echo.
    goto :eof
)
echo  OK: Node.js $(node --version)

:: ==========================================================================
:: Step 2: Verify backend dependencies
:: ==========================================================================
echo.
echo [2/4] Checking backend setup...
cd /d "%BACKEND_DIR%"
if not exist "package.json" (
    echo  ERROR: package.json not found in backend/
    echo.
    goto :eof
)

if not exist "node_modules\" (
    echo  Installing npm dependencies...
    npm install 2>&1 | findstr /i "error" >nul
    if errorlevel 1 (
        echo  ERROR: npm install failed
        echo.
        goto :eof
    )
    echo  OK: Dependencies installed
) else (
    echo  OK: Dependencies already installed
)

:: ==========================================================================
:: Step 3: Start Backend Server
:: ==========================================================================
echo.
echo [3/4] Starting Backend Server (port %BACKEND_PORT%)...
cd /d "%BACKEND_DIR%"

:: Set env vars for this process and launch node
set TELEGRAM_BOT_TOKEN=%TELEGRAM_BOT_TOKEN%
set TELEGRAM_CHAT_ID=%TELEGRAM_CHAT_ID%
set ADMIN_TELEGRAM_IDS=%ADMIN_TELEGRAM_IDS%

start "Karma Backend API" cmd /c "node server.js"
ping -n 3 127.0.0.1 >nul 2>&1

:: Wait and verify backend is running
netstat -n | findstr /i ":!BACKEND_PORT!  LISTENING" >nul
if errorlevel 0 (
    echo  OK: Backend running at http://localhost:%BACKEND_PORT%
    echo  Health check: http://localhost:%BACKEND_PORT%/api/health
) else (
    echo  WARNING: Backend may not have started successfully
    echo  Check: %BACKEND_DIR%\backend.log
)

echo.

:: ==========================================================================
:: Step 4: Start Frontend Server
:: ==========================================================================
echo [4/4] Starting Frontend Server (port %FRONTEND_PORT%)...
cd /d "%FRONTEND_DIR%"

python --version >nul 2>&1
if errorlevel 0 (
    start "Karma Frontend Python" cmd /c "python -m http.server %FRONTEND_PORT%"
    echo  Using: Python http.server
    echo  Frontend: http://localhost:%FRONTEND_PORT%
) else (
    npx --version >nul 2>&1
    if errorlevel 0 (
        start "Karma Frontend npx" cmd /c "npx serve . -p %FRONTEND_PORT%"
        echo  Using: npx serve
        echo  Frontend: http://localhost:%FRONTEND_PORT%
    ) else (
        echo  ERROR: Neither Python nor npx found
        echo  Install Python (https://python.org) or Node.js with npx
        echo  Frontend not started - open HTML files directly
    )
)

ping -n 3 127.0.0.1 >nul 2>&1
netstat -n | findstr /i ":!FRONTEND_PORT!  LISTENING" >nul
if errorlevel 0 (
    echo  OK: Frontend running at http://localhost:%FRONTEND_PORT%
) else (
    echo  WARNING: Frontend may not have started successfully
)

echo.
echo ============================================================================
echo  ============================================================================
echo  Karma Fire Protection LLP - Program Running!
echo ============================================================================
echo.
echo  Frontend: http://localhost:%FRONTEND_PORT%
echo  Backend:  http://localhost:%BACKEND_PORT%
echo  Health:   http://localhost:%BACKEND_PORT%/api/health
echo.
echo  Test the lead form:
echo  1. Open http://localhost:%FRONTEND_PORT% in your browser
echo  2. Fill out the contact form
echo  3. Submit - lead will be saved to SQLite database
echo  4. Telegram notification sent (if CHAT_ID configured)
echo.
echo  Test the API directly:
echo  curl http://localhost:%BACKEND_PORT%/api/health
echo  curl -X POST http://localhost:%BACKEND_PORT%/api/leads ^
echo  -H "Content-Type: application/json" ^
echo  -d "{\"name\":\"Test User\",\"phone\":\"+919876543210\",\"email\":\"test@example.com\",\"service\":\"Fire Alarm System\",\"location\":\"Mumbai\",\"message\":\"Test\",\"consent\":true}"
echo.
echo  Press Ctrl+C to stop both servers, or close this window.
echo.
goto :eof