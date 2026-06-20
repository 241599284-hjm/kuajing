import { NotFoundException } from "@nestjs/common";
import { ERROR_CODES } from "@commerce/error-codes";

export function catalogNotFound(message: string, details?: unknown): NotFoundException {
  return new NotFoundException({
    code: ERROR_CODES.NOT_FOUND,
    message,
    ...(details === undefined ? {} : { details })
  });
}
