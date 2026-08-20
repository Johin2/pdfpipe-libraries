#!/usr/bin/env node
/**
 * MCP server for PDFPipe (https://pdfpipe.xyz).
 *
 * Exposes a single high-value tool, `pdfpipe_generate_pdf`, that turns HTML or
 * a public URL into a PDF document via the PDFPipe REST API and writes it to a
 * path the agent chooses. Built so an AI agent can produce an invoice, report,
 * or certificate in one tool call.
 *
 * Auth: set PDFPIPE_API_KEY. Override the host with PDFPIPE_BASE_URL.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosError } from "axios";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve, sep } from "node:path";

// Read from package.json so the handshake version cannot drift from the
// published version again; it sat at 0.3.0 while the package shipped 0.3.2.
const PKG_VERSION = createRequire(import.meta.url)("../package.json").version as string;

const BASE_URL = (process.env.PDFPIPE_BASE_URL || "https://api.pdfpipe.xyz").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 60_000;

const PAGE_FORMATS = ["A4", "A3", "A5", "Letter", "Legal", "Tabloid"] as const;

const GeneratePdfInput = z
  .object({
    html: z
      .string()
      .min(1)
      .optional()
      .describe("Raw HTML to render into a PDF. Provide this OR url, not both."),
    url: z
      .string()
      .url()
      .optional()
      .describe("Public http(s) URL to render into a PDF. Provide this OR html, not both."),
    output_path: z
      .string()
      .min(1)
      .describe(
        "Filesystem path to write the resulting PDF to, e.g. './invoice.pdf'. " +
          "Parent directories are created if missing."
      ),
    format: z
      .enum(PAGE_FORMATS)
      .default("A4")
      .describe("Page size. Default A4."),
    landscape: z
      .boolean()
      .default(false)
      .describe("Render in landscape orientation. Default false."),
    margin: z
      .string()
      .default("1cm")
      .describe("Uniform page margin as a CSS length, e.g. '1cm', '0', '0.5in'. Default '1cm'."),
    store: z
      .boolean()
      .default(false)
      .describe("If true, persist the PDF and return document_id, document_url, and document_expires so it can be fetched again later. There is no separate retrieval tool: use document_url."),
    filename: z
      .string()
      .max(200)
      .optional()
      .describe("Filename to associate with the stored document. Only used when store is true."),
    header_html: z
      .string()
      .optional()
      .describe("HTML rendered as a running page header. Class names .pageNumber, .totalPages, .date, .title, .url are substituted by the renderer on each page."),
    footer_html: z
      .string()
      .optional()
      .describe("HTML rendered as a running page footer. Same class substitution as header_html."),
    print_background: z
      .boolean()
      .default(true)
      .describe("Print background graphics and colors. Default true."),
    tabular_nums: z
      .boolean()
      .default(false)
      .describe("Force consistent digit widths via font-variant-numeric: tabular-nums. Fixes column misalignment in tables and invoices. Default false."),
    deduplicate_images: z
      .boolean()
      .default(false)
      .describe("Merge identical image XObjects in the output PDF. Reduces file size when the same image appears on many pages. Default false."),
    pdf_a: z
      .boolean()
      .default(false)
      .describe("Add PDF/A-1b XMP metadata to the document (best-effort conformance). Default false."),
    password: z
      .string()
      .optional()
      .describe("Encrypt the PDF with this password. The reader is prompted for it on open."),
    scale: z
      .number()
      .min(0.1)
      .max(2)
      .default(1)
      .describe("Render scale, 0.1 to 2. Below 1 fits wide tables onto the page. Default 1."),
    page_ranges: z
      .string()
      .optional()
      .describe("Which pages to keep, e.g. '1-3, 5'. Omit for all pages."),
    prefer_css_page_size: z
      .boolean()
      .default(false)
      .describe("Honour the @page size and margins declared in the document CSS instead of format/margin. Default false."),
    media: z
      .enum(["print", "screen"])
      .default("print")
      .describe("CSS media type to emulate. Use 'screen' when a page hides content behind @media print. Default 'print'."),
    inject_css: z
      .string()
      .optional()
      .describe("Extra CSS applied after load. Useful for hiding cookie banners or nav when rendering a URL you do not control."),
    wait_until: z
      .enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
      .default("networkidle0")
      .describe("When to consider the page ready. Default 'networkidle0'."),
    wait_for: z
      .string()
      .optional()
      .describe("Wait for this CSS selector before rendering. Fails if it never appears within the timeout."),
    wait_ms: z
      .number()
      .min(0)
      .max(5000)
      .default(0)
      .describe("Fixed extra delay before rendering, up to 5000 ms. Prefer wait_for. Default 0."),
    timeout_ms: z
      .number()
      .min(1000)
      .max(60000)
      .default(30000)
      .describe("How long a render may take before it is abandoned, 1000 to 60000 ms. Raise for heavy pages. Default 30000."),
  })
  .strict();

type GeneratePdfInput = z.infer<typeof GeneratePdfInput>;

const GeneratePdfOutput = z.object({
  output_path: z.string(),
  size_bytes: z.number(),
  plan: z.string().optional(),
  usage: z.number().optional(),
  limit: z.number().optional(),
  document_id: z.string().optional().describe("Archive ID (present when store: true)"),
  document_url: z.string().optional().describe("Retrieval URL (present when store: true)"),
  document_expires: z.string().optional().describe("ISO 8601 expiry timestamp (present when store: true)"),
});

function apiKey(): string {
  const key = process.env.PDFPIPE_API_KEY;
  if (!key) {
    throw new Error(
      "PDFPIPE_API_KEY is not set. Get a key at https://pdfpipe.xyz and set it " +
        "in the MCP server environment."
    );
  }
  return key;
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const e = error as AxiosError;
    if (e.response) {
      // The API returns JSON {detail: "..."} for errors.
      let detail = "";
      const data = e.response.data as unknown;
      if (data && typeof data === "object" && "detail" in data) {
        detail = String((data as { detail: unknown }).detail);
      } else if (Buffer.isBuffer(data)) {
        try {
          detail = String(JSON.parse(data.toString("utf8")).detail ?? "");
        } catch {
          /* binary or non-JSON body */
        }
      }
      switch (e.response.status) {
        case 400:
          return `Error: Bad request. ${detail || "Provide exactly one of 'html' or 'url'."}`;
        case 401:
          return "Error: Invalid or missing API key. Check PDFPIPE_API_KEY.";
        case 402:
          return `Error: Monthly document limit reached. ${detail || "Upgrade your plan at https://pdfpipe.xyz."}`;
        case 413:
          return `Error: Payload too large. ${detail || "Reduce the HTML size."}`;
        case 422:
          return `Error: Could not render the document. ${detail || "Check the HTML/URL is valid and reachable."}`;
        case 429:
          return "Error: Rate limit reached. Wait a moment and retry.";
        default:
          return `Error: PDFPipe API returned ${e.response.status}. ${detail}`.trim();
      }
    }
    if (e.code === "ECONNABORTED") {
      return "Error: Request timed out. The document may be too complex, or the API is unreachable.";
    }
    if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND") {
      return `Error: Could not reach the PDFPipe API at ${BASE_URL}. Check PDFPIPE_BASE_URL and your connection.`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

const server = new McpServer({
  name: "pdfpipe-mcp-server",
  version: PKG_VERSION,
});

server.registerTool(
  "pdfpipe_generate_pdf",
  {
    title: "Generate a PDF with PDFPipe",
    description: `Generate a PDF document from HTML or a public URL using the PDFPipe API, and save it to disk.

Use this to produce invoices, receipts, reports, certificates, statements, or any document, from HTML you compose or a web page you point at. The rendering runs server-side in a sandboxed browser, so the calling agent does not need a browser.

Pass store: true to persist the PDF and receive a document_id for later retrieval.

Args:
  - html (string, optional): Raw HTML to render. Provide html OR url, not both.
  - url (string, optional): Public http(s) URL to render. Provide html OR url, not both.
  - output_path (string, required): Where to save the PDF, e.g. "./invoice.pdf". Parent dirs are created.
  - format ('A4'|'A3'|'A5'|'Letter'|'Legal'|'Tabloid', optional): Page size, default 'A4'.
  - landscape (boolean, optional): Landscape orientation, default false.
  - margin (string, optional): CSS length page margin, e.g. '1cm', '0', default '1cm'.
  - header_html (string, optional): HTML for a running page header. .pageNumber, .totalPages, .date classes substituted per page.
  - footer_html (string, optional): HTML for a running page footer. Same substitution as header_html.
  - tabular_nums (boolean, optional): Force consistent digit widths for tables/invoices. Default false.
  - deduplicate_images (boolean, optional): Merge duplicate image XObjects to shrink file size. Default false.
  - pdf_a (boolean, optional): Add PDF/A-1b metadata (best-effort). Default false.
  - password (string, optional): Encrypt the PDF with this password.
  - scale (number, optional): Render scale 0.1 to 2, default 1. Below 1 fits wide tables.
  - page_ranges (string, optional): Pages to keep, e.g. '1-3, 5'. Default all.
  - prefer_css_page_size (boolean, optional): Honour @page CSS over format/margin. Default false.
  - media ('print'|'screen', optional): CSS media to emulate, default 'print'.
  - inject_css (string, optional): Extra CSS applied after load, e.g. to hide cookie banners.
  - wait_until ('load'|'domcontentloaded'|'networkidle0'|'networkidle2', optional): Default 'networkidle0'.
  - wait_for (string, optional): CSS selector to wait for before rendering.
  - wait_ms (number, optional): Extra delay up to 5000 ms, default 0.
  - timeout_ms (number, optional): Render timeout 1000 to 60000 ms, default 30000. Raise for heavy pages.
  - store (boolean, optional): Persist the PDF for later retrieval, default false.
  - filename (string, optional): Filename for the stored document (used with store: true).

Returns JSON with output_path, size_bytes, plan, usage, limit, and optionally document_id/document_url/document_expires when store is true.

Errors return a message starting with "Error:" explaining the cause (bad key, limit reached, render failure, unreachable API).`,
    inputSchema: GeneratePdfInput.shape,
    outputSchema: GeneratePdfOutput.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: GeneratePdfInput) => {
    // Exactly one of html / url.
    if (!params.html && !params.url) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "Error: Provide either 'html' or 'url'." }],
      };
    }
    if (params.html && params.url) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "Error: Provide 'html' or 'url', not both." }],
      };
    }

    // Validate and sandbox output_path before any network call (covers both relative and absolute).
    const safeCwd = resolve(process.cwd());
    const absPath = isAbsolute(params.output_path)
      ? resolve(params.output_path)
      : resolve(safeCwd, params.output_path);
    if (!absPath.startsWith(safeCwd + sep) && absPath !== safeCwd) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "Error: output_path must not escape the working directory." }],
      };
    }

    try {
      // When store: true the API returns JSON (not PDF bytes).
      const responseType = params.store ? "json" : "arraybuffer";
      const response = await axios.post(
        `${BASE_URL}/v1/pdf`,
        {
          ...(params.html ? { html: params.html } : { url: params.url }),
          options: {
            format: params.format,
            landscape: params.landscape,
            margin: params.margin,
            print_background: params.print_background,
            ...(params.header_html ? { header_html: params.header_html } : {}),
            ...(params.footer_html ? { footer_html: params.footer_html } : {}),
            ...(params.tabular_nums ? { tabular_nums: true } : {}),
            ...(params.deduplicate_images ? { deduplicate_images: true } : {}),
            ...(params.pdf_a ? { pdf_a: true } : {}),
            // Only send what differs from the API default, so the request body
            // stays identical for callers that set none of these.
            ...(params.password ? { password: params.password } : {}),
            ...(params.scale !== 1 ? { scale: params.scale } : {}),
            ...(params.page_ranges ? { page_ranges: params.page_ranges } : {}),
            ...(params.prefer_css_page_size ? { prefer_css_page_size: true } : {}),
            ...(params.media === "screen" ? { media: "screen" } : {}),
            ...(params.inject_css ? { inject_css: params.inject_css } : {}),
            ...(params.wait_until !== "networkidle0" ? { wait_until: params.wait_until } : {}),
            ...(params.wait_for ? { wait_for: params.wait_for } : {}),
            ...(params.wait_ms > 0 ? { wait_ms: params.wait_ms } : {}),
            ...(params.timeout_ms !== 30000 ? { timeout_ms: params.timeout_ms } : {}),
          },
          ...(params.store ? { store: true } : {}),
          ...(params.filename ? { filename: params.filename } : {}),
        },
        {
          responseType,
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${apiKey()}`,
            "Content-Type": "application/json",
            Accept: params.store ? "application/json" : "application/pdf",
          },
        }
      );

      const num = (v: unknown): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const str = (v: unknown): string | undefined =>
        typeof v === "string" && v ? v : undefined;

      if (params.store) {
        const data = response.data as Record<string, unknown>;
        const output = {
          output_path: absPath,
          size_bytes: num(data["size_bytes"]) ?? 0,
          plan: str(data["plan"]),
          usage: num(data["used"]),
          limit: num(data["limit"]),
          document_id: str(data["document_id"]),
          document_url: str(data["document_url"]),
          document_expires: str(data["document_expires"]),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      const buffer = Buffer.from(response.data as ArrayBuffer);
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, buffer);

      const h = response.headers;
      const output = {
        output_path: absPath,
        size_bytes: buffer.length,
        plan: str(h["x-pdfpipe-plan"]),
        usage: num(h["x-pdfpipe-usage"]),
        limit: num(h["x-pdfpipe-limit"]),
        document_id: str(h["x-pdfpipe-document-id"]),
        document_url: str(h["x-pdfpipe-document-url"]),
        document_expires: str(h["x-pdfpipe-document-expires"]),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: describeError(error) }],
      };
    }
  }
);

async function main(): Promise<void> {
  if (!process.env.PDFPIPE_API_KEY) {
    console.error("Error: PDFPIPE_API_KEY is not set. Get a key at https://pdfpipe.xyz.");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`pdfpipe-mcp-server running (stdio), API base ${BASE_URL}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
