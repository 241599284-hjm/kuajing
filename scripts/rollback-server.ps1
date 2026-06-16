param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa",
  [string]$Password,
  [string]$RemoteDir = "/opt/crossborder-commerce-kit",
  [string]$Version,
  [switch]$WithObservability
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

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

function Escape-ShellSingleQuote {
  param([string]$Value)
  return $Value.Replace("'", "'\''")
}

if ([string]::IsNullOrWhiteSpace($Password) -and -not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH private key not found: $KeyPath"
}

$sshTarget = "$User@$HostName"
$sshBase = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")
$sshCommand = "ssh"

if ([string]::IsNullOrWhiteSpace($Password)) {
  $sshBase = @("-i", $KeyPath, "-o", "IdentitiesOnly=yes") + $sshBase
} else {
  $plink = Get-Command plink.exe -ErrorAction SilentlyContinue
  if (-not $plink) {
    throw "Password rollback requires PuTTY plink.exe in PATH. Use SSH key mode instead."
  }

  $sshCommand = $plink.Source
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

$profiles = "--profile app"
if ($WithObservability) {
  $profiles = "$profiles --profile observability"
}

$escapedRemoteDir = Escape-ShellSingleQuote $RemoteDir
$escapedVersion = Escape-ShellSingleQuote $Version
$escapedProfiles = Escape-ShellSingleQuote $profiles

$remoteCommand = @"
set -e
base='$escapedRemoteDir'
version='$escapedVersion'
profiles='$escapedProfiles'

if [ -n "`$version" ]; then
  target="`$base/releases/`$version"
else
  if [ -L "`$base/previous" ]; then
    target="`$(readlink -f "`$base/previous")"
  else
    target="`$(find "`$base/releases" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 2 | head -n 1)"
  fi
fi

if [ -z "`$target" ] || [ ! -d "`$target" ]; then
  echo "Rollback target not found. Available releases:" >&2
  find "`$base/releases" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort >&2 || true
  exit 1
fi

current="`$(readlink -f "`$base/current" 2>/dev/null || true)"
if [ -n "`$current" ] && [ "`$current" != "`$target" ]; then
  ln -sfn "`$current" "`$base/previous"
fi

ln -sfn "`$target" "`$base/current"
cd "`$base/current"
docker compose `$profiles up -d --build

wait_for_http() {
  name="`$1"
  url="`$2"
  attempts=30
  while [ "`$attempts" -gt 0 ]; do
    if curl -fsS --max-time 10 "`$url" >/dev/null; then
      echo "`$name ready"
      return 0
    fi
    attempts=`$((attempts - 1))
    sleep 3
  done
  echo "`$name did not become ready: `$url" >&2
  return 1
}

wait_for_http storefront http://localhost:3000
wait_for_http admin http://localhost:3001
wait_for_http api-gateway http://localhost:4000/health
wait_for_http admin-gateway http://localhost:4001/health

echo "Rollback completed: `$(basename "`$target")"
"@

Invoke-Remote $remoteCommand
