import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { ErrorCode } from "@mobile-simulator/protocol";
import { ProtocolRpcError } from "./errors.js";
import { NativeRpcClient, SKIP_CONSENT_ENV } from "./rpc-client.js";

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;
  exitCode: number | null = null;

  kill(): void {
    this.killed = true;
    this.exitCode = 0;
    this.emit("exit", 0, null);
  }
}

test("NativeRpcClient writes JSON-RPC and resolves the matching id", async () => {
  let spawned: { bin: string; args: string[] } | undefined;
  const child = new FakeChild();
  const written: string[] = [];
  child.stdin.on("data", (chunk: Buffer) => {
    written.push(chunk.toString("utf8"));
    const request = JSON.parse(String(chunk).trim()) as { id: number; method: string };
    child.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { devices: [] } })}\n`,
    );
  });

  const client = NativeRpcClient.spawn({
    bin: "/tmp/mobile-sim",
    env: {},
    spawnImpl: ((bin: string, args: string[]) => {
      spawned = { bin, args };
      return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
    }) as typeof import("node:child_process").spawn,
  });

  const result = await client.call("simulator.list", { available: true });
  assert.deepEqual(result, { devices: [] });
  assert.deepEqual(spawned, { bin: "/tmp/mobile-sim", args: ["rpc"] });
  assert.match(written[0] ?? "", /"method":"simulator.list"/);
  await client.close();
});

test("NativeRpcClient maps RPC errors and can skip consent in debug", async () => {
  const child = new FakeChild();
  child.stdin.on("data", (chunk: Buffer) => {
    const request = JSON.parse(String(chunk).trim()) as { id: number };
    child.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: ErrorCode.PERMISSION_DENIED, message: "not granted" },
      })}\n`,
    );
  });

  const client = NativeRpcClient.spawn({
    bin: "/tmp/mobile-sim",
    env: { [SKIP_CONSENT_ENV]: "1" },
    spawnImpl: ((_bin: string, args: string[]) => {
      assert.deepEqual(args, ["rpc", "--no-consent"]);
      return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
    }) as typeof import("node:child_process").spawn,
  });

  await assert.rejects(() => client.call("simulator.list"), (error: unknown) => {
    assert.ok(error instanceof ProtocolRpcError);
    assert.equal(error.code, ErrorCode.PERMISSION_DENIED);
    return true;
  });
  await client.close();
});
