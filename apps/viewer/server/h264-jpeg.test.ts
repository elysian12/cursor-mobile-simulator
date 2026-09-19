import { describe, expect, it } from "vitest";
import { extractJpegs, jpegTranscodeArgs } from "./h264-jpeg.js";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("JPEG MSF1 splitter", () => {
  it("extracts complete JPEGs and keeps a trailing partial", () => {
    const jpeg = bytes(0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9);
    const partial = bytes(0xff, 0xd8, 0xaa);
    const joined = new Uint8Array(jpeg.byteLength * 2 + partial.byteLength);
    joined.set(jpeg, 0);
    joined.set(jpeg, jpeg.byteLength);
    joined.set(partial, jpeg.byteLength * 2);
    const { frames, rest } = extractJpegs(joined);
    expect(frames).toHaveLength(2);
    expect(Array.from(frames[0] ?? [])).toEqual(Array.from(jpeg));
    expect(Array.from(rest)).toEqual(Array.from(partial));
  });

  it("scales Annex-B to 2× pane size with modest JPEG quality", () => {
    const args = jpegTranscodeArgs({ width: 804, height: 1748, quality: 12 });
    expect(args).toContain("-vf");
    expect(args[args.indexOf("-vf") + 1]).toBe("scale=804:1748:flags=fast_bilinear,format=yuvj420p");
    expect(args).toContain("-q:v");
    expect(args[args.indexOf("-q:v") + 1]).toBe("12");
    expect(args).toContain("mjpeg");
    expect(args).toContain("-strict");
  });

  it("defaults to iPhone 17 2× points when size is omitted", () => {
    const args = jpegTranscodeArgs();
    expect(args[args.indexOf("-vf") + 1]).toBe("scale=804:1748:flags=fast_bilinear,format=yuvj420p");
  });

  it("drops leading garbage before SOI", () => {
    const { frames, rest } = extractJpegs(bytes(0x00, 0xff, 0xd8, 0x11, 0xff, 0xd9));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0] ?? [])).toEqual([0xff, 0xd8, 0x11, 0xff, 0xd9]);
    expect(rest.byteLength).toBe(0);
  });
});
