const PAYPAL_APPROVAL_HOSTS = new Set([
  "www.paypal.com",
  "www.sandbox.paypal.com"
]);

export function safePayPalRedirectUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !PAYPAL_APPROVAL_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
