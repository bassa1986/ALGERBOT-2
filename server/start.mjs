import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import server from "../dist/server/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

const MIME_TYPES = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res) {
  if (!req.url.startsWith("/assets/")) return false;

  const filePath = join(process.cwd(), "dist/client", req.url);
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(content);
    return true;
  } catch (err) {
    console.error(`Failed to serve ${filePath}:`, err.message);
    return false;
  }
}

function nodeToWebRequest(req) {
  const url = `http://${req.headers.host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

async function webToNodeResponse(webRes, res) {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (webRes.body) {
    const reader = webRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

const httpServer = createServer(async (req, res) => {
  try {
    if (await serveStatic(req, res)) return;

    const request = nodeToWebRequest(req);
    const response = await server.fetch(request);
    await webToNodeResponse(response, res);
  } catch (err) {
    console.error("Request error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

httpServer.listen(port, host, () => {
  console.log(`✓ Server listening on http://${host}:${port}`);
});
