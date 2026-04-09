import { auth } from "@/lib/auth";
import { getModuleAccessMap } from "@/lib/module-access";
import { appModules } from "@/lib/modules";
import { isAllowed } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    const session = await auth();
    const upn = (session as { upn?: string } | null)?.upn;

    if (!upn || !(await isAllowed(upn))) {
        return new Response("Forbidden", { status: 403 });
    }

    const access = await getModuleAccessMap(upn);
    return Response.json({
        access,
        modules: appModules,
    });
}
