import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handleMcpRequest } from '../dist/src/http-handler.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  try {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const requestHost = req.headers.host || `${host}:${port}`;
    const init = {
      method: req.method,
      headers: req.headers,
      ...(body && !['GET', 'HEAD'].includes(req.method || '') ? { body, duplex: 'half' } : {}),
    };
    const request = new Request(`http://${requestHost}${req.url || '/'}`, init);
    const response = await handleMcpRequest(request);

    res.statusCode = response.status;
    for (const [name, value] of response.headers) res.setHeader(name, value);
    if (!response.body) {
      res.end();
      return;
    }
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error('[conformance-server] request failed', error);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal test server error' }));
  }
});

server.listen(port, host, () => {
  console.log(`Moyne Ross MCP conformance server listening on http://${host}:${port}/mcp`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
