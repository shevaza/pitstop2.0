import { canAccessModuleWithLevel } from "@/lib/module-access";
import type { AppModuleKey, ModuleAccessLevel } from "@/lib/modules";
import { getRequestIdentity } from "@/lib/request-auth";

export async function assertModuleAccess(moduleKey: AppModuleKey, requiredLevel: Exclude<ModuleAccessLevel, "none"> = "read") {
    const identity = await getRequestIdentity();
    const upn = identity?.upn;

    if (!upn || !(await canAccessModuleWithLevel(upn, moduleKey, requiredLevel))) {
        throw new Response("Forbidden", { status: 403 });
    }

    return upn;
}
