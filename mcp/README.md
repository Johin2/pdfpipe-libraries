# PDFPipe MCP Server

Generate PDF documents (invoices, reports, certificates) from HTML or a URL in
one tool call, from any MCP-compatible AI agent: Claude Desktop, Claude Code,
Cursor, Windsurf, and others.

It calls the [PDFPipe](https://pdfpipe.xyz) API, so rendering runs server-side in
a sandbox. Your agent does not need a browser.

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
| `scale` | number, 0.1 to 2 | no | `1` |
| `print_background` | boolean | no | `true` |
| `page_ranges` | string, e.g. `1-3, 5` | no | all pages |
| `prefer_css_page_size` | boolean | no | `false` |
| `media` | `print` `screen` | no | `print` |
| `header_html` | HTML string | no | — |
| `footer_html` | HTML string | no | — |
| `tabular_nums` | boolean | no | `false` |
| `deduplicate_images` | boolean | no | `false` |
| `pdf_a` | boolean | no | `false` |
| `password` | string | no | — |
| `inject_css` | string | no | — |
| `wait_until` | `load` `domcontentloaded` `networkidle0` `networkidle2` | no | `networkidle0` |
| `wait_for` | CSS selector | no | — |
| `wait_ms` | number, up to 5000 | no | `0` |
| `timeout_ms` | number, 1000 to 60000 | no | `30000` |
| `store` | boolean | no | `false` |
| `filename` | string | no | — |

Returns JSON: `{ output_path, size_bytes, plan, usage, limit }`, plus
`document_id`, `document_url`, and `document_expires` when `store` is true.

### Notes on the less obvious arguments

`header_html` and `footer_html` render on every page. The class names
`.pageNumber`, `.totalPages`, `.date`, `.title`, and `.url` are substituted per
page. Style them inline: they are laid out separately from the page body, so the
document's own CSS does not reach them. If `margin` is left at `1cm`, the
relevant side widens to `2cm` automatically to make room.

`wait_until`, `wait_for`, `wait_ms`, and `timeout_ms` matter for pages that
build themselves in JavaScript. If a chart or table renders after load, wait for
its selector rather than guessing with a delay, and raise `timeout_ms` when the
default 30 seconds is not enough.

`inject_css` is applied after the page loads, which makes it the usual way to
hide cookie banners or navigation when rendering a URL you do not control.

`output_path` cannot escape the working directory. It is validated before the
render is requested, so a bad path fails immediately rather than after billing.

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
- "Render this statement with page numbers in the footer and aligned digit columns"
- "Save that dashboard as a PDF, but wait for the #chart element first"

## Local development

```bash
npm install
npm run build
# point at a local PDFPipe API and smoke-test:
node test-client.mjs <api_key> http://localhost:8077
```

## License

MIT
