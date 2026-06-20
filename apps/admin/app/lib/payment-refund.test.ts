import { describe, expect, it } from "vitest";
import { parseRefundAmountMinor } from "./payment-refund.js";

describe("parseRefundAmountMinor", () => {
  it("converts a two-decimal amount to minor units", () => {
    expect(parseRefundAmountMinor("32.00", 6400)).toEqual({ amountMinor: 3200 });
  });

  it.each(["", "0", "-1", "1.001", "abc"])("rejects invalid amount %s", (value) => {
    expect(parseRefundAmountMinor(value, 6400)).toEqual({ error: "请输入大于 0 且最多两位小数的退款金额" });
  });

  it("rejects an amount above the refundable balance", () => {
    expect(parseRefundAmountMinor("64.01", 6400)).toEqual({ error: "退款金额不能超过当前可退款余额" });
  });
});
