import { getRequestIdentity } from "@/lib/request-auth";
import { isAllowed } from "@/lib/rbac";
import { listPolicies } from "@/lib/policies";

export async function assertPolicyUser() {
    const identity = await getRequestIdentity();
    if (!identity?.upn || !await isAllowed(identity.upn)) throw new Response("Forbidden", { status: 403 });
    return identity.upn;
}

export async function requiredPolicies(upn: string) {
    return (await listPolicies(upn)).filter((policy) => policy.requires_acknowledgement && !policy.acknowledged_at);
}

export async function assertPoliciesAcknowledged(upn: string) {
    try {
        const pending = await requiredPolicies(upn);
        if (pending.length) throw new Response("Acknowledge all pending policies before continuing.", { status: 428, headers: { "X-Policy-Acknowledgement-Required": "true" } });
    } catch (error) {
        if (error instanceof Response) throw error;
        console.error("Policy acknowledgement check failed", error);
        throw new Response("Unable to verify required policies. Please try again.", { status: 503 });
    }
}
