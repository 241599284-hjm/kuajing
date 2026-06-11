export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "[invalid-email]";
  return `${user.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export function redactPiiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(copy)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("email") && typeof copy[key] === "string") {
      copy[key] = maskEmail(copy[key] as string);
    }
    if (normalized.includes("phone") && typeof copy[key] === "string") {
      copy[key] = maskPhone(copy[key] as string);
    }
    if (normalized.includes("address")) {
      copy[key] = "[redacted]";
    }
  }
  return copy;
}
