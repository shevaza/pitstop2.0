# ITC attendance API

For the direct IP deployment at `85.112.75.82:4010`, follow [MikroTik HTTPS setup](MIKROTIK.md). It uses explicit bearer authentication and a private CA trusted only by the PitStop server.

Run this service on an always-on machine inside the office network with access to `ITC-SRV-10`. The Next.js app and Expo mobile app use the authenticated Next.js `/api/attendance` endpoint. Only Next.js contacts this service; SQL credentials never belong in Vercel or mobile configuration.

```text
Web / mobile -> PitStop user authentication and module authorization
             -> HTTPS + Cloudflare Access service token + API bearer token
             -> Cloudflare Tunnel -> 127.0.0.1:4010 -> internal MSSQL
```

## 1. Configure the internal service

Use Node.js 22.16+ (a supported LTS release is recommended). Copy this folder to the internal machine; it is independently installable and does not need the Next.js app.

```powershell
cd C:\Services\itc-srv-10
npm ci
Copy-Item .env.example .env
Copy-Item config/reports.example.json config/reports.json
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `ATTENDANCE_API_TOKEN`. Configure the SQL database, read-only user and password in `.env`. Keep `HOST=127.0.0.1` and run `cloudflared` on the same machine. No inbound router rule is needed.

For the named instance, use `MSSQL_SERVER=ITC-SRV-10` and `MSSQL_INSTANCE=CORP`. Alternatively, configure a fixed SQL TCP port, set `MSSQL_PORT`, and remove `MSSQL_INSTANCE`. The API machine needs internal firewall access to that SQL port. Instance discovery additionally depends on SQL Browser; a fixed port is preferable.

Use a SQL certificate whose name matches the configured SQL hostname and whose CA is trusted by Node. Set `NODE_EXTRA_CA_CERTS` to the corporate CA PEM if needed. Encryption defaults to `true` and certificate validation defaults to enabled (`MSSQL_TRUST_SERVER_CERT=false`). A certificate error should be fixed by configuring the certificate/CA; the tunnel protects a different network segment.

Use a dedicated SQL login granted SELECT only on the required attendance views/tables, or tightly scoped stored-procedure permissions if adapting the service. Do not grant `db_owner`, write permissions, or unrestricted database access. Restrict `.env` and `config` file ACLs to the service account and administrators; Git ignore rules are not filesystem access controls.

### Existing PitStop settings

To migrate the existing local settings, run this **instead of copying the example report**, from this folder in the current project:

```powershell
npm run migrate
# Or: node scripts/migrate-settings.mjs C:\path\to\mssql-settings.json
```

This creates ignored `config/mssql-settings.json` and `config/reports.json`, refuses to overwrite files, and leaves the source unchanged. Set `MSSQL_SETTINGS_FILE=./config/mssql-settings.json` in `.env` and remove the `MSSQL_SERVER`, `MSSQL_INSTANCE`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD` entries so migrated values can be used. Environment values take precedence, including blank values. Encryption is deliberately not downgraded from legacy settings.

Migration converts `{{limit}}`, `{{FromDate}}`, and `{{ToDate}}` into bound SQL parameters. It preserves existing query logic: review date predicates and AND/OR parentheses before using migrated reports. The supplied example uses both optional date filters and includes the whole end date, so same-day cross-check requests work. Existing queries using `< @toDate` still exclude that day until you update them to `< DATEADD(day, 1, @toDate)`.

The original `.data/mssql-settings.json` may already be tracked by Git. This change leaves it untouched and excludes `.data` from Vercel uploads. After migration, remove SQL secrets from cloud environment variables and handle any previously committed credentials according to your credential-rotation process.

For legacy reports starting with `SELECT` (including `SELECT DISTINCT` and `SELECT ALL`) without a TOP clause, migration adds `TOP (@limit)` to that outer SELECT. Already bounded queries and CTEs are left intact apart from parameter conversion. Unbounded CTEs and fixed TOP expressions require an administrator to add or replace the outer limit explicitly.

### Reports

Edit `config/reports.json` locally and restart the service. Each entry has a unique `id`, a display `name`, and a reviewed SQL `query`. Queries must use `TOP (@limit)`; supported parameters are `@limit`, `@fromDate`, and `@toDate`. Parameters are bound using `mssql`, not interpolated. SQL definitions are trusted administrator configuration, not a SQL sandbox; the read-only SQL account enforces database permissions.

For the example, confirm the `Attendance`, `Employee`, `BadgeNumber`, `NAME`, `VerifyTime`, and `id` columns match the database. Prefer an explicit list of required columns or a dedicated attendance view over `A.*` to minimize returned personal data.

```powershell
npm test
npm start
```

The startup command loads `.env` relative to the working directory. Run it through your organization's Windows service manager under a dedicated, unprivileged service account, with this folder as the working directory, automatic startup and restart on failure. `scripts/start.ps1` supplies a working-directory-safe entry point. Configure log rotation in the service manager. Do not register `node.exe` directly with `sc.exe`; Node is not a Windows Service executable.

Health and metadata endpoints test the database connection; startup alone does not confirm database connectivity. Test locally in another PowerShell session without putting tokens in command history:

```powershell
$apiToken = Read-Host 'API token' -MaskInput
Invoke-RestMethod http://127.0.0.1:4010/v1/health -Headers @{ Authorization = "Bearer $apiToken" }
Invoke-RestMethod 'http://127.0.0.1:4010/v1/attendance?limit=10' -Headers @{ Authorization = "Bearer $apiToken" }
Remove-Variable apiToken
```

`-MaskInput` requires PowerShell 7. For Windows PowerShell 5.1, use a secure-input workflow approved by your IT team.

## 2. Protect the API with Cloudflare Access and Tunnel

1. Use a hostname on a domain managed in your Cloudflare account, such as `attendance-api.example.com`.
2. Create a Cloudflare Access self-hosted application covering that hostname and **all paths**. Create a service token and a **Service Auth** policy permitting only that token. Do not add Bypass or public Allow policies. Configure Access before publishing the tunnel hostname.
3. Create a named Cloudflare Tunnel and install its connector as a Windows service on the API machine. Protect the tunnel token independently of the Access token.
4. Route the hostname to `http://127.0.0.1:4010`. Keep the API bound to loopback. Do not publish SQL TCP ports or create inbound NAT rules. If using local tunnel configuration, include a final `http_status:404` catch-all ingress rule.
5. Verify that requests without Access credentials are blocked and requests with Access credentials but without the API bearer token return 401. The tunnel alone does not restrict public access.

The API requires its own independent bearer token even behind Cloudflare. The Cloudflare layer authenticates the calling service, while PitStop checks individual browser/mobile users and their module permissions. No browser CORS configuration is needed because this is server-to-server traffic.

Official references: [Cloudflare Tunnel setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/), [Cloudflare service tokens and Service Auth](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/), [node-mssql configuration and parameters](https://github.com/tediousjs/node-mssql).

## 3. Configure Next.js / Vercel

Use the root `.env.attendance.example` as a reference. Set these **server-only** environment variables in Vercel, then redeploy:

```dotenv
ATTENDANCE_API_URL=https://attendance-api.example.com
ATTENDANCE_API_TOKEN=<same API bearer token as the internal service>
ATTENDANCE_CF_ACCESS_CLIENT_ID=<Cloudflare Access service token ID>
ATTENDANCE_CF_ACCESS_CLIENT_SECRET=<Cloudflare Access service token secret>
```

Never use `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefixes for these secrets. Restrict production credentials to the production deployment environment. SQL credentials and queries no longer belong in Next.js. The web settings page now displays connection status and report names; local files on Vercel are no longer used for attendance configuration.

For local Next.js development on the API machine, `ATTENDANCE_API_URL=http://127.0.0.1:4010` is allowed without Cloudflare tokens, but still requires the API token. All other hosts require HTTPS and Cloudflare credentials. Redirects are rejected so credentials cannot be forwarded to another origin.

## 4. Mobile

Keep the mobile app's existing backend URL pointed at **PitStop**, not this service. Mobile attendance and cross-check use the same `/api/attendance` proxy with their existing user bearer authentication. The settings screen now displays service status and report names. Rebuild/distribute the mobile app to deliver that screen change. Older mobile attendance clients retain the response contract; old settings save requests return 405 with an explanation.

## Diagnosing SQL connection failures

Run `npm run diagnose` from this folder to test the configured SQL connection with `SELECT 1`. It prints a safe error category and hint rather than raw driver errors. Request failures also log the category with the request ID; HTTP responses remain sanitized.

For `SQL_TLS_CERTIFICATE`, obtain the public issuing CA certificate from IT as a Base-64 X.509/PEM file (no private key), save it on the API machine, and set `NODE_EXTRA_CA_CERTS=C:/certificates/corporate-ca.pem` in `.env`. Restart Node and rerun the diagnostic. Expired certificates must be renewed, and automatically generated SQL self-signed certificates should be replaced with an appropriately issued server certificate. The configured SQL hostname must match the certificate. Do not disable certificate validation for production.

## API and operations

All endpoints require `Authorization: Bearer <ATTENDANCE_API_TOKEN>` and return `Cache-Control: no-store`.

| Method/path | Purpose |
| --- | --- |
| GET `/v1/health` | Readiness probe, including `SELECT 1` on SQL Server |
| GET `/v1/reports` | Database readiness and report IDs/names; no SQL or credentials |
| GET `/v1/attendance` | Report rows, columns, limit, fetch time, report metadata and source label |

Attendance parameters: `reportId` (optional; defaults to the first report), `limit` (1–2000, default 200), `fromDate` and `toDate` (optional `YYYY-MM-DD`). Unknown/repeated parameters, invalid dates, reversed ranges, and unknown report IDs are rejected. SQL/report/connection updates have no remote HTTP endpoint.

The example uses SQL stored timestamp values without timezone conversion; confirm the source's time convention. Cross-check clients retain their existing 2000-row request limit: high-volume days need narrower reports or a future pagination design.

The service maintains a shared connection pool (maximum 5 connections), limits simultaneous requests to 5, uses a 5-second connection timeout and 15-second SQL query timeout, and defaults to 120 authenticated requests/minute across the service. Adjust `RATE_LIMIT_PER_MINUTE` for expected usage. The Next.js proxy times out after 25 seconds and does not automatically retry queries. Responses above 4 MiB are rejected to stay below [Vercel's 4.5 MB response limit](https://vercel.com/docs/functions/limitations). All limits are per process.

Audit logs contain generated request IDs, status, duration, and fixed diagnostic categories/hints, never tokens, query strings, SQL text, credentials or rows. Upstream SQL errors are sanitized. Monitor readiness and repeated 5xx responses. Office internet/server outages make live attendance unavailable; there is no offline cache. Rotate API and Access credentials together with deployment updates, allowing for a maintenance window for API-token changes.

Run the service tests with `npm test`; run the proxy integration tests from the repository root with `npm run test:attendance` on Node.js 22.18+ (native TypeScript stripping). Those tests use a local HTTP server and mocked SQL results; actual SQL, certificate, Cloudflare and Vercel connectivity must be verified in the target environment.
