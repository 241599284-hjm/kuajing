type OrderSearchRecord = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  providerPaymentId?: string;
  status: string;
  totalMinor: number;
  currency: string;
};

type ProductSearchRecord = {
  sku: string;
  nameZh: string;
  nameEn: string;
  category: string;
  status: string;
};

type CustomerSearchRecord = {
  customerId: string;
  name: string;
  email: string;
  status: string;
};

export type GlobalSearchResult = {
  type: "order" | "product" | "customer";
  id: string;
  section: "orders" | "products" | "customers";
  title: string;
  subtitle: string;
  meta: string;
};

export function normalizeGlobalSearchQuery(value: unknown) {
  const query = typeof value === "string" ? value.trim().slice(0, 100) : "";
  if (query.length < 2) throw new Error("search query must contain at least 2 characters");
  return query;
}

export function buildGlobalSearchResults(
  records: {
    orders: OrderSearchRecord[];
    products: ProductSearchRecord[];
    customers: CustomerSearchRecord[];
  },
  limit: number
) {
  const results: GlobalSearchResult[] = [
    ...records.orders.map((order) => ({
      type: "order" as const,
      id: order.orderId,
      section: "orders" as const,
      title: order.orderNumber,
      subtitle: order.customerEmail,
      meta: `${order.providerPaymentId ?? order.status} · ${order.currency} ${(order.totalMinor / 100).toFixed(2)}`
    })),
    ...records.products.map((product) => ({
      type: "product" as const,
      id: product.sku,
      section: "products" as const,
      title: product.nameZh || product.nameEn || product.sku,
      subtitle: product.nameEn || product.sku,
      meta: `${product.sku} · ${product.category} · ${product.status}`
    })),
    ...records.customers.map((customer) => ({
      type: "customer" as const,
      id: customer.customerId,
      section: "customers" as const,
      title: customer.name || customer.email,
      subtitle: customer.email,
      meta: customer.status
    }))
  ];
  return results.slice(0, Math.max(1, Math.min(30, limit)));
}
