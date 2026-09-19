/** Read IHDR width/height from a PNG buffer. */
export function pngSize(buf: Uint8Array): { width: number; height: number } | undefined {
  if (buf.byteLength < 24) {
    return undefined;
  }
  if (buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    return undefined;
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

export function clampWatchInterval(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms)) {
    return 2000;
  }
  return Math.max(1000, Math.min(Math.round(ms), 60_000));
}
