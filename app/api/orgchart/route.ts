import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import { graphFetch } from "@/lib/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns: { items: Array<{ id, upn, displayName, jobTitle, department, managerId?, managerUpn? }> }
 * You can filter by ?department=... or ?top=... later if needed.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        const upn = (session as any)?.upn as string | undefined;
        if (!upn || !(await isAllowed(upn))) return new Response("Forbidden", { status: 403 });

        const url = new URL(req.url);
        const topStr = url.searchParams.get("top");        // optional cap for testing
        const cap = topStr ? Math.max(1, Math.min(9999, Number(topStr))) : undefined;

        // 1) Pull all users (paged)
        const select =
            "$select=id,displayName,userPrincipalName,jobTitle,department,accountEnabled";
        const filter = "$filter=accountEnabled eq true";
        let path = `/users?${select}&${filter}&$top=999`;
        const users: any[] = [];
        while (true) {
            const page = await graphFetch<any>(path);
            users.push(...(page.value ?? []));
            if (cap && users.length >= cap) break;
            const next = page["@odata.nextLink"];
            if (!next) break;
            const nt = new URL(next);
            const skiptoken = nt.searchParams.get("$skiptoken");
            path = `/users?${select}&$top=999${skiptoken ? `&$skiptoken=${encodeURIComponent(skiptoken)}` : ""}`;
        }
        const trimmed = cap ? users.slice(0, cap) : users;

        // 2) Batch-fetch each user's manager (reduce N+1 calls)
        const idList = trimmed.map(u => u.id).filter(Boolean);
        const batches: any[] = [];
        for (let i = 0; i < idList.length; i += 20) {
            const slice = idList.slice(i, i + 20);
            batches.push({
                requests: slice.map((id, idx) => ({
                    id: String(i + idx + 1),
                    method: "GET",
                    url: `/users/${id}/manager?$select=id,userPrincipalName`,
                })),
            });
        }

        const managerById = new Map<string, { id?: string; upn?: string }>();
        for (const body of batches) {
            const resp = await graphFetch<any>("/$batch", {
                method: "POST",
                body: JSON.stringify(body),
            } as any);
            for (const r of resp?.responses ?? []) {
                // r.id is just the batch item id; extract target user id from requests array if needed
                // We can match by array index order:
                const absoluteIndex = Number(r.id) - 1;
                const userId = idList[absoluteIndex];
                if (r.status === 200 && r.body) {
                    managerById.set(userId, {
                        id: r.body?.id,
                        upn: r.body?.userPrincipalName,
                    });
                } else {
                    managerById.set(userId, {}); // no manager
                }
            }
        }

        const items = trimmed.map(u => ({
            id: u.id as string,
            upn: u.userPrincipalName as string,
            displayName: (u.displayName as string) ?? u.userPrincipalName,
            jobTitle: (u.jobTitle as string) ?? "",
            department: (u.department as string) ?? "",
            managerId: managerById.get(u.id)?.id,
            managerUpn: managerById.get(u.id)?.upn,
        }));

        return Response.json({ items });
    } catch (e: any) {
        console.error("GET /api/orgchart failed", e);
        return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
    }
}
