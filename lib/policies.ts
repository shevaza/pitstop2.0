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

export async function listPolicies(upn: string) {
    const [policies, acknowledgements] = await Promise.all([
        allRows<Omit<Policy, "acknowledged_at">>("policies", { select: "*", order: "updated_at.desc,id.asc" }),
        allRows<PolicyAcknowledgement>("policy_acknowledgements", {
            select: "*", user_upn: `eq.${upn.trim().toLowerCase()}`, order: "policy_id.asc,version.asc",
        }),
    ]);
    const acknowledged = new Map(acknowledgements.map((row) => [`${row.policy_id}:${row.version}`, row.acknowledged_at]));
    return policies.map((policy) => ({ ...policy, acknowledged_at: acknowledged.get(`${policy.id}:${policy.version}`) ?? null }));
}

export async function listPolicyAcknowledgements(id: string) {
    return allRows<PolicyAcknowledgement>("policy_acknowledgements", { select: "*", policy_id: `eq.${id}`, order: "version.desc,user_upn.asc" });
}

export function publishPolicy(input: { id?: string; version?: number; title: string; body: string }, upn: string) {
    return supabaseRequest<Policy>("rpc/publish_policy", {
        method: "POST", body: { p_id: input.id ?? null, p_version: input.version ?? null,
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
    if (error instanceof Error && /\(40[49]\)/.test(error.message)) {
        return new Response(error.message.includes("(404)") ? "Policy not found" : "Policy changed. Refresh and read the latest version, then try again.",
            { status: error.message.includes("(404)") ? 404 : 409 });
    }
    console.error("Policy request failed", error);
    return new Response("Unable to load or save policies. Please try again.", { status: 500 });
}
