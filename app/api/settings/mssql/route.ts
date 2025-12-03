import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import {
    DEFAULT_ATTENDANCE_QUERY,
    getPublicSettings,
    saveMssqlSettings,
} from "@/lib/mssql-settings";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
    server: z.string().trim().min(1, "Server is required"),
    database: z.string().trim().min(1, "Database is required"),
    user: z.string().trim().min(1, "User is required"),
    password: z.string().optional(),
    attendanceQuery: z.string().trim().min(1).max(4000).default(DEFAULT_ATTENDANCE_QUERY),
    encrypt: z.boolean().optional(),
    trustServerCertificate: z.boolean().optional(),
});

async function requireAccess() {
    const session = await auth();
    const upn = (session as any)?.upn as string | undefined;
    if (!upn || !(await isAllowed(upn))) {
        return null;
    }
    return upn;
}

export async function GET() {
    const upn = await requireAccess();
    if (!upn) return new Response("Forbidden", { status: 403 });

    const settings = await getPublicSettings();
    return Response.json({
        settings: settings ?? null,
        defaultQuery: DEFAULT_ATTENDANCE_QUERY,
    });
}

export async function POST(req: Request) {
    const upn = await requireAccess();
    if (!upn) return new Response("Forbidden", { status: 403 });

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
    const saved = await saveMssqlSettings({
        server: data.server,
        database: data.database,
        user: data.user,
        password: data.password ?? undefined,
        attendanceQuery: data.attendanceQuery || DEFAULT_ATTENDANCE_QUERY,
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
            encrypt: saved.encrypt ?? true,
            trustServerCertificate: saved.trustServerCertificate ?? true,
            hasPassword: !!saved.password,
        },
    });
}
