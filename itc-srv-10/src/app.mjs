import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { diagnoseSqlError } from './diagnostics.mjs';

export class InputError extends Error {}

export function parseFilters(params) {
  const allowed = new Set(['limit', 'fromDate', 'toDate', 'reportId']);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new InputError('Unsupported or repeated parameter');
  }
  const rawLimit = params.get('limit') ?? '200';
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 2000) {
    throw new InputError('Limit must be an integer between 1 and 2000');
  }
  const date = (name) => {
    const value = params.get(name);
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value || value < '1753-01-01' || value > '9999-12-30') {
      throw new InputError(`${name} must be a valid YYYY-MM-DD date`);
    }
    return value;
  };
  const fromDate = date('fromDate');
  const toDate = date('toDate');
  if (fromDate && toDate && fromDate > toDate) throw new InputError('From date must not be after to date');
  return { limit: Number(rawLimit), fromDate, toDate, reportId: params.get('reportId') || null };
}

const digest = (value) => createHash('sha256').update(value).digest();

export function createHandler({ token, reports, rateLimit = 120, execute, health, log = console.info }) {
  const expected = digest(`Bearer ${token}`);
  const summaries = reports.map(({ id, name }) => ({ id, name }));
  let windowStart = Date.now();
  let requests = 0;
  let active = 0;
  return async (req, res) => {
    const started = Date.now();
    const requestId = randomUUID();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => log(JSON.stringify({ requestId, status: res.statusCode, durationMs: Date.now() - started })));
    const send = (status, data) => {
      let body = JSON.stringify(data);
      if (Buffer.byteLength(body) > 4 * 1024 * 1024) {
        status = 413;
        body = JSON.stringify({ error: 'Report too large; narrow the date range or limit' });
      }
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
    };
    if (!timingSafeEqual(expected, digest(req.headers.authorization || ''))) {
      send(401, { error: 'Unauthorized' });
      return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      send(405, { error: 'Method not allowed' });
      return;
    }
    if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0; }
    if (++requests > rateLimit) {
      res.setHeader('Retry-After', '60');
      send(429, { error: 'Too many requests' });
      return;
    }
    if (active >= 5) {
      res.setHeader('Retry-After', '2');
      send(503, { error: 'Attendance service is busy' });
      return;
    }
    active++;
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/v1/health') {
        await health();
        send(200, { ok: true });
      } else if (url.pathname === '/v1/reports') {
        await health();
        send(200, { connected: true, reports: summaries });
      } else if (url.pathname === '/v1/attendance') {
        const filters = parseFilters(url.searchParams);
        const report = filters.reportId ? reports.find((entry) => entry.id === filters.reportId) : reports[0];
        if (!report) throw new InputError('Unknown report');
        const result = await execute(report, filters);
        const rows = result.slice(0, filters.limit);
        send(200, {
          rows, columns: rows.length ? Object.keys(rows[0]) : [], limit: filters.limit,
          fetchedAt: new Date().toISOString(), report: { id: report.id, name: report.name },
          availableReports: summaries, source: 'ITC Attendance API',
        });
      } else {
        send(404, { error: 'Not found' });
      }
    } catch (error) {
      if (!(error instanceof InputError)) log(JSON.stringify({ requestId, ...diagnoseSqlError(error) }));
      // Never return SQL errors, queries, connection details or records to the caller/logs.
      send(error instanceof InputError ? 400 : 503, {
        error: error instanceof InputError ? error.message : 'Attendance database is unavailable',
      });
    } finally { active--; }
  };
}
