/** Mean luma of a packed grayscale buffer (0–255). */

export const NEAR_BLACK_LUMA = 12;
export const LUMA_PROBE_WIDTH = 32;
export const LUMA_PROBE_HEIGHT = 32;
export const LUMA_PROBE_BYTES = LUMA_PROBE_WIDTH * LUMA_PROBE_HEIGHT;

export function meanLuma(gray: Uint8Array): number {
  if (gray.byteLength === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < gray.byteLength; i++) {
    sum += gray[i] ?? 0;
  }
  return sum / gray.byteLength;
}

export function isNearBlackLuma(luma: number, threshold = NEAR_BLACK_LUMA): boolean {
  return Number.isFinite(luma) && luma <= threshold;
}
