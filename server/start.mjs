// Production entry point. `npm run build` produces dist/server/server.js,
// which exports a Web-standard `{ fetch(request): Promise<Response> }`
// handler (this TanStack Start version's actual build output — unlike the
// Nitro-based .output/server/index.mjs launcher some older docs/templates
// reference, which this version does not generate on its own). This file
// is the small adapter that actually listens on a port and forwards each
// incoming Node HTTP request into that handler, converting the Node
// req/res pair to/from the Fetch API's Request/Response the handler
// expects.
import { createServer } from 'node:http'
import server from '../dist/server/server.js'

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

function nodeRequestToWebRequest(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const hostHeader = req.headers.host || `localhost:${port}`
  const url = `${protocol}://${hostHeader}${req.url}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, value)
    }
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? 'half' : undefined,
  })
}

async function webResponseToNodeResponse(webResponse, res) {
  res.statusCode = webResponse.status
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  if (!webResponse.body) {
    res.end()
    return
  }

  const reader = webResponse.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
}

const httpServer = createServer(async (req, res) => {
  try {
    const webRequest = nodeRequestToWebRequest(req)
    const webResponse = await server.fetch(webRequest)
    await webResponseToNodeResponse(webResponse, res)
  } catch (err) {
    console.error('Unhandled error serving request', err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }
})

httpServer.listen(port, host, () => {
  console.log(`AlgerBot server listening on http://${host}:${port}`)
})
