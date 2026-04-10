import { canAccessModule } from "@/lib/module-access";
import type { AppModuleKey } from "@/lib/modules";
import { getRequestIdentity } from "@/lib/request-auth";

export async function assertModuleAccess(moduleKey: AppModuleKey) {
    const identity = await getRequestIdentity();
    const upn = identity?.upn;

    if (!upn || !(await canAccessModule(upn, moduleKey))) {
        throw new Response("Forbidden", { status: 403 });
    }

    return upn;
}
