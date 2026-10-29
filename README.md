# PitStop 2.0

PitStop 2.0 is a Next.js application with Prisma, Azure AD authentication, optional MSSQL attendance reporting, and Supabase-backed module access data. This repository also includes a separate Expo mobile client in [`mobile/`](C:\Users\shafiq.zabet\Desktop\code\pitstop2.0\mobile\README.md).

## Tech stack

- Next.js 16
- React 19
- Prisma with SQLite for local app data
- Azure AD via `next-auth`
- Supabase REST access with a service role key
- Internal attendance API for MSSQL attendance data

## Prerequisites

Install these before setting up the project:

- Node.js 20 or later
- `pnpm` 9 or later
- Access to the Azure AD app registration used by the project
- Access to the Supabase project used by the project
- Optional: internal attendance API deployment for attendance/reporting features

## Clone and install

```bash
git clone <your-repo-url>
cd pitstop2.0
pnpm install
```

`pnpm install` also runs `prisma generate` through the `postinstall` script.

## Root environment setup

Create a root `.env` file after cloning:

```env
DATABASE_URL="file:./prisma/dev.db"

AZURE_AD_CLIENT_ID="your-azure-app-client-id"
AZURE_AD_CLIENT_SECRET="your-azure-app-client-secret"
AZURE_AD_TENANT_ID="your-azure-tenant-id"

NEXTAUTH_SECRET="generate-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"

SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

ALLOWED_DOMAIN="your-company.com"
ALLOWED_GROUP_IDS="group-guid-1,group-guid-2"

ATTENDANCE_API_URL="https://attendance-api.example.com"
ATTENDANCE_API_TOKEN="internal-api-token"
ATTENDANCE_CF_ACCESS_CLIENT_ID="cloudflare-service-token-id"
ATTENDANCE_CF_ACCESS_CLIENT_SECRET="cloudflare-service-token-secret"
```

### Required values

- `DATABASE_URL`: Prisma database connection. Local development uses SQLite.
- `AZURE_AD_CLIENT_ID`: Azure app registration application ID.
- `AZURE_AD_CLIENT_SECRET`: Azure app registration client secret.
- `AZURE_AD_TENANT_ID`: Azure tenant ID.
- `NEXTAUTH_SECRET`: secret used by `next-auth`.
- `NEXTAUTH_URL`: externally reachable app URL. Use `http://localhost:3000` locally and the VPS URL in production, for example `http://74.208.36.23:3000`.
- `SUPABASE_URL`: base URL for the Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key used by server-side requests.

### Optional values

- `ALLOWED_DOMAIN`: restrict access to users from one email domain.
- `ALLOWED_GROUP_IDS`: comma-separated Azure AD group IDs for access control.
- `ATTENDANCE_API_*` and `ATTENDANCE_CF_ACCESS_*`: server-only attendance service credentials. See [internal API setup](itc-srv-10/README.md). SQL credentials and queries stay on the internal server.

## Database and local data setup

Prisma uses SQLite locally. After creating `.env`, initialize the local database:

```bash
pnpm prisma migrate deploy
```

If you are starting from scratch and want Prisma to create/update local schema during development:

```bash
pnpm prisma migrate dev
```

Attendance uses the service in [`itc-srv-10`](itc-srv-10/README.md). The web and mobile settings screens show connection status and report names. Configure SQL credentials and reports locally on the internal service; the old `.data/mssql-settings.json` is no longer read by Next.js. A migration command is documented in the service README.

## Azure AD configuration

Your Azure AD app registration must be configured for the web app:

- Add a web redirect URI for `http://localhost:3000/api/auth/callback/azure-ad`
- For a VPS deployment at `http://74.208.36.23:3000`, also add `http://74.208.36.23:3000/api/auth/callback/azure-ad`
- Make sure the client ID and tenant ID are GUID values
- Generate a client secret and place it in `AZURE_AD_CLIENT_SECRET`
- Grant the Microsoft Graph permissions your deployment expects

## Supabase setup

Run the SQL files in [`supabase/assets_module.sql`](C:\Users\shafiq.zabet\Desktop\code\pitstop2.0\supabase\assets_module.sql) and [`supabase/user_module_access.sql`](C:\Users\shafiq.zabet\Desktop\code\pitstop2.0\supabase\user_module_access.sql) in your Supabase project if those tables or policies do not already exist.

The server reads Supabase using the REST API, so `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be valid before features that depend on module access will work.

## Run the web app

### Policy portal setup

Run `supabase/policies_module.sql` in the same Supabase project as `user_module_access.sql` before using Policies. The SQL creates policies, immutable published revisions, version-specific acknowledgements, and atomic publication/acknowledgement RPCs. Only the server service role can access these objects; both clients use the authenticated Next.js API.

In **User Access → Policies**, grant **Read** to employees who should read and acknowledge policies, **Modify** to HR/publishers who should also create/edit policies and see acknowledgement history, or **None** to disable access. Existing users receive no policy access automatically. The existing all-employees access action can grant Read in bulk.

Re-run `supabase/policies_module.sql` when upgrading an existing installation to add policy audiences, optional attachments, and the updated publication RPC. Existing policies remain company-wide. Policy authors can attach one non-empty file up to 5 MB when publishing. Attachments are saved atomically with each revision and remain available on later versions unless replaced. Users who can view a policy can download its attachment through the authenticated API; attachment bytes are excluded from policy listings.

Publishers can send a policy to everyone, selected Microsoft 365 departments, selected users, or a combination of departments and users. The directory comes from Microsoft Graph using the existing application credentials and directory-read permissions. Department membership is captured at publication time; republish to refresh recipients. Only recipients see targeted policies and receive pending-policy alerts; publishers retain access to all policies. Recipients still need Policies Read access.

Publishing a new policy or editing a policy immediately creates a published version. The web editor accepts a manually entered positive whole-number version; updates must use a higher version than the current one. Every version requires a new acknowledgement; historical acknowledgements remain available to publishers with employee UPN, version, and timestamp. Conflicting edits and acknowledgements of an outdated version return HTTP 409.

Both web and Expo display persistent **in-app** pending-policy notifications, refreshed every minute while active and when the app regains focus. These alerts do not send email or device push notifications while the apps are closed. Policy publication, reading, acknowledgement, and acknowledgement history are available in both clients. The Expo app is a separate Git repository in `mobile/` and must be deployed/rebuilt separately.

Run policy API regression checks with `node --test tests/policies-api.test.mjs`.

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Run on a VPS

Do not run the public VPS with `pnpm dev`. The dev server serves Turbopack/HMR browser code, including `/_next/webpack-hmr` WebSocket requests, and is meant for local development only.

On the VPS, set the root `.env` to the public URL:

```env
NEXTAUTH_URL="http://74.208.36.23:3000"
NEXTAUTH_SECRET="generate-a-long-random-secret"
```

Then build and run the production server:

```bash
pnpm install
pnpm prisma migrate deploy
pnpm build:vps
pnpm start
```

If you are using npm on the VPS, run `npm run build:vps` instead of `npm run build`.

If the VPS still runs out of memory during TypeScript checking, add swap or build on a larger machine and deploy the built output. The `build:vps` script raises Node's heap limit to 4 GB, but the server still needs enough RAM or swap to satisfy that limit.

After changing `NEXTAUTH_URL`, restart the Node process. You can confirm the setting is being used by opening `/api/auth/providers`; the `signinUrl` and `callbackUrl` values should start with `http://74.208.36.23:3000`, not `http://localhost:3000`.

## Mobile app

The Expo client lives in `mobile/` and has its own installation and `.env` instructions in [`mobile/README.md`](C:\Users\shafiq.zabet\Desktop\code\pitstop2.0\mobile\README.md). Run the web app first if you want the mobile app to call the local API.

## Useful commands

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm prisma generate
pnpm prisma migrate deploy
```

## Troubleshooting

- If sign-in fails immediately, re-check `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, and the Azure redirect URI.
- If the VPS shows the login screen but the browser console logs `/_next/webpack-hmr` WebSocket failures, stop `pnpm dev` and run `pnpm build:vps` followed by `pnpm start`.
- If `/api/auth/providers` returns `localhost` URLs on the VPS, set `NEXTAUTH_URL` to the public VPS URL and restart the app.
- If module access calls fail, verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- If Prisma fails to connect, verify `DATABASE_URL`.
- If attendance data is missing, use Settings to check service connectivity, then verify the internal API, Cloudflare Access policy, and server-only `ATTENDANCE_*` environment values. See [troubleshooting and setup](itc-srv-10/README.md).

Attendance cross-check scraping is integrated into `itc-srv-10`; run one internal API plus Caddy. See [scraper setup](itc-srv-10/README.md#integrated-legacy-site-scraper). The old `LEAVE_API_BASE_URL` is unused. Redeploy web and rebuild mobile for job polling support.

Policy employee types: Employee, Project Based, and Intern are the supported user-edit values. Policy authors can select one or more of these types on web and mobile. Types filter the union of selected departments and individual users; with neither selected, they target all users of the selected types. With no type filter, all employee types are included. Audience membership is captured from Microsoft 365 at publication, and an empty matching audience is rejected. Re-run `supabase/policies_module.sql` when upgrading. Existing directory values are not automatically reclassified.

User Role is an optional business label (up to 100 characters) editable on user details. Clearing it removes the assignment. It is stored by stable Microsoft 365 user ID in `user_policy_roles`, independently of directory cache sync and application access permissions. Policy role options are populated from saved roles for current directory users. Selected roles narrow employee type, department, and individual-user selections; choosing only roles targets all users with those roles. Roles are captured on each policy revision. Apply `supabase/policies_module.sql` and rebuild/reload mobile when upgrading.

Mandatory acknowledgement: after login the application checks `/api/policies/required` before enabling the interface. A blocking dialog shows each pending assigned policy and its attachment, and cannot be dismissed until all current versions are acknowledged. This includes assigned users without Policies module permissions. The check repeats on focus/resume and every minute; failures keep the interface blocked. Server module authorization rejects other module requests with HTTP 428 while acknowledgement is pending (503 if verification fails). Authentication, access bootstrap, and policy reading/acknowledgement remain available. A newer policy version must be reviewed again after a publication conflict. No additional SQL is required for this enforcement. Deploy the backend and web updates together and rebuild/reload mobile.
