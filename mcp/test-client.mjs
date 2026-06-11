// Smoke test: spawn the built MCP server over stdio, list tools, generate a PDF.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, existsSync, rmSync } from "node:fs";

const API_KEY = process.argv[2];
const BASE_URL = process.argv[3] || "http://localhost:8077";
if (!API_KEY) {
  console.error("usage: node test-client.mjs <api_key> [base_url]");
  process.exit(1);
}

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") =>
  (ok ? (pass++, console.log(`  PASS  ${name}  ${detail}`)) : (fail++, console.log(`  FAIL  ${name}  ${detail}`)));

const outPath = "./test-output.pdf";
if (existsSync(outPath)) rmSync(outPath);

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, PDFPIPE_API_KEY: API_KEY, PDFPIPE_BASE_URL: BASE_URL },
});
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(transport);

// 1. tool is listed
const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === "pdfpipe_generate_pdf");
check("tool listed", !!tool, tool ? "" : `got ${tools.map((t) => t.name).join(",")}`);
check("has output schema", !!tool?.outputSchema);

// 2. generate from HTML
const r1 = await client.callTool({
  name: "pdfpipe_generate_pdf",
  arguments: { html: "<h1>Invoice #4012</h1><p>Thanks.</p>", output_path: outPath, format: "A4" },
});
const sc = r1.structuredContent;
check("html render not error", !r1.isError, r1.isError ? r1.content?.[0]?.text : "");
check("file written + valid PDF", existsSync(outPath) && readFileSync(outPath).subarray(0, 4).toString() === "%PDF",
  existsSync(outPath) ? `size=${sc?.size_bytes} usage=${sc?.usage}/${sc?.limit}` : "no file");

// 3. URL render
const r2 = await client.callTool({
  name: "pdfpipe_generate_pdf",
  arguments: { url: "https://example.com", output_path: "./test-url.pdf" },
});
check("url render not error", !r2.isError, r2.isError ? r2.content?.[0]?.text : "");
check("url file valid PDF", existsSync("./test-url.pdf") && readFileSync("./test-url.pdf").subarray(0, 4).toString() === "%PDF");

// 4. both html+url -> error
const r3 = await client.callTool({
  name: "pdfpipe_generate_pdf",
  arguments: { html: "<p>x</p>", url: "https://example.com", output_path: "./x.pdf" },
});
check("rejects html+url", r3.isError === true, r3.content?.[0]?.text);

// 5. bad key surfaces actionable error (spawn a second server with a bad key)
const badTransport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, PDFPIPE_API_KEY: "pp_live_bogus", PDFPIPE_BASE_URL: BASE_URL },
});
const badClient = new Client({ name: "test2", version: "1.0.0" });
await badClient.connect(badTransport);
const r4 = await badClient.callTool({
  name: "pdfpipe_generate_pdf",
  arguments: { html: "<p>x</p>", output_path: "./y.pdf" },
});
check("bad key -> actionable error", r4.isError === true && /API key/i.test(r4.content?.[0]?.text || ""), r4.content?.[0]?.text);

// cleanup
for (const f of [outPath, "./test-url.pdf"]) if (existsSync(f)) rmSync(f);
await client.close();
await badClient.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
