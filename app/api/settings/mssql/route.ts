import { DEFAULT_ATTENDANCE_QUERY, getPublicSettings, saveMssqlSettings } from "@/lib/mssql-settings";
import { assertModuleAccess } from "@/lib/module-auth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportSchema = z.object({
    id: z.string().trim().min(1, "Report id is required"),
    name: z.string().trim().min(1, "Report name is required").max(120),
    query: z.string().trim().min(1, "Report query is required").max(4000),
});

const payloadSchema = z.object({
    server: z.string().trim().min(1, "Server is required"),
    database: z.string().trim().min(1, "Database is required"),
    user: z.string().trim().min(1, "User is required"),
    password: z.string().optional(),
    attendanceQuery: z.string().trim().min(1).max(4000).optional(),
    reports: z.array(reportSchema).min(1, "At least one report is required").optional(),
    encrypt: z.boolean().optional(),
    trustServerCertificate: z.boolean().optional(),
}).superRefine((value, ctx) => {
    if (!value.reports?.length && !value.attendanceQuery) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide at least one report query.",
            path: ["reports"],
        });
    }
});

async function requireAccess() {
    return assertModuleAccess("settings");
}

export async function GET() {
    try {
        await requireAccess();
    } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }

    const settings = await getPublicSettings();
    return Response.json({
        settings: settings ?? null,
        defaultQuery: DEFAULT_ATTENDANCE_QUERY,
    });
}

export async function POST(req: Request) {
    try {
        await requireAccess();
    } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }

    let json: unknown;
    try {
        json = await req.json();
    } catch {
        return new Response("Invalid JSON body", { status: 400 });
    }

    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) {
        return new Response(parsed.error.issues.map(i => i.message).join(", "), { status: 400 });
    }

    const data = parsed.data;
    const reports = (data.reports ?? []).map((r) => ({
        id: r.id.trim(),
        name: r.name.trim(),
        query: r.query.trim(),
    }));
    if (!reports.length) {
        reports.push({
            id: "attendance-default",
            name: "Attendance",
            query: (data.attendanceQuery || DEFAULT_ATTENDANCE_QUERY).trim(),
        });
    }
    const saved = await saveMssqlSettings({
        server: data.server,
        database: data.database,
        user: data.user,
        password: data.password ?? undefined,
        attendanceQuery: reports[0]?.query || DEFAULT_ATTENDANCE_QUERY,
        reports,
        encrypt: data.encrypt ?? true,
        trustServerCertificate: data.trustServerCertificate ?? true,
    });

    return Response.json({
        ok: true,
        savedAt: new Date().toISOString(),
        settings: {
            server: saved.server,
            database: saved.database,
            user: saved.user,
            attendanceQuery: saved.attendanceQuery,
            reports: saved.reports,
            encrypt: saved.encrypt ?? true,
            trustServerCertificate: saved.trustServerCertificate ?? true,
            hasPassword: !!saved.password,
        },
    });
}
