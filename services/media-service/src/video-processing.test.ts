import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { processVideoMedia } from "./video-processing.js";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-v", "error", ...args], { windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
  });
}

describe("processVideoMedia", () => {
  it.each([
    ["image/gif", "source.gif"],
    ["video/mp4", "source.mp4"]
  ] as const)("creates MP4 media and a WebP poster from %s", async (mimeType, filename) => {
    const directory = await mkdtemp(path.join(tmpdir(), "commerce-video-test-"));
    const sourcePath = path.join(directory, filename);
    try {
      await runFfmpeg([
        "-f", "lavfi", "-i", "color=c=red:s=64x48:d=0.4",
        ...(mimeType === "image/gif" ? ["-vf", "fps=5"] : ["-pix_fmt", "yuv420p"]),
        sourcePath
      ]);
      const result = await processVideoMedia(await readFile(sourcePath), mimeType);

      expect(result.mimeType).toBe("video/mp4");
      expect(result.buffer.subarray(4, 8).toString("ascii")).toBe("ftyp");
      expect(result.width).toBe(64);
      expect(result.height).toBe(48);
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.poster.mimeType).toBe("image/webp");
      expect(result.poster.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("rejects a malformed MP4", async () => {
    await expect(processVideoMedia(Buffer.from("not-a-video"), "video/mp4")).rejects.toThrow();
  });
});
