import { isAllowed } from "@/lib/rbac";
import { supabaseRequest } from "@/lib/supabase-admin";
import { appModules, getDefaultModuleAccess, type AppModuleKey } from "@/lib/modules";
import { assetGroups, normalizeAssetGroups, type AssetGroup } from "@/lib/asset-groups";

type ModuleAccessRow = {
    user_principal_name: string;
    display_name: string | null;
    module_key: AppModuleKey;
    allowed: boolean;
    asset_groups?: AssetGroup[] | null;
    updated_by_upn: string | null;
    updated_at: string;
};

type SaveModuleAccessInput = {
    userPrincipalName: string;
    displayName?: string | null;
    updatedByUpn?: string | null;
    access: Record<AppModuleKey, boolean>;
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

    try {
        return await supabaseRequest<ModuleAccessRow[]>("user_module_access", {
            query: {
                ...baseQuery,
                select: "user_principal_name,display_name,module_key,allowed,asset_groups,updated_by_upn,updated_at",
            },
        });
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("asset_groups")) {
            throw error;
        }

        return supabaseRequest<ModuleAccessRow[]>("user_module_access", {
            query: {
                ...baseQuery,
                select: "user_principal_name,display_name,module_key,allowed,updated_by_upn,updated_at",
            },
        });
    }
}

export async function getModuleAccessDetails(userPrincipalName: string) {
    const rows = await listModuleAccessRows(userPrincipalName);
    if (!rows.length) {
        return {
            access: getDefaultModuleAccess(),
            assetGroups: [...assetGroups],
        };
    }

    const access = Object.fromEntries(appModules.map((module) => [module.key, false])) as Record<AppModuleKey, boolean>;
    let allowedAssetGroups: AssetGroup[] = [...assetGroups];

    for (const row of rows) {
        access[row.module_key] = row.allowed;
        if (row.module_key === "assets" && row.allowed) {
            allowedAssetGroups = normalizeAssetGroups(row.asset_groups);
        }
    }

    return {
        access,
        assetGroups: allowedAssetGroups.length ? allowedAssetGroups : [...assetGroups],
    };
}

export async function getModuleAccessMap(userPrincipalName: string) {
    const details = await getModuleAccessDetails(userPrincipalName);
    return details.access;
}

export async function saveModuleAccess(input: SaveModuleAccessInput) {
    const normalizedUpn = normalizeUpn(input.userPrincipalName);
    const rows = appModules.map((module) => ({
        user_principal_name: normalizedUpn,
        display_name: input.displayName?.trim() || null,
        module_key: module.key,
        allowed: Boolean(input.access[module.key]),
        asset_groups: module.key === "assets" && input.access.assets ? normalizeAssetGroups(input.assetGroups) : null,
        updated_by_upn: input.updatedByUpn?.trim().toLowerCase() || null,
    }));

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
    if (!(await isAllowed(userPrincipalName))) {
        return false;
    }

    const access = await getModuleAccessMap(userPrincipalName);
    return access[moduleKey] === true;
}
