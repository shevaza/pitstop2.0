import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadSync(graphFetch, supabaseRequest) {
  const source = readFileSync(new URL('../lib/users-cache.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(outputText, {
    exports, URL,
    require: (name) => {
      if (name === '@/lib/graph') return { graphFetch };
      if (name === '@/lib/supabase-admin') return { supabaseRequest };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports.syncUsersFromAzureToSupabase;
}

test('sync updates a renamed Azure user in place and inserts new users', async () => {
  const azureId = '6b88f097-1eb7-4a36-8ff9-5ee491da204c';
  const records = [{ id: 'existing-row', azure_user_id: azureId, user_principal_name: 'old@example.com' }];
  const calls = [];
  const sync = loadSync(async () => ({ value: [
    { id: azureId, userPrincipalName: 'new@example.com', displayName: 'Renamed User' },
    { id: 'another-azure-id', userPrincipalName: 'another@example.com' },
  ] }), async (table, options) => {
    assert.equal(table, 'users');
    calls.push(options);
    if (options.method !== 'POST') return null;
    assert.match(options.headers.Prefer, /resolution=merge-duplicates/);
    for (const row of options.body) {
      const existing = records.find((record) => record[options.query.on_conflict] === row[options.query.on_conflict]);
      if (existing) Object.assign(existing, row);
      else {
        assert.ok(!records.some((record) => record.azure_user_id === row.azure_user_id), 'duplicate Azure ID');
        records.push({ id: 'new-row', ...row });
      }
    }
    return null;
  });
  const result = await sync();
  assert.equal(records.length, 2);
  assert.equal(records[0].id, 'existing-row');
  assert.equal(records[0].user_principal_name, 'new@example.com');
  assert.equal(result.upserted, 2);
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('sync does not delete cached users when an upsert fails', async () => {
  let deleted = false;
  const sync = loadSync(async () => ({ value: [{ id: 'azure-id', userPrincipalName: 'user@example.com' }] }), async (_, options) => {
    if (options.method === 'DELETE') deleted = true;
    if (options.method === 'POST') throw new Error('write failed');
  });
  await assert.rejects(sync(), /write failed/);
  assert.equal(deleted, false);
});
