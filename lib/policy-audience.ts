import { graphFetch } from "@/lib/graph";
import type { PolicyAudience } from "@/lib/policy-types";

export async function getPolicyAudience(): Promise<PolicyAudience> {
    const users: PolicyAudience["users"] = [];
    let path = "/users?$select=userPrincipalName,displayName,department&$top=999";
    while (path) {
        const page = await graphFetch<{ value: { userPrincipalName: string; displayName?: string; department?: string }[]; "@odata.nextLink"?: string }>(path);
        for (const user of page.value) {
            if (user.userPrincipalName) users.push({ upn: user.userPrincipalName.trim().toLowerCase(), name: user.displayName || user.userPrincipalName, department: user.department?.trim() || "" });
        }
        const next = page["@odata.nextLink"];
        path = next ? next.replace("https://graph.microsoft.com/v1.0", "") : "";
    }
    users.sort((a, b) => a.name.localeCompare(b.name));
    return { users, departments: [...new Set(users.map((u) => u.department).filter(Boolean))].sort() };
}
