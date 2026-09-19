import { ProtocolRpcError } from "./errors.js";
import type { RpcClient } from "./rpc-client.js";

export class MockRpcClient implements RpcClient {
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  private readonly responders = new Map<string, (params: Record<string, unknown>) => unknown>();

  on(method: string, responder: (params: Record<string, unknown>) => unknown): this {
    this.responders.set(method, responder);
    return this;
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    this.calls.push(params !== undefined ? { method, params } : { method });
    const responder = this.responders.get(method);
    if (!responder) {
      throw new ProtocolRpcError({
        code: "INVALID_REQUEST",
        message: `Unknown method '${method}'. See packages/protocol Methods.`,
      });
    }
    const result = responder(params ?? {});
    if (result instanceof ProtocolRpcError) {
      throw result;
    }
    return result as T;
  }

  async close(): Promise<void> {
    /* no-op */
  }

  methods(): string[] {
    return this.calls.map((call) => call.method);
  }
}
