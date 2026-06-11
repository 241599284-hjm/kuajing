export type CurrencyCode = "USD" | "EUR" | "GBP" | "HKD" | "CNY" | string;

export type Money = {
  amountMinor: number;
  currency: CurrencyCode;
};

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error("Money amount must be stored as integer minor units");
  }
  return { amountMinor, currency };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error("Cannot add money in different currencies");
  }
  return money(left.amountMinor + right.amountMinor, left.currency);
}

