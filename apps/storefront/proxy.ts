const analyticsServiceUrl = process.env.ANALYTICS_SERVICE_URL ?? "http://analytics-service:4115";
const ingestToken = process.env.ANALYTICS_INGEST_TOKEN ?? "";
const trustedRealIpHeader = process.env.TRUSTED_REAL_IP_HEADER?.trim().toLowerCase();
const trustedCountryHeader = process.env.TRUSTED_COUNTRY_HEADER?.trim().toLowerCase();

function clientIp(request: Request) {
  if (trustedRealIpHeader) {
    const trusted = request.headers.get(trustedRealIpHeader)?.split(",")[0]?.trim();
    if (trusted) return trusted;
  }
  return "unknown";
}

export function proxy(request: Request, event: { waitUntil(promise: Promise<unknown>): void }) {
  const url = new URL(request.url);
  if (ingestToken) {
    event.waitUntil(
      fetch(`${analyticsServiceUrl}/server-requests`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-analytics-ingest-token": ingestToken
        },
        body: JSON.stringify({
          path: url.pathname + url.search,
          ipAddress: clientIp(request),
          countryCode: trustedCountryHeader ? request.headers.get(trustedCountryHeader) : null,
          referrer: request.headers.get("referer") ?? "",
          userAgent: request.headers.get("user-agent") ?? ""
        })
      }).catch(() => undefined)
    );
  }
}

export const config = {
  matcher: ["/((?!_next|static|assets|api|favicon.ico|robots.txt|sitemap.xml).*)"]
};
