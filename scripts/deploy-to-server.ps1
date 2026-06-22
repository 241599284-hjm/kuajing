param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa",
  [string]$Password,
  [string]$RemoteDir = "/opt/crossborder-commerce-kit",
  [switch]$SkipBootstrap,
  [switch]$WithObservability,
  [switch]$ResetVolumes,
  [switch]$IncludeWorkingTree,
  [switch]$SkipLocalVerification
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$gitSha = (git rev-parse --short=12 HEAD).Trim()
$releaseStamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$releaseName = if ($IncludeWorkingTree) { "$releaseStamp-$gitSha-worktree" } else { "$releaseStamp-$gitSha" }

function Invoke-LocalStep {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Command
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
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
    Invoke-Native ssh @sshBase $sshTarget $Command
    return
  }

  Invoke-Native $sshCommand @sshBase $sshTarget $Command
}

function Copy-ToRemote {
  param(
    [string]$Source,
    [string]$Target
  )

  if ([string]::IsNullOrWhiteSpace($Password)) {
    Invoke-Native scp @sshBase $Source "${sshTarget}:$Target"
    return
  }

  Invoke-Native $copyCommand @sshBase $Source "${sshTarget}:$Target"
}

if (-not $SkipLocalVerification) {
  Invoke-LocalStep "Verify local deployment config" {
    powershell -ExecutionPolicy Bypass -File scripts/validate-deployment-config.ps1 -EnvFile ".env.example" -AllowPlaceholders
    docker compose config --quiet
  }
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
  $archive = Join-Path $env:TEMP "crossborder-commerce-kit-deploy-$releaseName.tar"
  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
  }

  if ($IncludeWorkingTree) {
    $tarArguments = @(
      "--exclude=node_modules",
      "--exclude=.turbo",
      "--exclude=dist",
      "--exclude=.next",
      "--exclude=*.log",
      "-cf",
      $archive,
      "apps",
      "docs",
      "infra",
      "packages",
      "scripts",
      "services",
      "tests",
      ".env.example",
      ".gitattributes",
      ".gitignore",
      ".npmrc",
      "docker-compose.yml",
      "LICENSE",
      "package.json",
      "playwright.config.ts",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.base.json",
      "turbo.json"
    )
    Invoke-Native tar @tarArguments
  } else {
    Invoke-Native git archive --format=tar --output=$archive HEAD
  }
  Copy-ToRemote $archive "/tmp/crossborder-commerce-kit-deploy-$releaseName.tar"
}

Invoke-LocalStep "Unpack versioned release and prepare env" {
  Invoke-Remote @"
set -e
sudo install -d -o $User -g $User $RemoteDir
install -d -o $User -g $User '$RemoteDir/releases' '$RemoteDir/shared'
release_dir='$RemoteDir/releases/$releaseName'
rm -rf "`$release_dir"
install -d -o $User -g $User "`$release_dir"
tar -xf '/tmp/crossborder-commerce-kit-deploy-$releaseName.tar' -C "`$release_dir"
if [ ! -f '$RemoteDir/shared/.env' ]; then
  if [ -f '$RemoteDir/current/.env' ]; then
    cp '$RemoteDir/current/.env' '$RemoteDir/shared/.env'
  elif [ -f '$RemoteDir/.env' ]; then
    cp '$RemoteDir/.env' '$RemoteDir/shared/.env'
  else
    cp "`$release_dir/.env.example" '$RemoteDir/shared/.env'
  fi
fi
sed -i -E 's#^STOREFRONT_PUBLIC_URL=http://(localhost|127\.0\.0\.1):3000$#STOREFRONT_PUBLIC_URL=http://$HostName`:3000#' '$RemoteDir/shared/.env'
sed -i -E 's#^ADMIN_PUBLIC_URL=http://(localhost|127\.0\.0\.1):3001$#ADMIN_PUBLIC_URL=http://$HostName`:3001#' '$RemoteDir/shared/.env'
sed -i -E 's#^AUTH_VERIFY_BASE_URL=.*$#AUTH_VERIFY_BASE_URL=http://$HostName`:3000/auth#' '$RemoteDir/shared/.env'
sed -i -E 's#^NEXT_PUBLIC_AUTH_SERVICE_URL=.*$#NEXT_PUBLIC_AUTH_SERVICE_URL=/auth#' '$RemoteDir/shared/.env'
sed -i -E 's#^NEXT_PUBLIC_API_GATEWAY_URL=http://(localhost|127\.0\.0\.1):4000$#NEXT_PUBLIC_API_GATEWAY_URL=http://$HostName`:4000#' '$RemoteDir/shared/.env'
sed -i -E 's#^NEXT_PUBLIC_ADMIN_GATEWAY_URL=http://(localhost|127\.0\.0\.1):4001$#NEXT_PUBLIC_ADMIN_GATEWAY_URL=http://$HostName`:4001#' '$RemoteDir/shared/.env'
sed -i -E 's#^NEXT_PUBLIC_STOREFRONT_URL=http://(localhost|127\.0\.0\.1):3000$#NEXT_PUBLIC_STOREFRONT_URL=http://$HostName`:3000#' '$RemoteDir/shared/.env'
sed -i -E 's#^NEXT_PUBLIC_ADMIN_ORIGIN=http://(localhost|127\.0\.0\.1):3001$#NEXT_PUBLIC_ADMIN_ORIGIN=http://$HostName`:3001#' '$RemoteDir/shared/.env'
if ! grep -Eq '^OPS_MAINTENANCE_TOKEN=.{32,}$' '$RemoteDir/shared/.env'; then
  token=`$(openssl rand -hex 32)
  if grep -q '^OPS_MAINTENANCE_TOKEN=' '$RemoteDir/shared/.env'; then
    sed -i "s#^OPS_MAINTENANCE_TOKEN=.*#OPS_MAINTENANCE_TOKEN=`$token#" '$RemoteDir/shared/.env'
  else
    printf '\nOPS_MAINTENANCE_TOKEN=%s\n' "`$token" >> '$RemoteDir/shared/.env'
  fi
fi
rm -f "`$release_dir/.env"
ln -s '$RemoteDir/shared/.env' "`$release_dir/.env"
if [ -L '$RemoteDir/current' ] || [ -e '$RemoteDir/current' ]; then
  previous_target=`$(readlink -f '$RemoteDir/current' || true)
  if [ -n "`$previous_target" ] && [ "`$previous_target" != "`$release_dir" ]; then
    ln -sfn "`$previous_target" '$RemoteDir/previous'
  fi
fi
ln -sfn "`$release_dir" '$RemoteDir/current'
printf '%s %s %s\n' '$releaseName' '$gitSha' "`$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> '$RemoteDir/deployments.log'
"@
}

$profiles = "--profile app"
if ($WithObservability) {
  $profiles = "$profiles --profile observability"
}

if ($ResetVolumes) {
  Invoke-LocalStep "Reset remote Docker Compose volumes" {
    Invoke-Remote "cd '$RemoteDir/current' && docker compose $profiles down -v --remove-orphans || true"
  }
}

Invoke-LocalStep "Build and start Docker Compose stack" {
  Invoke-Remote "cd '$RemoteDir/current' && docker compose $profiles up -d --build"
}

Invoke-LocalStep "Show service status" {
  Invoke-Remote "cd '$RemoteDir/current' && docker compose ps"
}

Invoke-LocalStep "HTTP smoke check" {
  Invoke-Remote @'
set -e
wait_for_http() {
  name="$1"
  url="$2"
  attempts=30
  while [ "$attempts" -gt 0 ]; do
    if curl -fsS --max-time 10 "$url" >/dev/null; then
      echo "$name ready"
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 3
  done
  echo "$name did not become ready: $url" >&2
  return 1
}

wait_for_http storefront http://localhost:3000
wait_for_http admin http://localhost:3001
wait_for_http api-gateway http://localhost:4000/health
wait_for_http admin-gateway http://localhost:4001/health
'@
}

Write-Host ""
Write-Host "Deployment completed."
Write-Host "Release: $releaseName"
Write-Host "Storefront: http://$HostName`:3000"
Write-Host "Admin: http://$HostName`:3001"
Write-Host "API Gateway: http://$HostName`:4000"
Write-Host "Admin Gateway: http://$HostName`:4001"
