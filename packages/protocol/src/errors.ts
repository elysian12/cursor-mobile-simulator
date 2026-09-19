/**
 * Stable string codes shared by the CLI, JSON-RPC, and (later) MCP.
 * Mirrors native `SimulatorErrorCode`.
 */
export const ErrorCode = {
  DEVICE_NOT_BOOTED: "DEVICE_NOT_BOOTED",
  DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NOT_ATTACHED: "NOT_ATTACHED",
  DEVICE_LOCKED: "DEVICE_LOCKED",
  APP_NOT_FOUND: "APP_NOT_FOUND",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_UDID: "INVALID_UDID",
  XCODE_NOT_FOUND: "XCODE_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ProtocolError {
  code: ErrorCode | string;
  message: string;
  data?: Record<string, unknown>;
}
