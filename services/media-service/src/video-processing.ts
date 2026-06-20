import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type VideoMetadata = {
  width: number;
  height: number;
  durationSeconds: number;
};

export type ProcessedVideoMedia = VideoMetadata & {
  buffer: Buffer;
  mimeType: "video/mp4";
  poster: {
    buffer: Buffer;
    mimeType: "image/webp";
    width: number;
    height: number;
  };
};

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, signal: AbortSignal.timeout(60_000) });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").slice(-2000)}`));
    });
  });
}

async function probe(filePath: string): Promise<VideoMetadata> {
  const output = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json",
    filePath
  ]);
  const payload = JSON.parse(output) as {
    streams?: Array<{ width?: unknown; height?: unknown }>;
    format?: { duration?: unknown };
  };
  const width = Number(payload.streams?.[0]?.width);
  const height = Number(payload.streams?.[0]?.height);
  const durationSeconds = Number(payload.format?.duration);

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("video metadata is invalid");
  }
  return { width, height, durationSeconds: Math.round(durationSeconds * 1000) / 1000 };
}

export async function processVideoMedia(buffer: Buffer, sourceMimeType: "image/gif" | "video/mp4"): Promise<ProcessedVideoMedia> {
  const directory = await mkdtemp(path.join(tmpdir(), "commerce-media-"));
  const inputPath = path.join(directory, sourceMimeType === "image/gif" ? "input.gif" : "input.mp4");
  const videoPath = path.join(directory, "output.mp4");
  const posterPath = path.join(directory, "poster.webp");

  try {
    await writeFile(inputPath, buffer);
    if (sourceMimeType === "image/gif") {
      await run("ffmpeg", [
        "-y", "-v", "error", "-i", inputPath,
        "-an", "-movflags", "+faststart", "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        videoPath
      ]);
    } else {
      await writeFile(videoPath, buffer);
    }

    const metadata = await probe(videoPath);
    await run("ffmpeg", [
      "-y", "-v", "error", "-i", videoPath,
      "-frames:v", "1", "-c:v", "libwebp", "-quality", "82",
      posterPath
    ]);

    return {
      ...metadata,
      buffer: await readFile(videoPath),
      mimeType: "video/mp4",
      poster: {
        buffer: await readFile(posterPath),
        mimeType: "image/webp",
        width: metadata.width,
        height: metadata.height
      }
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
