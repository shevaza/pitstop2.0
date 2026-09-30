import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseSqlError } from '../src/diagnostics.mjs';

test('finds TLS cause inside a driver socket error without exposing raw details', () => {
  const result = diagnoseSqlError({ code: 'ESOCKET', message: 'secret-user: self-signed certificate', originalError: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } });
  assert.equal(result.category, 'SQL_TLS_CERTIFICATE');
  assert.equal(result.reason, 'self-signed certificate');
  assert.ok(!JSON.stringify(result).includes('secret-user'));
});

test('distinguishes login, hostname, network and query failures', () => {
  for (const [code, category] of [['ELOGIN', 'SQL_LOGIN'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'SQL_TLS_HOSTNAME'], ['ECONNREFUSED', 'SQL_NETWORK'], ['EREQUEST', 'SQL_QUERY']]) {
    assert.equal(diagnoseSqlError({ code, message: 'password=private' }).category, category);
  }
});

test('handles cyclic errors and emits only fixed diagnostics', () => {
  const error = new Error('private details');
  error.cause = error;
  assert.equal(diagnoseSqlError(error).category, 'SQL_UNKNOWN');
  assert.ok(!JSON.stringify(diagnoseSqlError(error)).includes('private details'));
});
