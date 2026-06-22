export const analyticsConsentStorageKey = "cookie-consent-v1";
export const analyticsConsentEvent = "storefront-analytics-consent";

export function analyticsAllowed(consent: string | null, doNotTrack: string | null | undefined) {
  const dnt = doNotTrack?.toLowerCase();
  return consent === "accepted" && dnt !== "1" && dnt !== "yes";
}
