param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa",
  [string]$Password,
  [string]$RemoteDir = "/opt/crossborder-commerce-kit",
  [switch]$SkipBootstrap,
  [switch]$WithObservability
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-LocalStep {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Command
}

if ([string]::IsNullOrWhiteSpace($Password) -and -not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH private key not found: $KeyPath"
}

$sshTarget = "$User@$HostName"
$sshBase = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")
$copyCommand = "scp"
$sshCommand = "ssh"

if ([string]::IsNullOrWhiteSpace($Password)) {
  $sshBase = @("-i", $KeyPath, "-o", "IdentitiesOnly=yes") + $sshBase
} else {
  $plink = Get-Command plink.exe -ErrorAction SilentlyContinue
  $pscp = Get-Command pscp.exe -ErrorAction SilentlyContinue
  if (-not $plink -or -not $pscp) {
    throw "Password deployment requires PuTTY plink.exe and pscp.exe in PATH. Use SSH key mode instead."
  }

  $sshCommand = $plink.Source
  $copyCommand = $pscp.Source
  $sshBase = @("-batch", "-pw", $Password, "-ssh", "-P", "22")
}

function Invoke-Remote {
  param([string]$Command)

  if ([string]::IsNullOrWhiteSpace($Password)) {
    ssh @sshBase $sshTarget $Command
    return
  }

  & $sshCommand @sshBase $sshTarget $Command
}

function Copy-ToRemote {
  param(
    [string]$Source,
    [string]$Target
  )

  if ([string]::IsNullOrWhiteSpace($Password)) {
    scp @sshBase $Source "${sshTarget}:$Target"
    return
  }

  & $copyCommand @sshBase $Source "${sshTarget}:$Target"
}

Invoke-LocalStep "Verify local deployment config" {
  powershell -ExecutionPolicy Bypass -File scripts/validate-deployment-config.ps1 -EnvFile ".env.example" -AllowPlaceholders
  docker compose config --quiet
}

Invoke-LocalStep "Verify SSH connectivity" {
  Invoke-Remote "echo connected"
}

if (-not $SkipBootstrap) {
  Invoke-LocalStep "Upload and run Ubuntu bootstrap" {
    Copy-ToRemote "infra/deploy/ubuntu-bootstrap.sh" "/tmp/cbck-ubuntu-bootstrap.sh"
    if ([string]::IsNullOrWhiteSpace($Password)) {
      Invoke-Remote "sudo APP_USER='$User' APP_DIR='$RemoteDir' bash /tmp/cbck-ubuntu-bootstrap.sh"
    } else {
      Invoke-Remote "echo '$Password' | sudo -S APP_USER='$User' APP_DIR='$RemoteDir' bash /tmp/cbck-ubuntu-bootstrap.sh"
    }
  }
}

Invoke-LocalStep "Create deployment archive" {
  $archive = Join-Path $env:TEMP "crossborder-commerce-kit-deploy.tar"
  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
  }

  git archive --format=tar --output=$archive HEAD
  Copy-ToRemote $archive "/tmp/crossborder-commerce-kit-deploy.tar"
}

Invoke-LocalStep "Unpack source and prepare env" {
  Invoke-Remote @"
set -e
sudo install -d -o $User -g $User $RemoteDir
tar -xf /tmp/crossborder-commerce-kit-deploy.tar -C $RemoteDir
cd $RemoteDir
if [ ! -f .env ]; then
  cp .env.example .env
fi
"@
}

$profiles = "--profile app"
if ($WithObservability) {
  $profiles = "$profiles --profile observability"
}

Invoke-LocalStep "Build and start Docker Compose stack" {
  Invoke-Remote "cd '$RemoteDir' && docker compose $profiles up -d --build"
}

Invoke-LocalStep "Show service status" {
  Invoke-Remote "cd '$RemoteDir' && docker compose ps"
}

Invoke-LocalStep "HTTP smoke check" {
  Invoke-Remote @"
set -e
curl -fsS http://localhost:3000 >/dev/null
curl -fsS http://localhost:3001 >/dev/null
curl -fsS http://localhost:4000/health >/dev/null || curl -fsS http://localhost:4000 >/dev/null
curl -fsS http://localhost:4001/health >/dev/null || curl -fsS http://localhost:4001 >/dev/null
"@
}

Write-Host ""
Write-Host "Deployment completed."
Write-Host "Storefront: http://$HostName`:3000"
Write-Host "Admin: http://$HostName`:3001"
Write-Host "API Gateway: http://$HostName`:4000"
Write-Host "Admin Gateway: http://$HostName`:4001"
