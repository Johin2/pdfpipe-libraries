"""Official PDFPipe SDK for Python."""

from importlib.metadata import PackageNotFoundError, version as _version

from .client import PDFPipe, PDFPipeError, PdfOptions

__all__ = ["PDFPipe", "PDFPipeError", "PdfOptions", "__version__"]

try:
    # Single source of truth: the installed distribution metadata, which comes
    # from pyproject.toml. Hand-copying the number here is how it drifted.
    __version__ = _version("pdfpipe-python")
except PackageNotFoundError:  # running from a source tree, not installed
    __version__ = "0.0.0.dev0"
