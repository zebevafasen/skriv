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
$env:CARGO_HOME = Join-Path $env:USERPROFILE ".cargo"
$env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');$env:PATH"
$env:TEMP = Join-Path $root ".tmp"
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null

$vsDevCmd = "E:\BuildTools\Common7\Tools\VsDevCmd.bat"
if (Test-Path $vsDevCmd) {
  cmd.exe /s /c "`"$vsDevCmd`" -no_logo -arch=x64 && set" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
  }
}

$manifest = Join-Path $root "apps\desktop\src-tauri\Cargo.toml"
$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
switch ($Command) {
  "dev" { pnpm --filter @asterism/desktop tauri dev }
  "build" { pnpm --filter @asterism/desktop tauri build }
  "e2e-build" { pnpm --filter @asterism/desktop tauri build --debug --no-bundle }
  "check" { & $cargo check --manifest-path $manifest }
  "test" { & $cargo test --manifest-path $manifest }
  "clippy" { & $cargo clippy --manifest-path $manifest --all-targets -- -D warnings }
  "fmt" { & $cargo fmt --manifest-path $manifest -- --check }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
