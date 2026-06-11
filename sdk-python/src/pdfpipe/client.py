"""PDFPipe client.

Example:
    from pdfpipe import PDFPipe

    pdfpipe = PDFPipe(api_key="pp_live_...")
    pdf = pdfpipe.from_html("<h1>Invoice #4012</h1>", {"format": "A4"})
    with open("invoice.pdf", "wb") as f:
        f.write(pdf)
"""

from __future__ import annotations

from typing import Optional

try:
    from typing import TypedDict
except ImportError:  # Python < 3.8 safety, though we require 3.8+
    TypedDict = dict  # type: ignore

import requests


class PdfOptions(TypedDict, total=False):
    """Optional rendering settings. All keys are optional."""

    format: str  # A4, A3, A5, Letter, Legal, Tabloid
    landscape: bool
    margin: str  # any CSS length, e.g. "1cm"
    print_background: bool
    scale: float  # 0.1 to 2.0
    page_ranges: str  # e.g. "1-3, 5"
    prefer_css_page_size: bool
    media: str  # "print" or "screen"
    timeout_ms: int  # 1000 to 60000
    wait_until: str  # load, domcontentloaded, networkidle0, networkidle2
    wait_for: str  # CSS selector
    wait_ms: int  # up to 10000


class PDFPipeError(Exception):
    """Raised when the API returns a non-2xx response."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


class PDFPipe:
    """A tiny client for the PDFPipe API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.pdfpipe.xyz",
        session: Optional[requests.Session] = None,
    ) -> None:
        if not api_key:
            raise ValueError("PDFPipe: an api_key is required.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._session = session or requests.Session()

    def from_html(self, html: str, options: Optional[PdfOptions] = None) -> bytes:
        """Render a PDF from an HTML string. Returns the PDF bytes."""
        return self._render({"html": html, "options": options or {}})

    def from_url(self, url: str, options: Optional[PdfOptions] = None) -> bytes:
        """Render a PDF from a public URL. Returns the PDF bytes."""
        return self._render({"url": url, "options": options or {}})

    def _render(self, body: dict) -> bytes:
        resp = self._session.post(
            f"{self.base_url}/v1/pdf",
            json=body,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=120,
        )
        if not resp.ok:
            detail = f"PDFPipe request failed with status {resp.status_code}."
            try:
                payload = resp.json()
                if isinstance(payload, dict) and isinstance(payload.get("detail"), str):
                    detail = payload["detail"]
            except ValueError:
                pass
            raise PDFPipeError(detail, resp.status_code)
        return resp.content
