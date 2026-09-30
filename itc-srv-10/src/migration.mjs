import { normalizeReports } from './config.mjs';

export function migrateReports(reports) {
  return normalizeReports(reports.map((report) => {
    if (typeof report.query !== 'string') return report;
    // Rewrite only a leading SELECT, never a nested SELECT or CTE body.
    const head = report.query.match(/^\s*SELECT\b(?:\s+(?:DISTINCT|ALL)\b)?/i);
    if (!head) return report;
    const rest = report.query.slice(head[0].length);
    if (/^\s*TOP\b/i.test(rest)) return report;
    return { ...report, query: `${head[0]} TOP (@limit)${rest}` };
  }));
}
