import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function assertRegistryRelease(payload, expected) {
  const actual = payload?.server;
  assert.equal(actual?.name, expected.name, 'Registry server name differs');
  assert.equal(actual?.version, expected.version, 'Registry release version differs');
  assert.deepEqual(
    actual?.remotes?.map(({ type, url }) => ({ type, url })),
    expected.remotes.map(({ type, url }) => ({ type, url })),
    'Registry remote connections differ',
  );
}

async function main() {
  const expected = JSON.parse(await readFile(new URL('../server.json', import.meta.url), 'utf8'));
  const url = `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(expected.name)}/versions/${encodeURIComponent(expected.version)}`;
  // Allow bounded propagation time after publication; never accept an old listing.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      assert.ok(response.ok, `Registry HTTP ${response.status}`);
      assertRegistryRelease(await response.json(), expected);
      console.log(`Verified ${expected.name} ${expected.version} and its remote connections.`);
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      console.error(`Registry verification attempt ${attempt} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
