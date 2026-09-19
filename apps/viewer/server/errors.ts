import type { ProtocolError } from "@mobile-simulator/protocol";

export class ProtocolRpcError extends Error {
  readonly code: string;
  readonly data?: Record<string, unknown>;

  constructor(error: ProtocolError) {
    super(`${error.code}: ${error.message}`);
    this.name = "ProtocolRpcError";
    this.code = error.code;
    if (error.data !== undefined) {
      this.data = error.data;
    }
  }

  toProtocolError(): ProtocolError {
    const error: ProtocolError = { code: this.code, message: this.message };
    if (this.data !== undefined) {
      error.data = this.data;
    }
    return error;
  }
}

export function asProtocolError(error: unknown): ProtocolError {
  if (error instanceof ProtocolRpcError) {
    return error.toProtocolError();
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: "INTERNAL_ERROR", message };
}

export const GRANT_HINT =
  "Simulator RPC is gated by ~/.mobile-simulator/permissions.json. Run `mobile-sim grant` in a terminal, then reconnect. This viewer will not write that file.";
