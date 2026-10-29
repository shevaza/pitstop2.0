import { listUserRoles } from "@/lib/user-roles";
import { graphFetch } from "@/lib/graph";
import type { PolicyAudience } from "@/lib/policy-types";

export async function getPolicyAudience(): Promise<PolicyAudience> {
    const roles = await listUserRoles();
    const users: PolicyAudience["users"] = [];
    let path = "/users?$select=id,userPrincipalName,displayName,department,employeeType&$top=999";
    while (path) {
        const page = await graphFetch<{ value: { id: string; userPrincipalName: string; displayName?: string; department?: string; employeeType?: string }[]; "@odata.nextLink"?: string }>(path);
        for (const user of page.value) {
            if (user.userPrincipalName) users.push({ upn: user.userPrincipalName.trim().toLowerCase(), name: user.displayName || user.userPrincipalName, department: user.department?.trim() || "", employeeType: user.employeeType?.trim() || "", role: roles.get(user.id) ?? "" });
        }
        const next = page["@odata.nextLink"];
        path = next ? next.replace("https://graph.microsoft.com/v1.0", "") : "";
    }
    users.sort((a, b) => a.name.localeCompare(b.name));
    return { users, roles: [...new Set(users.map((u) => u.role).filter(Boolean))].sort(), departments: [...new Set(users.map((u) => u.department).filter(Boolean))].sort() };
}
