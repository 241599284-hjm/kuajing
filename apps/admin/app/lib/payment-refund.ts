export function parseRefundAmountMinor(value: string, refundableMinor: number): { amountMinor: number } | { error: string } {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) {
    return { error: "请输入大于 0 且最多两位小数的退款金额" };
  }

  const amountMinor = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { error: "请输入大于 0 且最多两位小数的退款金额" };
  }
  if (amountMinor > refundableMinor) {
    return { error: "退款金额不能超过当前可退款余额" };
  }

  return { amountMinor };
}
