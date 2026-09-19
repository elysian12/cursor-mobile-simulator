import { describe, expect, it } from "vitest";
import {
  containRect,
  mapContainedPointerToDevicePoints,
  mapCssBoxToDevicePoints,
  pointerOnElementToDevicePoints,
  roundPoint,
} from "./coords";

const iphone17Pro = { width: 402, height: 874 };

describe("mapCssBoxToDevicePoints", () => {
  it("maps the origin and far corner in a 1:1 CSS box", () => {
    expect(mapCssBoxToDevicePoints(0, 0, { width: 402, height: 874 }, iphone17Pro)).toEqual({
      x: 0,
      y: 0,
    });
    expect(mapCssBoxToDevicePoints(402, 874, { width: 402, height: 874 }, iphone17Pro)).toEqual({
      x: 402,
      y: 874,
    });
  });

  it("converts CSS pixels to device points when the image is scaled", () => {
    const box = { width: 201, height: 437 };
    const mid = mapCssBoxToDevicePoints(100.5, 218.5, box, iphone17Pro);
    expect(mid.x).toBeCloseTo(201, 5);
    expect(mid.y).toBeCloseTo(437, 5);
  });

  it("does not treat CSS pixels as the HID coordinate space", () => {
    const css = mapCssBoxToDevicePoints(80, 160, { width: 200, height: 400 }, iphone17Pro);
    expect(css).not.toEqual({ x: 80, y: 160 });
    expect(css.x).toBeCloseTo(160.8, 5);
    expect(css.y).toBeCloseTo(349.6, 5);
  });

  it("clamps to the reported screen", () => {
    expect(mapCssBoxToDevicePoints(-10, 900, { width: 100, height: 100 }, iphone17Pro)).toEqual({
      x: 0,
      y: 874,
    });
  });
});

describe("contain / letterbox mapping", () => {
  it("places a tall phone in a wide container with side bars", () => {
    const dest = containRect({ width: 800, height: 400 }, iphone17Pro);
    expect(dest.height).toBeCloseTo(400, 5);
    expect(dest.width).toBeCloseTo(400 * (402 / 874), 5);
    expect(dest.offsetY).toBeCloseTo(0, 5);
    expect(dest.offsetX).toBeGreaterThan(100);
  });

  it("returns null for clicks in the letterbox", () => {
    const container = { width: 800, height: 400 };
    expect(mapContainedPointerToDevicePoints(2, 200, container, iphone17Pro)).toBeNull();
  });

  it("maps a click on the contained image to device points", () => {
    const container = { width: 800, height: 400 };
    const dest = containRect(container, iphone17Pro);
    const point = mapContainedPointerToDevicePoints(
      dest.offsetX + dest.width / 2,
      dest.offsetY + dest.height / 2,
      container,
      iphone17Pro,
    );
    expect(point).not.toBeNull();
    expect(point?.x).toBeCloseTo(201, 5);
    expect(point?.y).toBeCloseTo(437, 5);
  });
});

describe("pointerOnElementToDevicePoints", () => {
  it("subtracts the element origin before scaling", () => {
    const point = pointerOnElementToDevicePoints(150, 250, { left: 50, top: 50, width: 200, height: 400 }, iphone17Pro);
    expect(point.x).toBeCloseTo(201, 5);
    expect(point.y).toBeCloseTo(437, 5);
  });
});

describe("roundPoint", () => {
  it("rounds to one decimal by default", () => {
    expect(roundPoint({ x: 12.34, y: 56.78 })).toEqual({ x: 12.3, y: 56.8 });
  });
});
