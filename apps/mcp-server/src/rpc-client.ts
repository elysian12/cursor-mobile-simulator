import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { RPCRequest, RPCResponse } from "@mobile-simulator/protocol";
import { isRPCFailure } from "@mobile-simulator/protocol";
import { ProtocolRpcError } from "./errors.js";

export const SKIP_CONSENT_ENV = "MOBILE_SIMULATOR_SKIP_CONSENT";

export interface RpcClient {
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

export interface NativeRpcClientOptions {
  bin: string;
  env?: NodeJS.ProcessEnv;
  /** Debug-only: pass `--no-consent` to `mobile-sim rpc`. */
  skipConsent?: boolean;
  timeoutMs?: number;
  spawnImpl?: typeof spawn;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const METHOD_TIMEOUT_MS: Record<string, number> = {
  "simulator.boot": 180_000,
  "simulator.shutdown": 60_000,
  "app.install": 120_000,
  "simulator.screenshot": 60_000,
};

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Line-delimited JSON-RPC client over `mobile-sim rpc` stdio.
 * Node never talks to CoreSimulator; this child process is the only Apple owner.
 */
export class NativeRpcClient implements RpcClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private closed = false;
  private readonly defaultTimeoutMs: number;

  private constructor(child: ChildProcessWithoutNullStreams, defaultTimeoutMs: number) {
    this.child = child;
    this.defaultTimeoutMs = defaultTimeoutMs;
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => this.onLine(line));
    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const raw of text.split(/\r?\n/)) {
        if (raw.length > 0) {
          process.stderr.write(`[mobile-sim] ${raw}\n`);
        }
      }
    });
    child.on("exit", (code, signal) => {
      this.failAll(
        new Error(
          `mobile-sim rpc exited (code=${code ?? "null"}, signal=${signal ?? "null"}). ` +
            "The MCP server does not call simctl itself.",
        ),
      );
    });
    child.on("error", (error) => {
      this.failAll(error instanceof Error ? error : new Error(String(error)));
    });
  }

  static spawn(options: NativeRpcClientOptions): NativeRpcClient {
    const env = options.env ?? process.env;
    const skip =
      options.skipConsent ??
      (env[SKIP_CONSENT_ENV] === "1" || env[SKIP_CONSENT_ENV]?.toLowerCase() === "true");
    const args = ["rpc"];
    if (skip) {
      args.push("--no-consent");
    }
    const spawnImpl = options.spawnImpl ?? spawn;
    const child = spawnImpl(options.bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    }) as ChildProcessWithoutNullStreams;
    return new NativeRpcClient(child, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (this.closed || this.child.killed || this.child.exitCode !== null) {
      throw new Error("mobile-sim rpc is not running.");
    }
    const id = this.nextId++;
    const request: RPCRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };
    const timeoutMs = METHOD_TIMEOUT_MS[method] ?? this.defaultTimeoutMs;
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC timed out after ${timeoutMs}ms calling ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
    return result as T;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.failAll(new Error("RPC client closed."));
    this.child.stdin.end();
    this.child.kill();
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    let response: RPCResponse;
    try {
      response = JSON.parse(trimmed) as RPCResponse;
    } catch {
      process.stderr.write(`[mobile-sim] ignoring non-JSON stdout: ${trimmed.slice(0, 200)}\n`);
      return;
    }
    const id = response.id;
    if (typeof id !== "number" && typeof id !== "string") {
      return;
    }
    const numericId = typeof id === "number" ? id : Number(id);
    const pending = this.pending.get(numericId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(numericId);
    if (isRPCFailure(response)) {
      pending.reject(new ProtocolRpcError(response.error));
      return;
    }
    pending.resolve(response.result);
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
