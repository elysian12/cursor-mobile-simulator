import assert from "node:assert/strict";
import { test } from "node:test";
import { assertMacOS, isMacOS } from "./platform.js";

test("isMacOS is true only for darwin", () => {
  assert.equal(isMacOS("darwin"), true);
  assert.equal(isMacOS("linux"), false);
  assert.equal(isMacOS("win32"), false);
});

test("assertMacOS fails clearly off darwin", () => {
  assert.throws(() => assertMacOS("linux"), /macOS-only/);
});
