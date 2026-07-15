@echo off
setlocal
cd /d "%~dp0"
title Asterism Desktop Development

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm is required to run the development build.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing JavaScript dependencies...
  call pnpm install
  if errorlevel 1 goto :failed
)

echo Starting the local Asterism desktop application...
call pnpm desktop:dev
exit /b %errorlevel%

:failed
echo Asterism could not be started. Review the error above.
pause
exit /b 1
