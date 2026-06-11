# PDFPipe libraries

Official open-source client libraries for [PDFPipe](https://pdfpipe.xyz) — the document API. HTML or a URL in, pixel-perfect PDF out.

| Library | Install | Registry |
| --- | --- | --- |
| [`sdk-js`](./sdk-js) — Node.js / edge SDK | `npm install pdfpipe-node` | [npm](https://www.npmjs.com/package/pdfpipe-node) |
| [`sdk-python`](./sdk-python) — Python SDK | `pip install pdfpipe-python` | [PyPI](https://pypi.org/project/pdfpipe-python/) |
| [`mcp`](./mcp) — MCP server for AI agents | `npx pdfpipe-mcp-server` | [npm](https://www.npmjs.com/package/pdfpipe-mcp-server) |

The n8n community node lives in its own repo: [Johin2/n8n-nodes-pdfpipe](https://github.com/Johin2/n8n-nodes-pdfpipe).

## Quick start

```js
import { PDFPipe } from "pdfpipe-node";

const pdfpipe = new PDFPipe({ apiKey: process.env.PDFPIPE_API_KEY });
const pdf = await pdfpipe.fromHtml("<h1>Invoice #4012</h1>", { format: "A4" });
await pdf.toFile("invoice.pdf");
```

```python
from pdfpipe import PDFPipe

pdfpipe = PDFPipe(api_key="pp_live_...")
pdf = pdfpipe.from_html("<h1>Invoice #4012</h1>", {"format": "A4"})
open("invoice.pdf", "wb").write(pdf)
```

Get an API key at [pdfpipe.xyz](https://pdfpipe.xyz). Docs: [pdfpipe.xyz/docs](https://pdfpipe.xyz/docs).

## License

MIT — see [LICENSE](./LICENSE). Issues and PRs welcome.
