import { assertPolicyUser, requiredPolicies } from "@/lib/policy-enforcement";
import { policyError } from "@/lib/policies";
export const dynamic = "force-dynamic";
export async function GET() {
    try {
        const upn = await assertPolicyUser();
        return Response.json({ policies: await requiredPolicies(upn) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { return policyError(error); }
}
