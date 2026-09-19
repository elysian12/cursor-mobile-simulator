import type { ProtocolError } from "./errors.js";

/**
 * JSON-RPC-shaped envelope used on `mobile-sim rpc` stdin/stdout.
 * `jsonrpc` is optional; the native server accepts both `"2.0"` and omitted.
 * `id` may be a string or number. Notifications (no id) are ignored.
 */
export type RPCId = string | number;

export interface RPCRequest<M extends string = string, P = Record<string, unknown>> {
  jsonrpc?: "2.0";
  id: RPCId;
  method: M;
  params?: P;
}

export interface RPCSuccess<T = unknown> {
  jsonrpc?: "2.0";
  id: RPCId;
  result: T;
}

export interface RPCFailure {
  jsonrpc?: "2.0";
  id: RPCId | null;
  error: ProtocolError;
}

export type RPCResponse<T = unknown> = RPCSuccess<T> | RPCFailure;

export function isRPCFailure(value: RPCResponse): value is RPCFailure {
  return "error" in value;
}
