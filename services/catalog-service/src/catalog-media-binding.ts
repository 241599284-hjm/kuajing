import { BadRequestException } from "@nestjs/common";
import { ERROR_CODES } from "@commerce/error-codes";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeMediaAssetId(value: string): string {
  const assetId = value.trim();
  if (!uuidPattern.test(assetId)) {
    throw new BadRequestException({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "media asset id must be a UUID",
      details: { field: "assetId" }
    });
  }
  return assetId;
}
