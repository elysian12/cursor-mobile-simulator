import { ErrorCode, type ProtocolError } from "@mobile-simulator/protocol";

export class ProtocolRpcError extends Error {
  readonly code: string;
  readonly data?: Record<string, unknown>;

  constructor(error: ProtocolError) {
    super(`${error.code}: ${error.message}`);
    this.name = "ProtocolRpcError";
    this.code = error.code;
    if (error.data !== undefined) {
      this.data = error.data;
    }
  }
}

export function protocolError(code: string, message: string, data?: Record<string, unknown>): ProtocolRpcError {
  return new ProtocolRpcError({
    code,
    message,
    ...(data !== undefined ? { data } : {}),
  });
}

export const GRANT_INSTRUCTIONS = [
  "Simulator control over RPC/MCP is gated by ~/.mobile-simulator/permissions.json.",
  "Grant consent from a terminal (the MCP server will not write this file for you):",
  "  mobile-sim grant",
  "Consent is global. Device selection is always an explicit `udid` on each tool — never 'booted'.",
  "Revoke later with: mobile-sim revoke.",
].join("\n");

export function formatToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (error instanceof ProtocolRpcError) {
    let text = `${error.code}: ${stripCodePrefix(error.message, error.code)}`;
    if (error.code === ErrorCode.PERMISSION_DENIED) {
      text += `\n\n${GRANT_INSTRUCTIONS}`;
    } else if (error.code === ErrorCode.NOT_IMPLEMENTED) {
      text +=
        "\n\nThis call was forwarded to native `mobile-sim rpc`. The MCP server does not fake HID, hardware buttons, or UI trees.";
    } else if (error.code === ErrorCode.NOT_ATTACHED) {
      text += "\n\nCall `simulator_attach` with this explicit `udid` first, then retry.";
    }
    return { content: [{ type: "text", text }], isError: true };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `${ErrorCode.INTERNAL_ERROR}: ${message}` }],
    isError: true,
  };
}

export function jsonText(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function stripCodePrefix(message: string, code: string): string {
  const prefix = `${code}: `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}
