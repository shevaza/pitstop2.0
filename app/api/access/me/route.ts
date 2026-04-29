import { getModuleAccessDetails } from "@/lib/module-access";
import { appModules } from "@/lib/modules";
import { getRequestIdentity } from "@/lib/request-auth";
import { isAllowed } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    const identity = await getRequestIdentity();
    const upn = identity?.upn;

    if (!upn || !(await isAllowed(upn))) {
        return new Response("Forbidden", { status: 403 });
    }

    const { access, assetGroups } = await getModuleAccessDetails(upn);
    return Response.json({
        access,
        assetGroups,
        modules: appModules,
    });
}
