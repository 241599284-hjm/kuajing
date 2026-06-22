export type GlobalSearchResult = {
  type: "order" | "product" | "customer";
  id: string;
  section: "orders" | "products" | "customers";
  title: string;
  subtitle: string;
  meta: string;
};

export function globalSearchSelection(result: GlobalSearchResult) {
  return {
    section: result.section,
    search: result.type === "product" ? result.id : result.type === "customer" ? result.subtitle : result.title
  };
}
