// Inspect driver details locally, but emit only fixed categories and advice.
// Raw messages may contain usernames, SQL text, or connection details.
export function diagnoseSqlError(error) {
  const seen = new Set();
  const messages = [];
  const codes = [];
  const numbers = [];
  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value) || seen.size >= 30) return;
    seen.add(value);
    if (typeof value.message === 'string') messages.push(value.message.toLowerCase());
    if (typeof value.code === 'string') codes.push(value.code);
    if (typeof value.number === 'number') numbers.push(value.number);
    for (const nested of [value.cause, value.originalError, value.info, ...(Array.isArray(value.precedingErrors) ? value.precedingErrors : []), ...(Array.isArray(value.errors) ? value.errors : [])]) visit(nested);
  }
  visit(error);
  const text = messages.join(' ');
  if (codes.includes('ERR_TLS_CERT_ALTNAME_INVALID') || /hostname.*certificate|altnames|certificate.*name.*match/.test(text)) {
    return { category: 'SQL_TLS_HOSTNAME', hint: 'Use the DNS hostname listed in the SQL certificate, or provision a certificate matching the configured SQL hostname.' };
  }
  if (/self.signed|unable to verify|unable to get.*issuer|certificate.*expired|certificate chain/.test(text) || codes.some(code => ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(code))) {
    const reason = /self.signed/.test(text) ? 'self-signed certificate' : /expired/.test(text) ? 'expired certificate' : 'untrusted or incomplete certificate chain';
    return { category: 'SQL_TLS_CERTIFICATE', reason, hint: 'Configure a valid SQL Server certificate and trust its issuing CA with NODE_EXTRA_CA_CERTS. Keep certificate validation enabled.' };
  }
  if (codes.includes('ELOGIN') || numbers.includes(18456)) return { category: 'SQL_LOGIN', hint: 'Check the local SQL username/password, SQL authentication mode, and login status.' };
  if (numbers.includes(4060)) return { category: 'SQL_DATABASE_ACCESS', hint: 'Check the configured database name and grant the service login access to it.' };
  if (numbers.includes(229)) return { category: 'SQL_PERMISSION', hint: 'Grant the service account read access to the tables or views required by this report.' };
  if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN', 'EINSTLOOKUP'].includes(code))) return { category: 'SQL_DISCOVERY', hint: 'Check office DNS and named-instance discovery. A fixed SQL TCP port can avoid SQL Browser discovery.' };
  if (/tls|ssl|certificate/.test(text)) return { category: 'SQL_TLS', hint: 'Check SQL Server TLS support, its certificate, and the trusted CA configuration.' };
  if (codes.includes('ETIMEOUT') || codes.includes('ETIMEDOUT')) return { category: 'SQL_TIMEOUT', hint: 'Check SQL reachability, firewall rules, instance/port, and query duration.' };
  if (codes.some(code => ['ESOCKET', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'].includes(code))) return { category: 'SQL_NETWORK', hint: 'Check SQL TCP/IP is enabled and the internal host/port is reachable from the API machine.' };
  if (codes.includes('EREQUEST')) return { category: 'SQL_QUERY', hint: 'Review the local report SQL, table/column names, and parameter types.' };
  return { category: 'SQL_UNKNOWN', hint: 'Inspect SQL Server logs locally for the corresponding failure. Do not share raw credentials or report data.' };
}
