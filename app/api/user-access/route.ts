import { getModuleAccessDetails, saveModuleAccess } from "@/lib/module-access";
import { assertModuleAccess } from "@/lib/module-auth";
import { appModules, getDefaultModuleAccess, isAppModuleKey, type AppModuleKey } from "@/lib/modules";
import { assetGroups, normalizeAssetGroups } from "@/lib/asset-groups";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
    userPrincipalName: z.string().email(),
    displayName: z.string().trim().optional().nullable(),
    access: z.record(z.string(), z.boolean()),
    assetGroups: z.array(z.enum(assetGroups)).optional(),
});

async function assertAuthorized() {
    return assertModuleAccess("user-access");
}

export async function GET(req: Request) {
    try {
        await assertAuthorized();

        const { searchParams } = new URL(req.url);
        const userPrincipalName = (searchParams.get("userPrincipalName") || "").trim();
        if (!userPrincipalName) {
            return Response.json({
                access: getDefaultModuleAccess(),
                assetGroups,
                modules: appModules,
            });
        }

        const details = await getModuleAccessDetails(userPrincipalName);
        return Response.json({ ...details, modules: appModules });
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("GET /api/user-access failed", error);
        return new Response("Failed to load user access", { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const actorUpn = await assertAuthorized();
        const parsed = payloadSchema.parse(await req.json());

        const nextAccess = Object.fromEntries(
            appModules.map((module) => [
                module.key,
                isAppModuleKey(module.key) ? Boolean(parsed.access[module.key]) : false,
            ]),
        ) as Record<AppModuleKey, boolean>;

        if (
            parsed.userPrincipalName.trim().toLowerCase() === actorUpn.trim().toLowerCase() &&
            !nextAccess["user-access"]
        ) {
            return new Response("You cannot remove your own User Access permission.", { status: 400 });
        }

        const nextAssetGroups = normalizeAssetGroups(parsed.assetGroups);
        if (nextAccess.assets && !nextAssetGroups.length) {
            return new Response("Select at least one asset group for Assets Management access.", { status: 400 });
        }

        await saveModuleAccess({
            userPrincipalName: parsed.userPrincipalName,
            displayName: parsed.displayName,
            updatedByUpn: actorUpn,
            access: nextAccess,
            assetGroups: nextAssetGroups,
        });

        const details = await getModuleAccessDetails(parsed.userPrincipalName);
        return Response.json({ ...details, modules: appModules });
    } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError) {
            return new Response(JSON.stringify(error.flatten()), { status: 400 });
        }
        console.error("POST /api/user-access failed", error);
        return new Response("Failed to save user access", { status: 500 });
    }
}
