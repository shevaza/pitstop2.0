# PitStop 2.0

PitStop 2.0 is a Next.js application with Prisma, Azure AD authentication, optional MSSQL attendance reporting, and Supabase-backed module access data. This repository also includes a separate Expo mobile client in [`mobile/`](C:\Users\shafiq.zabet\Desktop\code\pitstop2.0\mobile\README.md).

## Tech stack

- Next.js 16
- React 19
- Prisma with SQLite for local app data
- Azure AD via `next-auth`
- Supabase REST access with a service role key
- Optional MSSQL connection for attendance data

## Prerequisites

Install these before setting up the project:

- Node.js 20 or later
- `pnpm` 9 or later
- Access to the Azure AD app registration used by the project
- Access to the Supabase project used by the project
- Optional: access to the MSSQL server if you want attendance/reporting features

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

MSSQL_SERVER="your-sql-server"
MSSQL_DATABASE="your-database"
MSSQL_USER="your-username"
MSSQL_PASSWORD="your-password"
MSSQL_ENCRYPT="true"
MSSQL_TRUST_SERVER_CERT="true"
MSSQL_ATTENDANCE_QUERY="SELECT TOP ({{limit}}) * FROM Attendance ORDER BY [Date] DESC"
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
- `MSSQL_*`: only needed if you use the attendance/reporting module.
- `MSSQL_ATTENDANCE_QUERY`: custom SQL query template for attendance retrieval.

## Database and local data setup

Prisma uses SQLite locally. After creating `.env`, initialize the local database:

```bash
pnpm prisma migrate deploy
```

If you are starting from scratch and want Prisma to create/update local schema during development:

```bash
pnpm prisma migrate dev
```

The app also stores MSSQL connection settings in `.data/mssql-settings.json` when configured through the UI. You do not need to create that file manually.

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
- If attendance data is missing, verify the `MSSQL_*` values or the saved `.data/mssql-settings.json` configuration.
