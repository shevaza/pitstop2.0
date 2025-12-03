// app/api/users/[id]/route.ts
import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import { graphFetch } from "@/lib/graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/users/:id
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const upn = (session as any)?.upn as string | undefined;
        if (!upn || !(await isAllowed(upn))) return new Response("Forbidden", { status: 403 });

        const { id } = await ctx.params;                 // ✅ await the params promise
        const userId = decodeURIComponent(id);

        const user = await graphFetch<any>(
            `/users/${userId}?$select=id,displayName,givenName,surname,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,employeeId,employeeType,usageLocation,accountEnabled`
        );

        let manager: any = null;
        try {
            manager = await graphFetch<any>(`/users/${userId}/manager?$select=id,userPrincipalName,displayName`);
        } catch { /* no manager is fine */ }

        return Response.json({ user, manager });
    } catch (e: any) {
        console.error("GET /api/users/[id] failed", e);
        return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
    }
}

// PATCH /api/users/:id
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const upn = (session as any)?.upn as string | undefined;
        if (!upn || !(await isAllowed(upn))) return new Response("Forbidden", { status: 403 });

        const { id } = await ctx.params;                 // ✅ await the params promise
        const userId = decodeURIComponent(id);
        const body = await req.json();

        const allowed = [
            "displayName", "givenName", "surname", "jobTitle", "department",
            "officeLocation", "mobilePhone", "employeeId", "employeeType", "usageLocation",
        ] as const;

        const patch: Record<string, any> = {};
        for (const k of allowed) if (k in body && body[k] !== "") patch[k] = body[k];

        if (Object.keys(patch).length) {
            await graphFetch(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
        }

        if (typeof body.managerUPN === "string") {
            if (body.managerUPN.trim() === "") {
                await graphFetch(`/users/${userId}/manager/$ref`, { method: "DELETE" });
            } else {
                const mgr = await graphFetch<any>(`/users/${encodeURIComponent(body.managerUPN)}?$select=id`);
                if (!mgr?.id) return new Response("Manager not found", { status: 400 });
                await graphFetch(`/users/${userId}/manager/$ref`, {
                    method: "PUT",
                    body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/users/${mgr.id}` }),
                });
            }
        }

        return new Response(null, { status: 204 });
    } catch (e: any) {
        console.error("PATCH /api/users/[id] failed", e);
        return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
    }
}
