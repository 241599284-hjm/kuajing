import { describe, expect, it } from "vitest";
import { decideWebhookClaim, nextWebhookFailure, retryWebhookAttemptCount } from "./payment-webhook-inbox.js";

describe("decideWebhookClaim", () => {
  it("claims a new event and retries a previously failed event", () => {
    expect(decideWebhookClaim(null, "hash-1")).toBe("claim_new");
    expect(decideWebhookClaim({ status: "failed", payloadHash: "hash-1" }, "hash-1")).toBe("claim_retry");
  });

  it("does not process an in-flight or completed duplicate twice", () => {
    expect(decideWebhookClaim({ status: "processing", payloadHash: "hash-1" }, "hash-1")).toBe("duplicate_processing");
    expect(decideWebhookClaim({ status: "processed", payloadHash: "hash-1" }, "hash-1")).toBe("duplicate_processed");
  });

  it("rejects reuse of an event ID with different payload content", () => {
    expect(decideWebhookClaim({ status: "processed", payloadHash: "hash-1" }, "hash-2")).toBe("payload_conflict");
  });

  it("does not increment attempts beyond the configured maximum", () => {
    expect(nextWebhookFailure(1, 3)).toEqual({ status: "processing", attemptCount: 2 });
    expect(nextWebhookFailure(3, 3)).toEqual({ status: "failed", attemptCount: 3 });
  });

  it("resets the processing budget when a failed event is explicitly reclaimed", () => {
    expect(retryWebhookAttemptCount()).toBe(1);
  });
});
