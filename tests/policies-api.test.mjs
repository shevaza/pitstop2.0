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
  runInNewContext(outputText, { exports, Response, Error, SyntaxError, console, Map, Buffer, require: (name) => {
    if (name === '@/lib/policy-audience' && !(name in imports)) return { getPolicyAudience: async () => ({ departments: [], users: [] }) };
    if (name === '@/lib/employee-types') return { EMPLOYEE_TYPES: ['Employee', 'Project Based', 'Intern'], isEmployeeType: (value) => ['Employee', 'Project Based', 'Intern'].includes(value) };
    if (name === '@/lib/user-roles' && !(name in imports)) return { listUserRoles: async () => new Map(), getUserRole: async () => '', setUserRole: async () => {} };
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


test('targeted policies are only visible to recipients, while managers can see all without pending obligations', async () => {
  const policies = [
    { id: 'all', version: 1, recipient_upns: null },
    { id: 'mine', version: 1, recipient_upns: ['employee@example.com'] },
    { id: 'other', version: 1, recipient_upns: ['other@example.com'] },
  ];
  const service = load('lib/policies.ts', { '@/lib/supabase-admin': { supabaseRequest: async (table) => table === 'policies' ? policies : [] } });
  assert.deepEqual(Array.from(await service.listPolicies(' Employee@Example.com '), (p) => p.id), ['all', 'mine']);
  const admin = await service.listPolicies('employee@example.com', true);
  assert.equal(admin.length, 3);
  assert.equal(admin[2].requires_acknowledgement, false);
});

test('publication resolves departments and selected users into a union and preserves manual and expected versions', async () => {
  let saved;
  const service = load('lib/policies.ts', {
    '@/lib/policy-audience': { getPolicyAudience: async () => ({ departments: ['IT', 'HR'], users: [
      { upn: 'it@example.com', department: 'IT' }, { upn: 'hr@example.com', department: 'HR' }, { upn: 'other@example.com', department: '' },
    ] }) },
    '@/lib/supabase-admin': { supabaseRequest: async (_table, { body }) => { saved = body; return { id, attachment: body.p_attachment }; } },
  });
  await service.publishPolicy({ id, version: 7, expectedVersion: 2, title: 'Title', body: 'Body', target_departments: ['IT'], target_users: ['it@example.com', 'hr@example.com'] }, ' HR@Example.com ');
  assert.deepEqual(Array.from(saved.p_recipients), ['it@example.com', 'hr@example.com']);
  assert.equal(saved.p_new_version, 7); assert.equal(saved.p_version, 2); assert.equal(saved.p_actor, 'hr@example.com');
  await assert.rejects(service.publishPolicy({ title: 'Title', body: 'Body', target_departments: ['Unknown'] }, 'hr@example.com'), (e) => e.status === 400);
  await assert.rejects(service.publishPolicy({ title: 'Title', body: 'Body', target_users: ['unknown@example.com'] }, 'hr@example.com'), (e) => e.status === 400);
});

test('manual version and audience payload validation rejects invalid selections and stale-edit metadata', async () => {
  const api = route('app/api/policies/route.ts', async () => 'hr@example.com');
  for (const body of [
    { version: 0 }, { version: 1.5 }, { version: '2' }, { target_users: ['invalid'] },
    { target_departments: [''] }, { id, version: 4 },
  ]) assert.equal((await api.POST(request({ title: 'Title', body: 'Body', ...body }))).status, 400);
});

test('directory lookup follows Microsoft Graph pagination and returns department classifications', async () => {
  const paths = [];
  const directory = load('lib/policy-audience.ts', { '@/lib/graph': { graphFetch: async (path) => {
    paths.push(path);
    return paths.length === 1 ? { value: [{ userPrincipalName: 'A@Example.com', displayName: 'Alice', department: ' IT ', employeeType: ' Intern ' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=next' } : { value: [{ userPrincipalName: 'b@example.com', department: 'HR' }] };
  } } });
  const audience = await directory.getPolicyAudience();
  assert.equal(paths[1], '/users?$skiptoken=next');
  assert.match(paths[0], /employeeType/);
  assert.deepEqual(Array.from(audience.departments), ['HR', 'IT']);
  assert.equal(audience.users.find((u) => u.name === 'Alice').upn, 'a@example.com');
  assert.equal(audience.users.find((u) => u.name === 'Alice').employeeType, 'Intern');
});


test('attachment publication validates size and content before saving', async () => {
  let saved;
  const api = route('app/api/policies/route.ts', async () => 'hr@example.com', {
    publishPolicy: async (input) => { saved = input; return { id }; },
  });
  const attachment = { name: 'policy.pdf', size: 3, data: 'YWJj' };
  assert.equal((await api.POST(request({ title: 'Title', body: 'Body', attachment }))).status, 201);
  assert.equal(saved.attachment.name, 'policy.pdf');
  for (const invalid of [
    { ...attachment, size: 0 }, { ...attachment, size: 6 * 1024 * 1024 },
    { ...attachment, size: 4 }, { ...attachment, data: '!!!!' },
    { ...attachment, name: '../secret' }, { ...attachment, name: 'bad\r\nname' },
  ]) assert.equal((await api.POST(request({ title: 'Title', body: 'Body', attachment: invalid }))).status, 400);
});

test('attachment downloads enforce policy audience, allow managers, and handle missing files', async () => {
  let policy = { recipient_upns: ['employee@example.com'], attachment: { name: 'policy.pdf', size: 3, data: 'YWJj' } };
  const service = load('lib/policies.ts', { '@/lib/supabase-admin': {
    supabaseRequest: async () => policy ? [policy] : [],
  } });
  assert.equal((await service.downloadPolicyAttachment(id, ' Employee@Example.com ', false)).name, 'policy.pdf');
  await assert.rejects(service.downloadPolicyAttachment(id, 'other@example.com', false), (e) => e.status === 403);
  assert.equal((await service.downloadPolicyAttachment(id, 'manager@example.com', true)).data, 'YWJj');
  policy.attachment = null;
  await assert.rejects(service.downloadPolicyAttachment(id, 'employee@example.com', false), (e) => e.status === 404);
  policy = null;
  await assert.rejects(service.downloadPolicyAttachment(id, 'employee@example.com', false), (e) => e.status === 404);
});

test('download endpoint returns original bytes with safe download headers', async () => {
  const api = route('app/api/policies/[id]/attachment/route.ts', async () => 'employee@example.com', {
    downloadPolicyAttachment: async (_id, upn, canModify) => {
      assert.equal(_id, id); assert.equal(upn, 'employee@example.com'); assert.equal(canModify, false);
      return { name: "Company policy.pdf", size: 3, data: 'YWJj' };
    },
  });
  const response = await api.GET(request({}), context);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'abc');
  assert.match(response.headers.get('Content-Disposition'), /attachment;.*Company%20policy.pdf/);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});


test('publication stores attachment atomically and returns only its name', async () => {
  const attachment = { name: 'policy.pdf', size: 3, data: 'YWJj' };
  const service = load('lib/policies.ts', { '@/lib/supabase-admin': {
    supabaseRequest: async (table, { body }) => {
      assert.equal(table, 'rpc/publish_policy');
      assert.equal(body.p_attachment, attachment);
      return { id, attachment };
    },
  } });
  const result = await service.publishPolicy({ title: 'Title', body: 'Body', attachment }, 'hr@example.com');
  assert.equal(result.attachment_name, 'policy.pdf');
  assert.equal(result.attachment, undefined);
});


test('employee types target matching users and narrow department/user audiences', async () => {
 let saved;
 const service = load('lib/policies.ts', {
  '@/lib/policy-audience': { getPolicyAudience: async () => ({ departments: ['IT', 'HR'], users: [
   { upn: 'employee@example.com', department: 'IT', employeeType: 'Employee' },
   { upn: 'intern@example.com', department: 'IT', employeeType: 'Intern' },
   { upn: 'project@example.com', department: 'HR', employeeType: 'Project Based' },
   { upn: 'legacy@example.com', department: 'HR', employeeType: 'Contractor' },
  ] }) },
  '@/lib/supabase-admin': { supabaseRequest: async (_table, { body }) => { saved = body; return { id }; } },
 });
 const base = { title: 'Title', body: 'Body' };
 await service.publishPolicy({ ...base, target_employee_types: ['Employee', 'Project Based'] }, 'hr@example.com');
 assert.deepEqual(Array.from(saved.p_recipients), ['employee@example.com', 'project@example.com']);
 assert.deepEqual(Array.from(saved.p_employee_types), ['Employee', 'Project Based']);
 await service.publishPolicy({ ...base, target_departments: ['IT'], target_employee_types: ['Intern'] }, 'hr@example.com');
 assert.deepEqual(Array.from(saved.p_recipients), ['intern@example.com']);
 await service.publishPolicy({ ...base, target_users: ['project@example.com'], target_employee_types: ['Project Based'] }, 'hr@example.com');
 assert.deepEqual(Array.from(saved.p_recipients), ['project@example.com']);
 await assert.rejects(service.publishPolicy({ ...base, target_departments: ['HR'], target_employee_types: ['Intern'] }, 'hr@example.com'), (e) => e.status === 400);
 await assert.rejects(service.publishPolicy({ ...base, target_employee_types: ['Contractor'] }, 'hr@example.com'), (e) => e.status === 400);
 await service.publishPolicy(base, 'hr@example.com'); assert.equal(saved.p_recipients, null);
});

test('publication API restricts employee types to the three supported values', async () => {
 const api = route('app/api/policies/route.ts', async () => 'hr@example.com', { publishPolicy: async () => ({ id }) });
 for (const type of ['Employee', 'Project Based', 'Intern']) {
  assert.equal((await api.POST(request({ title: 'Title', body: 'Body', target_employee_types: [type] }))).status, 201);
 }
 for (const types of [['Contractor'], ['employee'], [''], [null], 'Intern']) {
  assert.equal((await api.POST(request({ title: 'Title', body: 'Body', target_employee_types: types }))).status, 400);
 }
});

test('user edits reject unsupported employee types before Microsoft Graph writes', async () => {
 const calls = [];
 const api = load('app/api/users/[id]/route.ts', {
  '@/lib/module-auth': { assertModuleAccess: async () => 'hr@example.com' },
  '@/lib/graph': { graphFetch: async (...args) => { calls.push(args); } },
 });
 for (const value of ['Contractor', 'employee', null, 123]) {
  assert.equal((await api.PATCH(request({ employeeType: value }), context)).status, 400);
 }
 assert.equal(calls.length, 0);
 for (const value of ['Employee', 'Project Based', 'Intern']) {
  assert.equal((await api.PATCH(request({ employeeType: value }), context)).status, 204);
  assert.equal(JSON.parse(calls.at(-1)[1].body).employeeType, value);
 }
 assert.equal((await api.PATCH(request({ employeeType: '', jobTitle: 'Engineer' }), context)).status, 204);
 assert.equal(JSON.parse(calls.at(-1)[1].body).employeeType, undefined);
});


test('roles target their members and intersect employee type and department filters', async () => {
 let saved;
 const service = load('lib/policies.ts', {
  '@/lib/policy-audience': { getPolicyAudience: async () => ({ roles: ['Engineer', 'Manager'], departments: ['IT', 'HR'], users: [
   { upn: 'a@example.com', role: 'Engineer', employeeType: 'Employee', department: 'IT' },
   { upn: 'b@example.com', role: 'Engineer', employeeType: 'Intern', department: 'HR' },
   { upn: 'c@example.com', role: 'Manager', employeeType: 'Employee', department: 'IT' },
  ] }) },
  '@/lib/supabase-admin': { supabaseRequest: async (_path, { body }) => { saved = body; return { id }; } },
 });
 const base = { title: 'Title', body: 'Body', target_roles: ['Engineer'] };
 await service.publishPolicy(base, 'hr@example.com');
 assert.deepEqual(Array.from(saved.p_recipients), ['a@example.com', 'b@example.com']);
 assert.deepEqual(Array.from(saved.p_roles), ['Engineer']);
 await service.publishPolicy({ ...base, target_employee_types: ['Employee'], target_departments: ['IT'] }, 'hr@example.com');
 assert.deepEqual(Array.from(saved.p_recipients), ['a@example.com']);
 await assert.rejects(service.publishPolicy({ ...base, target_users: ['c@example.com'] }, 'hr@example.com'), (e) => e.status === 400);
 await assert.rejects(service.publishPolicy({ ...base, target_roles: ['Missing'] }, 'hr@example.com'), (e) => e.status === 400);
});

test('roles come from saved assignments matched by stable directory IDs', async () => {
 const service = load('lib/policy-audience.ts', {
  '@/lib/user-roles': { listUserRoles: async () => new Map([['azure-id', 'Engineer'], ['deleted-id', 'Obsolete']]) },
  '@/lib/graph': { graphFetch: async () => ({ value: [{ id: 'azure-id', userPrincipalName: 'renamed@example.com' }] }) },
 });
 const directory = await service.getPolicyAudience();
 assert.deepEqual(Array.from(directory.roles), ['Engineer']);
 assert.equal(directory.users[0].role, 'Engineer');
});

test('user role saves use stable IDs, trim values, support clearing, and reject invalid text', async () => {
 const saved = [];
 const graphCalls = [];
 const api = load('app/api/users/[id]/route.ts', {
  '@/lib/module-auth': { assertModuleAccess: async () => 'hr@example.com' },
  '@/lib/user-roles': { setUserRole: async (...args) => saved.push(args) },
  '@/lib/graph': { graphFetch: async (...args) => { graphCalls.push(args); return { id: 'azure-id' }; } },
 });
 for (const invalid of [null, 123, 'x'.repeat(101), 'bad\nrole']) assert.equal((await api.PATCH(request({ role: invalid }), context)).status, 400);
 assert.equal(graphCalls.length, 0);
 assert.equal((await api.PATCH(request({ role: ' Engineer ' }), context)).status, 204);
 assert.deepEqual(saved[0], ['azure-id', 'Engineer']);
 assert.equal((await api.PATCH(request({ role: '' }), context)).status, 204);
 assert.deepEqual(saved[1], ['azure-id', '']);
 assert.equal(graphCalls.some((call) => call[1]?.method === 'PATCH'), false);
});

test('role assignment upserts and deletion never alter the directory cache', async () => {
 const calls = [];
 const roles = load('lib/user-roles.ts', { '@/lib/supabase-admin': { supabaseRequest: async (...args) => { calls.push(args); return []; } } });
 await roles.setUserRole('azure-id', 'Engineer');
 assert.equal(calls[0][0], 'user_policy_roles'); assert.equal(calls[0][1].body.role, 'Engineer');
 assert.equal(calls[0][1].query.on_conflict, 'user_id');
 await roles.setUserRole('azure-id', '');
 assert.equal(calls[1][1].method, 'DELETE'); assert.equal(calls[1][1].query.user_id, 'eq.azure-id');
});


test('mandatory acknowledgement blocks module actions, allows policy reading, and unlocks after completion', async () => {
 let pending = true, checks = 0;
 const api = load('lib/module-auth.ts', {
  '@/lib/request-auth': { getRequestIdentity: async () => ({ upn: 'employee@example.com' }) },
  '@/lib/module-access': { canAccessModuleWithLevel: async () => true },
  '@/lib/policy-enforcement': { assertPoliciesAcknowledged: async () => { checks++; if (pending) throw new Response('Required', { status: 428 }); } },
 });
 await assert.rejects(api.assertModuleAccess('users', 'modify'), (e) => e.status === 428);
 await assert.rejects(api.assertModuleAccess('dashboard'), (e) => e.status === 428);
 await assert.rejects(api.assertModuleAccess('policies', 'modify'), (e) => e.status === 428);
 assert.equal(await api.assertModuleAccess('policies'), 'employee@example.com');
 assert.equal(checks, 3);
 pending = false;
 assert.equal(await api.assertModuleAccess('users', 'modify'), 'employee@example.com');
});

test('mandatory checks include only pending assigned policies and fail closed on storage errors', async () => {
 let fail = false, policies = [
  { id: 'pending', requires_acknowledgement: true, acknowledged_at: null },
  { id: 'done', requires_acknowledgement: true, acknowledged_at: 'now' },
  { id: 'other', requires_acknowledgement: false, acknowledged_at: null },
 ];
 const api = load('lib/policy-enforcement.ts', {
  '@/lib/request-auth': { getRequestIdentity: async () => ({ upn: 'employee@example.com' }) },
  '@/lib/rbac': { isAllowed: async () => true },
  '@/lib/policies': { listPolicies: async () => { if (fail) throw new Error('Storage unavailable'); return policies; } },
 });
 assert.equal(await api.assertPolicyUser(), 'employee@example.com');
 assert.deepEqual(Array.from(await api.requiredPolicies('employee@example.com'), (p) => p.id), ['pending']);
 await assert.rejects(api.assertPoliciesAcknowledged('employee@example.com'), (e) => e.status === 428);
 policies = []; await api.assertPoliciesAcknowledged('employee@example.com');
 fail = true;
 await assert.rejects(api.assertPoliciesAcknowledged('employee@example.com'), (e) => e.status === 503);
});

test('assigned users can acknowledge through the required endpoint without policy module access', async () => {
 let recorded;
 const api = load('app/api/policies/required/[id]/acknowledge/route.ts', {
  '@/lib/policy-enforcement': { assertPolicyUser: async () => 'employee@example.com' },
  '@/lib/policies': { acknowledgePolicy: async (...args) => { recorded = args; }, policyError: (e) => e },
 });
 assert.equal((await api.POST(request({ version: 3, user_upn: 'spoof@example.com' }), context)).status, 200);
 assert.deepEqual(recorded, [id, 3, 'employee@example.com']);
});

test('required attachment endpoint enforces recipient access even for managers', async () => {
 let args;
 const api = load('app/api/policies/required/[id]/attachment/route.ts', {
  '@/lib/policy-enforcement': { assertPolicyUser: async () => 'employee@example.com' },
  '@/lib/policies': { downloadPolicyAttachment: async (...input) => { args = input; throw new Response('Not assigned', { status: 403 }); }, policyError: (e) => e },
 });
 assert.equal((await api.GET(request({}), context)).status, 403);
 assert.deepEqual(args, [id, 'employee@example.com', false]);
});


test('required policy endpoints reject unsigned or disallowed identities', async () => {
 for (const identity of [null, { upn: 'outside@example.com' }]) {
  const api = load('lib/policy-enforcement.ts', {
   '@/lib/request-auth': { getRequestIdentity: async () => identity },
   '@/lib/rbac': { isAllowed: async () => false },
   '@/lib/policies': {},
  });
  await assert.rejects(api.assertPolicyUser(), (e) => e.status === 403);
 }
});
