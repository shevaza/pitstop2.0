import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

function load(file, imports) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  runInNewContext(outputText, { exports, Response, Error, SyntaxError, console, Map, require: (name) => {
    if (name === 'zod') return { z };
    if (name in imports) return imports[name];
    throw new Error(`Unexpected import ${name}`);
  } });
  return exports;
}
const id = 'bf8ce0b5-1299-43b7-96e8-60cd825c1548';
const request = (body) => new Request('https://example.com/api/policies', { method: 'POST', body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id }) };
function route(file, authorize, policies = {}) {
  return load(file, {
    '@/lib/module-auth': { assertModuleAccess: authorize },
    '@/lib/module-access': { getModuleAccessLevelMap: async () => ({ policies: 'read' }) },
    '@/lib/policies': { policyError: (e) => e instanceof Response ? e : new Response('Error', { status: 500 }), ...policies },
  });
}

test('policy publishing requires modify permission before accessing storage', async () => {
  let called = false;
  const api = route('app/api/policies/route.ts', async (key, level) => {
    assert.equal(key, 'policies'); assert.equal(level, 'modify'); throw new Response('Forbidden', { status: 403 });
  }, { publishPolicy: () => { called = true; } });
  assert.equal((await api.POST(request({ title: 'Title', body: 'Text' }))).status, 403);
  assert.equal(called, false);
});

test('read permission can acknowledge, and the actor comes from the verified identity', async () => {
  let args;
  const api = route('app/api/policies/[id]/acknowledge/route.ts', async (key, level) => {
    assert.equal(key, 'policies'); assert.equal(level, undefined); return 'employee@example.com';
  }, { acknowledgePolicy: async (...values) => { args = values; } });
  assert.equal((await api.POST(request({ version: 2, user_upn: 'someone-else@example.com' }), context)).status, 200);
  assert.deepEqual(args, [id, 2, 'employee@example.com']);
});

test('missing permission blocks acknowledgement history', async () => {
  const api = route('app/api/policies/[id]/acknowledgements/route.ts', async (_key, level) => {
    assert.equal(level, 'modify'); throw new Response('Forbidden', { status: 403 });
  });
  assert.equal((await api.GET(request({}), context)).status, 403);
});

test('invalid publication and acknowledgement payloads do not reach storage', async () => {
  const api = route('app/api/policies/route.ts', async () => 'hr@example.com');
  for (const body of [{ title: ' ', body: 'text' }, { title: 'title', body: '' }, { id, title: 'title', body: 'text' }, { title: 'x'.repeat(201), body: 'text' }]) {
    assert.equal((await api.POST(request(body))).status, 400);
  }
  const ack = route('app/api/policies/[id]/acknowledge/route.ts', async () => 'employee@example.com');
  for (const version of [undefined, 0, -1, '1', 1.5]) {
    assert.equal((await ack.POST(request({ version }), context)).status, 400);
  }
});

test('published content is trimmed and publisher identity cannot be spoofed', async () => {
  let actor;
  const api = route('app/api/policies/route.ts', async () => 'hr@example.com', { publishPolicy: async (input, upn) => {
    assert.equal(input.title, 'Title'); assert.equal(input.body, 'Policy text');
    assert.equal(input.updated_by_upn, undefined); actor = upn;
    return { id, version: 1 };
  } });
  const response = await api.POST(request({ title: ' Title ', body: ' Policy text ', updated_by_upn: 'other@example.com' }));
  assert.equal(response.status, 201); assert.equal(actor, 'hr@example.com');
});

test('old acknowledgements leave updated policies pending, including across paginated results', async () => {
  const policies = Array.from({ length: 501 }, (_, index) => ({ id: String(index), version: index === 0 ? 2 : 1 }));
  const service = load('lib/policies.ts', { '@/lib/supabase-admin': { supabaseRequest: async (table, { query }) => {
    if (table === 'policies') return policies.slice(query.offset, query.offset + query.limit);
    assert.equal(query.user_upn, 'eq.employee@example.com');
    return [{ policy_id: '0', version: 1, acknowledged_at: 'old' }, { policy_id: '500', version: 1, acknowledged_at: 'current' }];
  } } });
  const rows = await service.listPolicies(' Employee@Example.com ');
  assert.equal(rows.length, 501); assert.equal(rows[0].acknowledged_at, null); assert.equal(rows[500].acknowledged_at, 'current');
});

test('version conflicts are returned as 409 without exposing database details', async () => {
  const service = load('lib/policies.ts', { '@/lib/supabase-admin': {} });
  const response = service.policyError(new Error('Supabase POST rpc/acknowledge_policy failed (409): private SQL details'));
  assert.equal(response.status, 409); assert.doesNotMatch(await response.text(), /private SQL/);
});
