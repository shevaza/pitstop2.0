import { supabaseRequest } from "@/lib/supabase-admin";

export async function listUserRoles() {
    const roles = new Map<string, string>();
    for (let offset = 0; ; offset += 500) {
        const rows = await supabaseRequest<{ user_id: string; role: string }[]>("user_policy_roles", {
            query: { select: "user_id,role", order: "user_id.asc", limit: 500, offset },
        });
        for (const row of rows) roles.set(row.user_id, row.role);
        if (rows.length < 500) return roles;
    }
}

export async function getUserRole(userId: string) {
    const rows = await supabaseRequest<{ role: string }[]>("user_policy_roles", {
        query: { select: "role", user_id: `eq.${userId}`, limit: 1 },
    });
    return rows[0]?.role ?? "";
}

export async function setUserRole(userId: string, role: string) {
    if (!role) {
        await supabaseRequest("user_policy_roles", { method: "DELETE", query: { user_id: `eq.${userId}` } });
        return;
    }
    await supabaseRequest("user_policy_roles", {
        method: "POST", query: { on_conflict: "user_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: { user_id: userId, role },
    });
}
