const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

export function clampDurationSeconds(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.min(86_400, Math.round(seconds)));
}

export function normalizePath(value: unknown) {
  if (typeof value !== "string") return "/";
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 2_000) return "/";
  return path;
}

export function shouldRecordServerPath(value: unknown) {
  const path = normalizePath(value).split("?")[0] ?? "/";
  return ![
    "/_next/",
    "/static/",
    "/assets/",
    "/api/",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml"
  ].some((prefix) => path === prefix || path.startsWith(prefix));
}

export function normalizeCountry(value: string | undefined) {
  const code = value?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code) || code === "XX") {
    return { code: null, name: "Unknown" };
  }
  return { code, name: countryNames.of(code) ?? code };
}

function timezoneOffsetMilliseconds(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return representedAsUtc - date.getTime();
}

function zonedMidnight(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  const firstOffset = timezoneOffsetMilliseconds(utcGuess, timezone);
  const firstPass = new Date(utcGuess.getTime() - firstOffset);
  const correctedOffset = timezoneOffsetMilliseconds(firstPass, timezone);
  return new Date(utcGuess.getTime() - correctedOffset);
}

export function resolveBusinessDayRange(date: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date must use YYYY-MM-DD");
  }
  const start = zonedMidnight(date, timezone);
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const endDate = nextDate.toISOString().slice(0, 10);
  return { start, end: zonedMidnight(endDate, timezone) };
}

export function maskIp(value: string) {
  if (value.includes(":")) {
    const segments = value.split(":").filter(Boolean);
    return `${segments.slice(0, 3).join(":")}::`;
  }
  const segments = value.split(".");
  return segments.length === 4 ? `${segments[0]}.${segments[1]}.${segments[2]}.0` : "unknown";
}
