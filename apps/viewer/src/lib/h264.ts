/**
 * WebCodecs decode of H.264 Annex-B. Chrome wants AVCC (length-prefixed NALUs)
 * plus an avcC description — passing raw start codes usually produces no frames.
 * Live is the caller's job after a VideoFrame is actually painted.
 */

type FrameHandler = (frame: VideoFrame) => void;

export interface H264Decoder {
  push(chunk: Uint8Array): void;
  close(): void;
}

export function supportsWebCodecs(): boolean {
  return typeof VideoDecoder !== "undefined";
}

export function createH264Decoder(onFrame: FrameHandler, onError: (error: Error) => void): H264Decoder | undefined {
  if (!supportsWebCodecs()) {
    return undefined;
  }
  let decoder: VideoDecoder | undefined;
  let configured = false;
  const pending: Uint8Array[] = [];
  let sps: Uint8Array | undefined;
  let pps: Uint8Array | undefined;
  let timestamp = 0;

  const fail = (error: unknown): void => {
    onError(error instanceof Error ? error : new Error(String(error)));
  };

  const ensure = (): VideoDecoder | undefined => {
    if (decoder && configured) {
      return decoder;
    }
    if (!sps || !pps) {
      return undefined;
    }
    const codec = codecFromSps(sps);
    const description = avcCFromSpsPps(sps, pps);
    decoder = new VideoDecoder({
      output: onFrame,
      error: (error) => fail(error),
    });
    try {
      decoder.configure({ codec, description, optimizeForLatency: true });
    } catch {
      try {
        decoder.configure({
          codec,
          description,
          optimizeForLatency: true,
          hardwareAcceleration: "prefer-software",
        });
      } catch (error) {
        fail(error);
        try {
          decoder.close();
        } catch {
          // already closed
        }
        decoder = undefined;
        configured = false;
        return undefined;
      }
    }
    configured = true;
    return decoder;
  };

  return {
    push(chunk: Uint8Array): void {
      pending.push(chunk);
      const joined = concat(pending);
      const nalus = splitAnnexB(joined);
      pending.length = 0;
      if (nalus.incomplete.byteLength > 0) {
        pending.push(nalus.incomplete);
      }
      for (const unit of nalus.units) {
        const type = nalType(unit);
        if (type === 7) {
          sps = unit;
        } else if (type === 8) {
          pps = unit;
        }
      }
      const active = ensure();
      if (!active) {
        return;
      }
      for (const unit of nalus.units) {
        const type = nalType(unit);
        if (type !== 1 && type !== 5) {
          continue;
        }
        try {
          const payload = type === 5 && sps && pps
            ? concat([annexBToAvcc(sps), annexBToAvcc(pps), annexBToAvcc(unit)])
            : annexBToAvcc(unit);
          active.decode(
            new EncodedVideoChunk({
              type: type === 5 ? "key" : "delta",
              timestamp,
              data: payload,
            }),
          );
          timestamp += 66_666;
        } catch (error) {
          fail(error);
        }
      }
    },
    close(): void {
      try {
        decoder?.close();
      } catch {
        // already closed
      }
      decoder = undefined;
      configured = false;
    },
  };
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function splitAnnexB(data: Uint8Array): { units: Uint8Array[]; incomplete: Uint8Array } {
  const starts: number[] = [];
  for (let i = 0; i < data.byteLength - 3; i++) {
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 1) {
        starts.push(i);
        i += 2;
      } else if (data[i + 2] === 0 && data[i + 3] === 1) {
        starts.push(i);
        i += 3;
      }
    }
  }
  if (starts.length < 2) {
    return { units: [], incomplete: data };
  }
  const units: Uint8Array[] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const from = starts[i];
    const to = starts[i + 1];
    if (from === undefined || to === undefined) {
      continue;
    }
    units.push(data.subarray(from, to));
  }
  const last = starts[starts.length - 1] ?? 0;
  return { units, incomplete: data.subarray(last) };
}

export function nalType(unit: Uint8Array): number {
  const header = unit[startCodeLength(unit)];
  return header === undefined ? 0 : header & 0x1f;
}

export function startCodeLength(unit: Uint8Array): number {
  if (unit[0] === 0 && unit[1] === 0 && unit[2] === 1) {
    return 3;
  }
  if (unit[0] === 0 && unit[1] === 0 && unit[2] === 0 && unit[3] === 1) {
    return 4;
  }
  return 0;
}

export function stripStartCode(unit: Uint8Array): Uint8Array {
  return unit.subarray(startCodeLength(unit));
}

export function annexBToAvcc(unit: Uint8Array): Uint8Array {
  const nal = stripStartCode(unit);
  const out = new Uint8Array(4 + nal.byteLength);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(0, nal.byteLength);
  out.set(nal, 4);
  return out;
}

export function avcCFromSpsPps(spsUnit: Uint8Array, ppsUnit: Uint8Array): Uint8Array {
  const sps = stripStartCode(spsUnit);
  const pps = stripStartCode(ppsUnit);
  const out = new Uint8Array(11 + sps.byteLength + pps.byteLength);
  out[0] = 1;
  out[1] = sps[1] ?? 0x42;
  out[2] = sps[2] ?? 0;
  out[3] = sps[3] ?? 0x1e;
  out[4] = 0xff;
  out[5] = 0xe1;
  out[6] = (sps.byteLength >> 8) & 0xff;
  out[7] = sps.byteLength & 0xff;
  out.set(sps, 8);
  let offset = 8 + sps.byteLength;
  out[offset] = 1;
  offset += 1;
  out[offset] = (pps.byteLength >> 8) & 0xff;
  offset += 1;
  out[offset] = pps.byteLength & 0xff;
  offset += 1;
  out.set(pps, offset);
  return out;
}

export function codecFromSps(unit: Uint8Array): string {
  const nal = stripStartCode(unit);
  const profile = nal[1] ?? 0x42;
  const constraints = nal[2] ?? 0;
  const level = nal[3] ?? 0x1e;
  const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `avc1.${hex(profile)}${hex(constraints)}${hex(level)}`;
}
