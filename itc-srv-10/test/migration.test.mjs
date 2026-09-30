import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateReports } from '../src/migration.mjs';

const migrate = (query) => migrateReports([{ id: 'report', name: 'Report', query }])[0].query;

test('adds a bound outer limit without changing a NOT EXISTS report', () => {
  const query = 'SELECT e.BadgeNumber, e.NAME FROM Employee e WHERE NOT EXISTS (SELECT 1 FROM Attendance a WHERE a.BadgeNumber = e.BadgeNumber AND a.VerifyTime > {{FromDate}}) ORDER BY e.NAME';
  assert.equal(migrate(query), query.replace('SELECT ', 'SELECT TOP (@limit) ').replace('{{FromDate}}', '@fromDate'));
});

test('preserves grouping and ordering in aggregate reports', () => {
  const query = 'SELECT\n E.Id, MIN(A.VerifyTime) AS FirstCheckIn FROM Employee E JOIN Attendance A ON E.BadgeNumber = A.BadgeNumber GROUP BY E.Id ORDER BY E.Id;';
  assert.equal(migrate(query), query.replace('SELECT', 'SELECT TOP (@limit)'));
});

test('inserts TOP after DISTINCT or ALL', () => {
  assert.equal(migrate('SELECT DISTINCT BadgeNumber FROM Attendance'), 'SELECT DISTINCT TOP (@limit) BadgeNumber FROM Attendance');
  assert.equal(migrate('select all BadgeNumber FROM Attendance'), 'select all TOP (@limit) BadgeNumber FROM Attendance');
});

test('preserves already bounded queries and CTE reports', () => {
  const query = 'WITH latest AS (SELECT * FROM Attendance) SELECT TOP ({{limit}}) * FROM latest';
  assert.equal(migrate(query), query.replace('{{limit}}', '@limit'));
  assert.equal(migrate('SELECT TOP (@limit) * FROM Attendance'), 'SELECT TOP (@limit) * FROM Attendance');
});

test('does not guess how to rewrite an unbounded CTE or fixed TOP expression', () => {
  assert.throws(() => migrate('WITH latest AS (SELECT * FROM Attendance) SELECT * FROM latest'), /TOP/);
  assert.throws(() => migrate('SELECT TOP 100 * FROM Attendance'), /TOP/);
});
