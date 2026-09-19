#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { locateMobileSimBinary } from "./locate-binary.js";
import { assertMacOS } from "./platform.js";
import { NativeRpcClient } from "./rpc-client.js";
import { createMobileSimulatorServer } from "./server.js";
import { SessionStore } from "./session-store.js";

async function main(): Promise<void> {
  try {
    assertMacOS();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  let binaryPath: string;
  try {
    binaryPath = locateMobileSimBinary();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const rpc = NativeRpcClient.spawn({ bin: binaryPath });
  const server = createMobileSimulatorServer({
    rpc,
    sessions: new SessionStore(),
    binaryPath,
  });

  const shutdown = async () => {
    await rpc.close();
  };
  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
