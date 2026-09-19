import assert from "node:assert/strict";
import { test } from "node:test";
import { ErrorCode } from "@mobile-simulator/protocol";
import { ProtocolRpcError } from "./errors.js";
import { requireUdid } from "./udid.js";

test("requireUdid accepts a UUID", () => {
  assert.equal(requireUdid("939B604A-4B42-4B0C-B164-CAFAB320C123"), "939B604A-4B42-4B0C-B164-CAFAB320C123");
});

test("requireUdid rejects missing, empty, and booted aliases", () => {
  for (const value of [undefined, null, "", "  ", "booted", "Booted", "current", "the-booted-simulator"]) {
    assert.throws(() => requireUdid(value), (error: unknown) => {
      assert.ok(error instanceof ProtocolRpcError);
      assert.equal(error.code, ErrorCode.INVALID_UDID);
      return true;
    });
  }
});
