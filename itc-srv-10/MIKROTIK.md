# Direct HTTPS through MikroTik

Public endpoint: `https://85.112.75.82:4010`

Route: WAN TCP 4010 -> 10.185.42.102 TCP 4443 (Caddy TLS) -> localhost TCP 4010 (Node).

Keep Node's `.env` at `HOST=127.0.0.1` and `PORT=4010`. Reserve the LAN IP so it does not change. This replaces Cloudflare; no Cloudflare credentials are required in bearer mode.

## Certificates

From this folder, run `python scripts/create-tls.py` once (requires Python's `cryptography` package). It refuses to overwrite existing files. The server certificate has the public IP in its SAN and expires after one year. Schedule renewal before expiry; changing the CA also requires replacing the Vercel CA variable and redeploying. Keep both private keys confidential and restrict `certs` to the service account and administrators. Store the CA private key securely offline after provisioning; Caddy needs only server.crt and server.key.

## Caddy on the API machine

Download the standard Windows amd64 Caddy binary from https://caddyserver.com/download and put `caddy.exe` in this folder. In a separate terminal, with Node already running:

```powershell
.\caddy.exe validate --config .\Caddyfile.mikrotik --adapter caddyfile
.\caddy.exe run --config .\Caddyfile.mikrotik --adapter caddyfile
```

The explicit certificate avoids ACME and needs no port 80 or 443 forwarding. Keep both Node and Caddy running, and configure both for automatic startup for ongoing use. Do not expose Caddy's localhost admin port 2019.

In an elevated PowerShell on 10.185.42.102, allow only the HTTPS listener:

```powershell
New-NetFirewallRule -DisplayName 'PitStop Attendance HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4443 -LocalAddress 10.185.42.102 -Profile Domain,Private
```

Use the machine's actual firewall profile; do not change its network category just to bypass firewall configuration. No inbound rule is needed for Node port 4010 or SQL Server.

## MikroTik

First inspect `/ip address print`, `/interface list member print`, `/ip firewall nat print`, and `/ip firewall filter print`. Confirm this public IP belongs to the router, the WAN interface list is correct, no earlier NAT rule captures 4010, and forwarding rules permit the intended connection. If upstream NAT exists, it also needs forwarding. Do not change unrelated existing rules.

Template NAT rule (run only after checking WAN membership and rule ordering):

```routeros
/ip firewall nat add chain=dstnat in-interface-list=WAN dst-address=85.112.75.82 protocol=tcp dst-port=4010 action=dst-nat to-addresses=10.185.42.102 to-ports=4443 comment="PitStop Attendance HTTPS"
```

If an existing firewall policy already accepts destination-NAT connections, another accept rule may be unnecessary. Otherwise add this narrowly scoped rule, placing it BEFORE the forward-chain rule that would drop this traffic, while preserving your existing security policy:

```routeros
/ip firewall filter add chain=forward in-interface-list=WAN connection-nat-state=dstnat protocol=tcp dst-address=10.185.42.102 dst-port=4443 action=accept comment="PitStop Attendance HTTPS"
```

Do not blindly append an allow after a drop rule. Do not add an input-chain allow: this traffic goes through the router to the Windows host. Do not forward the public port directly to the plain HTTP Node listener. For rollback, disable only the two rules bearing this exact comment. Static Vercel egress IPs, if configured, can be used to restrict source addresses further.

## Vercel (Production environment)

```dotenv
ATTENDANCE_API_URL=https://85.112.75.82:4010
ATTENDANCE_API_AUTH_MODE=bearer
ATTENDANCE_API_TOKEN=<same token as internal API>
ATTENDANCE_API_CA_PEM=<complete public certs/ca.crt contents including BEGIN/END lines>
```

Paste actual multiline PEM or literal `\n` escapes. Never upload a private key. Trust is scoped to this one API request; Node still validates the certificate chain, expiry and IP address. No `NODE_TLS_REJECT_UNAUTHORIZED=0` or insecure TLS override is used. The old Cloudflare variables are ignored in bearer mode. Redeploy the updated code after saving variables. SQL certificate verification is a separate connection setting and is not fixed by this HTTPS proxy.

## Checks

Before NAT, test Caddy locally without sending a token:

```powershell
curl.exe --ssl-revoke-best-effort --noproxy "*" --cacert .\certs\ca.crt --connect-to 85.112.75.82:4010:127.0.0.1:4443 https://85.112.75.82:4010/v1/health
```

The Windows curl revocation flag tolerates missing revocation endpoints for this private CA; certificate trust and IP validation remain enabled. Expected: `Unauthorized` (401), proving verified HTTPS works while authentication is enforced. After NAT, repeat from an external connection with `--cacert` and without `--connect-to`. Ordinary browsers will not trust this private CA by default; do not use a browser certificate-warning bypass as verification. Test external reachability from mobile data rather than relying on MikroTik hairpin NAT.

Finally open PitStop on Vercel, sign in, and check Settings and Attendance. Vercel supplies the token server-side. Mobile continues using the PitStop URL. A 401 means token mismatch; a 502 from Caddy means Node is unavailable; a 503 from Node requires `npm run diagnose`. Office power/internet outages interrupt attendance access.

References: https://help.mikrotik.com/docs/spaces/ROS/pages/3211299/NAT and https://caddyserver.com/docs/caddyfile/directives/tls.
