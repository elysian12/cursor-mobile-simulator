export function isMacOS(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "darwin";
}

export function assertMacOS(platform: NodeJS.Platform = process.platform): void {
  if (!isMacOS(platform)) {
    throw new Error(
      `mobile-simulator-mcp is macOS-only (need darwin, got ${platform}). ` +
        "Run Cursor on a Mac with Xcode and a built `mobile-sim` binary.",
    );
  }
}
