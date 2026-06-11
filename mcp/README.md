# PDFPipe MCP Server

Generate PDF documents (invoices, reports, certificates) from HTML or a URL in
one tool call, from any MCP-compatible AI agent: Claude Desktop, Claude Code,
Cursor, Windsurf, and others.

It calls the [PDFPipe](https://pdfpipe.xyz) API, so rendering runs server-side in
a sandboxed Chromium. Your agent does not need a browser.

## Tool

### `pdfpipe_generate_pdf`

Render HTML or a public URL to a PDF and save it to disk.

| Argument | Type | Required | Default |
| --- | --- | --- | --- |
| `html` | string | one of html/url | — |
| `url` | string (http/https) | one of html/url | — |
| `output_path` | string | yes | — |
| `format` | `A4` `A3` `A5` `Letter` `Legal` `Tabloid` | no | `A4` |
| `landscape` | boolean | no | `false` |
| `margin` | CSS length (`1cm`, `0`, `0.5in`) | no | `1cm` |

Returns JSON: `{ output_path, size_bytes, plan, usage, limit }`.

## Setup

You need a PDFPipe API key. Get one at https://pdfpipe.xyz.

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "pdfpipe": {
      "command": "npx",
      "args": ["-y", "pdfpipe-mcp-server"],
      "env": {
        "PDFPIPE_API_KEY": "pp_live_your_key_here"
      }
    }
  }
}
```

### Cursor / Windsurf

Same block, in the editor's MCP settings file.

### Environment variables

| Variable | Required | Default |
| --- | --- | --- |
| `PDFPIPE_API_KEY` | yes | — |
| `PDFPIPE_BASE_URL` | no | `https://api.pdfpipe.xyz` |

## Example prompts

- "Generate an invoice PDF for order #4012 and save it to ./invoices/4012.pdf"
- "Save https://example.com/report as a landscape A4 PDF at ./report.pdf"

## Local development

```bash
npm install
npm run build
# point at a local PDFPipe API and smoke-test:
node test-client.mjs <api_key> http://localhost:8077
```

## License

MIT
