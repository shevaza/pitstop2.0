import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import { graphFetch } from "@/lib/graph";
import pLimit from "p-limit";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

async function patchUser(userId: string, patch: Record<string, any>) {
    if (Object.keys(patch).length === 0) return;
    await graphFetch(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

async function setManager(userId: string, managerId: string) {
    await graphFetch(`/users/${userId}/manager/$ref`, {
        method: "PUT",
        body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/users/${managerId}` }),
    });
}

async function addToGroup(groupId: string, userObjectId: string) {
    await graphFetch(`/groups/${groupId}/members/$ref`, {
        method: "POST",
        body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userObjectId}` }),
    });
}

async function assignLicenses(userId: string, addSkuIds: string[]) {
    if (addSkuIds.length === 0) return;
    await graphFetch(`/users/${userId}/assignLicense`, {
        method: "POST",
        body: JSON.stringify({ addLicenses: addSkuIds.map(id => ({ skuId: id })), removeLicenses: [] }),
    });
}

export async function POST(req: Request) {
    const session = await auth();
    const actorUpn = (session as any)?.upn as string | undefined;
    if (!actorUpn || !(await isAllowed(actorUpn))) return new Response("Forbidden", { status: 403 });

    const body = await req.json();
    const dryRun = !!body?.dryRun;
    const canary = Number(body?.canary ?? 5);
    const items = Array.isArray(body?.items) ? body.items : [];

    const limit = pLimit(4);
    let changed = 0, failed = 0;

    const run = await prisma.auditRun.create({
        data: { actorUpn, dryRun, canary, total: items.length, changed: 0, failed: 0 }
    });

    const tasks = items.slice(0, Math.max(0, canary || items.length)).map((it: any) => limit(async () => {
        const detail: any = { upn: it.upn, ops: [] };
        let status: "updated" | "partial" | "error" | "nochange" = "nochange";

        try {
            if (!dryRun) {
                if (it.patch && Object.keys(it.patch).length) {
                    await patchUser(it.userId, it.patch);
                    detail.ops.push({ type: "patch", fields: Object.keys(it.patch) });
                    status = "updated";
                }
                if (it.manager?.managerId) {
                    await setManager(it.userId, it.manager.managerId);
                    detail.ops.push({ type: "manager", to: it.manager.managerId });
                    status = "updated";
                }
                for (const g of it.groupAdds || []) {
                    await addToGroup(g, it.userId);
                    detail.ops.push({ type: "group.add", id: g });
                    status = "updated";
                }
                if (it.licenseAdds?.length) {
                    await assignLicenses(it.userId, it.licenseAdds);
                    detail.ops.push({ type: "license.add", ids: it.licenseAdds });
                    status = "updated";
                }
            } else {
                // Dry-run: record intended ops
                if (it.patch && Object.keys(it.patch).length) detail.ops.push({ type: "patch", fields: Object.keys(it.patch) });
                if (it.manager?.managerId) detail.ops.push({ type: "manager", to: it.manager.managerId });
                if (it.groupAdds?.length) for (const g of it.groupAdds) detail.ops.push({ type: "group.add", id: g });
                if (it.licenseAdds?.length) detail.ops.push({ type: "license.add", ids: it.licenseAdds });
                status = detail.ops.length ? "updated" : "nochange";
            }
        } catch (e: any) {
            status = status === "updated" ? "partial" : "error";
            detail.error = String(e.message || e);
        }

        if (status === "updated" || status === "partial") changed++; else if (status === "error") failed++;

        await prisma.auditItem.create({ data: { runId: run.id, upn: it.upn, status, details: detail } });
        return { upn: it.upn, status, details: detail };
    }));

    const results = await Promise.all(tasks);
    const updatedRun = await prisma.auditRun.update({
        where: { id: run.id }, data: { changed, failed }
    });

    return Response.json({ summary: updatedRun, results });
}
