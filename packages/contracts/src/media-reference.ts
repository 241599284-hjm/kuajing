const publicMediaPrefix = "/media/public/";

export function publicMediaPath(objectKey: string) {
  const normalized = objectKey.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\\")) {
    throw new Error("invalid media object key");
  }
  return `${publicMediaPrefix}${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

export function normalizeResourceReference(value: string) {
  const reference = value.trim();
  if (reference.startsWith("http://")) throw new Error("insecure HTTP resource references are not allowed");
  if (reference.startsWith("//")) return `https:${reference}`;
  if (reference.startsWith("https://") || (reference.startsWith("/") && !reference.startsWith("//"))) {
    return reference;
  }
  throw new Error("resource reference must be a relative path or HTTPS URL");
}

export function containsInsecureHttp(value: string) {
  return /(?:^|["'\s(=])http:\/\//i.test(value);
}
