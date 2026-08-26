import { getModuleAccessDetails, patchModuleAccessForUsers, saveModuleAccess } from "@/lib/module-access";
import { assertModuleAccess } from "@/lib/module-auth";
import { graphFetch } from "@/lib/graph";
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

const bulkPayloadSchema = z.object({
    changes: z.record(z.string(), z.enum(["none", "read", "modify"])),
    assetGroups: z.array(z.enum(assetGroups)).optional(),
});

type GraphUsersPage = {
    value?: Array<{ userPrincipalName?: string; displayName?: string; userType?: string }>;
    "@odata.nextLink"?: string;
};

async function listActiveEmployees() {
    const users: Array<{ userPrincipalName: string; displayName?: string }> = [];
    let path: string | undefined = "/users?$select=userPrincipalName,displayName,userType&$filter=accountEnabled eq true&$top=999";

    while (path) {
        const page: GraphUsersPage = await graphFetch<GraphUsersPage>(path);
        for (const user of page.value || []) {
            if (user.userPrincipalName && (user.userType ?? "Member") === "Member") {
                users.push({ userPrincipalName: user.userPrincipalName, displayName: user.displayName });
            }
        }
        const nextLink: string | undefined = page["@odata.nextLink"];
        path = nextLink ? `${new URL(nextLink).pathname.replace("/v1.0", "")}${new URL(nextLink).search}` : undefined;
    }

    return users;
}

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

export async function PATCH(req: Request) {
    try {
        const actorUpn = await assertAuthorized("modify");
        const parsed = bulkPayloadSchema.parse(await req.json());
        const changes = Object.entries(parsed.changes).filter(
            (entry): entry is [AppModuleKey, ModuleAccessLevel] => isAppModuleKey(entry[0]),
        );
        if (!changes.length) return new Response("Choose at least one module to update.", { status: 400 });

        const assetChange = changes.find(([moduleKey]) => moduleKey === "assets");
        if (assetChange && assetChange[1] !== "none" && !normalizeAssetGroups(parsed.assetGroups).length) {
            return new Response("Select at least one asset group for Assets Management access.", { status: 400 });
        }

        const users = await listActiveEmployees();
        for (const [moduleKey, level] of changes) {
            // Preserve the current administrator's ability to administer access.
            const targets = moduleKey === "user-access" && level !== "modify"
                ? users.filter((user) => user.userPrincipalName.toLowerCase() !== actorUpn.toLowerCase())
                : users;
            await patchModuleAccessForUsers(targets, moduleKey, level, actorUpn, parsed.assetGroups);
        }

        return Response.json({ updatedUsers: users.length, updatedModules: changes.length });
    } catch (error) {
        if (error instanceof Response) return error;
        if (error instanceof z.ZodError) return new Response(JSON.stringify(error.flatten()), { status: 400 });
        console.error("PATCH /api/user-access failed", error);
        return new Response("Failed to update access for all employees", { status: 500 });
    }
}
