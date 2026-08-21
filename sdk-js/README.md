# pdfpipe-node

Official Node/TypeScript SDK for [PDFPipe](https://pdfpipe.xyz). Turn HTML or a URL into a PDF with one call, backed by real Chromium rendering, flat pricing, and 500 free documents a month.

```bash
npm install pdfpipe-node
```

## Quick start

```ts
import { PDFPipe } from "pdfpipe-node";

const pdfpipe = new PDFPipe({ apiKey: process.env.PDFPIPE_API_KEY! });

// From HTML
const invoice = await pdfpipe.fromHtml("<h1>Invoice #4012</h1>", { format: "A4" });
await invoice.toFile("invoice.pdf");

// From a URL
const page = await pdfpipe.fromUrl("https://example.com");
await page.toFile("example.pdf");
```

Get an API key at [pdfpipe.xyz](https://pdfpipe.xyz). Keys look like `pp_live_...`.

## API

### `new PDFPipe({ apiKey, baseUrl?, fetch? })`

- `apiKey` (required): your `pp_live_...` key.
- `baseUrl` (optional): defaults to `https://api.pdfpipe.xyz`.
- `fetch` (optional): a custom fetch implementation. Defaults to the global `fetch` (Node 18+).

### `fromHtml(html, options?) => Promise<PdfResult>`
### `fromUrl(url, options?) => Promise<PdfResult>`

`options` (all optional):

| Option | Values | Default |
| --- | --- | --- |
| `format` | A4, A3, A5, Letter, Legal, Tabloid | A4 |
| `landscape` | boolean | false |
| `margin` | any CSS length | 1cm |
| `print_background` | boolean | true |
| `scale` | 0.1 to 2.0 | 1.0 |
| `page_ranges` | e.g. "1-3, 5" | all pages |
| `prefer_css_page_size` | boolean | false |
| `media` | print, screen | print |
| `timeout_ms` | 1000 to 60000 | 30000 |
| `wait_until` | load, domcontentloaded, networkidle0, networkidle2 | networkidle0 |
| `wait_for` | CSS selector | none |
| `wait_ms` | up to 5000 | 0 |
| `header_html` | HTML string | none |
| `footer_html` | HTML string | none |
| `tabular_nums` | boolean | false |
| `deduplicate_images` | boolean | false |
| `pdf_a` | boolean | false |

#### Running headers and footers

`header_html` and `footer_html` render on every page. Five class names are
substituted per page as the document is laid out:

| Class | Becomes |
| --- | --- |
| `.pageNumber` | the current page number |
| `.totalPages` | the total page count |
| `.date` | the render date |
| `.title` | the document title |
| `.url` | the source URL, when rendering from a URL |

```ts
const report = await pdfpipe.fromHtml(html, {
  header_html: '<div style="font-size:9px;width:100%;text-align:center">Q3 Report</div>',
  footer_html: '<div style="font-size:9px;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
});
```

Inline your styles. The header and footer are laid out separately from the page
body, so a stylesheet in your HTML does not reach them, and they inherit a very
small default font size.

If you leave `margin` at its `1cm` default, the top or bottom margin widens to
`2cm` automatically so the header or footer has room. Set `margin` yourself if
you want different spacing.

#### The other three

`tabular_nums` forces `font-variant-numeric: tabular-nums`, so digits share one
width. Use it whenever a column of numbers has to line up, which is most
invoices and statements.

`deduplicate_images` merges identical image XObjects after rendering. It only
pays off when the same image repeats across pages, a logo in a running header
being the usual case, and it costs a little post-processing time.

`pdf_a` writes PDF/A-1b XMP metadata on a best-effort basis. It marks the file
for archival tooling but does not guarantee full conformance, which would also
require tagged structure and an embedded ICC profile.

### `PdfResult`

- `bytes`: the raw PDF as a `Uint8Array`.
- `usage`: `{ used, limit, plan }` from the response headers.
- `toFile(path)`: write the PDF to disk (Node).
- `toArrayBuffer()`: get an `ArrayBuffer`, handy for HTTP responses in browsers or edge runtimes.

## Errors

Non-2xx responses throw a `PDFPipeError` with a `status` and a clear `message` (a slow render returns a timeout you can raise with `timeout_ms`, an unreachable URL says so, and a renderer at capacity returns a retryable `503`).

```ts
import { PDFPipe, PDFPipeError } from "pdfpipe-node";

try {
  const pdf = await pdfpipe.fromUrl("https://example.com", { timeout_ms: 45000 });
} catch (err) {
  if (err instanceof PDFPipeError) console.error(err.status, err.message);
}
```

## Works everywhere

Uses the standard `fetch` API, so it runs on Node 18+, Bun, Deno, Cloudflare Workers, and the browser. In edge runtimes use `toArrayBuffer()` to stream the PDF back in a `Response`.

## License

MIT
