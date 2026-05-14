import { graphFetch } from "@/lib/graph";
import { supabaseRequest } from "@/lib/supabase-admin";
import { canAccessAssetGroup, type AssetGroup } from "@/lib/asset-groups";

export type AssetUserSnapshot = {
    id?: string;
    azure_user_id?: string | null;
    user_principal_name: string;
    display_name?: string | null;
    given_name?: string | null;
    surname?: string | null;
    job_title?: string | null;
    department?: string | null;
    office_location?: string | null;
    mobile_phone?: string | null;
    employee_id?: string | null;
    employee_type?: string | null;
    usage_location?: string | null;
    account_enabled?: boolean | null;
    source?: string | null;
    last_synced_at?: string | null;
    created_at?: string;
    updated_at?: string;
};

export type AssetRecord = {
    id: string;
    asset_tag: string;
    name: string;
    asset_group?: string | null;
    asset_type: string;
    status: string;
    quantity?: number | null;
    location?: string | null;
    serial_number?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    notes?: string | null;
    assigned_user_id?: string | null;
    created_by_upn: string;
    updated_by_upn: string;
    created_at: string;
    updated_at: string;
    assigned_user?: AssetUserSnapshot | null;
};

export type AssetActivityChange = {
    field: string;
    label: string;
    from: string | number | null;
    to: string | number | null;
};

export type AssetActivityLog = {
    id: string;
    asset_id: string;
    action: "created" | "updated";
    actor_upn: string;
    summary: string;
    changes: AssetActivityChange[];
    created_at: string;
};

export type DirectoryUser = {
    id: string;
    userPrincipalName: string;
    displayName?: string;
    givenName?: string;
    surname?: string;
    jobTitle?: string;
    department?: string;
    officeLocation?: string;
    mobilePhone?: string;
    employeeId?: string;
    employeeType?: string;
    usageLocation?: string;
    accountEnabled?: boolean;
};

export function toAssetUserSnapshot(user: Partial<DirectoryUser>): AssetUserSnapshot {
    return {
        azure_user_id: user.id ?? null,
        user_principal_name: user.userPrincipalName ?? "",
        display_name: user.displayName ?? null,
        given_name: user.givenName ?? null,
        surname: user.surname ?? null,
        job_title: user.jobTitle ?? null,
        department: user.department ?? null,
        office_location: user.officeLocation ?? null,
        mobile_phone: user.mobilePhone ?? null,
        employee_id: user.employeeId ?? null,
        employee_type: user.employeeType ?? null,
        usage_location: user.usageLocation ?? null,
        account_enabled: user.accountEnabled ?? null,
        source: user.id ? "azure" : "asset-module",
        last_synced_at: new Date().toISOString(),
    };
}

export async function upsertAssetUserSnapshot(user: Partial<DirectoryUser>) {
    const snapshot = toAssetUserSnapshot(user);
    if (!snapshot.user_principal_name) {
        throw new Error("userPrincipalName is required to save an asset user snapshot");
    }

    const [saved] = await supabaseRequest<AssetUserSnapshot[]>("asset_users", {
        method: "POST",
        query: {
            on_conflict: "user_principal_name",
            select: "*",
        },
        headers: {
            Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: snapshot,
    });

    return saved;
}

export async function listAssets(allowedGroups?: readonly AssetGroup[]) {
    const items = await supabaseRequest<AssetRecord[]>("assets", {
        query: {
            select: "*,assigned_user:asset_users!assets_assigned_user_id_fkey(*)",
            order: "created_at.desc",
        },
    });

    if (!allowedGroups) return items;
    return items.filter((asset) => canAccessAssetGroup(asset.asset_group, allowedGroups));
}

export async function getAssetById(id: string) {
    const items = await supabaseRequest<AssetRecord[]>("assets", {
        query: {
            select: "*,assigned_user:asset_users!assets_assigned_user_id_fkey(*)",
            id: `eq.${id}`,
            limit: 1,
        },
    });

    return items[0] ?? null;
}

export async function listAssetActivityLogs(assetId: string) {
    return supabaseRequest<AssetActivityLog[]>("asset_activity_logs", {
        query: {
            select: "*",
            asset_id: `eq.${assetId}`,
            order: "created_at.desc",
        },
    });
}

async function resolveAssignedUserId(assignedUser?: Partial<DirectoryUser> | null) {
    if (!assignedUser?.userPrincipalName) {
        return null;
    }

    const savedUser = await upsertAssetUserSnapshot(assignedUser);
    return savedUser.id ?? null;
}

function userLabel(user?: AssetUserSnapshot | null) {
    if (!user) return null;
    return user.display_name || user.user_principal_name || null;
}

function normalizeLogValue(value: unknown) {
    if (value === undefined || value === "") return null;
    if (typeof value === "string" || typeof value === "number") return value;
    if (value === null) return null;
    return String(value);
}

function buildAssetChanges(before: AssetRecord | null, after: AssetRecord) {
    const fields: Array<{
        field: keyof AssetRecord | "assigned_owner";
        label: string;
        before: string | number | null | undefined;
        after: string | number | null | undefined;
    }> = [
        { field: "asset_tag", label: "Asset Tag", before: before?.asset_tag, after: after.asset_tag },
        { field: "name", label: "Name", before: before?.name, after: after.name },
        { field: "asset_group", label: "Group", before: before?.asset_group, after: after.asset_group },
        { field: "asset_type", label: "Type", before: before?.asset_type, after: after.asset_type },
        { field: "status", label: "Status", before: before?.status, after: after.status },
        { field: "quantity", label: "Quantity", before: before?.quantity, after: after.quantity },
        { field: "location", label: "Location", before: before?.location, after: after.location },
        { field: "serial_number", label: "Serial Number", before: before?.serial_number, after: after.serial_number },
        { field: "manufacturer", label: "Manufacturer", before: before?.manufacturer, after: after.manufacturer },
        { field: "model", label: "Model", before: before?.model, after: after.model },
        { field: "assigned_owner", label: "Owner", before: userLabel(before?.assigned_user), after: userLabel(after.assigned_user) },
        { field: "notes", label: "Notes", before: before?.notes, after: after.notes },
    ];

    return fields.reduce<AssetActivityChange[]>((changes, field) => {
        const from = normalizeLogValue(field.before);
        const to = normalizeLogValue(field.after);
        if (from !== to) {
            changes.push({
                field: String(field.field),
                label: field.label,
                from,
                to,
            });
        }
        return changes;
    }, []);
}

async function createAssetActivityLog(input: {
    asset: AssetRecord;
    before: AssetRecord | null;
    action: AssetActivityLog["action"];
    actorUpn: string;
}) {
    const changes = buildAssetChanges(input.before, input.asset);
    const summary = input.action === "created"
        ? "Asset created"
        : changes.length
            ? `${changes.length} field${changes.length === 1 ? "" : "s"} updated`
            : "Asset saved without tracked changes";

    const [log] = await supabaseRequest<AssetActivityLog[]>("asset_activity_logs", {
        method: "POST",
        query: {
            select: "*",
        },
        headers: {
            Prefer: "return=representation",
        },
        body: {
            asset_id: input.asset.id,
            action: input.action,
            actor_upn: input.actorUpn,
            summary,
            changes,
        },
    });

    return log;
}

export async function createAsset(input: {
    assetTag: string;
    name: string;
    assetGroup?: string | null;
    assetType: string;
    status: string;
    quantity?: number | null;
    location?: string | null;
    serialNumber?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    notes?: string | null;
    assignedUser?: Partial<DirectoryUser> | null;
    actorUpn: string;
}) {
    const assignedUserId = await resolveAssignedUserId(input.assignedUser);

    const [created] = await supabaseRequest<AssetRecord[]>("assets", {
        method: "POST",
        query: {
            select: "*,assigned_user:asset_users!assets_assigned_user_id_fkey(*)",
        },
        headers: {
            Prefer: "return=representation",
        },
        body: {
            asset_tag: input.assetTag,
            name: input.name,
            asset_group: input.assetGroup ?? null,
            asset_type: input.assetType,
            status: input.status,
            quantity: input.quantity ?? 1,
            location: input.location ?? null,
            serial_number: input.serialNumber ?? null,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            notes: input.notes ?? null,
            assigned_user_id: assignedUserId,
            created_by_upn: input.actorUpn,
            updated_by_upn: input.actorUpn,
        },
    });

    await createAssetActivityLog({
        asset: created,
        before: null,
        action: "created",
        actorUpn: input.actorUpn,
    });

    return created;
}

export async function updateAsset(id: string, input: {
    assetTag: string;
    name: string;
    assetGroup?: string | null;
    assetType: string;
    status: string;
    quantity?: number | null;
    location?: string | null;
    serialNumber?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    notes?: string | null;
    assignedUser?: Partial<DirectoryUser> | null;
    actorUpn: string;
}) {
    const existing = await getAssetById(id);
    const assignedUserId = await resolveAssignedUserId(input.assignedUser);

    const [updated] = await supabaseRequest<AssetRecord[]>("assets", {
        method: "PATCH",
        query: {
            select: "*,assigned_user:asset_users!assets_assigned_user_id_fkey(*)",
            id: `eq.${id}`,
        },
        headers: {
            Prefer: "return=representation",
        },
        body: {
            asset_tag: input.assetTag,
            name: input.name,
            asset_group: input.assetGroup ?? null,
            asset_type: input.assetType,
            status: input.status,
            quantity: input.quantity ?? 1,
            location: input.location ?? null,
            serial_number: input.serialNumber ?? null,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            notes: input.notes ?? null,
            assigned_user_id: assignedUserId,
            updated_by_upn: input.actorUpn,
        },
    });

    if (updated) {
        await createAssetActivityLog({
            asset: updated,
            before: existing,
            action: "updated",
            actorUpn: input.actorUpn,
        });
    }

    return updated ?? null;
}

export async function deleteAsset(id: string) {
    await supabaseRequest<null>("assets", {
        method: "DELETE",
        query: {
            id: `eq.${id}`,
        },
        headers: {
            Prefer: "return=minimal",
        },
    });
}

export async function searchCachedAssetUsers(search: string) {
    const term = search.trim();
    const filter = term
        ? `or=(display_name.ilike.*${escapePostgrestLike(term)}*,user_principal_name.ilike.*${escapePostgrestLike(term)}*)`
        : "";

    const path = `asset_users?select=*&order=display_name.asc${filter ? `&${filter}` : ""}`;
    return supabaseRequest<AssetUserSnapshot[]>(path);
}

function escapePostgrestLike(value: string) {
    return value.replace(/[%*,()]/g, "");
}

export async function searchAssetUsers(search: string) {
    const term = search.trim();

    try {
        const select =
            "$select=id,displayName,givenName,surname,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,employeeId,employeeType,usageLocation,accountEnabled";
        let path = `/users?${select}&$top=25`;
        if (term) {
            const sanitized = term.replace(/'/g, "''");
            path += `&$filter=startswith(displayName,'${sanitized}') or startswith(userPrincipalName,'${sanitized}')`;
        }

        const data = await graphFetch<{ value?: DirectoryUser[] }>(path);
        const users = data.value ?? [];

        return {
            source: "azure" as const,
            items: users,
        };
    } catch (error) {
        console.error("Falling back to cached Supabase users for asset lookup", error);
        const items = await searchCachedAssetUsers(term);
        return {
            source: "supabase" as const,
            items: items.map((user) => ({
                id: user.azure_user_id || user.id || user.user_principal_name,
                userPrincipalName: user.user_principal_name,
                displayName: user.display_name ?? undefined,
                givenName: user.given_name ?? undefined,
                surname: user.surname ?? undefined,
                jobTitle: user.job_title ?? undefined,
                department: user.department ?? undefined,
                officeLocation: user.office_location ?? undefined,
                mobilePhone: user.mobile_phone ?? undefined,
                employeeId: user.employee_id ?? undefined,
                employeeType: user.employee_type ?? undefined,
                usageLocation: user.usage_location ?? undefined,
                accountEnabled: user.account_enabled ?? undefined,
            })),
        };
    }
}
