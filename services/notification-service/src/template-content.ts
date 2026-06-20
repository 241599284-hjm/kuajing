import { containsInsecureHttp } from "@commerce/contracts";

export function assertTemplateContentIsHttpsSafe(fields: Record<string, string>) {
  for (const [field, value] of Object.entries(fields)) {
    if (containsInsecureHttp(value)) throw new Error(`${field} must not contain an http:// URL`);
  }
}
