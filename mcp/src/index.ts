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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

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
  })
  .strict();

type GeneratePdfInput = z.infer<typeof GeneratePdfInput>;

const GeneratePdfOutput = z.object({
  output_path: z.string(),
  size_bytes: z.number(),
  plan: z.string().optional(),
  usage: z.number().optional(),
  limit: z.number().optional(),
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
  version: "0.1.0",
});

server.registerTool(
  "pdfpipe_generate_pdf",
  {
    title: "Generate a PDF with PDFPipe",
    description: `Generate a PDF document from HTML or a public URL using the PDFPipe API, and save it to disk.

Use this to produce invoices, receipts, reports, certificates, statements, or any document, from HTML you compose or a web page you point at. The rendering runs server-side in a sandboxed Chromium, so the calling agent does not need a browser.

Args:
  - html (string, optional): Raw HTML to render. Provide html OR url, not both.
  - url (string, optional): Public http(s) URL to render. Provide html OR url, not both.
  - output_path (string, required): Where to save the PDF, e.g. "./invoice.pdf". Parent dirs are created.
  - format ('A4'|'A3'|'A5'|'Letter'|'Legal'|'Tabloid', optional): Page size, default 'A4'.
  - landscape (boolean, optional): Landscape orientation, default false.
  - margin (string, optional): CSS length page margin, e.g. '1cm', '0', default '1cm'.

Returns JSON:
  {
    "output_path": string,   // absolute path the PDF was written to
    "size_bytes": number,    // size of the generated PDF
    "plan": string,          // the API key's plan (e.g. "hobby")
    "usage": number,         // documents used this month after this call
    "limit": number          // monthly document limit for the plan
  }

Examples:
  - "Make an invoice PDF": html="<h1>Invoice #4012</h1>...", output_path="./invoice-4012.pdf"
  - "Save this web page as PDF": url="https://example.com/report", output_path="./report.pdf"

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

    try {
      const response = await axios.post(
        `${BASE_URL}/v1/pdf`,
        {
          ...(params.html ? { html: params.html } : { url: params.url }),
          options: {
            format: params.format,
            landscape: params.landscape,
            margin: params.margin,
          },
        },
        {
          responseType: "arraybuffer",
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${apiKey()}`,
            "Content-Type": "application/json",
            Accept: "application/pdf",
          },
        }
      );

      const buffer = Buffer.from(response.data as ArrayBuffer);
      const absPath = isAbsolute(params.output_path)
        ? params.output_path
        : resolve(process.cwd(), params.output_path);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, buffer);

      const h = response.headers;
      const num = (v: unknown): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const output = {
        output_path: absPath,
        size_bytes: buffer.length,
        plan: (h["x-pdfpipe-plan"] as string | undefined) ?? undefined,
        usage: num(h["x-pdfpipe-usage"]),
        limit: num(h["x-pdfpipe-limit"]),
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
  // Fail fast with a clear message if the key is missing.
  if (!process.env.PDFPIPE_API_KEY) {
    console.error(
      "WARNING: PDFPIPE_API_KEY is not set. Tool calls will fail until it is. " +
        "Get a key at https://pdfpipe.xyz."
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`pdfpipe-mcp-server running (stdio), API base ${BASE_URL}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
