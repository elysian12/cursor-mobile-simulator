import { describe, expect, it } from "vitest";
import { isNearBlackLuma, meanLuma } from "./jpeg-luma.js";

describe("JPEG / gray luma", () => {
  it("computes mean luma of a packed gray buffer", () => {
    expect(meanLuma(new Uint8Array([0, 0, 0, 0]))).toBe(0);
    expect(meanLuma(new Uint8Array([255, 255, 255, 255]))).toBe(255);
    expect(meanLuma(new Uint8Array([0, 100, 200, 255]))).toBeCloseTo(138.75);
  });

  it("treats empty buffers as black", () => {
    expect(meanLuma(new Uint8Array())).toBe(0);
  });

  it("flags DeviceHub-style near-black frames and keeps a home screen", () => {
    expect(isNearBlackLuma(0)).toBe(true);
    expect(isNearBlackLuma(8)).toBe(true);
    expect(isNearBlackLuma(12)).toBe(true);
    expect(isNearBlackLuma(13)).toBe(false);
    expect(isNearBlackLuma(181)).toBe(false);
  });
});
