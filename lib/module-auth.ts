import { auth } from "@/lib/auth";
import { canAccessModule } from "@/lib/module-access";
import type { AppModuleKey } from "@/lib/modules";

export async function assertModuleAccess(moduleKey: AppModuleKey) {
    const session = await auth();
    const upn = (session as { upn?: string } | null)?.upn;

    if (!upn || !(await canAccessModule(upn, moduleKey))) {
        throw new Response("Forbidden", { status: 403 });
    }

    return upn;
}
