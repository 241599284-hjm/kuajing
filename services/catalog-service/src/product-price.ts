import { BadRequestException } from "@nestjs/common";
import { ERROR_CODES } from "@commerce/error-codes";

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

export function normalizeProductPriceMinor(value: number | undefined, minorValue?: number): number {
  if (minorValue !== undefined) {
    const priceMinor = Number(minorValue);

    if (!Number.isInteger(priceMinor) || priceMinor < 0 || priceMinor > 999999999) {
      throw validationFailed("product.priceMinor must be a non-negative integer", {
        field: "product.priceMinor",
        min: 0,
        max: 999999999
      });
    }

    return priceMinor;
  }

  const price = Number(value ?? 0);

  if (!Number.isFinite(price) || price < 0) {
    throw validationFailed("product.price must be a non-negative number", {
      field: "product.price",
      min: 0
    });
  }

  return Math.round(price * 100);
}
