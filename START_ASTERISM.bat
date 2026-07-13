@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Asterism Development Server
cd /d "%~dp0"

echo.
echo ========================================
echo   Starting Asterism
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo Install Node.js 24 LTS, then run this file again.
  goto :failed
)

call :find_docker
if errorlevel 1 goto :failed

"%DOCKER_CMD%" info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Starting Docker Desktop...
  if not exist "%DOCKER_DESKTOP%" (
    echo [ERROR] Docker Desktop could not be found at:
    echo         %DOCKER_DESKTOP%
    echo Start Docker Desktop manually, then run this file again.
    goto :failed
  )

  start "" "%DOCKER_DESKTOP%"
  echo Waiting for Docker Desktop to become ready...
  call :wait_for_docker
  if errorlevel 1 goto :failed
)

:docker_ready
echo [OK] Docker is ready.

if not exist ".env" (
  echo Creating .env from .env.example...
  copy /y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo [ERROR] Could not create .env.
    goto :failed
  )
)

if not exist "node_modules" (
  echo Installing project dependencies...
  call :pnpm install
  if errorlevel 1 goto :pnpm_failed
)

echo Starting PostgreSQL...
call :pnpm infra:up
if errorlevel 1 goto :pnpm_failed

echo Waiting for PostgreSQL to become ready...
set /a POSTGRES_ATTEMPTS=0
:wait_for_postgres
"%DOCKER_CMD%" compose exec -T postgres pg_isready -U asterism -d asterism >nul 2>&1
if not errorlevel 1 goto :postgres_ready
timeout /t 2 /nobreak >nul
set /a POSTGRES_ATTEMPTS+=1
if !POSTGRES_ATTEMPTS! GEQ 30 (
  echo [ERROR] PostgreSQL did not become ready within 60 seconds.
  goto :failed
)
goto :wait_for_postgres

:postgres_ready
echo [OK] PostgreSQL is ready.

echo Applying database migrations...
call :pnpm db:migrate
if errorlevel 1 goto :pnpm_failed

echo.
echo ========================================
echo   Asterism is starting
echo   Open http://localhost:5173
echo   Press Ctrl+C here to stop the app.
echo ========================================
echo.

call :pnpm dev
exit /b %errorlevel%

:find_docker
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "DOCKER_CMD="

where docker >nul 2>&1
if not errorlevel 1 set "DOCKER_CMD=docker"

if not defined DOCKER_CMD if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
  set "DOCKER_CMD=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
)

if not defined DOCKER_CMD (
  echo [ERROR] Docker Desktop is not installed or the Docker command cannot be found.
  echo Install Docker Desktop, then run this file again.
  exit /b 1
)
exit /b 0

:wait_for_docker
set /a DOCKER_ATTEMPTS=0
:wait_for_docker_loop
timeout /t 2 /nobreak >nul
"%DOCKER_CMD%" info >nul 2>&1
if not errorlevel 1 exit /b 0
set /a DOCKER_ATTEMPTS+=1
if !DOCKER_ATTEMPTS! GEQ 90 (
  echo [ERROR] Docker Desktop did not become ready within 3 minutes.
  exit /b 1
)
goto :wait_for_docker_loop

:pnpm
where pnpm >nul 2>&1
if not errorlevel 1 (
  call pnpm %*
  exit /b !errorlevel!
)

where corepack >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm and corepack are not available in PATH.
  exit /b 1
)

call corepack pnpm %*
exit /b !errorlevel!

:pnpm_failed
echo [ERROR] A required pnpm command failed.

:failed
echo.
echo Asterism could not be started. Review the error above.
pause
exit /b 1
