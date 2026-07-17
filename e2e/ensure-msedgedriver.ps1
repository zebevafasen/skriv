param(
  [Parameter(Mandatory = $true)]
  [string]$CacheRoot
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$registryPaths = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
)

$webViewVersion = $null
foreach ($registryPath in $registryPaths) {
  if (Test-Path -LiteralPath $registryPath) {
    $candidate = (Get-ItemProperty -LiteralPath $registryPath -Name "pv" -ErrorAction SilentlyContinue).pv
    if ($candidate -match "^\d+(\.\d+){3}$") {
      $webViewVersion = $candidate
      break
    }
  }
}
if (-not $webViewVersion) {
  throw "Microsoft Edge WebView2 Runtime was not found in the registry."
}

$cachePath = [System.IO.Path]::GetFullPath($CacheRoot)
[System.IO.Directory]::CreateDirectory($cachePath) | Out-Null

$cachedDrivers = Get-ChildItem -LiteralPath $cachePath -Filter "msedgedriver.exe" -File -Recurse -ErrorAction SilentlyContinue
foreach ($cachedDriver in $cachedDrivers) {
  $reportedVersion = ((& $cachedDriver.FullName --version 2>$null) -replace "^MSEdgeDriver\s+", "").Trim()
  if ($reportedVersion -eq $webViewVersion) {
    Write-Output $cachedDriver.DirectoryName
    exit 0
  }
}

$driverVersion = $webViewVersion

$driverDirectory = Join-Path $cachePath $driverVersion
[System.IO.Directory]::CreateDirectory($driverDirectory) | Out-Null
$driverPath = Join-Path $driverDirectory "msedgedriver.exe"
$archivePath = Join-Path $driverDirectory "edgedriver.zip"
$architecture = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
$downloadUrl = "https://msedgedriver.microsoft.com/$driverVersion/edgedriver_$architecture.zip"

Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -UseBasicParsing -TimeoutSec 60
Expand-Archive -LiteralPath $archivePath -DestinationPath $driverDirectory -Force
Remove-Item -LiteralPath $archivePath -Force
if (-not (Test-Path -LiteralPath $driverPath -PathType Leaf)) {
  throw "The Microsoft Edge WebDriver archive did not contain msedgedriver.exe."
}

Write-Output $driverDirectory
