import { describe, expect, it } from "vitest";
import { decodeMediaFrame, encodeMediaFrame, MEDIA_FRAME_HEADER_SIZE } from "@mobile-simulator/protocol";

describe("MSF1 binary frames", () => {
  it("round-trips a PNG still without putting bytes in JSON", () => {
    const payload = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const encoded = encodeMediaFrame(
      { format: "png", width: 402, height: 874, timestampMs: 1_700_000_000_000, source: "snapshot" },
      payload,
    );
    expect(encoded.byteLength).toBe(MEDIA_FRAME_HEADER_SIZE + payload.byteLength);
    const decoded = decodeMediaFrame(encoded);
    expect(decoded?.header.format).toBe("png");
    expect(decoded?.header.source).toBe("snapshot");
    expect(decoded?.header.width).toBe(402);
    expect(decoded?.header.height).toBe(874);
    expect(Array.from(decoded?.payload ?? [])).toEqual(Array.from(payload));
  });

  it("round-trips H.264 Annex-B as stream (Live) media", () => {
    const payload = new Uint8Array([0, 0, 0, 1, 0x65, 9, 8, 7]);
    const encoded = encodeMediaFrame(
      { format: "h264_annexb", width: 0, height: 0, timestampMs: 42, source: "stream" },
      payload,
    );
    const decoded = decodeMediaFrame(encoded);
    expect(decoded?.header.format).toBe("h264_annexb");
    expect(decoded?.header.source).toBe("stream");
    expect(Array.from(decoded?.payload ?? [])).toEqual(Array.from(payload));
  });

  it("rejects a buffer that is not MSF1", () => {
    expect(decodeMediaFrame(new Uint8Array([1, 2, 3, 4, 5]))).toBeUndefined();
  });
});
