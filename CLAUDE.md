# PixelForge MCP

MCP server for the PixelLab pixel art generation API. 47 tools covering image generation, characters, animation, tilesets, editing, rotation, and more.

## Project Structure

```
src/
  index.ts       - MCP server setup, tool registration via low-level Server API
  tools.ts       - All 47 tool definitions with JSON schemas and handlers
  api-client.ts  - PixelLab REST client with auto-polling, retry, and job logging
  job-log.ts     - Persistent job log for crash recovery (stored in OS temp dir)
```

## Key Architecture Decisions

- Uses the **low-level `Server` class** from `@modelcontextprotocol/sdk` (not `McpServer`) because the high-level API requires Zod schemas. We use raw JSON Schema objects instead.
- SDK v1.29 uses **newline-delimited JSON** for stdio transport, not Content-Length framing.
- **Two API generations** with different parameter names:
  - **Pro/v2 endpoints**: `guidance_scale`, `remove_background`, `ai_freedom`
  - **Legacy endpoints**: `text_guidance_scale`, `no_background`, `color_image`
- Background jobs auto-poll every 2s for up to 10 minutes with 3 retries on network failure.
- Job IDs are logged to stderr and persisted to `$TMPDIR/pixelforge/jobs.json` for recovery.

## Git Identity

Use `rabbitcannon` for all commits. The local git config is already set:
- name: rabbitcannon
- email: 7041454+rabbitcannon@users.noreply.github.com

Do NOT add co-author attributions to commits.

## Releasing

When asked to release a new version:

1. **Bump version** in `package.json`
2. **Build and verify**: `npm run build` then test with the MCP inspector or stdio
3. **Commit**: Use a clean commit message like `v1.x.x - <summary of changes>`
4. **Push**: `git push origin main`
5. **Create GitHub release**: `gh release create v1.x.x --title "v1.x.x" --notes "<release notes>"`
6. **Publish to npm**: `npm publish`

Always update the version in `package.json` first — npm will reject if the version already exists.

## Development

```bash
npm install
npm run build
PIXELLAB_API_KEY=your-key npx @modelcontextprotocol/inspector node dist/index.js
```

## Testing

Quick smoke test via stdio:
```bash
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
  sleep 0.2
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 1
} | PIXELLAB_API_KEY=test node dist/index.js
```
