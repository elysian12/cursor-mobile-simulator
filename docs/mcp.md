# Cursor MCP (`mobile-simulator-mcp`)

Stdio MCP adapter in `apps/mcp-server`. It only talks to Apple through `mobile-sim rpc`.

See [apps/mcp-server/README.md](../apps/mcp-server/README.md) for tools, consent (`mobile-sim grant`), and the full workflow.

To watch the framebuffer while MCP drives a UDID, open the separate viewer at `http://127.0.0.1:8787` (`npm run dev -w @mobile-simulator/viewer`). It is not part of this MCP server.

Copy [.cursor/mcp.json.example](../.cursor/mcp.json.example) into `~/.cursor/mcp.json` or the project `.cursor/mcp.json`, replacing `/ABS/PATH/mobile-simulator` with this repo. Do not commit a personal `.cursor/mcp.json`.
