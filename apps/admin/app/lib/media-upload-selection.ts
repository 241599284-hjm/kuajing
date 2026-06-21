type UploadedImage = {
  url?: string;
  responsiveSources?: Array<{ url?: string; width?: number; mimeType?: string }>;
};

export function preferredUploadedImageUrl(upload: UploadedImage) {
  const webp = (upload.responsiveSources ?? [])
    .filter((source) => source.mimeType === "image/webp" && source.url)
    .sort((left, right) => (right.width ?? 0) - (left.width ?? 0))[0];
  return webp?.url ?? upload.url ?? "";
}
