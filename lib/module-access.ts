import { isAllowed } from "@/lib/rbac";
import { supabaseRequest } from "@/lib/supabase-admin";
import {
    appModules,
    getDefaultModuleAccess,
    getDefaultModuleAccessLevels,
    moduleAccessLevelAllows,
    normalizeModuleAccessLevel,
    type AppModuleKey,
    type ModuleAccessLevel,
} from "@/lib/modules";
import { assetGroups, normalizeAssetGroups, type AssetGroup } from "@/lib/asset-groups";

type ModuleAccessRow = {
    user_principal_name: string;
    display_name: string | null;
    module_key: AppModuleKey;
    allowed: boolean;
    access_level?: ModuleAccessLevel | null;
    asset_groups?: AssetGroup[] | null;
    updated_by_upn: string | null;
    updated_at: string;
};

type SaveModuleAccessInput = {
    userPrincipalName: string;
    displayName?: string | null;
    updatedByUpn?: string | null;
    access?: Record<AppModuleKey, boolean>;
    accessLevel?: Record<AppModuleKey, ModuleAccessLevel>;
    assetGroups?: AssetGroup[];
};

function normalizeUpn(value: string) {
    return value.trim().toLowerCase();
}

export async function listModuleAccessRows(userPrincipalName: string) {
    const normalizedUpn = normalizeUpn(userPrincipalName);
    const moduleKeys = appModules.map((module) => module.key).join(",");

    const baseQuery = {
        user_principal_name: `eq.${normalizedUpn}`,
        module_key: `in.(${moduleKeys})`,
        order: "module_key.asc",
    };

    const selectRows = (select: string) => supabaseRequest<ModuleAccessRow[]>("user_module_access", {
        query: {
            ...baseQuery,
            select,
        },
    });

    try {
        return await selectRows("user_principal_name,display_name,module_key,allowed,access_level,asset_groups,updated_by_upn,updated_at");
    } catch (error) {
        if (!(error instanceof Error)) {
            throw error;
        }

        if (error.message.includes("access_level")) {
            try {
                return await selectRows("user_principal_name,display_name,module_key,allowed,asset_groups,updated_by_upn,updated_at");
            } catch (fallbackError) {
                if (!(fallbackError instanceof Error) || !fallbackError.message.includes("asset_groups")) {
                    throw fallbackError;
                }

                return selectRows("user_principal_name,display_name,module_key,allowed,updated_by_upn,updated_at");
            }
        }

        if (error.message.includes("asset_groups")) {
            try {
                return await selectRows("user_principal_name,display_name,module_key,allowed,access_level,updated_by_upn,updated_at");
            } catch (fallbackError) {
                if (!(fallbackError instanceof Error) || !fallbackError.message.includes("access_level")) {
                    throw fallbackError;
                }

                return selectRows("user_principal_name,display_name,module_key,allowed,updated_by_upn,updated_at");
            }
        }

        throw error;
    }
}

export async function getModuleAccessDetails(userPrincipalName: string) {
    const rows = await listModuleAccessRows(userPrincipalName);
    if (!rows.length) {
        return {
            access: getDefaultModuleAccess(),
            accessLevel: getDefaultModuleAccessLevels(),
            assetGroups: [...assetGroups],
        };
    }

    const access = Object.fromEntries(appModules.map((module) => [module.key, false])) as Record<AppModuleKey, boolean>;
    const accessLevel = getDefaultModuleAccessLevels();
    let allowedAssetGroups: AssetGroup[] = [...assetGroups];

    for (const row of rows) {
        const level = row.access_level ? normalizeModuleAccessLevel(row.access_level) : row.allowed ? "modify" : "none";
        accessLevel[row.module_key] = level;
        access[row.module_key] = level !== "none";
        if (row.module_key === "assets" && level !== "none") {
            allowedAssetGroups = normalizeAssetGroups(row.asset_groups);
        }
    }

    return {
        access,
        accessLevel,
        assetGroups: allowedAssetGroups.length ? allowedAssetGroups : [...assetGroups],
    };
}

export async function getModuleAccessMap(userPrincipalName: string) {
    const details = await getModuleAccessDetails(userPrincipalName);
    return details.access;
}

export async function getModuleAccessLevelMap(userPrincipalName: string) {
    const details = await getModuleAccessDetails(userPrincipalName);
    return details.accessLevel;
}

export async function saveModuleAccess(input: SaveModuleAccessInput) {
    const normalizedUpn = normalizeUpn(input.userPrincipalName);
    const accessLevel = input.accessLevel ?? Object.fromEntries(
        appModules.map((module) => [module.key, input.access?.[module.key] ? "modify" : "none"]),
    ) as Record<AppModuleKey, ModuleAccessLevel>;
    const rows = appModules.map((module) => {
        const level = normalizeModuleAccessLevel(accessLevel[module.key]);
        return ({
            user_principal_name: normalizedUpn,
            display_name: input.displayName?.trim() || null,
            module_key: module.key,
            allowed: level !== "none",
            access_level: level,
            asset_groups: module.key === "assets" && level !== "none" ? normalizeAssetGroups(input.assetGroups) : null,
            updated_by_upn: input.updatedByUpn?.trim().toLowerCase() || null,
        });
    });

    await supabaseRequest<ModuleAccessRow[]>("user_module_access", {
        method: "POST",
        body: rows,
        query: {
            on_conflict: "user_principal_name,module_key",
        },
        headers: {
            Prefer: "resolution=merge-duplicates,return=representation",
        },
    });

    return getModuleAccessMap(normalizedUpn);
}

export async function canAccessModule(userPrincipalName: string, moduleKey: AppModuleKey) {
    return canAccessModuleWithLevel(userPrincipalName, moduleKey, "read");
}

export async function canAccessModuleWithLevel(
    userPrincipalName: string,
    moduleKey: AppModuleKey,
    requiredLevel: Exclude<ModuleAccessLevel, "none"> = "read",
) {
    if (!(await isAllowed(userPrincipalName))) {
        return false;
    }

    const accessLevel = await getModuleAccessLevelMap(userPrincipalName);
    return moduleAccessLevelAllows(accessLevel[moduleKey], requiredLevel);
}
