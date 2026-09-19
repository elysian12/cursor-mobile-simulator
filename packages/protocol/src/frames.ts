/**
 * Binary WebSocket media frames. Keep stills and Annex-B out of JSON control.
 *
 * Wire (big-endian), 24-byte header + payload:
 *   0-3   magic `MSF1`
 *   4     version = 1
 *   5     codec: 1 jpeg, 2 png, 3 h264_annexb
 *   6     source: 1 stream, 2 snapshot
 *   7     reserved
 *   8-9   width u16 (pixels; 0 if unknown)
 *   10-11 height u16
 *   12-19 timestamp u64 milliseconds
 *   20-23 payload length u32
 *   24+   payload
 */

export const FRAME_MAGIC = "MSF1";
export const MEDIA_FRAME_VERSION = 1;
export const MEDIA_FRAME_HEADER_SIZE = 24;

export type MediaCodecName = "jpeg" | "png" | "h264_annexb";
export type MediaFrameSource = "stream" | "snapshot";

export const MediaCodecId = {
  jpeg: 1,
  png: 2,
  h264_annexb: 3,
} as const;

export const MediaFrameSourceId = {
  stream: 1,
  snapshot: 2,
} as const;

export interface MediaFrameHeader {
  format: MediaCodecName;
  width: number;
  height: number;
  timestampMs: number;
  source: MediaFrameSource;
}

export interface DecodedMediaFrame {
  header: MediaFrameHeader;
  payload: Uint8Array;
}

const CODEC_BY_ID: Record<number, MediaCodecName> = {
  1: "jpeg",
  2: "png",
  3: "h264_annexb",
};

const SOURCE_BY_ID: Record<number, MediaFrameSource> = {
  1: "stream",
  2: "snapshot",
};

export function encodeMediaFrame(header: MediaFrameHeader, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(MEDIA_FRAME_HEADER_SIZE + payload.byteLength);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  out[0] = 0x4d;
  out[1] = 0x53;
  out[2] = 0x46;
  out[3] = 0x31;
  view.setUint8(4, MEDIA_FRAME_VERSION);
  view.setUint8(5, MediaCodecId[header.format]);
  view.setUint8(6, MediaFrameSourceId[header.source]);
  view.setUint8(7, 0);
  view.setUint16(8, clampU16(header.width), false);
  view.setUint16(10, clampU16(header.height), false);
  view.setBigUint64(12, BigInt(Math.max(0, Math.floor(header.timestampMs))), false);
  view.setUint32(20, payload.byteLength, false);
  out.set(payload, MEDIA_FRAME_HEADER_SIZE);
  return out;
}

export function decodeMediaFrame(data: ArrayBuffer | Uint8Array): DecodedMediaFrame | undefined {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength < MEDIA_FRAME_HEADER_SIZE) {
    return undefined;
  }
  if (bytes[0] !== 0x4d || bytes[1] !== 0x53 || bytes[2] !== 0x46 || bytes[3] !== 0x31) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(4) !== MEDIA_FRAME_VERSION) {
    return undefined;
  }
  const format = CODEC_BY_ID[view.getUint8(5)];
  const source = SOURCE_BY_ID[view.getUint8(6)];
  if (!format || !source) {
    return undefined;
  }
  const payloadLength = view.getUint32(20, false);
  if (bytes.byteLength < MEDIA_FRAME_HEADER_SIZE + payloadLength) {
    return undefined;
  }
  const payload = bytes.subarray(MEDIA_FRAME_HEADER_SIZE, MEDIA_FRAME_HEADER_SIZE + payloadLength);
  return {
    header: {
      format,
      width: view.getUint16(8, false),
      height: view.getUint16(10, false),
      timestampMs: Number(view.getBigUint64(12, false)),
      source,
    },
    payload,
  };
}

function clampU16(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(0xffff, Math.round(value));
}
