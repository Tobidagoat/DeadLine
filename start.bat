@echo off
title Kanji SRS Server
cd /d "%~dp0"

echo ============================================
echo   Kanji SRS Server
echo ============================================
echo.
echo Folder: %CD%
echo.
echo To STOP the server: close this window, or press Ctrl+C.
echo To START it again: double-click start.bat, or just log back in
echo   (Task Scheduler will start it automatically).
echo.
echo ============================================
echo.

:: quick check: is node actually available?
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not on your PATH.
  echo Install it from https://nodejs.org or fix your PATH.
  echo.
  pause
  exit /b 1
)

:: quick check: does server.js exist?
if not exist "server.js" (
  echo [ERROR] server.js was not found in this folder.
  echo Make sure start.bat and server.js are in the same directory.
  echo.
  pause
  exit /b 1
)

:: quick check: is port 3000 already in use?
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [WARN] Something is already listening on port 3000.
  echo Another copy of the server might already be running.
  echo Close the other window first, or press any key to try anyway.
  echo.
  pause
)

echo Starting server...
echo.

node server.js

echo.
echo ============================================
echo   Server stopped.
echo ============================================
echo.
echo If this was unexpected, look at the error output above.
echo Press any key to close this window.
pause >nul