import { createHash, createHmac } from "node:crypto";

export type TencentSesEmail = {
  fromEmailAddress: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey: string;
  providerTemplateId?: string;
  templateData?: Record<string, string | number | boolean | null>;
};

export type TencentSesConfig = {
  secretId: string;
  secretKey: string;
  host: string;
  region: string;
  replyTo?: string;
  triggerType?: number;
  unsubscribe?: string;
};

export type TencentSesResult = {
  messageId: string;
  requestId: string;
};

type TencentSesResponse = {
  Response?: {
    MessageId?: string;
    RequestId?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
};

const service = "ses";
const version = "2020-10-02";
const action = "SendEmail";
const algorithm = "TC3-HMAC-SHA256";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function toUtcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function toBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function assertCleanHeaderValue(value: string, field: string) {
  if (/[\r\n]/.test(value)) throw new Error(`${field} cannot contain new lines`);
  return value;
}

function buildPayload(email: TencentSesEmail, config: TencentSesConfig) {
  const templateId = email.providerTemplateId?.trim();
  const templatePayload =
    templateId && /^\d+$/.test(templateId)
      ? {
          Template: {
            TemplateID: Number(templateId),
            TemplateData: JSON.stringify(email.templateData ?? {})
          }
        }
      : undefined;
  if (email.providerTemplateId && !templatePayload) throw new Error("Tencent SES providerTemplateId must be numeric");

  const simple: { Html?: string; Text?: string } = {};
  if (!templatePayload) {
    if (email.html) simple.Html = toBase64(email.html);
    if (email.text) simple.Text = toBase64(email.text);
    if (!simple.Html && !simple.Text) throw new Error("Tencent SES email requires html or text content");
  }

  return {
    FromEmailAddress: assertCleanHeaderValue(email.fromEmailAddress, "FromEmailAddress"),
    Destination: [email.to],
    Subject: assertCleanHeaderValue(email.subject, "Subject"),
    ...(templatePayload ?? { Simple: simple }),
    ...(config.replyTo ? { ReplyToAddresses: assertCleanHeaderValue(config.replyTo, "ReplyToAddresses") } : {}),
    ...(config.triggerType === undefined ? { TriggerType: 1 } : { TriggerType: config.triggerType }),
    ...(config.unsubscribe ? { Unsubscribe: config.unsubscribe } : {})
  };
}

export function buildTencentSesSignedRequest(email: TencentSesEmail, config: TencentSesConfig, timestamp = Math.floor(Date.now() / 1000)) {
  const host = config.host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const date = toUtcDate(timestamp);
  const payload = JSON.stringify(buildPayload(email, config));
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256(payload)].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [algorithm, String(timestamp), credentialScope, sha256(canonicalRequest)].join("\n");
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = `${algorithm} Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}`,
    payload,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": action,
      "X-TC-Region": config.region,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": version
    }
  };
}

export async function sendTencentSesEmail(email: TencentSesEmail, config: TencentSesConfig): Promise<TencentSesResult> {
  const request = buildTencentSesSignedRequest(email, config);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.payload
  });
  const body = (await response.json().catch(() => ({}))) as TencentSesResponse;
  const apiError = body.Response?.Error;
  if (!response.ok || apiError) {
    const code = apiError?.Code ?? `HTTP_${response.status}`;
    const message = apiError?.Message ?? response.statusText;
    throw new Error(`${code}: ${message}`);
  }
  const messageId = body.Response?.MessageId;
  const requestId = body.Response?.RequestId;
  if (!messageId || !requestId) throw new Error("Tencent SES response missing MessageId or RequestId");
  return { messageId, requestId };
}
