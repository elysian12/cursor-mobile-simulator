import { describe, expect, it } from "vitest";
import { clampWatchInterval } from "./png";

describe("clampWatchInterval", () => {
  it("defaults to 2s and never goes below 1s", () => {
    expect(clampWatchInterval(undefined)).toBe(2000);
    expect(clampWatchInterval(250)).toBe(1000);
    expect(clampWatchInterval(1500)).toBe(1500);
    expect(clampWatchInterval(120_000)).toBe(60_000);
  });
});
