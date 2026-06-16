param(
  [string]$OutputDir = "artifacts/deploy"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$outputPath = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$tarPath = Join-Path $outputPath "crossborder-commerce-kit-deploy.tar"
$gzipPath = "$tarPath.gz"
$bootstrapPath = Join-Path $outputPath "ubuntu-bootstrap.sh"
$installPath = Join-Path $outputPath "server-install-from-package.sh"

foreach ($path in @($tarPath, $gzipPath, $bootstrapPath, $installPath)) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
  }
}

git archive --format=tar --output=$tarPath HEAD

if (Get-Command gzip.exe -ErrorAction SilentlyContinue) {
  gzip -9 $tarPath
} else {
  tar -czf $gzipPath -C $outputPath (Split-Path -Leaf $tarPath)
  Remove-Item -LiteralPath $tarPath -Force
}

Copy-Item -LiteralPath "infra/deploy/ubuntu-bootstrap.sh" -Destination $bootstrapPath
Copy-Item -LiteralPath "infra/deploy/server-install-from-package.sh" -Destination $installPath

Write-Host "Server package generated:"
Write-Host $gzipPath
Write-Host $bootstrapPath
Write-Host $installPath
Write-Host ""
Write-Host "Upload these three files to the server /tmp directory, then run:"
Write-Host "sudo bash /tmp/server-install-from-package.sh /tmp/crossborder-commerce-kit-deploy.tar.gz"
