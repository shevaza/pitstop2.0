import { createScraper, scraperConfig } from '../src/scraper.mjs';

const scraper = createScraper(scraperConfig());
try {
  if (!scraper.configured) throw new Error('Missing configuration');
  const result = await scraper.execute('leave-users', {}, AbortSignal.timeout(180000));
  console.info(`Scraper login and employee-list extraction succeeded (${result.users.length} options).`);
} catch {
  console.error('Scraper check failed. Verify PITSTOP_URL/PITSTOP_USER/PITSTOP_PASS, install Chromium under the service account, and check legacy site availability/layout.');
  process.exitCode = 1;
} finally { await scraper.close(); }
