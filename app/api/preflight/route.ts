import { RowSchema, Row } from "@/lib/schema";
import { graphFetch } from "@/lib/graph";
import { assertModuleAccess } from "@/lib/module-auth";
import { skuPartToId } from "@/lib/resolvers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await assertModuleAccess("bulk");
    } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }

    const body = await req.json();
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
    const valid: Row[] = [];

    for (const r of rows) {
        const parsed = RowSchema.safeParse(r);
        if (parsed.success) valid.push(parsed.data);
    }

    const items: any[] = [];
    let errors = 0, willChange = 0;

    for (const r of valid) {
        try {
            const user = await graphFetch<any>(`/users/${encodeURIComponent(r.UserPrincipalName)}`); // select basic fields by default
            if (!user?.id) {
                items.push({ upn: r.UserPrincipalName, errors: ["UserNotFound"] });
                errors++; continue;
            }

            const changes: any[] = [];
            const patch: any = {};
            const map: [keyof Row, string][] = [
                ["DisplayName", "displayName"],
                ["GivenName", "givenName"],
                ["Surname", "surname"],
                ["JobTitle", "jobTitle"],
                ["Department", "department"],
                ["OfficeLocation", "officeLocation"],
                ["MobilePhone", "mobilePhone"],
                ["EmployeeId", "employeeId"],
                ["EmployeeType", "employeeType"],
                ["UsageLocation", "usageLocation"],
            ];
            for (const [col, key] of map) {
                const v = (r as any)[col];
                if (v && user[key] !== v) {
                    patch[key] = v;
                    changes.push({ field: key, old: user[key] ?? null, new: v });
                }
            }

            // Manager
            let managerChange: any = null;
            if (r.ManagerUPN) {
                const mgr = await graphFetch<any>(`/users/${encodeURIComponent(r.ManagerUPN)}`);
                if (!mgr?.id) {
                    items.push({ upn: r.UserPrincipalName, errors: ["ManagerNotFound"] });
                    errors++; continue;
                }
                managerChange = { field: "manager", new: r.ManagerUPN, managerId: mgr.id };
                changes.push(managerChange);
            }

            // Groups (ADD only by default)
            const groupAdds: string[] = [];
            if (r["Groups(semi;colon;list)"]) {
                const wanted = r["Groups(semi;colon;list)"].split(";").map(s => s.trim()).filter(Boolean);
                if (wanted.length) {
                    // For a starter, we trust the CSV contains group IDs to avoid collisions.
                    // If you want names, add a resolver here.
                    for (const g of wanted) groupAdds.push(g);
                    if (groupAdds.length) changes.push({ field: "groups.add", values: groupAdds });
                }
            }

            // Licenses
            const licenseAdds: string[] = [];
            if (r["Licenses(comma,list)"]) {
                const parts = r["Licenses(comma,list)"].split(",").map(s => s.trim()).filter(Boolean);
                for (const p of parts) {
                    const id = await skuPartToId(p);
                    if (id) licenseAdds.push(id);
                    else changes.push({ field: "licenses.add", error: `Unknown SKU: ${p}` });
                }
                if (licenseAdds.length) changes.push({ field: "licenses.add", values: licenseAdds });
            }

            willChange += changes.length > 0 ? 1 : 0;
            items.push({ upn: r.UserPrincipalName, userId: user.id, patch, manager: managerChange, groupAdds, licenseAdds, changes, errors: [] });
        } catch (e: any) {
            errors++;
            items.push({ upn: r.UserPrincipalName, errors: [String(e.message || e)] });
        }
    }

    return Response.json({ summary: { rows: valid.length, willChange, errors }, items });
}
