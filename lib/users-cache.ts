import { graphFetch } from "@/lib/graph";
import { supabaseRequest } from "@/lib/supabase-admin";

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

export type CachedUserRecord = {
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

export type GraphUsersPage = {
    value?: DirectoryUser[];
    "@odata.nextLink"?: string;
};

const USER_SELECT =
    "$select=id,displayName,givenName,surname,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,employeeId,employeeType,usageLocation,accountEnabled";

const SYNC_BATCH_SIZE = 250;

export function buildAzureUsersPath(params: {
    top: number;
    search?: string;
    skiptoken?: string | null;
}) {
    let path = `/users?${USER_SELECT}&$top=${params.top}`;

    if (params.search) {
        const sanitized = params.search.replace(/'/g, "''");
        path += `&$filter=startswith(displayName,'${sanitized}') or userPrincipalName eq '${sanitized}'`;
    }

    if (params.skiptoken) {
        path += `&$skiptoken=${encodeURIComponent(params.skiptoken)}`;
    }

    return path;
}

function toCachedUserRecord(user: DirectoryUser, syncedAt: string): CachedUserRecord {
    return {
        azure_user_id: user.id ?? null,
        user_principal_name: user.userPrincipalName,
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
        source: "azure",
        last_synced_at: syncedAt,
    };
}

function toRelativeGraphPath(nextLink: string) {
    const url = new URL(nextLink);
    return `${url.pathname}${url.search}`.replace(/^\/v1\.0/, "");
}

async function upsertCachedUserBatch(users: DirectoryUser[], syncedAt: string) {
    if (!users.length) return 0;

    const rows = users
        .filter((user) => user.userPrincipalName)
        .map((user) => toCachedUserRecord(user, syncedAt));

    if (!rows.length) return 0;

    await supabaseRequest<CachedUserRecord[]>("users", {
        method: "POST",
        query: {
            on_conflict: "user_principal_name",
            select: "id",
        },
        headers: {
            Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: rows,
    });

    return rows.length;
}

async function deleteStaleCachedUsers(syncedAt: string) {
    await supabaseRequest<null>("users", {
        method: "DELETE",
        query: {
            last_synced_at: `lt.${syncedAt}`,
        },
        headers: {
            Prefer: "return=minimal",
        },
    });
}

export async function syncUsersFromAzureToSupabase() {
    const syncedAt = new Date().toISOString();
    let path = buildAzureUsersPath({ top: 500 });
    let fetched = 0;
    let upserted = 0;
    let pages = 0;

    while (path) {
        const data = await graphFetch<GraphUsersPage>(path);
        const users = data.value ?? [];
        fetched += users.length;
        pages += 1;

        for (let index = 0; index < users.length; index += SYNC_BATCH_SIZE) {
            upserted += await upsertCachedUserBatch(users.slice(index, index + SYNC_BATCH_SIZE), syncedAt);
        }

        path = data["@odata.nextLink"] ? toRelativeGraphPath(data["@odata.nextLink"]) : "";
    }

    await deleteStaleCachedUsers(syncedAt);

    return {
        fetched,
        upserted,
        pages,
        syncedAt,
    };
}
