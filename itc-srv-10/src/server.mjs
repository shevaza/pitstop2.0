import { createServer } from 'node:http';
import sql from 'mssql';
import { loadConfig } from './config.mjs';
import { createHandler } from './app.mjs';
import { createScraper, scraperConfig } from './scraper.mjs';
import { createScraperJobs } from './scraper-jobs.mjs';

const config = await loadConfig();
const scraperJobs = createScraperJobs(createScraper(scraperConfig()));
let poolPromise;
async function getPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(config.sql);
    pool.on('error', () => console.error('SQL connection pool error'));
    poolPromise = pool.connect().catch(async (error) => {
      poolPromise = undefined;
      await pool.close().catch(() => {});
      throw error;
    });
  }
  return poolPromise;
}

const handler = createHandler({
  ...config,
  scraperJobs,
  health: async () => { await (await getPool()).request().query('SELECT 1 AS ok'); },
  execute: async (report, filters) => {
    const request = (await getPool()).request();
    request.input('limit', sql.Int, filters.limit);
    request.input('fromDate', sql.Date, filters.fromDate ? new Date(`${filters.fromDate}T00:00:00Z`) : null);
    request.input('toDate', sql.Date, filters.toDate ? new Date(`${filters.toDate}T00:00:00Z`) : null);
    const result = await request.query(report.query);
    return result.recordset ?? [];
  },
});
const server = createServer({ requestTimeout: 25000, headersTimeout: 10000, maxHeaderSize: 8192 }, handler);
server.timeout = 30000;
server.listen(config.port, config.host, () => console.info(`Attendance API listening on ${config.host}:${config.port}`));

async function shutdown() {
  const deadline = setTimeout(() => process.exit(1), 25000);
  deadline.unref();
  await scraperJobs.close();
  server.close(async () => {
    try { await (await poolPromise)?.close(); } finally { process.exit(0); }
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
