import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { BINARY_ENV, locateMobileSimBinary, RELEASE_RELATIVE } from "./locate-binary.js";

test("prefers MOBILE_SIMULATOR_BIN when the file exists", () => {
  const bin = "/opt/mobile-sim";
  const path = locateMobileSimBinary({
    env: { [BINARY_ENV]: bin },
    exists: (candidate) => candidate === bin,
    cwd: "/tmp",
    packageDir: "/tmp/pkg",
    searchRoots: ["/tmp"],
  });
  assert.equal(path, bin);
});

test("errors when MOBILE_SIMULATOR_BIN is set but missing", () => {
  assert.throws(
    () =>
      locateMobileSimBinary({
        env: { [BINARY_ENV]: "/missing/mobile-sim" },
        exists: () => false,
        cwd: "/tmp",
        packageDir: "/tmp/pkg",
      }),
    /MOBILE_SIMULATOR_BIN/,
  );
});

test("finds a sibling binary", () => {
  const sibling = "/repo/apps/mcp-server/mobile-sim";
  const path = locateMobileSimBinary({
    env: {},
    exists: (candidate) => candidate === sibling,
    cwd: "/repo",
    packageDir: "/repo/apps/mcp-server",
    searchRoots: ["/repo/apps/mcp-server"],
  });
  assert.equal(path, sibling);
});

test("walks up to the release path", () => {
  const release = join("/repo", RELEASE_RELATIVE);
  const path = locateMobileSimBinary({
    env: {},
    exists: (candidate) => candidate === release,
    cwd: "/repo/apps/mcp-server",
    packageDir: "/repo/apps/mcp-server",
    searchRoots: ["/repo/apps/mcp-server"],
  });
  assert.equal(path, release);
});
