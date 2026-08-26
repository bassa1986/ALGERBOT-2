import { createServer } from "node:http";
import server from "../dist/server/server.js";

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

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
