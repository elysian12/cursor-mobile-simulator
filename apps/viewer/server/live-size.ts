/** Live JPEG target: ~2× device points, not the 3× framebuffer. */

export const VIEWER_POINT_SCALE = 2;
export const DEFAULT_JPEG_QUALITY = 12;
export const DEFAULT_VIEWER_POINTS = { width: 402, height: 874, scale: 3 };

export function evenPixels(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function viewerJpegSize(screen?: { width: number; height: number; scale?: number }): {
  width: number;
  height: number;
} {
  const widthPts = screen?.width && screen.width > 0 ? screen.width : DEFAULT_VIEWER_POINTS.width;
  const heightPts = screen?.height && screen.height > 0 ? screen.height : DEFAULT_VIEWER_POINTS.height;
  const nativeScale = screen?.scale && screen.scale > 0 ? screen.scale : DEFAULT_VIEWER_POINTS.scale;
  const factor = Math.min(VIEWER_POINT_SCALE, nativeScale);
  return { width: evenPixels(widthPts * factor), height: evenPixels(heightPts * factor) };
}
