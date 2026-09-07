import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import server from "../dist/server/server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

// Resolved once at startup: the one directory static asset requests are
// ever allowed to read from.
const CLIENT_ASSETS_DIR = resolve(process.cwd(), "dist/client");

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

  // req.url can contain a query string and percent-encoded segments
  // (e.g. "%2e%2e" for "..") — both must be stripped/decoded BEFORE the
  // path is resolved, or a request like "/assets/%2e%2e/%2e%2e/.env"
  // would sail through untouched.
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.statusCode = 400;
    res.end("Bad Request");
    return true;
  }

  // resolve() collapses any ".." segments; the check below then verifies
  // the FINAL resolved path is still inside CLIENT_ASSETS_DIR before
  // ever touching the filesystem. Without this, a request such as
  // "/assets/../../../../etc/passwd" would previously escape dist/client
  // entirely via plain path.join (which does not sandbox ".."), letting
  // an attacker read arbitrary files readable by the Node process.
  const filePath = resolve(CLIENT_ASSETS_DIR, "." + pathname);
  if (filePath !== CLIENT_ASSETS_DIR && !filePath.startsWith(CLIENT_ASSETS_DIR + sep)) {
    console.error(`[static] blocked path-traversal attempt: ${req.url}`);
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

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

// Graceful shutdown: on SIGTERM/SIGINT (container stop, redeploy, Ctrl+C),
// stop accepting NEW connections but let in-flight requests finish rather
// than hard-killing them mid-response. Without this, every redeploy could
// cut off requests that were already being served.
//
// NOTE: this only drains the HTTP layer. It does NOT close the Postgres
// pool (src/lib/db.ts's closeDb()) — that module is TypeScript, compiled
// into the ../dist/server/server.js bundle this file imports, and isn't
// currently exposed on that bundle's exported `server` object for a
// plain .mjs entrypoint to call. Postgres itself will notice the TCP
// connections go idle and eventually clean them up server-side, but that
// isn't as clean as an explicit pool.end(). If you want that fully wired,
// the `server.fetch` module (src/router.tsx / the TanStack Start server
// entry) would need to export a small `shutdown()` hook alongside
// `fetch` that this file can call here.
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, closing server (draining in-flight requests)...`);

  httpServer.close(() => {
    console.log("✓ Server closed, exiting.");
    process.exit(0);
  });

  // Safety net: if some connection never finishes (e.g. a hung request),
  // don't let the process hang forever waiting for it.
  setTimeout(() => {
    console.error("Forced shutdown after 10s timeout (some connections did not drain in time).");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
