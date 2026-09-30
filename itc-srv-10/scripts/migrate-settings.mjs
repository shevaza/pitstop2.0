import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { migrateReports } from '../src/migration.mjs';

// Run inside itc-srv-10. Never prints secrets or modifies the original settings.
const source = process.argv[2] || '../.data/mssql-settings.json';
const saved = JSON.parse(await readFile(source, 'utf8'));
const reports = migrateReports(saved.reports?.length ? saved.reports : [
  { id: 'attendance-default', name: 'Attendance', query: saved.attendanceQuery },
]);
await mkdir('./config', { recursive: true });
await writeFile('./config/reports.json', JSON.stringify(reports, null, 2), { flag: 'wx', mode: 0o600 });
await writeFile('./config/mssql-settings.json', JSON.stringify({
  server: saved.server, database: saved.database, user: saved.user, password: saved.password,
}, null, 2), { flag: 'wx', mode: 0o600 });
console.info('Created local config files. Restrict their Windows ACLs to the service account.');
console.info('Set MSSQL_SETTINGS_FILE=./config/mssql-settings.json and omit MSSQL connection values from .env.');
console.info('Review migrated queries: legacy date semantics are preserved. The example report uses an inclusive end date.');
