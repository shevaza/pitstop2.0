import sql from 'mssql';
import { loadConfig } from '../src/config.mjs';
import { diagnoseSqlError } from '../src/diagnostics.mjs';

let pool;
try {
  const config = await loadConfig();
  pool = new sql.ConnectionPool(config.sql);
  pool.on('error', (error) => console.error(JSON.stringify(diagnoseSqlError(error))));
  await pool.connect();
  await pool.request().query('SELECT 1 AS ok');
  console.info('SQL connection and SELECT 1 succeeded.');
} catch (error) {
  console.error(JSON.stringify(diagnoseSqlError(error)));
  process.exitCode = 1;
} finally {
  await pool?.close().catch(() => {});
}
