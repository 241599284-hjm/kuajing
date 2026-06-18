import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { ERROR_CODES, normalizeErrorPayload } from "@commerce/error-codes";

export type CatalogPublishDraft = {
  sku: string;
  nameZh: string;
  nameEn: string;
  category: string;
  region: string;
  priceMinor: number;
  detailZh: string;
  detailEn: string;
  materialZh: string;
  materialEn: string;
  originZh: string;
  originEn: string;
  originCountry: string;
  capacityZh: string;
  capacityEn: string;
  hsCode: string;
  packageLengthMm: number;
  packageWidthMm: number;
  packageHeightMm: number;
  weightGrams: number;
  customsDeclarationZh: string;
  customsDeclarationEn: string;
  mainImageUrl: string;
};

function dependencyUnavailable(message: string, details?: unknown): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
    message,
    ...(details === undefined ? {} : { details })
  });
}

export async function publishDraftToCatalog(input: {
  catalogServiceUrl: string;
  taskId: string;
  draft: CatalogPublishDraft;
  actor: string;
  correlationId: string;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${input.catalogServiceUrl}/products`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-admin-actor": input.actor,
        "x-correlation-id": input.correlationId,
        "idempotency-key": `product-import-publish-${input.taskId}`
      },
      body: JSON.stringify({
        products: [{
          sku: input.draft.sku,
          nameZh: input.draft.nameZh,
          nameEn: input.draft.nameEn,
          category: input.draft.category,
          region: input.draft.region,
          priceMinor: input.draft.priceMinor,
          detailZh: input.draft.detailZh,
          detailEn: input.draft.detailEn,
          materialZh: input.draft.materialZh,
          materialEn: input.draft.materialEn,
          originZh: input.draft.originZh,
          originEn: input.draft.originEn,
          originCountry: input.draft.originCountry,
          capacityZh: input.draft.capacityZh,
          capacityEn: input.draft.capacityEn,
          hsCode: input.draft.hsCode,
          packageLengthMm: input.draft.packageLengthMm,
          packageWidthMm: input.draft.packageWidthMm,
          packageHeightMm: input.draft.packageHeightMm,
          weightGrams: input.draft.weightGrams,
          customsDeclarationZh: input.draft.customsDeclarationZh,
          customsDeclarationEn: input.draft.customsDeclarationEn,
          status: "active",
          imageUrl: input.draft.mainImageUrl
        }]
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new HttpException(normalizeErrorPayload(payload, response.status, input.correlationId), response.status);
    }

    if (!Array.isArray(payload)) {
      throw dependencyUnavailable("catalog-service returned an invalid product response");
    }

    const publishedProduct = payload.find((product) => product && product.skuCode === input.draft.sku);

    if (!publishedProduct?.id) {
      throw dependencyUnavailable("catalog-service did not confirm the published product", {
        sku: input.draft.sku
      });
    }

    return String(publishedProduct.id);
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }

    throw dependencyUnavailable("catalog-service is unavailable", {
      cause: error instanceof Error ? error.message : "unknown error"
    });
  } finally {
    clearTimeout(timeout);
  }
}
