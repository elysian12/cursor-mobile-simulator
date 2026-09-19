/**
 * Consent file at `~/.mobile-simulator/permissions.json`.
 * Required for `mobile-sim rpc` / future MCP. Interactive CLI does not need it.
 */
export interface PermissionsFile {
  version: 1;
  allowSimulatorControl: boolean;
  /** ISO-8601 */
  grantedAt?: string;
}

export const PERMISSIONS_RELATIVE_PATH = ".mobile-simulator/permissions.json";
