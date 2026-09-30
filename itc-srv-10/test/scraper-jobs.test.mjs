import test from 'node:test';
import assert from 'node:assert/strict';
import { createScraperJobs } from '../src/scraper-jobs.mjs';
import { createScraper } from '../src/scraper.mjs';

const owner = 'a'.repeat(64);
const params = (extra = {}) => new URLSearchParams({ owner, ...extra });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('jobs deduplicate pending requests and enforce owner, operation and filters', async (t) => {
  let finish;
  let calls = 0;
  const jobs = createScraperJobs({ configured: true, close: async () => {}, execute: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  t.after(() => jobs.close());
  const first = jobs.request('leave-users', params());
  assert.equal(jobs.request('leave-users', params()).jobId, first.jobId);
  await tick();
  assert.equal(calls, 1);
  assert.throws(() => jobs.request('leave-users', params({ owner: 'b'.repeat(64), jobId: first.jobId })), { status: 404 });
  assert.throws(() => jobs.request('pitstop-data', params({ jobId: first.jobId })), { status: 404 });
  finish({ success: true, users: [{ value: '1', text: 'Test' }] });
  await tick();
  assert.deepEqual(jobs.request('leave-users', params({ jobId: first.jobId })), { state: 'done', data: { success: true, users: [{ value: '1', text: 'Test' }] } });
});

test('validates filters before launching browsers and caps concurrency', async (t) => {
  const jobs = createScraperJobs({ configured: true, close: async () => {}, execute: (_kind, _params, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) }, { concurrency: 1 });
  t.after(() => jobs.close());
  assert.throws(() => jobs.request('employee-leaves', params({ year: 'bad', employeeId: '1' })), { status: 400 });
  assert.throws(() => jobs.request('leave-users', params({ url: 'http://evil' })), { status: 400 });
  jobs.request('leave-users', params());
  await tick();
  assert.throws(() => jobs.request('pitstop-data', params()), { status: 503 });
});

test('deadline aborts work and sanitizes errors; results expire', async (t) => {
  let aborted = false;
  const jobs = createScraperJobs({ configured: true, close: async () => {}, execute: (_kind, _params, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('secret')); })) }, { timeoutMs: 10, ttlMs: 100 });
  t.after(() => jobs.close());
  const { jobId } = jobs.request('leave-users', params());
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(aborted, true);
  assert.equal(jobs.request('leave-users', params({ jobId })).state, 'failed');
  assert.ok(!JSON.stringify(jobs.request('leave-users', params({ jobId }))).includes('secret'));
  await new Promise(resolve => setTimeout(resolve, 110));
  assert.throws(() => jobs.request('leave-users', params({ jobId })), { status: 404 });
});

test('browser closes if page creation fails, including aborted launch', async () => {
  let closes = 0;
  const browser = { close: async () => { closes++; }, newPage: async () => { throw new Error('page failed'); } };
  const scraper = createScraper({ url: 'http://fixture', user: 'test', password: 'test' }, async () => browser);
  await assert.rejects(scraper.execute('leave-users', {}, new AbortController().signal), /page failed/);
  assert.equal(closes, 1);
  const controller = new AbortController();
  const delayed = createScraper({}, async () => { controller.abort(); return browser; });
  await assert.rejects(delayed.execute('leave-users', {}, controller.signal));
  assert.equal(closes, 2);
});
