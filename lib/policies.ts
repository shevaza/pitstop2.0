import { getPolicyAudience } from "@/lib/policy-audience";
import { supabaseRequest } from "@/lib/supabase-admin";
import type { Policy, PolicyAcknowledgement } from "@/lib/policy-types";

// PostgREST caps each response. Page explicitly so no policies disappear at that cap.
async function allRows<T>(table: string, query: Record<string, string>) {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
        const page = await supabaseRequest<T[]>(table, { query: { ...query, limit: 500, offset } });
        rows.push(...page);
        if (page.length < 500) return rows;
    }
}

export async function listPolicies(upn: string, canModify = false) {
    const [policies, acknowledgements] = await Promise.all([
        allRows<Omit<Policy, "acknowledged_at">>("policies", { select: "*", order: "updated_at.desc,id.asc" }),
        allRows<PolicyAcknowledgement>("policy_acknowledgements", {
            select: "*", user_upn: `eq.${upn.trim().toLowerCase()}`, order: "policy_id.asc,version.asc",
        }),
    ]);
    const acknowledged = new Map(acknowledgements.map((row) => [`${row.policy_id}:${row.version}`, row.acknowledged_at]));
    return policies.filter((policy) => canModify || policy.recipient_upns == null || policy.recipient_upns.includes(upn.trim().toLowerCase())).map((policy) => ({ ...policy, requires_acknowledgement: policy.recipient_upns == null || policy.recipient_upns.includes(upn.trim().toLowerCase()), acknowledged_at: acknowledged.get(`${policy.id}:${policy.version}`) ?? null }));
}

export async function listPolicyAcknowledgements(id: string) {
    return allRows<PolicyAcknowledgement>("policy_acknowledgements", { select: "*", policy_id: `eq.${id}`, order: "version.desc,user_upn.asc" });
}

export async function publishPolicy(input: { id?: string; version?: number; expectedVersion?: number; target_departments?: string[]; target_users?: string[]; title: string; body: string }, upn: string) {
    const departments = input.target_departments ?? [];
    const users = input.target_users ?? [];
    let recipients: string[] | null = null;
    if (departments.length || users.length) {
        const directory = await getPolicyAudience();
        if (departments.some((d) => !directory.departments.includes(d)) || users.some((u) => !directory.users.some((person) => person.upn === u))) {
            throw new Response("Select existing Microsoft 365 departments and users.", { status: 400 });
        }
        recipients = directory.users.filter((u) => departments.includes(u.department) || users.includes(u.upn)).map((u) => u.upn);
        if (!recipients.length) throw new Response("The selected audience has no users.", { status: 400 });
    }
    return supabaseRequest<Policy>("rpc/publish_policy", {
        method: "POST", body: { p_id: input.id ?? null, p_version: input.expectedVersion ?? null, p_new_version: input.version ?? 1,
            p_departments: departments, p_users: users, p_recipients: recipients,
            p_title: input.title, p_body: input.body, p_actor: upn.trim().toLowerCase() },
    });
}

export function acknowledgePolicy(id: string, version: number, upn: string) {
    return supabaseRequest("rpc/acknowledge_policy", {
        method: "POST", body: { p_id: id, p_version: version, p_actor: upn.trim().toLowerCase() },
    });
}

export function policyError(error: unknown) {
    if (error instanceof Response) return error;
    if (error instanceof Error && /\(40[0349]\)/.test(error.message)) {
        if (error.message.includes("(403)")) return new Response("Policy is not assigned to you.", { status: 403 });
        if (error.message.includes("(400)")) return new Response("Enter a version greater than the current version and select a valid audience.", { status: 400 });
        return new Response(error.message.includes("(404)") ? "Policy not found" : "Policy changed. Refresh and read the latest version, then try again.",
            { status: error.message.includes("(404)") ? 404 : 409 });
    }
    console.error("Policy request failed", error);
    return new Response("Unable to load or save policies. Please try again.", { status: 500 });
}
