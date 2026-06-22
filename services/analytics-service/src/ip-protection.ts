import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const configured = process.env.VISITOR_ANALYTICS_ENCRYPTION_KEY?.trim();
  if (!configured) return null;
  const decoded = Buffer.from(configured, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(configured).digest();
}

export function protectIp(value: string) {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

export function revealIp(value: string | null) {
  if (!value) return null;
  const key = encryptionKey();
  if (!key) return null;
  try {
    const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
