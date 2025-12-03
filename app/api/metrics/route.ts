import { access } from "node:fs/promises";
import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import { graphFetch } from "@/lib/graph";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/**
 * Returns:
 * {
 *   totals: { employees, active, disabled, guests },
 *   departments: Array<{ name, count, active, disabled }>,
 *   generatedAt: string,
 *   recentRuns: Array<{ id, actorUpn, createdAt, dryRun, total, changed, failed }>
 * }
 */
export async function GET() {
    const dbExists = await access(`${process.cwd()}/prisma/dev.db`).then(() => true).catch(() => false);
    console.log("metrics route env", {
        DATABASE_URL: process.env.DATABASE_URL,
        cwd: process.cwd(),
        dbExists,
    });
    const session = await auth();
    const upn = (session as any)?.upn as string | undefined;
    if (!upn || !(await isAllowed(upn))) {
        return new Response("Forbidden", { status: 403 });
    }

    // --- Pull users (paged), exclude guests for "employees" KPIs ---
    const select = "$select=id,accountEnabled,department,userType";
    let path = `/users?${select}&$top=999`;
    const all: any[] = [];

    while (true) {
        const page = await graphFetch<any>(path);
        all.push(...(page.value ?? []));
        const next = page["@odata.nextLink"];
        if (!next) break;
        const nt = new URL(next);
        const skiptoken = nt.searchParams.get("$skiptoken");
        path = `/users?${select}&$top=999${skiptoken ? `&$skiptoken=${encodeURIComponent(skiptoken)}` : ""}`;
    }

    // Partition: employees (Member) vs guests (Guest)
    const employees = all.filter(u => (u.userType ?? "Member") === "Member");
    const guests = all.filter(u => (u.userType ?? "Member") === "Guest");

    const active = employees.filter(u => u.accountEnabled === true);
    const disabled = employees.filter(u => u.accountEnabled === false);

    // Department aggregates
    const deptMap = new Map<string, { count: number; active: number; disabled: number }>();
    for (const u of employees) {
        const key = (u.department || "Unassigned").trim() || "Unassigned";
        if (!deptMap.has(key)) deptMap.set(key, { count: 0, active: 0, disabled: 0 });
        const d = deptMap.get(key)!;
        d.count += 1;
        if (u.accountEnabled) d.active += 1; else d.disabled += 1;
    }
    const departments = Array.from(deptMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.count - a.count);

    // Recent bulk runs from your audit log (Prisma)
    const recentRuns = await prisma.auditRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, actorUpn: true, createdAt: true, dryRun: true, total: true, changed: true, failed: true },
    });

    const payload = {
        totals: {
            employees: employees.length,
            active: active.length,
            disabled: disabled.length,
            guests: guests.length,
        },
        departments,
        generatedAt: new Date().toISOString(),
        recentRuns,
    };

    return Response.json(payload);
}
