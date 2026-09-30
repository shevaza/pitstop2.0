import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { getAttendanceApiConfig, fetchAttendance, fetchAttendanceSettings, attendanceErrorResponse } from '../lib/attendance-api.ts';
import { createHandler } from '../itc-srv-10/src/app.mjs';

const token = 'b'.repeat(64);
test('private certificate transport verifies trust/IP and rejects redirects', async (t) => {
  const originalEnv = { ...process.env };
  const ca = readFileSync(new URL('./fixtures/attendance-tls/certificate.txt', import.meta.url), 'utf8');
  const key = readFileSync(new URL('./fixtures/attendance-tls/test-only-key.txt', import.meta.url), 'utf8');
  let redirect = false;
  let calls = 0;
  const server = createHttpsServer({ cert: ca, key }, (req, res) => {
    calls++;
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    if (redirect) { res.writeHead(302, { Location: 'https://example.com' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ connected: true, reports: [] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { process.env = originalEnv; await new Promise(resolve => server.close(resolve)); });
  process.env.NODE_ENV = 'production';
  process.env.ATTENDANCE_API_AUTH_MODE = 'bearer';
  process.env.ATTENDANCE_API_TOKEN = token;
  process.env.ATTENDANCE_API_URL = `https://127.0.0.1:${server.address().port}`;
  process.env.ATTENDANCE_API_CA_PEM = ca;
  assert.equal((await fetchAttendanceSettings()).connected, true);
  redirect = true;
  await assert.rejects(fetchAttendanceSettings(), /redirects/);
  assert.equal(calls, 2);
  process.env.ATTENDANCE_API_URL = `https://localhost:${server.address().port}`;
  await assert.rejects(fetchAttendanceSettings(), { status: 502 });
  assert.equal(calls, 2, 'hostname mismatch must fail before token is sent');
  process.env.ATTENDANCE_API_URL = `https://127.0.0.1:${server.address().port}`;
  delete process.env.ATTENDANCE_API_CA_PEM;
  await assert.rejects(fetchAttendanceSettings(), { status: 502 });
  assert.equal(calls, 2, 'untrusted certificate must fail before token is sent');
});
test('explicit bearer mode supports the MikroTik HTTPS origin without Cloudflare secrets', () => {
  const env = { NODE_ENV: 'production', ATTENDANCE_API_TOKEN: token, ATTENDANCE_API_AUTH_MODE: 'bearer', ATTENDANCE_API_URL: 'https://85.112.75.82:4010' };
  assert.equal(getAttendanceApiConfig(env).headers.Authorization, `Bearer ${token}`);
  assert.equal(getAttendanceApiConfig({ ...env, ATTENDANCE_CF_ACCESS_CLIENT_ID: 'unused', ATTENDANCE_CF_ACCESS_CLIENT_SECRET: 'unused' }).headers['CF-Access-Client-Secret'], undefined);
  assert.throws(() => getAttendanceApiConfig({ ...env, ATTENDANCE_API_URL: 'http://85.112.75.82:4010' }));
  assert.throws(() => getAttendanceApiConfig({ ...env, ATTENDANCE_API_AUTH_MODE: 'typo' }));
  assert.throws(() => getAttendanceApiConfig({ ...env, ATTENDANCE_API_CA_PEM: 'PRIVATE KEY' }));
});
test('production config requires HTTPS, origin-only URL and Cloudflare credentials', () => {
  const env = { NODE_ENV: 'production', ATTENDANCE_API_TOKEN: token, ATTENDANCE_API_URL: 'https://attendance.example.com' };
  assert.throws(() => getAttendanceApiConfig(env), /Cloudflare/);
  const full = { ...env, ATTENDANCE_CF_ACCESS_CLIENT_ID: 'client', ATTENDANCE_CF_ACCESS_CLIENT_SECRET: 'secret' };
  assert.equal(getAttendanceApiConfig(full).headers['CF-Access-Client-Id'], 'client');
  for (const url of ['http://attendance.example.com', 'http://localhost:4010', 'https://user:password@attendance.example.com', 'https://attendance.example.com/path', 'https://attendance.example.com?x=y']) {
    assert.throws(() => getAttendanceApiConfig({ ...full, ATTENDANCE_API_URL: url }));
  }
});

test('web/mobile proxy contract works against the internal HTTP service', async (t) => {
  const originalEnv = { ...process.env };
  const server = createServer(createHandler({
    token, rateLimit: 100, reports: [{ id: 'default', name: 'Attendance', query: 'local-only SQL' }],
    health: async () => {}, execute: async () => [{ BadgeNumber: '123', VerifyTime: '2026-09-29T08:00:00Z' }], log: () => {},
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    process.env = originalEnv;
    await new Promise((resolve) => server.close(resolve));
  });
  process.env.NODE_ENV = 'development';
  process.env.ATTENDANCE_API_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ATTENDANCE_API_TOKEN = token;
  const data = await fetchAttendance(new URLSearchParams('fromDate=2026-09-29&toDate=2026-09-29'));
  assert.equal(data.rows[0].BadgeNumber, '123');
  assert.equal(data.queryUsed, undefined);
  assert.equal((await fetchAttendanceSettings()).managedBy, 'internal-api');
  await assert.rejects(fetchAttendance(new URLSearchParams('query=SELECT+1')), { status: 400 });
  await assert.rejects(fetchAttendance(new URLSearchParams('limit=2001')), { status: 400 });
  process.env.ATTENDANCE_API_TOKEN = 'c'.repeat(64);
  await assert.rejects(fetchAttendance(new URLSearchParams()), { status: 503 });
});

test('proxy sanitizes failures and refuses redirects without forwarding credentials', async (t) => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  t.after(() => { process.env = originalEnv; globalThis.fetch = originalFetch; });
  process.env.NODE_ENV = 'development';
  process.env.ATTENDANCE_API_URL = 'http://127.0.0.1:4010';
  process.env.ATTENDANCE_API_TOKEN = token;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return new Response('password=secret', { status: 500 });
  };
  await assert.rejects(fetchAttendance(new URLSearchParams()), (error) => error.status === 503 && !error.message.includes('secret'));
  globalThis.fetch = async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(fetchAttendance(new URLSearchParams()), { status: 502 });
  globalThis.fetch = async () => { throw new DOMException('timed out', 'TimeoutError'); };
  await assert.rejects(fetchAttendance(new URLSearchParams()), { status: 504 });
  assert.equal(await attendanceErrorResponse(new Error('secret')).text(), 'Attendance service is unavailable.');
});
