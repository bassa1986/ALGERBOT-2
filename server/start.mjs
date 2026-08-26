import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the built server
const { handler } = await import("../dist/server/server.js");

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

const server = createServer(handler);

server.listen(port, host, () => {
  console.log(`✓ Server listening on http://${host}:${port}`);
});
