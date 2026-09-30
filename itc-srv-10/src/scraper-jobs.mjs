import { randomUUID } from 'node:crypto';

export class ScraperError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function parseScraperRequest(kind, params) {
  if (!['pitstop-data', 'leave-users', 'employee-leaves'].includes(kind)) throw new ScraperError('Unknown scraper operation');
  const allowed = new Set(['owner', 'jobId', ...(kind === 'employee-leaves' ? ['year', 'employeeId'] : [])]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new ScraperError('Invalid scraper parameters');
  }
  const owner = params.get('owner') || '';
  if (!/^[a-f0-9]{64}$/.test(owner)) throw new ScraperError('Invalid scraper owner');
  const jobId = params.get('jobId');
  if (jobId && !/^[a-f0-9-]{36}$/.test(jobId)) throw new ScraperError('Invalid job ID');
  const year = params.get('year') || '';
  const employeeId = params.get('employeeId') || '';
  if (kind === 'employee-leaves' && (!/^(19|20)\d{2}$/.test(year) || !/^[\w.-]{1,100}$/.test(employeeId))) {
    throw new ScraperError('Provide a valid year and employee ID');
  }
  return { owner, jobId, params: kind === 'employee-leaves' ? { year, employeeId } : {} };
}

export function createScraperJobs(scraper, { timeoutMs = 180000, ttlMs = 300000, maxJobs = 20, concurrency = 2 } = {}) {
  const jobs = new Map();
  let active = 0;
  let closed = false;
  const prune = () => {
    for (const [id, job] of jobs) if (job.completedAt && Date.now() - job.completedAt >= ttlMs) jobs.delete(id);
  };
  const cleanup = setInterval(prune, Math.min(ttlMs, 60000));
  cleanup.unref();
  const view = (job) => job.state === 'done' ? { state: 'done', data: job.data }
    : job.state === 'failed' ? { state: 'failed', error: job.error }
    : { state: 'pending', jobId: job.id };
  return {
    request(kind, searchParams) {
      const { owner, jobId, params } = parseScraperRequest(kind, searchParams);
      prune();
      const key = JSON.stringify([owner, kind, params]);
      if (jobId) {
        const job = jobs.get(jobId);
        if (!job || job.key !== key) throw new ScraperError('Scrape expired or unavailable. Run the request again.', 404);
        return view(job);
      }
      if (closed || !scraper.configured) throw new ScraperError('Scraper is not configured on the internal server.', 503);
      for (const job of jobs.values()) if (job.key === key && job.state === 'pending') return view(job);
      if (active >= concurrency || jobs.size >= maxJobs) throw new ScraperError('Scraper is busy. Try again shortly.', 503);
      const controller = new AbortController();
      const job = { id: randomUUID(), key, state: 'pending', controller };
      jobs.set(job.id, job);
      active++;
      const timer = setTimeout(() => {
        job.state = 'failed';
        job.error = 'Scraping timed out. Try again or contact IT.';
        job.completedAt = Date.now();
        controller.abort();
      }, timeoutMs);
      void Promise.resolve().then(() => scraper.execute(kind, params, controller.signal)).then(data => {
        if (controller.signal.aborted) return;
        if (Buffer.byteLength(JSON.stringify(data)) > 3 * 1024 * 1024) throw new Error('Result too large');
        job.data = data;
        job.state = 'done';
      }).catch(() => {
        if (!controller.signal.aborted) {
          job.state = 'failed';
          job.error = 'Could not collect data from the legacy PitStop site. Check its availability, credentials, and page layout.';
        }
      }).finally(() => { clearTimeout(timer); job.completedAt = Date.now(); active--; });
      return view(job);
    },
    async close() {
      closed = true;
      clearInterval(cleanup);
      for (const job of jobs.values()) job.controller.abort();
      await scraper.close();
      jobs.clear();
    },
  };
}
