# Cursor MCP (`mobile-simulator-mcp`)

Stdio MCP adapter in `apps/mcp-server`. It only talks to Apple through `mobile-sim rpc`.

See [apps/mcp-server/README.md](../apps/mcp-server/README.md) for tools, consent (`mobile-sim grant`), and the full workflow.

To watch the framebuffer while MCP drives a UDID, open the separate viewer at `http://127.0.0.1:8787` (`npm run dev -w @mobile-simulator/viewer`). It is not part of this MCP server.

Copy [.cursor/mcp.json.example](../.cursor/mcp.json.example) into **`~/.cursor/mcp.json`** (user-level, once per Mac), replacing `/ABS/PATH/mobile-simulator` with this repo. Enable it in **Customize → MCPs**. Do not commit a personal `.cursor/mcp.json`. Do not add a project MCP file to every iOS app.

Optional: copy [`skills/run-on-simulator/`](../skills/run-on-simulator/) to `~/.cursor/skills/run-on-simulator/`, or copy [`plugin/`](../plugin/) to `~/.cursor/plugins/local/mobile-simulator/`.

`npx -y mobile-simulator-mcp` is the intended command (not published yet). The [Add to Cursor](https://cursor.com/docs/mcp/install-links.md) deeplink and intended `npx` config live in the [root README](../README.md). [cursor.directory](https://cursor.directory) and [Marketplace publish](https://cursor.com/marketplace/publish) are not listed yet.
