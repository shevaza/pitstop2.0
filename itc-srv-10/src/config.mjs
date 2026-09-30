import { readFile } from 'node:fs/promises';

export function integer(value, fallback, min, max, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${name}`);
  return number;
}

function flag(value, fallback, name) {
  if (value === undefined) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`Invalid ${name}; use true or false`);
}

export function normalizeReports(reports) {
  if (!Array.isArray(reports) || !reports.length) throw new Error('Configure at least one report');
  const ids = new Set();
  return reports.map((report) => {
    if (!report || typeof report.id !== 'string' || !/^[\w-]{1,100}$/.test(report.id) || ids.has(report.id)) {
      throw new Error('Report IDs must be unique letters, numbers, underscores or hyphens');
    }
    if (typeof report.name !== 'string' || !report.name.trim() || typeof report.query !== 'string' || !report.query.trim()) {
      throw new Error('Each report needs a name and query');
    }
    ids.add(report.id);
    // Legacy templates become bound parameters, never interpolated user input.
    const query = report.query
      .replace(/{{\s*limit\s*}}/gi, '@limit')
      .replace(/{{\s*fromdate\s*}}/gi, '@fromDate')
      .replace(/{{\s*todate\s*}}/gi, '@toDate');
    if (/{{|}}/.test(query) || !/\bTOP\s*\(\s*@limit\s*\)/i.test(query)) {
      throw new Error(`Report ${report.id} must use TOP (@limit) and supported parameters`);
    }
    return { id: report.id, name: report.name.trim(), query };
  });
}

export async function loadConfig(env = process.env) {
  const saved = env.MSSQL_SETTINGS_FILE ? JSON.parse(await readFile(env.MSSQL_SETTINGS_FILE, 'utf8')) : {};
  const required = (name, fallback) => {
    const value = env[name] ?? fallback;
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}`);
    return value;
  };
  const token = required('ATTENDANCE_API_TOKEN');
  if (token.length < 32 || /\s/.test(token)) throw new Error('ATTENDANCE_API_TOKEN must have at least 32 characters and no whitespace');
  const serverValue = required('MSSQL_SERVER', saved.server);
  const [server, namedInstance, extra] = serverValue.split('\\');
  if (extra !== undefined) throw new Error('Invalid MSSQL_SERVER');
  const instanceName = env.MSSQL_INSTANCE || namedInstance;
  if (env.MSSQL_PORT && instanceName) throw new Error('Use MSSQL_PORT or MSSQL_INSTANCE, not both');
  const reports = normalizeReports(JSON.parse(await readFile(env.REPORTS_FILE || './config/reports.json', 'utf8')));
  return {
    host: env.HOST || '127.0.0.1',
    port: integer(env.PORT, 4010, 1, 65535, 'PORT'),
    token,
    rateLimit: integer(env.RATE_LIMIT_PER_MINUTE, 120, 1, 10000, 'RATE_LIMIT_PER_MINUTE'),
    reports,
    sql: {
      server,
      ...(env.MSSQL_PORT ? { port: integer(env.MSSQL_PORT, 1433, 1, 65535, 'MSSQL_PORT') } : {}),
      database: required('MSSQL_DATABASE', saved.database),
      user: required('MSSQL_USER', saved.user),
      password: required('MSSQL_PASSWORD', saved.password),
      connectionTimeout: 5000,
      requestTimeout: 15000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      options: {
        ...(instanceName ? { instanceName } : {}),
        encrypt: flag(env.MSSQL_ENCRYPT, true, 'MSSQL_ENCRYPT'),
        trustServerCertificate: flag(env.MSSQL_TRUST_SERVER_CERT, false, 'MSSQL_TRUST_SERVER_CERT'),
        useUTC: true,
      },
    },
  };
}
