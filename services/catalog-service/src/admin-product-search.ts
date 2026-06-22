export function normalizeAdminProductSearch(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export function adminProductSearchFilter(search: string, parameterIndex: number) {
  if (!search) return { sql: "", values: [] as string[] };
  return {
    sql: `AND (
      s.sku_code ILIKE $${parameterIndex}
      OR p.slug ILIKE $${parameterIndex}
      OR p.title ILIKE $${parameterIndex}
      OR pt_zh.name ILIKE $${parameterIndex}
      OR pt_en.name ILIKE $${parameterIndex}
      OR c.slug ILIKE $${parameterIndex}
      OR r.slug ILIKE $${parameterIndex}
    )`,
    values: [`%${search}%`]
  };
}
