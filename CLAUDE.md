# PixelLab Forge MCP

MCP server for the PixelLab pixel art generation API. 47 tools covering image generation, characters, animation, tilesets, editing, rotation, and more.

## Project Structure

```
src/
  index.ts       - MCP server setup, tool registration via low-level Server API
  tools.ts       - All 47 tool definitions with JSON schemas and handlers
  api-client.ts  - PixelLab REST client with auto-polling, retry, and job logging
  job-log.ts     - Persistent job log for crash recovery (stored in OS temp dir)
  save-images.ts - Auto-saves base64 images from responses to ./pixellab-forge-output/
```

## Key Architecture Decisions

- Uses the **low-level `Server` class** from `@modelcontextprotocol/sdk` (not `McpServer`) because the high-level API requires Zod schemas. We use raw JSON Schema objects instead.
- SDK v1.29 uses **newline-delimited JSON** for stdio transport, not Content-Length framing.
- **All tool schemas are verified against the OpenAPI spec** at `https://api.pixellab.ai/v2/openapi.json`. Key naming:
  - v2 endpoints use `no_background` and `seed` (NOT `guidance_scale`, `remove_background`, or `ai_freedom`)
  - Character/object/tileset endpoints use `text_guidance_scale`, `outline/shading/detail`, `color_image`
  - Legacy endpoints (pixflux, bitforge, skeleton, rotate, inpaint) use Python SDK field names
- Background jobs auto-poll every 2s for up to 10 minutes with 3 retries on network failure.
- Job IDs are logged to stderr and persisted to `$TMPDIR/pixellab-forge/jobs.json` for recovery.
- Generated images are auto-saved to `./pixellab-forge-output/` in the working directory.

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
