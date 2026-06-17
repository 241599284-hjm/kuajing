import { describe, expect, it } from "vitest";
import { ERROR_CODES, localizedErrorMessage } from "./index.js";

describe("localizedErrorMessage", () => {
  it("maps standard error codes to Chinese copy", () => {
    expect(
      localizedErrorMessage(
        { code: ERROR_CODES.INVENTORY_SHORTAGE, message: "inventory shortage" },
        409,
        "zh"
      )
    ).toBe("商品库存不足，请调整数量后重试。");
  });

  it("maps standard error codes to English copy", () => {
    expect(
      localizedErrorMessage(
        { code: ERROR_CODES.UPLOAD_REJECTED, message: "file rejected" },
        400,
        "en"
      )
    ).toBe("The uploaded file was rejected.");
  });

  it("preserves explicit messages for non-standard codes", () => {
    expect(localizedErrorMessage({ code: "CUSTOM_ERROR", message: "Custom failure" }, 400, "en")).toBe("Custom failure");
  });
});
