import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorCode, type SimulatorSession } from "@mobile-simulator/protocol";
import { ProtocolRpcError } from "./errors.js";
import { SessionStore } from "./session-store.js";

const UDID = "939B604A-4B42-4B0C-B164-CAFAB320C123";

function session(overrides: Partial<SimulatorSession> = {}): SimulatorSession {
  return {
    id: "sess-1",
    deviceUDID: UDID,
    createdAt: "2026-09-19T00:00:00.000Z",
    owner: "mcp",
    attached: true,
    bootedByServer: false,
    ...overrides,
  };
}

test("locks a device so a second attach fails", () => {
  const store = new SessionStore();
  store.attach(session());
  assert.throws(() => store.attach(session({ id: "sess-2" })), (error: unknown) => {
    assert.ok(error instanceof ProtocolRpcError);
    assert.equal(error.code, ErrorCode.DEVICE_LOCKED);
    return true;
  });
});

test("requireAttached fails when no session exists", () => {
  const store = new SessionStore();
  assert.throws(() => store.requireAttached(UDID), (error: unknown) => {
    assert.ok(error instanceof ProtocolRpcError);
    assert.equal(error.code, ErrorCode.NOT_ATTACHED);
    return true;
  });
});

test("detach releases the lock", () => {
  const store = new SessionStore();
  store.attach(session());
  const released = store.detach(UDID);
  assert.equal(released.attached, false);
  store.attach(session({ id: "sess-2" }));
  assert.equal(store.requireAttached(UDID).id, "sess-2");
});
