import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  console.error('[moyneross-mcp] starting stdio transport');
  await serveStdio(createMcpServer);
}

main().catch((error: unknown) => {
  console.error('[moyneross-mcp] fatal stdio error', error);
  process.exitCode = 1;
});
