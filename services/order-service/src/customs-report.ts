type CustomsReportOrder = {
  orderId: string;
  orderNumber: string;
  currency: string;
  shippingAddress: {
    country: string;
    province: string;
    city: string;
    postalCode: string;
    street: string;
  };
  lines: Array<{
    skuCode: string;
    title: string;
    hsCode: string;
    material: string;
    customsDeclaration: string;
    originCountry: string;
    weightGrams: number;
    quantity: number;
    unitPriceMinor: number;
  }>;
};

export class CustomsReportError extends Error {}

export function buildCustomsReport(order: CustomsReportOrder) {
  const incompleteLine = order.lines.find((line) => (
    !line.skuCode.trim()
    || !line.title.trim()
    || !line.hsCode.trim()
    || !line.material.trim()
    || !line.customsDeclaration.trim()
    || !/^[A-Z]{2}$/.test(line.originCountry.trim().toUpperCase())
    || !Number.isInteger(line.weightGrams)
    || line.weightGrams <= 0
  ));
  if (incompleteLine) {
    throw new CustomsReportError(
      `customs snapshots are incomplete for SKU ${incompleteLine.skuCode || "unknown"}`
    );
  }
  const rows = order.lines.map((line) => ({
    skuCode: line.skuCode,
    productTitle: line.title,
    description: line.customsDeclaration,
    hsCode: line.hsCode,
    material: line.material,
    originCountry: line.originCountry.toUpperCase(),
    quantity: line.quantity,
    unitWeightGrams: line.weightGrams,
    totalWeightGrams: line.weightGrams * line.quantity,
    unitDeclaredValueMinor: line.unitPriceMinor,
    totalDeclaredValueMinor: line.unitPriceMinor * line.quantity,
    currency: order.currency
  }));

  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    destination: order.shippingAddress,
    currency: order.currency,
    totalWeightGrams: rows.reduce((total, row) => total + row.totalWeightGrams, 0),
    totalDeclaredValueMinor: rows.reduce((total, row) => total + row.totalDeclaredValueMinor, 0),
    rows
  };
}
