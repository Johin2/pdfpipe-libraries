/**
 * Official PDFPipe SDK.
 *
 * Turn HTML or a URL into a PDF with one call, backed by real Chromium rendering.
 *
 * ```ts
 * import { PDFPipe } from "pdfpipe-node";
 * const pdfpipe = new PDFPipe({ apiKey: process.env.PDFPIPE_API_KEY! });
 * const pdf = await pdfpipe.fromHtml("<h1>Invoice #4012</h1>", { format: "A4" });
 * await pdf.toFile("invoice.pdf");
 * ```
 */

export interface PdfOptions {
  /** Page size. Defaults to A4. */
  format?: "A4" | "A3" | "A5" | "Letter" | "Legal" | "Tabloid";
  /** Landscape orientation. Defaults to false. */
  landscape?: boolean;
  /** Page margin as any CSS length, for example "1cm". */
  margin?: string;
  /** Print CSS backgrounds. Defaults to true. */
  print_background?: boolean;
  /** Render scale, 0.1 to 2.0. Defaults to 1.0. */
  scale?: number;
  /** Page ranges to include, for example "1-3, 5". Defaults to all pages. */
  page_ranges?: string;
  /** Use the @page CSS size instead of `format`. Defaults to false. */
  prefer_css_page_size?: boolean;
  /** Emulate "print" or "screen" media. Defaults to "print". */
  media?: "print" | "screen";
  /** Hard timeout in ms, 1000 to 60000. Defaults to 30000. */
  timeout_ms?: number;
  /** When the page is considered ready. Defaults to "networkidle0". */
  wait_until?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  /** Wait for a CSS selector before rendering. */
  wait_for?: string;
  /** Extra delay before rendering, up to 10000 ms. */
  wait_ms?: number;
}

export interface PDFPipeOptions {
  /** Your API key, looks like `pp_live_...`. */
  apiKey: string;
  /** Override the API base URL. Defaults to https://api.pdfpipe.xyz. */
  baseUrl?: string;
  /** Optional custom fetch implementation. */
  fetch?: typeof fetch;
}

/** Thrown when the API returns a non-2xx response. `status` is the HTTP code. */
export class PDFPipeError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PDFPipeError";
    this.status = status;
  }
}

/** A generated PDF, returned as bytes with a couple of convenience helpers. */
export class PdfResult {
  constructor(
    /** Raw PDF bytes. */
    readonly bytes: Uint8Array,
    /** Usage reported by the API for this render. */
    readonly usage: { used: number | null; limit: number | null; plan: string | null }
  ) {}

  /** Write the PDF to a file (Node only). */
  async toFile(path: string): Promise<void> {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, this.bytes);
  }

  /** The PDF as an ArrayBuffer, handy for HTTP responses in the browser or workers. */
  toArrayBuffer(): ArrayBuffer {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength
    ) as ArrayBuffer;
  }
}

export class PDFPipe {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: PDFPipeOptions) {
    if (!options || !options.apiKey) {
      throw new Error("PDFPipe: an apiKey is required.");
    }
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? "https://api.pdfpipe.xyz").replace(/\/+$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function") {
      throw new Error("PDFPipe: no global fetch found. Pass a fetch implementation via options.fetch.");
    }
  }

  /** Render a PDF from an HTML string. */
  fromHtml(html: string, options: PdfOptions = {}): Promise<PdfResult> {
    return this.#render({ html, options });
  }

  /** Render a PDF from a public URL. */
  fromUrl(url: string, options: PdfOptions = {}): Promise<PdfResult> {
    return this.#render({ url, options });
  }

  async #render(body: { html?: string; url?: string; options: PdfOptions }): Promise<PdfResult> {
    const res = await this.#fetch(`${this.#baseUrl}/v1/pdf`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = `PDFPipe request failed with status ${res.status}.`;
      try {
        const j = (await res.json()) as { detail?: string };
        if (j && typeof j.detail === "string") detail = j.detail;
      } catch {
        /* keep the default message */
      }
      throw new PDFPipeError(detail, res.status);
    }

    const num = (v: string | null) => (v == null ? null : Number(v));
    const usage = {
      used: num(res.headers.get("X-PDFPipe-Usage")),
      limit: num(res.headers.get("X-PDFPipe-Limit")),
      plan: res.headers.get("X-PDFPipe-Plan"),
    };
    return new PdfResult(new Uint8Array(await res.arrayBuffer()), usage);
  }
}

export default PDFPipe;
