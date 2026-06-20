export function normalizeNewsletterEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("a valid email address is required");
  }
  return email;
}

function positiveInteger(value: unknown, fallback: number, field: string, maximum: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(normalized) || Number(normalized) < 1 || Number(normalized) > maximum) {
    throw new Error(`${field} must be an integer from 1 to ${maximum}`);
  }
  return Number(normalized);
}

export function normalizeNewsletterListQuery(input: {
  page?: unknown;
  size?: unknown;
  status?: unknown;
  search?: unknown;
}) {
  const page = positiveInteger(input.page, 1, "page", 100000);
  const size = positiveInteger(input.size, 20, "size", 100);
  const status = input.status === undefined || input.status === "" ? "all" : input.status;
  if (status !== "all" && status !== "active" && status !== "unsubscribed") {
    throw new Error("status must be all, active, or unsubscribed");
  }
  const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
  if (search.length > 254) throw new Error("search must not exceed 254 characters");
  return { page, size, offset: (page - 1) * size, status, search };
}

export type NewsletterStatus = "active" | "unsubscribed";

export function normalizeNewsletterStatusUpdate(
  emailValue: unknown,
  statusValue: unknown,
): { email: string; status: NewsletterStatus } {
  const email = normalizeNewsletterEmail(emailValue);
  if (statusValue !== "active" && statusValue !== "unsubscribed") {
    throw new Error("status must be active or unsubscribed");
  }
  return { email, status: statusValue };
}

export function newsletterEventAction(
  previousStatus: NewsletterStatus | null,
  nextStatus: NewsletterStatus,
) {
  if (nextStatus === "unsubscribed") return "unsubscribed";
  return previousStatus === "unsubscribed" ? "reactivated" : "subscribed";
}
