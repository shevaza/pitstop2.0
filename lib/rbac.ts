import { graphFetch } from "./graph";

export async function isAllowed(upn?: string | null) {
    if (!upn) return false;
    const allowedDomain = process.env.ALLOWED_DOMAIN;
    if (allowedDomain && !upn.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
        return false;
    }
    const groupIds = (process.env.ALLOWED_GROUP_IDS || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

    if (groupIds.length === 0) return true; // domain-only gate

    // Find the user object
    const user = await graphFetch<{ id?: string }>(`/users/${encodeURIComponent(upn)}`);
    if (!user?.id) return false;

    // Check transitive membership
    const data = await graphFetch<{ value: { id: string }[] }>(`/users/${user.id}/transitiveMemberOf?$select=id`);
    const userGroupIds = new Set((data.value || []).map(v => v.id));
    return groupIds.some(id => userGroupIds.has(id));
}
