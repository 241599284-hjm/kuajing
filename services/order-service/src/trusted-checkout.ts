type BrowserCheckoutLine = {
  slug?: string;
  quantity?: number;
  skuId?: string;
  skuCode?: string;
  title?: string;
  unitPriceMinor?: number;
  currency?: string;
};

export type TrustedCatalogProduct = {
  slug: string;
  status: string;
  skuId: string;
  skuCode: string;
  originCountry: string;
  price: {
    minor: number;
    currency: string;
  };
  copy: {
    en: {
      name: string;
      details: {
        material: string;
        hsCode: string;
        customsDeclaration: string;
        weightGrams: number;
      };
    };
  };
};

function requiredText(value: unknown, field: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

export function trustedCheckoutLine(line: BrowserCheckoutLine, product: TrustedCatalogProduct) {
  const slug = requiredText(line.slug, "line slug");
  const quantity = Number(line.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
    throw new Error("line quantity must be 1-99");
  }
  if (product.slug !== slug || product.status !== "active") {
    throw new Error("product is not available for checkout");
  }

  const title = requiredText(product.copy.en.name, "catalog English product name");
  const hsCode = requiredText(product.copy.en.details.hsCode, "catalog customs HS code");
  const material = requiredText(product.copy.en.details.material, "catalog customs material");
  const customsDeclaration = requiredText(
    product.copy.en.details.customsDeclaration,
    "catalog customs declaration"
  );
  const originCountry = requiredText(product.originCountry, "catalog customs origin country").toUpperCase();
  const weightGrams = Number(product.copy.en.details.weightGrams);
  const unitPriceMinor = Number(product.price.minor);
  const currency = requiredText(product.price.currency, "catalog currency").toUpperCase();

  if (!/^[A-Z]{2}$/.test(originCountry) || !Number.isInteger(weightGrams) || weightGrams <= 0) {
    throw new Error("catalog customs origin country and weight are invalid");
  }
  if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new Error("catalog price is invalid");
  }

  return {
    slug,
    skuId: requiredText(product.skuId, "catalog skuId"),
    skuCode: requiredText(product.skuCode, "catalog skuCode"),
    title,
    hsCode,
    material,
    customsDeclaration,
    originCountry,
    weightGrams,
    quantity,
    unitPriceMinor,
    currency
  };
}
