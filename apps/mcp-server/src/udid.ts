import { ErrorCode } from "@mobile-simulator/protocol";
import { protocolError } from "./errors.js";

const BANNED_LITERALS = new Set(["booted", "current", "booted-simulator", "the-booted-simulator"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Explicit simulator UDID only. Mirrors native `DeviceID.parse`.
 * Never defaults to a booted device.
 */
export function requireUdid(value: unknown, field = "udid"): string {
  if (value === undefined || value === null) {
    throw protocolError(
      ErrorCode.INVALID_UDID,
      `${field} is required. Pass an explicit simulator UDID (UUID). Never default to the booted simulator.`,
    );
  }
  if (typeof value !== "string") {
    throw protocolError(ErrorCode.INVALID_UDID, `${field} must be a string UDID.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw protocolError(
      ErrorCode.INVALID_UDID,
      `${field} is required. Pass an explicit simulator UDID (UUID); never 'booted'.`,
    );
  }
  if (BANNED_LITERALS.has(trimmed.toLowerCase())) {
    throw protocolError(
      ErrorCode.INVALID_UDID,
      `'${trimmed}' is not allowed. Every device-scoped tool requires an explicit UDID (never 'booted' or 'the currently booted simulator').`,
    );
  }
  if (!UUID_RE.test(trimmed)) {
    throw protocolError(
      ErrorCode.INVALID_UDID,
      `Expected an explicit simulator UDID (UUID), got '${trimmed}'.`,
    );
  }
  return trimmed;
}

export function deviceParams(udid: string): { deviceId: string; udid: string } {
  return { deviceId: udid, udid };
}
