import { HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishDraftToCatalog, type CatalogPublishDraft } from "./catalog-publisher.js";

const draft: CatalogPublishDraft = {
  sku: "IMPORT-TEA-001",
  nameZh: "测试茶具",
  nameEn: "Test Tea Set",
  category: "gift",
  region: "jiangxi",
  priceMinor: 1299,
  detailZh: "测试详情",
  detailEn: "Test details",
  materialZh: "陶瓷",
  materialEn: "Ceramic",
  originZh: "中国",
  originEn: "China",
  originCountry: "CN",
  capacityZh: "200毫升",
  capacityEn: "200 ml",
  hsCode: "691200",
  packageLengthMm: 200,
  packageWidthMm: 200,
  packageHeightMm: 150,
  weightGrams: 900,
  customsDeclarationZh: "陶瓷茶具",
  customsDeclarationEn: "Ceramic tea set",
  mainImageUrl: "https://cdn.example.com/tea.webp"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publishDraftToCatalog", () => {
  it("returns the product id only after catalog confirms the matching SKU", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: "product-1", skuCode: draft.sku }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(publishDraftToCatalog({
      catalogServiceUrl: "http://catalog",
      taskId: "task-1",
      draft,
      actor: "admin",
      correlationId: "correlation-1"
    })).resolves.toBe("product-1");

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.products[0].priceMinor).toBe(1299);
    expect(body.products[0].status).toBe("active");
  });

  it("preserves a catalog validation error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "VALIDATION_FAILED", message: "invalid product" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      })
    );

    const result = publishDraftToCatalog({
      catalogServiceUrl: "http://catalog",
      taskId: "task-1",
      draft,
      actor: "admin",
      correlationId: "correlation-1"
    });

    await expect(result).rejects.toBeInstanceOf(HttpException);
    await expect(result).rejects.toMatchObject({ status: 400 });
  });

  it("returns dependency unavailable when catalog cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("connection refused"));

    await expect(publishDraftToCatalog({
      catalogServiceUrl: "http://catalog",
      taskId: "task-1",
      draft,
      actor: "admin",
      correlationId: "correlation-1"
    })).rejects.toMatchObject({
      status: 503,
      response: {
        code: "DEPENDENCY_UNAVAILABLE"
      }
    });
  });
});
