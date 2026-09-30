import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHandler, parseFilters } from '../src/app.mjs';
import { normalizeReports } from '../src/config.mjs';

const token = 'a'.repeat(64);
const reports = normalizeReports([{ id: 'attendance-default', name: 'Attendance', query: 'SELECT TOP ({{limit}}) * FROM Attendance WHERE VerifyTime >= {{fromDate}}' }]);
async function service(t, options = {}) {
  const calls = [];
  const logs = [];
  const server = createServer(createHandler({
    token, reports, log: (entry) => logs.push(entry), health: async () => {},
    execute: async (report, filters) => { calls.push({ report, filters }); return [{ EmployeeName: 'Test Employee' }]; },
    ...options,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { calls, logs, request: (path, init = {}) => fetch(base + path, { headers: { Authorization: `Bearer ${token}` }, ...init }) };
}

test('requires authentication for every endpoint and never executes unauthenticated SQL', async (t) => {
  const api = await service(t);
  for (const path of ['/v1/attendance', '/v1/reports', '/v1/health']) {
    const response = await api.request(path, { headers: {} });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(api.calls.length, 0);
});

test('retains the web/mobile attendance contract without exposing SQL or credentials', async (t) => {
  const api = await service(t);
  const response = await api.request('/v1/attendance?limit=1&fromDate=2026-09-29&toDate=2026-09-29');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.rows, [{ EmployeeName: 'Test Employee' }]);
  assert.deepEqual(data.columns, ['EmployeeName']);
  assert.equal(data.report.id, 'attendance-default');
  assert.equal(data.limit, 1);
  assert.equal(data.queryUsed, undefined);
  assert.equal(api.calls[0].filters.fromDate, '2026-09-29');
  assert.equal(api.calls[0].filters.toDate, '2026-09-29');
  assert.match(api.calls[0].report.query, /TOP \(@limit\)/);
  const metadata = await (await api.request('/v1/reports')).json();
  assert.deepEqual(metadata, { connected: true, reports: [{ id: 'attendance-default', name: 'Attendance' }] });
  assert.ok(!api.logs.join('').includes('Test Employee'));
});

test('rejects SQL injection, invalid dates, unknown reports and ambiguous filters before SQL', async (t) => {
  const api = await service(t);
  for (const query of ['limit=0', 'limit=2001', 'limit=1.5', 'limit=Infinity', 'limit=1;DROP TABLE Attendance', 'fromDate=2026-02-30', 'fromDate=2026-09-30&toDate=2026-09-29', 'reportId=missing', 'query=SELECT+1', 'limit=1&limit=2', 'server=evil']) {
    assert.equal((await api.request(`/v1/attendance?${query}`)).status, 400, query);
  }
  assert.equal(api.calls.length, 0);
  assert.equal((await api.request('/v1/attendance', { method: 'POST', body: 'SQL' })).status, 405);
});

test('accepts leap day and optional dates', () => {
  assert.equal(parseFilters(new URLSearchParams('fromDate=2024-02-29')).fromDate, '2024-02-29');
  assert.equal(parseFilters(new URLSearchParams()).limit, 200);
  assert.equal(parseFilters(new URLSearchParams()).toDate, null);
});

test('database errors are sanitized and readiness checks the database', async (t) => {
  const fail = async () => { throw new Error('SQL password=secret; internal-server'); };
  const api = await service(t, { execute: fail, health: fail });
  for (const path of ['/v1/attendance', '/v1/health', '/v1/reports']) {
    const response = await api.request(path);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Attendance database is unavailable' });
  }
});

test('rate limits authenticated requests', async (t) => {
  const api = await service(t, { rateLimit: 1 });
  assert.equal((await api.request('/v1/attendance')).status, 200);
  const response = await api.request('/v1/attendance');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(api.calls.length, 1);
});

test('limits simultaneous queries and recovers after completion', async (t) => {
  let release;
  let ready;
  let started = 0;
  const barrier = new Promise((resolve) => { release = resolve; });
  const fiveStarted = new Promise((resolve) => { ready = resolve; });
  const api = await service(t, { execute: async () => { if (++started === 5) ready(); await barrier; return []; } });
  const pending = Array.from({ length: 5 }, () => api.request('/v1/attendance'));
  await fiveStarted;
  try { assert.equal((await api.request('/v1/attendance')).status, 503); }
  finally { release(); await Promise.all(pending); }
  assert.equal((await api.request('/v1/attendance')).status, 200);
});

test('rejects unbounded and duplicate local report definitions', () => {
  assert.throws(() => normalizeReports([{ id: 'x', name: 'x', query: 'SELECT * FROM Attendance' }]));
  assert.throws(() => normalizeReports([reports[0], reports[0]]));
});

test('oversized reports produce a controlled error below the Vercel response limit', async (t) => {
  const api = await service(t, { execute: async () => [{ data: 'x'.repeat(4 * 1024 * 1024) }] });
  const response = await api.request('/v1/attendance');
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'Report too large; narrow the date range or limit' });
});
