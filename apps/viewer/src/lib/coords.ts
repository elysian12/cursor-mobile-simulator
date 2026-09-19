import type { ScreenInfo } from "@mobile-simulator/protocol";

export interface Box {
  width: number;
  height: number;
}

export interface DisplayRect {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface DevicePoint {
  x: number;
  y: number;
}

/** object-fit: contain destination rectangle inside a CSS box. */
export function containRect(container: Box, content: Box): DisplayRect {
  if (container.width <= 0 || container.height <= 0 || content.width <= 0 || content.height <= 0) {
    return { offsetX: 0, offsetY: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / content.width, container.height / content.height);
  const width = content.width * scale;
  const height = content.height * scale;
  return {
    offsetX: (container.width - width) / 2,
    offsetY: (container.height - height) / 2,
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Map CSS pixels on the **displayed framebuffer box** (the image, not the
 * letterbox) to device points. Origin is top-left. Uses `screen.width/height`
 * from the reported coordinate space — never raw CSS pixels.
 */
export function mapCssBoxToDevicePoints(
  cssX: number,
  cssY: number,
  box: Box,
  screen: Pick<ScreenInfo, "width" | "height">,
): DevicePoint {
  if (box.width <= 0 || box.height <= 0 || screen.width <= 0 || screen.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: clamp((cssX / box.width) * screen.width, 0, screen.width),
    y: clamp((cssY / box.height) * screen.height, 0, screen.height),
  };
}

/**
 * Map a pointer on a container that letterboxes the device aspect
 * (`object-fit: contain`). Clicks in the bars return `null`.
 */
export function mapContainedPointerToDevicePoints(
  cssX: number,
  cssY: number,
  container: Box,
  screen: Pick<ScreenInfo, "width" | "height">,
): DevicePoint | null {
  const dest = containRect(container, { width: screen.width, height: screen.height });
  if (dest.width <= 0 || dest.height <= 0) {
    return null;
  }
  const localX = cssX - dest.offsetX;
  const localY = cssY - dest.offsetY;
  if (localX < 0 || localY < 0 || localX > dest.width || localY > dest.height) {
    return null;
  }
  return mapCssBoxToDevicePoints(localX, localY, dest, screen);
}

export function pointerOnElementToDevicePoints(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  screen: Pick<ScreenInfo, "width" | "height">,
): DevicePoint {
  return mapCssBoxToDevicePoints(clientX - rect.left, clientY - rect.top, rect, screen);
}

export function roundPoint(point: DevicePoint, digits = 1): DevicePoint {
  const f = 10 ** digits;
  return {
    x: Math.round(point.x * f) / f,
    y: Math.round(point.y * f) / f,
  };
}

export const DRAG_THRESHOLD_PX = 8;
