const BANNED = new Set(["booted", "current", "booted-simulator", "the-booted-simulator"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUdid(value: unknown, field = "deviceId"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required. Pass an explicit simulator UDID. Never 'booted'.`);
  }
  const trimmed = value.trim();
  if (BANNED.has(trimmed.toLowerCase())) {
    throw new Error(`'${trimmed}' is not allowed. Attach an explicit UDID.`);
  }
  if (!UUID_RE.test(trimmed)) {
    throw new Error(`Expected an explicit simulator UDID (UUID), got '${trimmed}'.`);
  }
  return trimmed;
}

export function deviceParams(udid: string): { deviceId: string; udid: string } {
  return { deviceId: udid, udid };
}
