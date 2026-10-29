// app/api/users/[id]/route.ts
import { getUserRole, setUserRole } from "@/lib/user-roles";
import { isEmployeeType } from "@/lib/employee-types";
import { graphFetch } from "@/lib/graph";
import { assertModuleAccess } from "@/lib/module-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/users/:id
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        await assertModuleAccess("users", "modify");

        const { id } = await ctx.params;                 // ✅ await the params promise
        const userId = decodeURIComponent(id);

        const user = await graphFetch<any>(
            `/users/${userId}?$select=id,displayName,givenName,surname,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,employeeId,employeeType,usageLocation,accountEnabled`
        );

        user.role = await getUserRole(user.id);
        let manager: any = null;
        try {
            manager = await graphFetch<any>(`/users/${userId}/manager?$select=id,userPrincipalName,displayName`);
        } catch { /* no manager is fine */ }

        return Response.json({ user, manager });
    } catch (e: any) {
        if (e instanceof Response) return e;
        console.error("GET /api/users/[id] failed", e);
        return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
    }
}

// PATCH /api/users/:id
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        await assertModuleAccess("users", "modify");

        const { id } = await ctx.params;                 // ✅ await the params promise
        const userId = decodeURIComponent(id);
        const body = await req.json();

        if ("employeeType" in body && body.employeeType !== "" && !isEmployeeType(body.employeeType)) {
            return new Response("Employee type must be Employee, Project Based, or Intern.", { status: 400 });
        }
        if ("role" in body && (typeof body.role !== "string" || body.role.trim().length > 100 || /[\x00-\x1f\x7f]/.test(body.role))) {
            return new Response("Role must be text of up to 100 characters.", { status: 400 });
        }
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

        if ("role" in body) {
            // Resolve UPN routes to the stable directory ID used by policy audiences.
            const user = await graphFetch<{ id: string }>(`/users/${userId}?$select=id`);
            await setUserRole(user.id, body.role.trim());
        }
        return new Response(null, { status: 204 });
    } catch (e: any) {
        if (e instanceof Response) return e;
        console.error("PATCH /api/users/[id] failed", e);
        return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
    }
}
