import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCrossCheck } from '../lib/cross-check-client.ts';
import { existsSync } from 'node:fs';

const clients = [['web', fetchCrossCheck]];
// mobile/ is intentionally Git-ignored in this repository; exercise it when present.
if (existsSync(new URL('../mobile/src/cross-check-client.ts', import.meta.url))) {
  clients.push(['mobile', (await import('../mobile/src/cross-check-client.ts')).fetchCrossCheck]);
}

for (const [name, execute] of clients) {
  test(`${name} polls the same route and preserves final response and filters`, async () => {
    const urls = [];
    const data = { success: true, logs: [], balances: [] };
    const response = await execute('/api/cross-check/employee-leaves?year=2026&employeeId=1', async url => {
      urls.push(url);
      return urls.length === 1 ? Response.json({ state: 'pending', jobId: '12345678-1234-1234-1234-123456789abc' }, { status: 202 }) : Response.json(data);
    });
    assert.deepEqual(await response.json(), data);
    assert.match(urls[1], /year=2026&employeeId=1&jobId=/);
  });
  test(`${name} stops on HTTP errors and rejects invalid pending payloads`, async () => {
    assert.equal((await execute('/api/cross-check/leave-users', async () => new Response('Forbidden', { status: 403 }))).status, 403);
    await assert.rejects(execute('/api/cross-check/leave-users', async () => Response.json({ jobId: 'http://evil' }, { status: 202 })), /Invalid scrape/);
  });
}
