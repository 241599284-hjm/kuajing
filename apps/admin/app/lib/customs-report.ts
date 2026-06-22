export type CustomsReport = {
  orderId: string;
  orderNumber: string;
  currency: string;
  totalWeightGrams: number;
  totalDeclaredValueMinor: number;
  destination: {
    country: string;
    province: string;
    city: string;
    postalCode: string;
    street: string;
  };
  rows: Array<{
    skuCode: string;
    productTitle: string;
    description: string;
    hsCode: string;
    material: string;
    originCountry: string;
    quantity: number;
    unitWeightGrams: number;
    totalWeightGrams: number;
    unitDeclaredValueMinor: number;
    totalDeclaredValueMinor: number;
    currency: string;
  }>;
};

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function customsReportCsv(report: CustomsReport) {
  const header = [
    "Order Number",
    "Destination Country",
    "Destination Province",
    "Destination City",
    "Postal Code",
    "Street",
    "SKU",
    "Product Title",
    "Customs Description",
    "HS Code",
    "Material",
    "Origin Country",
    "Quantity",
    "Unit Weight (g)",
    "Total Weight (g)",
    "Unit Declared Value",
    "Total Declared Value",
    "Currency"
  ];
  const rows = report.rows.map((row) => [
    report.orderNumber,
    report.destination.country,
    report.destination.province,
    report.destination.city,
    report.destination.postalCode,
    report.destination.street,
    row.skuCode,
    row.productTitle,
    row.description,
    row.hsCode,
    row.material,
    row.originCountry,
    row.quantity,
    row.unitWeightGrams,
    row.totalWeightGrams,
    (row.unitDeclaredValueMinor / 100).toFixed(2),
    (row.totalDeclaredValueMinor / 100).toFixed(2),
    row.currency
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
