import { isEmployeeType } from "@/lib/employee-types";
import { getPolicyAudience } from "@/lib/policy-audience";
import { supabaseRequest } from "@/lib/supabase-admin";
import type { Policy, PolicyAcknowledgement, PolicyAttachment } from "@/lib/policy-types";

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
        allRows<Omit<Policy, "acknowledged_at">>("policies", { select: "id,title,body,version,target_roles,target_employee_types,target_departments,target_users,recipient_upns,updated_by_upn,created_at,updated_at,attachment_name:attachment->>name", order: "updated_at.desc,id.asc" }),
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

export async function publishPolicy(input: { id?: string; version?: number; expectedVersion?: number; target_roles?: string[]; target_employee_types?: string[]; target_departments?: string[]; target_users?: string[]; title: string; body: string; attachment?: PolicyAttachment }, upn: string) {
    const roles = input.target_roles ?? [];
    const employeeTypes = input.target_employee_types ?? [];
    if (employeeTypes.some((type) => !isEmployeeType(type))) throw new Response("Select Employee, Project Based, or Intern.", { status: 400 });
    const departments = input.target_departments ?? [];
    const users = input.target_users ?? [];
    let recipients: string[] | null = null;
    if (departments.length || users.length || employeeTypes.length || roles.length) {
        const directory = await getPolicyAudience();
        if (roles.some((role) => !directory.roles.includes(role)) || departments.some((d) => !directory.departments.includes(d)) || users.some((u) => !directory.users.some((person) => person.upn === u))) {
            throw new Response("Select existing roles, Microsoft 365 departments and users.", { status: 400 });
        }
        recipients = directory.users.filter((u) => (!departments.length && !users.length || departments.includes(u.department) || users.includes(u.upn)) && (!employeeTypes.length || employeeTypes.includes(u.employeeType)) && (!roles.length || roles.includes(u.role))).map((u) => u.upn);
        if (!recipients.length) throw new Response("The selected audience has no users.", { status: 400 });
    }
    const { attachment, ...policy } = await supabaseRequest<Policy & { attachment: PolicyAttachment | null }>("rpc/publish_policy", {
        method: "POST", body: { p_id: input.id ?? null, p_version: input.expectedVersion ?? null, p_new_version: input.version ?? 1,
            p_roles: roles, p_employee_types: employeeTypes, p_departments: departments, p_users: users, p_recipients: recipients,
            p_attachment: input.attachment ?? null, p_title: input.title, p_body: input.body, p_actor: upn.trim().toLowerCase() },
    });
    return { ...policy, attachment_name: attachment?.name ?? null };
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

export async function downloadPolicyAttachment(id: string, upn: string, canModify: boolean) {
    const [policy] = await supabaseRequest<{ recipient_upns: string[] | null; attachment: PolicyAttachment | null }[]>("policies", {
        query: { select: "recipient_upns,attachment", id: `eq.${id}`, limit: 1 },
    });
    if (!policy) throw new Response("Policy not found", { status: 404 });
    if (!canModify && policy.recipient_upns != null && !policy.recipient_upns.includes(upn.trim().toLowerCase())) {
        throw new Response("Policy is not assigned to you.", { status: 403 });
    }
    if (!policy.attachment) throw new Response("No attachment found", { status: 404 });
    return policy.attachment;
}
