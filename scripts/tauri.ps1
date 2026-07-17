param(
  [Parameter(Position = 0)]
  [ValidateSet("dev", "build", "e2e-build", "check", "test", "clippy", "fmt")]
  [string]$Command = "dev"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$repoRustup = Join-Path $root ".rustup"
if (Test-Path (Join-Path $repoRustup "toolchains")) {
  $env:RUSTUP_HOME = $repoRustup
}
$env:TEMP = Join-Path $root ".tmp"
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null

$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargoCommand) {
  $userCargo = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".cargo\bin\cargo.exe"
  if (-not (Test-Path $userCargo)) {
    throw "Cargo was not found. Install the stable Rust MSVC toolchain and restart the terminal."
  }
  $cargoCommand = Get-Item $userCargo
}

if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
  $vswhereCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"),
    (Join-Path $env:ProgramFiles "Microsoft Visual Studio\Installer\vswhere.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }
  $vswhere = $vswhereCandidates | Select-Object -First 1
  if ($vswhere) {
    $installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    $vsDevCmd = if ($installation) { Join-Path $installation "Common7\Tools\VsDevCmd.bat" } else { $null }
    if ($vsDevCmd -and (Test-Path $vsDevCmd)) {
      cmd.exe /s /c "`"$vsDevCmd`" -no_logo -arch=x64 && set" | ForEach-Object {
        if ($_ -match "^([^=]+)=(.*)$") {
          [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
      }
    }
  }
}

$manifest = Join-Path $root "apps\desktop\src-tauri\Cargo.toml"
$cargo = $cargoCommand.Source
$target = Join-Path $root "apps\desktop\src-tauri\target"
$targetRootMarker = Join-Path $target ".skriv-workspace-root"
if ($Command -in @("dev", "build", "e2e-build")) {
  $normalizedRoot = ([IO.Path]::GetFullPath($root)).TrimEnd("\").ToLowerInvariant()
  $previousRoot = if (Test-Path $targetRootMarker) {
    (Get-Content -Raw $targetRootMarker).Trim().ToLowerInvariant()
  } else {
    $null
  }
  if ((Test-Path $target -PathType Container) -and $previousRoot -ne $normalizedRoot) {
    Write-Host "Cargo target belongs to a different workspace path; clearing stale desktop build artifacts."
    & $cargo clean --manifest-path $manifest
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  [IO.File]::WriteAllText($targetRootMarker, $normalizedRoot)
}
switch ($Command) {
  "dev" { pnpm --filter @skriv/desktop tauri dev }
  "build" { pnpm --filter @skriv/desktop tauri build }
  "e2e-build" { pnpm --filter @skriv/desktop tauri build --debug --no-bundle }
  "check" { & $cargo check --manifest-path $manifest }
  "test" { & $cargo test --manifest-path $manifest }
  "clippy" { & $cargo clippy --manifest-path $manifest --all-targets -- -D warnings }
  "fmt" { & $cargo fmt --manifest-path $manifest -- --check }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
