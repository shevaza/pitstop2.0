import { getModuleAccessDetails, saveModuleAccess } from "@/lib/module-access";
import { assertModuleAccess } from "@/lib/module-auth";
import {
    appModules,
    getDefaultModuleAccess,
    getDefaultModuleAccessLevels,
    isAppModuleKey,
    normalizeModuleAccessLevel,
    type AppModuleKey,
    type ModuleAccessLevel,
} from "@/lib/modules";
import { assetGroups, normalizeAssetGroups } from "@/lib/asset-groups";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const payloadSchema = z.object({
    userPrincipalName: z.string().email(),
    displayName: z.string().trim().optional().nullable(),
    access: z.record(z.string(), z.boolean()).optional(),
    accessLevel: z.record(z.string(), z.enum(["none", "read", "modify"])).optional(),
    assetGroups: z.array(z.enum(assetGroups)).optional(),
});

async function assertAuthorized(requiredLevel: "read" | "modify" = "read") {
    return assertModuleAccess("user-access", requiredLevel);
}

export async function GET(req: Request) {
    try {
        await assertAuthorized();

        const { searchParams } = new URL(req.url);
        const userPrincipalName = (searchParams.get("userPrincipalName") || "").trim();
        if (!userPrincipalName) {
            return Response.json({
                access: getDefaultModuleAccess(),
                accessLevel: getDefaultModuleAccessLevels(),
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
        const actorUpn = await assertAuthorized("modify");
        const parsed = payloadSchema.parse(await req.json());

        const nextAccessLevel = Object.fromEntries(
            appModules.map((module) => {
                const levelFromPayload = parsed.accessLevel?.[module.key];
                const fallbackLevel = parsed.access?.[module.key] ? "modify" : "none";
                return [
                    module.key,
                    isAppModuleKey(module.key) ? normalizeModuleAccessLevel(levelFromPayload ?? fallbackLevel) : "none",
                ];
            }),
        ) as Record<AppModuleKey, ModuleAccessLevel>;

        const nextAccess = Object.fromEntries(
            appModules.map((module) => [module.key, nextAccessLevel[module.key] !== "none"]),
        ) as Record<AppModuleKey, boolean>;

        if (
            parsed.userPrincipalName.trim().toLowerCase() === actorUpn.trim().toLowerCase() &&
            nextAccessLevel["user-access"] !== "modify"
        ) {
            return new Response("You cannot remove your own User Access modify permission.", { status: 400 });
        }

        const nextAssetGroups = normalizeAssetGroups(parsed.assetGroups);
        if (nextAccess.assets && !nextAssetGroups.length) {
            return new Response("Select at least one asset group for Assets Management access.", { status: 400 });
        }

        await saveModuleAccess({
            userPrincipalName: parsed.userPrincipalName,
            displayName: parsed.displayName,
            updatedByUpn: actorUpn,
            accessLevel: nextAccessLevel,
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
