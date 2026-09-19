import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BINARY_ENV = "MOBILE_SIMULATOR_BIN";
export const RELEASE_RELATIVE = join("native", "simulator-controller", ".build", "release", "mobile-sim");

export interface LocateBinaryOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  exists?: (path: string) => boolean;
  packageDir?: string;
  searchRoots?: string[];
}

function defaultPackageDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Resolve `mobile-sim`:
 * 1. MOBILE_SIMULATOR_BIN
 * 2. sibling `mobile-sim` next to this package / dist
 * 3. walk up for native/simulator-controller/.build/release/mobile-sim
 */
export function locateMobileSimBinary(options: LocateBinaryOptions = {}): string {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const cwd = options.cwd ?? process.cwd();
  const packageDir = options.packageDir ?? defaultPackageDir();

  const fromEnv = env[BINARY_ENV]?.trim();
  if (fromEnv) {
    const resolved = isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv);
    if (!exists(resolved)) {
      throw new Error(
        `${BINARY_ENV} is set to '${fromEnv}' but that file does not exist (resolved ${resolved}). ` +
          "Build the native CLI: `npm run build:native`.",
      );
    }
    return resolved;
  }

  const siblings = [
    join(packageDir, "mobile-sim"),
    join(packageDir, "dist", "mobile-sim"),
    join(packageDir, "..", "mobile-sim"),
    join(dirname(packageDir), "mobile-sim"),
  ];
  for (const candidate of siblings) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  const roots = options.searchRoots ?? [cwd, packageDir];
  for (const root of roots) {
    const found = walkForRelease(root, exists);
    if (found) {
      return found;
    }
  }

  throw new Error(
    "Could not find the native `mobile-sim` binary. Set MOBILE_SIMULATOR_BIN or build it at " +
      `${RELEASE_RELATIVE} (from the repo root: npm run build:native).`,
  );
}

function walkForRelease(start: string, exists: (path: string) => boolean): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, RELEASE_RELATIVE);
    if (exists(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
