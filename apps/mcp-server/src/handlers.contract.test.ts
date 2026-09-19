import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorCode, Methods } from "@mobile-simulator/protocol";
import { ProtocolRpcError } from "./errors.js";
import { createHandlers } from "./handlers.js";
import { MockRpcClient } from "./mock-rpc.js";
import { SessionStore } from "./session-store.js";
import { TOOL_RPC_METHOD, ToolName } from "./tools.js";

const UDID = "939B604A-4B42-4B0C-B164-CAFAB320C123";
const PNG_1X1 = Buffer.from(
  "iVBORw0KgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const DEVICE = {
  udid: UDID,
  name: "iPhone 17 Pro",
  runtime: "iOS 26.5",
  state: "Shutdown" as const,
};

function setup(state: "Shutdown" | "Booted" = "Booted") {
  const rpc = new MockRpcClient();
  rpc.on(Methods.simulatorList, () => ({ devices: [{ ...DEVICE, state }] }));
  rpc.on(Methods.simulatorBoot, () => ({ udid: UDID, state: "Booted" }));
  rpc.on(Methods.simulatorShutdown, () => ({ udid: UDID, state: "Shutdown" }));
  rpc.on(Methods.appInstall, (params) => ({ udid: UDID, path: params.path }));
  rpc.on(Methods.appLaunch, (params) => ({ udid: UDID, bundleId: params.bundleId, pid: 42 }));
  rpc.on(Methods.appTerminate, (params) => ({ udid: UDID, bundleId: params.bundleId }));
  rpc.on(Methods.appUninstall, (params) => ({ udid: UDID, bundleId: params.bundleId }));
  rpc.on(Methods.simulatorTap, () => {
    throw new ProtocolRpcError({ code: ErrorCode.NOT_IMPLEMENTED, message: "HID helper not available" });
  });
  rpc.on(Methods.simulatorSwipe, () => {
    throw new ProtocolRpcError({ code: ErrorCode.NOT_IMPLEMENTED, message: "HID helper not available" });
  });
  rpc.on(Methods.simulatorType, () => {
    throw new ProtocolRpcError({ code: ErrorCode.NOT_IMPLEMENTED, message: "HID helper not available" });
  });
  rpc.on(Methods.simulatorPress, () => {
    throw new ProtocolRpcError({
      code: ErrorCode.INVALID_REQUEST,
      message: "Unknown method 'simulator.press'",
    });
  });
  rpc.on(Methods.simulatorHome, () => {
    throw new ProtocolRpcError({
      code: ErrorCode.INVALID_REQUEST,
      message: "Unknown method 'simulator.home'",
    });
  });
  rpc.on(Methods.simulatorScreenshot, () => ({ path: "/tmp/shot.png" }));
  rpc.on(Methods.simulatorHideHost, () => ({
    action: "hidden",
    hidden: true,
    app: "Device Hub",
    note: "Apple Device Hub hidden — control this pane",
  }));
  rpc.on(Methods.simulatorShowHost, () => ({
    action: "shown",
    hidden: false,
    app: "Device Hub",
    note: "Reopened Device Hub. The simulator guest was not detached.",
  }));
  rpc.on(Methods.simulatorUiTree, () => {
    throw new ProtocolRpcError({
      code: ErrorCode.NOT_IMPLEMENTED,
      message: "axbridge not shipped",
    });
  });

  const sessions = new SessionStore();
  const handlers = createHandlers({
    rpc,
    sessions,
    binaryPath: "/repo/native/simulator-controller/.build/release/mobile-sim",
    platform: "darwin",
    readFile: async () => PNG_1X1,
    now: () => new Date("2026-09-19T00:00:00.000Z"),
    randomId: () => "sess-1",
  });
  return { rpc, sessions, handlers };
}

async function attach(handlers: ReturnType<typeof createHandlers>, rpc: MockRpcClient) {
  const result = await handlers.simulator_attach({ udid: UDID });
  assert.equal(result.isError, undefined);
  rpc.calls.length = 0;
}

test("TOOL_RPC_METHOD maps each passthrough tool to the native JSON-RPC method", () => {
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorList], "simulator.list");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorBoot], "simulator.boot");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorShutdown], "simulator.shutdown");
  assert.equal(TOOL_RPC_METHOD[ToolName.appInstall], "app.install");
  assert.equal(TOOL_RPC_METHOD[ToolName.appLaunch], "app.launch");
  assert.equal(TOOL_RPC_METHOD[ToolName.appTerminate], "app.terminate");
  assert.equal(TOOL_RPC_METHOD[ToolName.appUninstall], "app.uninstall");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorTap], "simulator.tap");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorSwipe], "simulator.swipe");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorType], "simulator.type");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorPress], "simulator.press");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorHome], "simulator.home");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorScreenshot], "simulator.screenshot");
  assert.equal(TOOL_RPC_METHOD[ToolName.simulatorUiTree], "simulator.uiTree");
});

test("simulator_list calls simulator.list and does not invent a default udid", async () => {
  const { rpc, handlers } = setup();
  const result = await handlers.simulator_list({});
  assert.equal(result.isError, undefined);
  assert.deepEqual(rpc.calls[0], {
    method: "simulator.list",
    params: { available: true, platform: "ios" },
  });
  assert.match(result.content[0]?.text ?? "", /939B604A-4B42-4B0C-B164-CAFAB320C123/);
});

test("device-scoped tools reject a missing udid before RPC", async () => {
  const { rpc, handlers } = setup();
  const calls: Array<Promise<{ isError?: boolean; content: Array<{ text?: string }> }>> = [
    handlers.simulator_boot({}),
    handlers.simulator_shutdown({}),
    handlers.simulator_attach({}),
    handlers.simulator_detach({}),
    handlers.app_install({ path: "/tmp/App.app" }),
    handlers.app_launch({ bundleId: "dev.app" }),
    handlers.app_terminate({ bundleId: "dev.app" }),
    handlers.app_uninstall({ bundleId: "dev.app" }),
    handlers.simulator_tap({ x: 1, y: 2 }),
    handlers.simulator_swipe({ x1: 1, y1: 2, x2: 3, y2: 4 }),
    handlers.simulator_type({ text: "hi" }),
    handlers.simulator_press({ button: "home" }),
    handlers.simulator_home({}),
    handlers.simulator_screenshot({}),
    handlers.simulator_ui_tree({}),
    handlers.simulator_status({}),
  ];
  const results = await Promise.all(calls);
  for (const result of results) {
    assert.equal(result.isError, true);
    assert.match(result.content[0]?.text ?? "", /INVALID_UDID/);
  }
  assert.equal(rpc.calls.length, 0);
});

test("device-scoped tools reject 'booted' and never default to a booted simulator", async () => {
  const { rpc, handlers } = setup();
  const result = await handlers.simulator_screenshot({ udid: "booted" });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /INVALID_UDID/);
  assert.equal(rpc.calls.length, 0);
});

test("PERMISSION_DENIED is surfaced with grant instructions", async () => {
  const { rpc, handlers } = setup();
  rpc.on(Methods.simulatorList, () => {
    throw new ProtocolRpcError({
      code: ErrorCode.PERMISSION_DENIED,
      message: "Simulator control over RPC is not granted.",
    });
  });
  const list = await handlers.simulator_list({});
  assert.equal(list.isError, true);
  assert.match(list.content[0]?.text ?? "", /PERMISSION_DENIED/);
  assert.match(list.content[0]?.text ?? "", /mobile-sim grant/);

  const doctor = await handlers.doctor();
  assert.equal(doctor.isError, undefined);
  assert.match(doctor.content[0]?.text ?? "", /PERMISSION_DENIED|mobile-sim grant/);
});

test("attach boots only when the device is not already Booted and locks the udid", async () => {
  const shutdown = setup("Shutdown");
  const attached = await shutdown.handlers.simulator_attach({ udid: UDID, owner: "cursor" });
  assert.equal(attached.isError, undefined);
  assert.deepEqual(shutdown.rpc.methods(), ["simulator.list", "simulator.boot", "simulator.hideHost"]);
  assert.match(attached.content[0]?.text ?? "", /"bootedByServer": true/);
  assert.match(attached.content[0]?.text ?? "", /"host"/);

  const locked = await shutdown.handlers.simulator_attach({ udid: UDID });
  assert.equal(locked.isError, true);
  assert.match(locked.content[0]?.text ?? "", /DEVICE_LOCKED/);

  const already = setup("Booted");
  const reuse = await already.handlers.simulator_attach({ udid: UDID });
  assert.equal(reuse.isError, undefined);
  assert.deepEqual(already.rpc.methods(), ["simulator.list", "simulator.hideHost"]);
  assert.match(reuse.content[0]?.text ?? "", /"bootedByServer": false/);
  assert.match(reuse.content[0]?.text ?? "", /Device Hub hidden/);
});

test("attach still succeeds when hideHost fails and does not shut down the guest", async () => {
  const { rpc, handlers } = setup("Booted");
  rpc.on(Methods.simulatorHideHost, () => {
    throw new ProtocolRpcError({ code: ErrorCode.INVALID_REQUEST, message: "Unknown method" });
  });
  const result = await handlers.simulator_attach({ udid: UDID });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /"attached": true/);
  assert.equal(rpc.methods().includes("simulator.shutdown"), false);
});

test("detach shuts down only if bootedByServer", async () => {
  const bootedByUs = setup("Shutdown");
  await bootedByUs.handlers.simulator_attach({ udid: UDID });
  bootedByUs.rpc.calls.length = 0;
  const detachOurs = await bootedByUs.handlers.simulator_detach({ udid: UDID });
  assert.equal(detachOurs.isError, undefined);
  assert.deepEqual(bootedByUs.rpc.methods(), ["simulator.shutdown"]);

  const alreadyBooted = setup("Booted");
  await alreadyBooted.handlers.simulator_attach({ udid: UDID });
  alreadyBooted.rpc.calls.length = 0;
  const detachTheirs = await alreadyBooted.handlers.simulator_detach({ udid: UDID });
  assert.equal(detachTheirs.isError, undefined);
  assert.deepEqual(alreadyBooted.rpc.methods(), []);
});

test("passthrough tools send the mapped JSON-RPC method and explicit udid", async () => {
  const { rpc, handlers } = setup("Booted");
  await attach(handlers, rpc);

  const cases: Array<{
    run: () => Promise<{ isError?: boolean }>;
    method: string;
    params: Record<string, unknown>;
  }> = [
    {
      run: () => handlers.simulator_boot({ udid: UDID }),
      method: "simulator.boot",
      params: { deviceId: UDID, udid: UDID },
    },
    {
      run: () => handlers.simulator_shutdown({ udid: UDID }),
      method: "simulator.shutdown",
      params: { deviceId: UDID, udid: UDID },
    },
    {
      run: () => handlers.app_install({ udid: UDID, path: "/tmp/App.app" }),
      method: "app.install",
      params: { deviceId: UDID, udid: UDID, path: "/tmp/App.app" },
    },
    {
      run: () => handlers.app_launch({ udid: UDID, bundleId: "dev.app" }),
      method: "app.launch",
      params: { deviceId: UDID, udid: UDID, bundleId: "dev.app" },
    },
    {
      run: () => handlers.app_terminate({ udid: UDID, bundleId: "dev.app" }),
      method: "app.terminate",
      params: { deviceId: UDID, udid: UDID, bundleId: "dev.app" },
    },
    {
      run: () => handlers.app_uninstall({ udid: UDID, bundleId: "dev.app" }),
      method: "app.uninstall",
      params: { deviceId: UDID, udid: UDID, bundleId: "dev.app" },
    },
    {
      run: () => handlers.simulator_swipe({ udid: UDID, x1: 1, y1: 2, x2: 3, y2: 4, duration: 0.3 }),
      method: "simulator.swipe",
      params: { deviceId: UDID, udid: UDID, x1: 1, y1: 2, x2: 3, y2: 4, duration: 0.3 },
    },
    {
      run: () => handlers.simulator_type({ udid: UDID, text: "hello" }),
      method: "simulator.type",
      params: { deviceId: UDID, udid: UDID, text: "hello" },
    },
    {
      run: () => handlers.simulator_press({ udid: UDID, button: "home" }),
      method: "simulator.press",
      params: { deviceId: UDID, udid: UDID, button: "home" },
    },
    {
      run: () => handlers.simulator_home({ udid: UDID }),
      method: "simulator.home",
      params: { deviceId: UDID, udid: UDID },
    },
    {
      run: () => handlers.simulator_ui_tree({ udid: UDID }),
      method: "simulator.uiTree",
      params: { deviceId: UDID, udid: UDID },
    },
  ];

  for (const testCase of cases) {
    rpc.calls.length = 0;
    await testCase.run();
    assert.deepEqual(rpc.calls[0], { method: testCase.method, params: testCase.params }, testCase.method);
  }
});

test("tap success is forwarded when native HID succeeds", async () => {
  const { rpc, handlers } = setup("Booted");
  rpc.on(Methods.simulatorTap, () => ({}));
  await attach(handlers, rpc);
  const result = await handlers.simulator_tap({ udid: UDID, x: 10, y: 20 });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /HID tap was sent/);
  assert.deepEqual(rpc.calls[0], {
    method: "simulator.tap",
    params: { deviceId: UDID, udid: UDID, x: 10, y: 20 },
  });
});

test("tap is forwarded and not faked as success", async () => {
  const { rpc, handlers } = setup("Booted");
  await attach(handlers, rpc);
  const result = await handlers.simulator_tap({ udid: UDID, x: 10, y: 20 });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /NOT_IMPLEMENTED/);
  assert.match(result.content[0]?.text ?? "", /does not fake/);
  assert.deepEqual(rpc.calls[0], {
    method: "simulator.tap",
    params: { deviceId: UDID, udid: UDID, x: 10, y: 20 },
  });
});

test("screenshot returns MCP image content plus name and UDID caption", async () => {
  const { rpc, handlers } = setup("Booted");
  await attach(handlers, rpc);
  const result = await handlers.simulator_screenshot({ udid: UDID });
  assert.equal(result.isError, undefined);
  const image = result.content.find((block) => block.type === "image");
  const text = result.content.find((block) => block.type === "text");
  assert.ok(image);
  assert.equal(image?.type, "image");
  if (image && image.type === "image") {
    assert.equal(image.mimeType, "image/png");
    assert.equal(image.data, PNG_1X1.toString("base64"));
  }
  assert.match(text?.text ?? "", /iPhone 17 Pro/);
  assert.match(text?.text ?? "", new RegExp(UDID));
  assert.equal(rpc.calls[0]?.method, "simulator.screenshot");
});

test("tools that require attach fail with NOT_ATTACHED", async () => {
  const { handlers } = setup("Booted");
  const result = await handlers.simulator_screenshot({ udid: UDID });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /NOT_ATTACHED/);
});

test("simulator_status uses list + session and requires udid", async () => {
  const { rpc, handlers } = setup("Booted");
  const before = await handlers.simulator_status({ udid: UDID });
  assert.equal(before.isError, undefined);
  assert.match(before.content[0]?.text ?? "", /"attached": false/);
  await handlers.simulator_attach({ udid: UDID });
  rpc.calls.length = 0;
  const after = await handlers.simulator_status({ udid: UDID });
  assert.match(after.content[0]?.text ?? "", /"attached": true/);
  assert.equal(rpc.calls[0]?.method, "simulator.list");
});
