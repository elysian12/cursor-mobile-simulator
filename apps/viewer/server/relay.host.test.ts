import { ErrorCode, Methods, type WSServerMessage } from "@mobile-simulator/protocol";
import { describe, expect, it } from "vitest";
import { ProtocolRpcError } from "./errors.js";
import { createRelay } from "./relay.js";
import type { RpcClient } from "./rpc-client.js";

const UDID = "87B55D56-FCB8-4A7B-AADC-D11DC689D2E0";

const DEVICE = {
  udid: UDID,
  name: "iPhone 17",
  runtime: "iOS 26.0",
  state: "Booted" as const,
};

function mockRpc(responders: Record<string, (params?: Record<string, unknown>) => unknown>): RpcClient & {
  calls: Array<{ method: string; params?: Record<string, unknown> }>;
} {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  return {
    calls,
    async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
      calls.push(params !== undefined ? { method, params } : { method });
      const responder = responders[method];
      if (!responder) {
        throw new ProtocolRpcError({
          code: ErrorCode.INVALID_REQUEST,
          message: `Unknown method '${method}'`,
        });
      }
      return responder(params) as T;
    },
    async close() {
      /* no-op */
    },
  };
}

describe("viewer attach hides Apple host UI", () => {
  it("calls simulator.hideHost on attach and does not shutdown on detach", async () => {
    const messages: WSServerMessage[] = [];
    const rpc = mockRpc({
      [Methods.simulatorList]: () => ({ devices: [DEVICE] }),
      [Methods.simulatorHideHost]: () => ({
        action: "hidden",
        hidden: true,
        app: "Device Hub",
        note: "Apple Device Hub hidden — control this pane",
      }),
      [Methods.simulatorScreenshot]: () => {
        throw new ProtocolRpcError({ code: ErrorCode.NOT_IMPLEMENTED, message: "skip still" });
      },
      [Methods.simulatorStream]: () => {
        throw new ProtocolRpcError({ code: ErrorCode.NOT_ATTACHED, message: "skip live" });
      },
    });
    const relay = createRelay(rpc, (message) => messages.push(message), () => undefined);

    await relay.attach(UDID);

    expect(rpc.calls.map((call) => call.method)).toContain(Methods.simulatorHideHost);
    expect(rpc.calls.map((call) => call.method)).not.toContain(Methods.simulatorShutdown);
    const host = messages.find((message) => message.type === "host_status");
    expect(host).toMatchObject({
      type: "host_status",
      action: "hidden",
      hidden: true,
      app: "Device Hub",
    });

    rpc.calls.length = 0;
    relay.detach();
    expect(rpc.calls.map((call) => call.method)).not.toContain(Methods.simulatorShutdown);
    expect(relay.snapshot()).toBeUndefined();
  });

  it("attaches when Device Hub is not running", async () => {
    const messages: WSServerMessage[] = [];
    const rpc = mockRpc({
      [Methods.simulatorList]: () => ({ devices: [DEVICE] }),
      [Methods.simulatorHideHost]: () => ({
        action: "none",
        hidden: true,
        note: "Apple host UI is not running. Attach still works with an already-booted simulator.",
      }),
      [Methods.simulatorScreenshot]: () => {
        throw new ProtocolRpcError({ code: ErrorCode.NOT_IMPLEMENTED, message: "skip still" });
      },
      [Methods.simulatorStream]: () => {
        throw new ProtocolRpcError({ code: ErrorCode.NOT_ATTACHED, message: "skip live" });
      },
    });
    const relay = createRelay(rpc, (message) => messages.push(message), () => undefined);
    await relay.attach(UDID);
    expect(relay.snapshot()?.attached).toBe(true);
    expect(messages.some((message) => message.type === "control_result" && message.action === "attach" && message.ok)).toBe(
      true,
    );
  });

  it("showHost reopens Device Hub without detaching", async () => {
    const messages: WSServerMessage[] = [];
    const rpc = mockRpc({
      [Methods.simulatorList]: () => ({ devices: [DEVICE] }),
      [Methods.simulatorHideHost]: () => ({
        action: "hidden",
        hidden: true,
        app: "Device Hub",
        note: "Apple Device Hub hidden — control this pane",
      }),
      [Methods.simulatorShowHost]: () => ({
        action: "shown",
        hidden: false,
        app: "Device Hub",
        note: "Reopened Device Hub. The simulator guest was not detached.",
      }),
      [Methods.simulatorScreenshot]: () => {
        throw new ProtocolRpcError({ code: ErrorCode.NOT_IMPLEMENTED, message: "skip still" });
      },
      [Methods.simulatorStream]: () => {
        throw new ProtocolRpcError({ code: ErrorCode.NOT_ATTACHED, message: "skip live" });
      },
    });
    const relay = createRelay(rpc, (message) => messages.push(message), () => undefined);
    await relay.attach(UDID);
    await relay.showHost();
    expect(relay.snapshot()?.deviceUDID).toBe(UDID);
    expect(rpc.calls.some((call) => call.method === Methods.simulatorShowHost)).toBe(true);
    expect(messages.some((message) => message.type === "host_status" && message.action === "shown")).toBe(true);
  });
});
