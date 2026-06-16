import { describe, expect, it } from "vitest";
import { buildTencentSesSignedRequest } from "./tencent-ses.js";

describe("Tencent SES API provider", () => {
  it("builds a TC3 signed SendEmail request with base64 email content", () => {
    const request = buildTencentSesSignedRequest(
      {
        fromEmailAddress: "H&L ARTISAN <noreply@mail.lpgexam.tech>",
        to: "buyer@example.com",
        subject: "Order confirmed",
        html: "<p>Your order is confirmed.</p>",
        text: "Your order is confirmed.",
        idempotencyKey: "email:test"
      },
      {
        secretId: "AKIDEXAMPLE",
        secretKey: "secret",
        host: "ses.tencentcloudapi.com",
        region: "ap-hongkong",
        replyTo: "service@mail.lpgexam.tech"
      },
      1_718_000_000
    );

    const payload = JSON.parse(request.payload) as {
      FromEmailAddress: string;
      Destination: string[];
      Subject: string;
      Simple: { Html: string; Text: string };
      ReplyToAddresses: string;
      TriggerType: number;
    };

    expect(request.url).toBe("https://ses.tencentcloudapi.com");
    expect(request.headers["X-TC-Action"]).toBe("SendEmail");
    expect(request.headers["X-TC-Region"]).toBe("ap-hongkong");
    expect(request.headers.Authorization).toContain("TC3-HMAC-SHA256 Credential=AKIDEXAMPLE/");
    expect(payload.FromEmailAddress).toBe("H&L ARTISAN <noreply@mail.lpgexam.tech>");
    expect(payload.Destination).toEqual(["buyer@example.com"]);
    expect(payload.Simple.Html).toBe(Buffer.from("<p>Your order is confirmed.</p>", "utf8").toString("base64"));
    expect(payload.Simple.Text).toBe(Buffer.from("Your order is confirmed.", "utf8").toString("base64"));
    expect(payload.ReplyToAddresses).toBe("service@mail.lpgexam.tech");
    expect(payload.TriggerType).toBe(1);
  });

  it("rejects header newline injection", () => {
    expect(() =>
      buildTencentSesSignedRequest(
        {
          fromEmailAddress: "noreply@mail.lpgexam.tech",
          to: "buyer@example.com",
          subject: "Hello\nBcc: attacker@example.com",
          text: "test",
          idempotencyKey: "email:test"
        },
        {
          secretId: "AKIDEXAMPLE",
          secretKey: "secret",
          host: "ses.tencentcloudapi.com",
          region: "ap-hongkong"
        }
      )
    ).toThrow("Subject cannot contain new lines");
  });
});
