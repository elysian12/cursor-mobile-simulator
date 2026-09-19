import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Methods } from "@mobile-simulator/protocol";
import { createHandlers } from "./handlers.js";
import { MockRpcClient } from "./mock-rpc.js";
import { createMobileSimulatorServer } from "./server.js";
import { SessionStore } from "./session-store.js";
import { DEVICE_SCOPED_TOOLS, ToolName } from "./tools.js";

const UDID = "939B604A-4B42-4B0C-B164-CAFAB320C123";

test("MCP server registers every V1 tool name", async () => {
  const rpc = new MockRpcClient();
  rpc.on(Methods.simulatorList, () => ({ devices: [] }));
  const server = createMobileSimulatorServer({
    rpc,
    sessions: new SessionStore(),
    binaryPath: "/tmp/mobile-sim",
    platform: "darwin",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    ToolName.appInstall,
    ToolName.appLaunch,
    ToolName.appTerminate,
    ToolName.appUninstall,
    ToolName.doctor,
    ToolName.simulatorAttach,
    ToolName.simulatorBoot,
    ToolName.simulatorDetach,
    ToolName.simulatorHome,
    ToolName.simulatorList,
    ToolName.simulatorPress,
    ToolName.simulatorScreenshot,
    ToolName.simulatorShutdown,
    ToolName.simulatorStatus,
    ToolName.simulatorSwipe,
    ToolName.simulatorTap,
    ToolName.simulatorType,
    ToolName.simulatorUiTree,
  ].sort());
  await client.close();
  await server.close();
});

test("MCP schema rejects device-scoped tools without udid", async () => {
  const rpc = new MockRpcClient();
  const server = createMobileSimulatorServer({
    rpc,
    sessions: new SessionStore(),
    binaryPath: "/tmp/mobile-sim",
    platform: "darwin",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  for (const name of DEVICE_SCOPED_TOOLS) {
    const result = await client.callTool({ name, arguments: {} });
    const text = JSON.stringify(result);
    const failed = result.isError === true || /udid|invalid/i.test(text);
    assert.ok(failed, `${name} should reject a missing udid, got ${text}`);
  }
  assert.equal(rpc.calls.length, 0);
  await client.close();
  await server.close();
});

test("createHandlers is the same mapping the MCP server uses", () => {
  const rpc = new MockRpcClient();
  const handlers = createHandlers({
    rpc,
    sessions: new SessionStore(),
    binaryPath: "/tmp/mobile-sim",
  });
  for (const name of Object.values(ToolName)) {
    assert.equal(typeof handlers[name], "function", name);
  }
});
