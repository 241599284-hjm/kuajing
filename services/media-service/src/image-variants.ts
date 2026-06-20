import sharp from "sharp";

export type GeneratedImageVariant = {
  width: number;
  height: number;
  mimeType: "image/webp";
  byteSize: number;
  buffer: Buffer;
};

export async function generateResponsiveImageVariants(buffer: Buffer): Promise<GeneratedImageVariant[]> {
  const metadata = await sharp(buffer).metadata();
  const sourceWidth = metadata.width;

  if (!sourceWidth || sourceWidth <= 0) return [];

  const widths = [...new Set([
    ...[480, 960, 1600].filter((width) => width < sourceWidth),
    Math.min(sourceWidth, 1600)
  ])].sort((left, right) => left - right);

  return Promise.all(widths.map(async (width) => {
    const output = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    return {
      width: output.info.width,
      height: output.info.height,
      mimeType: "image/webp" as const,
      byteSize: output.info.size,
      buffer: output.data
    };
  }));
}
