import { describe, expect, it } from "vitest";
import { extractJpegs } from "./h264-jpeg.js";

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

  it("drops leading garbage before SOI", () => {
    const { frames, rest } = extractJpegs(bytes(0x00, 0xff, 0xd8, 0x11, 0xff, 0xd9));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0] ?? [])).toEqual([0xff, 0xd8, 0x11, 0xff, 0xd9]);
    expect(rest.byteLength).toBe(0);
  });
});
