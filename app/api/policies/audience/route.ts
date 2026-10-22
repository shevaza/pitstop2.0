import { assertModuleAccess } from "@/lib/module-auth";
import { getPolicyAudience } from "@/lib/policy-audience";
import { policyError } from "@/lib/policies";
export const dynamic = "force-dynamic";
export async function GET() {
    try {
        await assertModuleAccess("policies", "modify");
        return Response.json(await getPolicyAudience());
    } catch (error) { return policyError(error); }
}
