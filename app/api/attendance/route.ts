import sql from "mssql";
import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import { DEFAULT_ATTENDANCE_QUERY, loadMssqlSettings } from "@/lib/mssql-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeLimit(value: string | null) {
    const num = Number(value);
    if (Number.isNaN(num) || num <= 0) return 200;
    return Math.min(Math.max(Math.round(num), 1), 2000);
}

function sanitizeDate(value: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    // Standardize to YYYY-MM-DD to keep SQL predictable
    return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
    const session = await auth();
    const upn = (session as any)?.upn as string | undefined;
    if (!upn || !(await isAllowed(upn))) {
        return new Response("Forbidden", { status: 403 });
    }

    const settings = await loadMssqlSettings();
    if (!settings) {
        return new Response("SQL connection is not configured. Please update Settings.", { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = sanitizeLimit(searchParams.get("limit"));
    const fromDate = sanitizeDate(searchParams.get("fromDate"));
    const toDate = sanitizeDate(searchParams.get("toDate"));
    const requestedReportId = searchParams.get("reportId");
    const reports =
        (settings.reports && settings.reports.length > 0
            ? settings.reports
            : [
                  {
                      id: "attendance-default",
                      name: "Attendance",
                      query: settings.attendanceQuery || DEFAULT_ATTENDANCE_QUERY,
                  },
              ]);
    const activeReport = reports.find((r) => r.id === requestedReportId) ?? reports[0];
    if (!activeReport) {
        return new Response("No report configured", { status: 400 });
    }
    const queryText = (activeReport.query || DEFAULT_ATTENDANCE_QUERY)
        .replace(/{{\s*limit\s*}}/gi, String(limit))
        .replace(/{{\s*fromdate\s*}}/gi, fromDate ? `'${fromDate}'` : "NULL")
        .replace(/{{\s*todate\s*}}/gi, toDate ? `'${toDate}'` : "NULL");

    let pool: sql.ConnectionPool | null = null;
    try {
        pool = await sql.connect({
            server: settings.server,
            database: settings.database,
            user: settings.user,
            password: settings.password,
            options: {
                encrypt: settings.encrypt ?? true,
                trustServerCertificate: settings.trustServerCertificate ?? true,
            },
        });

        const result = await pool.request().query(queryText);
        const rows = result.recordset ?? [];
        return Response.json({
            rows,
            columns: rows.length ? Object.keys(rows[0]) : [],
            limit,
            fetchedAt: new Date().toISOString(),
            queryUsed: queryText,
            report: { id: activeReport.id, name: activeReport.name },
            availableReports: reports.map((r) => ({ id: r.id, name: r.name })),
            source: settings.server,
        });
    } catch (err) {
        console.error("Failed to load attendance data:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return new Response(`Failed to query MSSQL: ${message}`, { status: 500 });
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch {
                // ignore close errors
            }
        }
    }
}
