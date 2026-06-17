param(
  [Parameter(Mandatory = $true)]
  [string]$Domain
)

$ErrorActionPreference = "Stop"

function Normalize-Domain([string]$Value) {
  return (($Value -replace '^https?://', '') -split '/')[0] -split ':' | Select-Object -First 1
}

function Get-CertificateInfo([string]$HostName) {
  $tcp = [System.Net.Sockets.TcpClient]::new()
  try {
    $tcp.Connect($HostName, 443)
    $ssl = [System.Net.Security.SslStream]::new($tcp.GetStream(), $false, { $true })
    try {
      $ssl.AuthenticateAsClient($HostName)
      $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
      $daysRemaining = [Math]::Ceiling(($cert.NotAfter.ToUniversalTime() - (Get-Date).ToUniversalTime()).TotalDays)
      return [ordered]@{
        subject = $cert.Subject
        issuer = $cert.Issuer
        validFromUtc = $cert.NotBefore.ToUniversalTime().ToString("o")
        validToUtc = $cert.NotAfter.ToUniversalTime().ToString("o")
        daysRemaining = $daysRemaining
      }
    } finally {
      $ssl.Dispose()
    }
  } finally {
    $tcp.Dispose()
  }
}

$domainName = Normalize-Domain $Domain
if ([string]::IsNullOrWhiteSpace($domainName) -or $domainName -eq "[WEBSITE_DOMAIN]") {
  throw "Please pass a real domain, for example: -Domain hlandteaware.com"
}

$dns = [ordered]@{ cname = @(); ipv4 = @(); ipv6 = @() }
try { $dns.cname = @(Resolve-DnsName -Name $domainName -Type CNAME -ErrorAction Stop | ForEach-Object { $_.NameHost } | Where-Object { $_ }) } catch {}
try { $dns.ipv4 = @(Resolve-DnsName -Name $domainName -Type A -ErrorAction Stop | ForEach-Object { $_.IPAddress } | Where-Object { $_ }) } catch {}
try { $dns.ipv6 = @(Resolve-DnsName -Name $domainName -Type AAAA -ErrorAction Stop | ForEach-Object { $_.IPAddress } | Where-Object { $_ }) } catch {}

$certificate = Get-CertificateInfo $domainName

$homepage = [ordered]@{ status = 0; finalUrl = "https://$domainName"; mixedContentRefs = @() }
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "https://$domainName" -TimeoutSec 15
  $homepage.status = [int]$response.StatusCode
  $homepage.finalUrl = $response.BaseResponse.ResponseUri.AbsoluteUri
  $matches = [regex]::Matches($response.Content, 'http://[^"''\s<>)]*', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $homepage.mixedContentRefs = @($matches |
    ForEach-Object { $_.Value } |
    Where-Object { -not $_.ToLowerInvariant().StartsWith("http://www.w3.org/") } |
    Select-Object -Unique -First 20)
} catch {
  $homepage.error = $_.Exception.Message
}

$ok = (($dns.cname.Count + $dns.ipv4.Count + $dns.ipv6.Count) -gt 0) -and
  ($homepage.status -ge 200) -and
  ($homepage.status -lt 400) -and
  ($certificate.daysRemaining -gt 15) -and
  ($homepage.mixedContentRefs.Count -eq 0)

$result = [ordered]@{
  domain = $domainName
  ok = $ok
  dns = $dns
  certificate = $certificate
  homepage = $homepage
}

$result | ConvertTo-Json -Depth 8

if (-not $ok) {
  exit 1
}
