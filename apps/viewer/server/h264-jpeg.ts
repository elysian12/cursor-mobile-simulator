import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { LUMA_PROBE_BYTES, LUMA_PROBE_HEIGHT, LUMA_PROBE_WIDTH, meanLuma } from "./jpeg-luma.js";
import { DEFAULT_JPEG_QUALITY, viewerJpegSize } from "./live-size.js";

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "ffmpeg",
];

export interface JpegFrame {
  jpeg: Uint8Array;
  luma?: number;
}

interface ByteSink {
  push(chunk: Uint8Array): void;
  close(): void;
}

export interface JpegTranscoder extends ByteSink {
  /** Stop the second ffmpeg luma probe after Live is unlocked. */
  stopProbe(): void;
}

export interface JpegTranscodeOptions {
  width?: number;
  height?: number;
  quality?: number;
}

/** ffmpeg argv for Annex-B → downscaled MJPEG. */
export function jpegTranscodeArgs(options: JpegTranscodeOptions = {}): string[] {
  const fallback = viewerJpegSize();
  const width = options.width && options.width > 0 ? options.width : fallback.width;
  const height = options.height && options.height > 0 ? options.height : fallback.height;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "+genpts+nobuffer+discardcorrupt+flush_packets",
    "-flags",
    "low_delay",
    "-use_wallclock_as_timestamps",
    "1",
    "-err_detect",
    "ignore_err",
    "-f",
    "h264",
    "-framerate",
    "15",
    "-i",
    "pipe:0",
    "-an",
    "-fps_mode",
    "passthrough",
    "-vf",
    `scale=${width}:${height}:flags=fast_bilinear,format=yuvj420p`,
    "-strict",
    "unofficial",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-q:v",
    String(quality),
    "pipe:1",
  ];
}

export function findFfmpeg(): string | undefined {
  for (const candidate of FFMPEG_CANDIDATES) {
    if (!candidate) {
      continue;
    }
    if (candidate.includes("/") && existsSync(candidate)) {
      return candidate;
    }
    if (!candidate.includes("/")) {
      return candidate;
    }
  }
  return undefined;
}

export function extractJpegs(buffer: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array } {
  const buf = Buffer.from(buffer);
  const frames: Uint8Array[] = [];
  let offset = 0;
  const soiMark = Buffer.from([0xff, 0xd8]);
  const eoiMark = Buffer.from([0xff, 0xd9]);
  while (offset < buf.byteLength) {
    const soi = buf.indexOf(soiMark, offset);
    if (soi < 0) {
      return { frames, rest: new Uint8Array() };
    }
    const eoi = buf.indexOf(eoiMark, soi + 2);
    if (eoi < 0) {
      return { frames, rest: new Uint8Array(buf.subarray(soi)) };
    }
    frames.push(new Uint8Array(buf.subarray(soi, eoi + 2)));
    offset = eoi + 2;
  }
  return { frames, rest: new Uint8Array() };
}

export function createAnnexBJpegTranscoder(
  onJpeg: (frame: JpegFrame) => void,
  onError: (error: Error) => void,
  options: JpegTranscodeOptions & { ffmpegPath?: string } = {},
): JpegTranscoder | undefined {
  const ffmpegPath = options.ffmpegPath ?? findFfmpeg();
  if (!ffmpegPath) {
    return undefined;
  }
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(ffmpegPath, jpegTranscodeArgs(options), { stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
    return undefined;
  }

  let rest = new Uint8Array();
  let closed = false;
  let probeEnabled = true;
  let jpegIndex = 0;
  const pendingJpeg: Uint8Array[] = [];
  const pendingLuma: number[] = [];
  let lumaProbe: ByteSink | undefined = createJpegLumaProbe(ffmpegPath, (luma) => {
    pendingLuma.push(luma);
    flushPaired();
  });

  const shouldProbe = (): boolean => {
    jpegIndex += 1;
    // Gate the first few frames for DeviceHub-black detection, then sample rarely.
    return jpegIndex <= 6 || jpegIndex % 15 === 0;
  };

  const stopProbe = (): void => {
    probeEnabled = false;
    lumaProbe?.close();
    lumaProbe = undefined;
    while (pendingJpeg.length > 0) {
      const jpeg = pendingJpeg.shift();
      if (jpeg) {
        onJpeg({ jpeg });
      }
    }
    pendingLuma.length = 0;
  };

  const flushPaired = (): void => {
    while (pendingJpeg.length > 0 && pendingLuma.length > 0) {
      const jpeg = pendingJpeg.shift();
      const luma = pendingLuma.shift();
      if (!jpeg) {
        break;
      }
      if (typeof luma === "number") {
        onJpeg({ jpeg, luma });
      } else {
        onJpeg({ jpeg });
      }
    }
    while (!lumaProbe && pendingJpeg.length > 0) {
      const jpeg = pendingJpeg.shift();
      if (jpeg) {
        onJpeg({ jpeg });
      }
    }
    while (pendingJpeg.length > 4) {
      const jpeg = pendingJpeg.shift();
      if (jpeg) {
        onJpeg({ jpeg });
      }
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    const next = Buffer.concat([Buffer.from(rest), chunk]);
    const extracted = extractJpegs(next);
    rest = new Uint8Array(extracted.rest);
    for (const frame of extracted.frames) {
      if (!probeEnabled || !lumaProbe || !shouldProbe()) {
        onJpeg({ jpeg: frame });
        continue;
      }
      pendingJpeg.push(frame);
      lumaProbe.push(frame);
      flushPaired();
    }
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8").trim();
    if (text.length > 0) {
      process.stderr.write(`[ffmpeg] ${text}\n`);
    }
  });
  child.on("error", (error) => {
    if (!closed) {
      onError(error);
    }
  });
  child.on("exit", (code) => {
    if (!closed && code !== 0 && code !== null) {
      onError(new Error(`ffmpeg exited (code=${code})`));
    }
  });

  return {
    push(chunk: Uint8Array): void {
      if (closed || child.killed || child.exitCode !== null) {
        return;
      }
      child.stdin.write(chunk, (error) => {
        if (error && !closed) {
          onError(error);
        }
      });
    },
    stopProbe,
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      probeEnabled = false;
      lumaProbe?.close();
      lumaProbe = undefined;
      pendingJpeg.length = 0;
      pendingLuma.length = 0;
      child.stdin.end();
      child.kill("SIGTERM");
    },
  };
}

function createJpegLumaProbe(
  ffmpegPath: string,
  onLuma: (luma: number) => void,
): ByteSink | undefined {
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-fflags",
        "+nobuffer+discardcorrupt",
        "-flags",
        "low_delay",
        "-f",
        "mjpeg",
        "-i",
        "pipe:0",
        "-an",
        "-vf",
        `scale=${LUMA_PROBE_WIDTH}:${LUMA_PROBE_HEIGHT}`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    ) as ChildProcessWithoutNullStreams;
  } catch {
    return undefined;
  }

  let closed = false;
  let grayRest = Buffer.alloc(0);
  child.stdout.on("data", (chunk: Buffer) => {
    grayRest = Buffer.concat([grayRest, chunk]);
    while (grayRest.byteLength >= LUMA_PROBE_BYTES) {
      onLuma(meanLuma(grayRest.subarray(0, LUMA_PROBE_BYTES)));
      grayRest = grayRest.subarray(LUMA_PROBE_BYTES);
    }
  });
  child.on("error", () => {
    closed = true;
  });

  return {
    push(chunk: Uint8Array): void {
      if (closed || child.killed || child.exitCode !== null) {
        return;
      }
      child.stdin.write(chunk);
    },
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      child.stdin.end();
      child.kill("SIGTERM");
    },
  };
}
