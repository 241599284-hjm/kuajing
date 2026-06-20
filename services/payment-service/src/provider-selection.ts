export type PaymentProviderName = "mock" | "paypal";

export function normalizePaymentProviderName(value: string | undefined): PaymentProviderName {
  const provider = value?.trim().toLowerCase() || "mock";
  if (provider === "mock" || provider === "paypal") return provider;
  throw new Error(`Unsupported payment provider: ${provider}`);
}
