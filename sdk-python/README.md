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
