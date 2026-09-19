/**
 * Control session — MCP attach/detach. Native V1 does not persist sessions.
 */
export interface Session {
  id: string;
  deviceUDID: string;
  /** ISO-8601 */
  createdAt: string;
  /** Who attached (MCP client name, user, CI job, …). */
  owner: string;
  attached: boolean;
  /** True if this session booted the device and should shut it down on release. */
  bootedByServer: boolean;
}

/** MCP-facing name for {@link Session}. */
export type SimulatorSession = Session;
