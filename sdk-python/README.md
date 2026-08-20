# pdfpipe-python

Official Python SDK for [PDFPipe](https://pdfpipe.xyz). Turn HTML or a URL into a PDF with one call, backed by real Chromium rendering.

```bash
pip install pdfpipe-python
```

## Quick start

```python
from pdfpipe import PDFPipe

pdfpipe = PDFPipe(api_key="pp_live_...")

# From HTML
pdf = pdfpipe.from_html("<h1>Invoice #4012</h1>", {"format": "A4"})
with open("invoice.pdf", "wb") as f:
    f.write(pdf)

# From a URL
pdf = pdfpipe.from_url("https://example.com")
with open("example.pdf", "wb") as f:
    f.write(pdf)
```

Get an API key at [pdfpipe.xyz](https://pdfpipe.xyz). Keys look like `pp_live_...`.

## API

### `PDFPipe(api_key, base_url="https://api.pdfpipe.xyz", session=None)`

### `from_html(html, options=None) -> bytes`
### `from_url(url, options=None) -> bytes`

Both return the raw PDF bytes. `options` is a dict, all keys optional:

| Key | Values | Default |
| --- | --- | --- |
| `format` | A4, A3, A5, Letter, Legal, Tabloid | A4 |
| `landscape` | bool | False |
| `margin` | any CSS length | 1cm |
| `print_background` | bool | True |
| `scale` | 0.1 to 2.0 | 1.0 |
| `page_ranges` | e.g. "1-3, 5" | all pages |
| `prefer_css_page_size` | bool | False |
| `media` | print, screen | print |
| `timeout_ms` | 1000 to 60000 | 30000 |
| `wait_until` | load, domcontentloaded, networkidle0, networkidle2 | networkidle0 |
| `wait_for` | CSS selector | none |
| `wait_ms` | up to 10000 | 0 |
| `header_html` | HTML string | none |
| `footer_html` | HTML string | none |
| `tabular_nums` | bool | False |
| `deduplicate_images` | bool | False |
| `pdf_a` | bool | False |

### Running headers and footers

`header_html` and `footer_html` render on every page. Five class names are
substituted per page as the document is laid out:

| Class | Becomes |
| --- | --- |
| `.pageNumber` | the current page number |
| `.totalPages` | the total page count |
| `.date` | the render date |
| `.title` | the document title |
| `.url` | the source URL, when rendering from a URL |

```python
pdf = pdfpipe.from_html(
    html,
    {
        "header_html": '<div style="font-size:9px;width:100%;text-align:center">Q3 Report</div>',
        "footer_html": '<div style="font-size:9px;width:100%;text-align:center">'
                       'Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    },
)
```

Inline your styles. The header and footer are laid out separately from the page
body, so a stylesheet in your HTML does not reach them, and they inherit a very
small default font size.

If you leave `margin` at its `1cm` default, the top or bottom margin widens to
`2cm` automatically so the header or footer has room. Set `margin` yourself if
you want different spacing.

### The other three

`tabular_nums` forces `font-variant-numeric: tabular-nums`, so digits share one
width. Use it whenever a column of numbers has to line up, which is most
invoices and statements.

`deduplicate_images` merges identical image XObjects after rendering. It only
pays off when the same image repeats across pages, a logo in a running header
being the usual case, and it costs a little post-processing time.

`pdf_a` writes PDF/A-1b XMP metadata on a best-effort basis. It marks the file
for archival tooling but does not guarantee full conformance, which would also
require tagged structure and an embedded ICC profile.

## Errors

Non-2xx responses raise `PDFPipeError` with a `.status` attribute and a clear message.

```python
from pdfpipe import PDFPipe, PDFPipeError

try:
    pdf = pdfpipe.from_url("https://example.com", {"timeout_ms": 45000})
except PDFPipeError as e:
    print(e.status, str(e))
```

## License

MIT
