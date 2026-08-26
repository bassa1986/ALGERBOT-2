import { createServer } from "http";
import { createRequestHandler } from "@tanstack/react-start/server";
import { getManifest } from "./dist/manifest.json" assert { type: "json" };

const handler = createRequestHandler({
  manifest: getManifest(),
});

const port = process.env.PORT || 3000;

const server = createServer(handler);

server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
