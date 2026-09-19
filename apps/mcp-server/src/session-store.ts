import { ErrorCode, type SimulatorSession } from "@mobile-simulator/protocol";
import { protocolError } from "./errors.js";

export class SessionStore {
  private readonly byUdid = new Map<string, SimulatorSession>();
  private readonly byId = new Map<string, SimulatorSession>();

  getByUdid(udid: string): SimulatorSession | undefined {
    return this.byUdid.get(this.key(udid));
  }

  getAttached(udid: string): SimulatorSession | undefined {
    const session = this.getByUdid(udid);
    return session?.attached === true ? session : undefined;
  }

  list(): SimulatorSession[] {
    return [...this.byId.values()];
  }

  requireAttached(udid: string): SimulatorSession {
    const session = this.getAttached(udid);
    if (!session) {
      throw protocolError(
        ErrorCode.NOT_ATTACHED,
        `No MCP session is attached to ${udid}. Call simulator_attach with this explicit udid first.`,
        { udid },
      );
    }
    return session;
  }

  attach(session: SimulatorSession): void {
    const key = this.key(session.deviceUDID);
    const existing = this.byUdid.get(key);
    if (existing?.attached) {
      throw protocolError(
        ErrorCode.DEVICE_LOCKED,
        `Simulator ${session.deviceUDID} is already attached (session ${existing.id}, owner ${existing.owner}). ` +
          "Detach that session first. The MCP server never defaults to another booted device.",
        { udid: session.deviceUDID, sessionId: existing.id },
      );
    }
    this.byUdid.set(key, session);
    this.byId.set(session.id, session);
  }

  detach(udid: string): SimulatorSession {
    const session = this.requireAttached(udid);
    const released: SimulatorSession = { ...session, attached: false };
    this.byUdid.delete(this.key(udid));
    this.byId.delete(session.id);
    return released;
  }

  private key(udid: string): string {
    return udid.toLowerCase();
  }
}
