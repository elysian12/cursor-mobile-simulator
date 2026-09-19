import { describe, expect, it } from "vitest";
import { DEFAULT_JPEG_QUALITY, evenPixels, viewerJpegSize } from "./live-size.js";

describe("viewer live JPEG size", () => {
  it("targets 2× logical points for iPhone 17 (not 3× 1206×2622)", () => {
    expect(viewerJpegSize({ width: 402, height: 874, scale: 3 })).toEqual({
      width: 804,
      height: 1748,
    });
    expect(DEFAULT_JPEG_QUALITY).toBe(12);
  });

  it("does not upscale a 2× device past its native framebuffer", () => {
    expect(viewerJpegSize({ width: 375, height: 667, scale: 2 })).toEqual({
      width: 750,
      height: 1334,
    });
  });

  it("falls back to iPhone 17 points when screen metadata is missing", () => {
    expect(viewerJpegSize()).toEqual({ width: 804, height: 1748 });
  });

  it("rounds odd sizes up to even pixels for yuv420", () => {
    expect(evenPixels(401)).toBe(402);
    expect(evenPixels(874)).toBe(874);
  });
});
