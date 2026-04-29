"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { assetGroups } from "@/lib/asset-groups";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type AssetUser = {
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

type Asset = {
    id: string;
    asset_tag: string;
    name: string;
    asset_group?: string | null;
    asset_type: string;
    status: string;
    serial_number?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    notes?: string | null;
    created_at: string;
    assigned_user?: {
        azure_user_id?: string | null;
        id?: string;
        user_principal_name: string;
        display_name?: string | null;
        given_name?: string | null;
        surname?: string | null;
        department?: string | null;
        job_title?: string | null;
        office_location?: string | null;
        mobile_phone?: string | null;
        employee_id?: string | null;
        employee_type?: string | null;
        usage_location?: string | null;
        account_enabled?: boolean | null;
        last_synced_at?: string | null;
    } | null;
};

type FormState = {
    assetTag: string;
    name: string;
    assetGroup: string;
    assetType: string;
    status: string;
    serialNumber: string;
    manufacturer: string;
    model: string;
    notes: string;
};

const STATUSES = ["active", "in-stock", "repair", "retired"];

function toFormState(asset: Asset, allowedGroups: string[]): FormState {
    return {
        assetTag: asset.asset_tag,
        name: asset.name,
        assetGroup: asset.asset_group ?? allowedGroups[0] ?? assetGroups[0],
        assetType: asset.asset_type,
        status: asset.status,
        serialNumber: asset.serial_number ?? "",
        manufacturer: asset.manufacturer ?? "",
        model: asset.model ?? "",
        notes: asset.notes ?? "",
    };
}

function toSelectedUser(asset: Asset): AssetUser | null {
    if (!asset.assigned_user) return null;
    return {
        id: asset.assigned_user.azure_user_id || asset.assigned_user.id || asset.assigned_user.user_principal_name,
        userPrincipalName: asset.assigned_user.user_principal_name,
        displayName: asset.assigned_user.display_name ?? undefined,
        givenName: asset.assigned_user.given_name ?? undefined,
        surname: asset.assigned_user.surname ?? undefined,
        jobTitle: asset.assigned_user.job_title ?? undefined,
        department: asset.assigned_user.department ?? undefined,
        officeLocation: asset.assigned_user.office_location ?? undefined,
        mobilePhone: asset.assigned_user.mobile_phone ?? undefined,
        employeeId: asset.assigned_user.employee_id ?? undefined,
        employeeType: asset.assigned_user.employee_type ?? undefined,
        usageLocation: asset.assigned_user.usage_location ?? undefined,
        accountEnabled: asset.assigned_user.account_enabled ?? undefined,
    };
}

export default function AssetEditPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { status } = useSession();
    const [asset, setAsset] = useState<Asset | null>(null);
    const [allowedAssetGroups, setAllowedAssetGroups] = useState<string[]>([...assetGroups]);
    const [form, setForm] = useState<FormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [userSearch, setUserSearch] = useState("");
    const [userResults, setUserResults] = useState<AssetUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<AssetUser | null>(null);
    const [userSource, setUserSource] = useState<"azure" | "supabase" | null>(null);
    const [searchingUsers, setSearchingUsers] = useState(false);

    const loadAsset = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, { cache: "no-store" });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const nextAsset = data.asset as Asset;
            const nextAllowedGroups = Array.isArray(data.assetGroups) && data.assetGroups.length ? data.assetGroups : [...assetGroups];
            setAsset(nextAsset);
            setAllowedAssetGroups(nextAllowedGroups);
            setForm(toFormState(nextAsset, nextAllowedGroups));
            const nextUser = toSelectedUser(nextAsset);
            setSelectedUser(nextUser);
            setUserSearch(nextUser?.displayName ?? nextUser?.userPrincipalName ?? "");
            setUserResults(nextUser ? [nextUser] : []);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to load asset");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (status !== "authenticated") return;
        void loadAsset();
    }, [status, loadAsset]);

    useEffect(() => {
        if (status !== "authenticated" || !form) return;

        const term = userSearch.trim();
        if (!term) {
            setUserResults(selectedUser ? [selectedUser] : []);
            setUserSource(null);
            return;
        }

        let active = true;
        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            try {
                setSearchingUsers(true);
                const res = await fetch(`/api/assets/users?search=${encodeURIComponent(term)}`, {
                    signal: controller.signal,
                    cache: "no-store",
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                if (!active) return;
                setUserResults(Array.isArray(data.items) ? data.items : []);
                setUserSource(data.source === "supabase" ? "supabase" : "azure");
            } catch (error) {
                if (!active || (error as { name?: string })?.name === "AbortError") return;
                setUserResults([]);
                setUserSource(null);
                setMessage(error instanceof Error ? error.message : "User lookup failed");
            } finally {
                if (active) setSearchingUsers(false);
            }
        }, 250);

        return () => {
            active = false;
            controller.abort();
            clearTimeout(timeout);
        };
    }, [status, form, userSearch, selectedUser]);

    const selectedUserLabel = useMemo(() => {
        if (!selectedUser) return "Unassigned";
        return selectedUser.displayName
            ? `${selectedUser.displayName} (${selectedUser.userPrincipalName})`
            : selectedUser.userPrincipalName;
    }, [selectedUser]);

    const save = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!form || !id) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    assignedUser: selectedUser,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            setMessage("Asset updated");
            await loadAsset();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to update asset");
        } finally {
            setSaving(false);
        }
    }, [form, id, selectedUser, loadAsset]);

    const remove = useCallback(async () => {
        if (!id || deleting) return;
        const confirmed = window.confirm("Delete this asset? This action cannot be undone.");
        if (!confirmed) return;

        setDeleting(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/assets/${encodeURIComponent(id)}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error(await res.text());
            router.push("/assets");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to delete asset");
            setDeleting(false);
        }
    }, [id, deleting, router]);

    if (loading || !form) {
        return (
            <ModuleGuard moduleKey="assets">
                <main className="p-6 text-[var(--foreground)]">Loading...</main>
            </ModuleGuard>
        );
    }

    return (
        <ModuleGuard moduleKey="assets">
            <main className="space-y-4 p-6 text-[var(--foreground)]">
                <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text)]/45">Asset Editor</div>
                            <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">{asset?.name}</h1>
                            <div className="mt-1 text-sm text-[var(--text)]/65">
                                {asset?.asset_tag} | Created {asset ? new Date(asset.created_at).toLocaleString() : ""}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className="rounded border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)]"
                                onClick={() => router.push("/assets")}
                            >
                                Back to Assets
                            </button>
                            <button
                                type="button"
                                className="rounded border border-[color:rgba(255,99,132,0.35)] bg-[color:rgba(255,99,132,0.16)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[color:rgba(255,99,132,0.26)] disabled:opacity-50"
                                onClick={() => void remove()}
                                disabled={deleting || saving}
                            >
                                {deleting ? "Deleting..." : "Delete Asset"}
                            </button>
                        </div>
                    </div>

                    {message && (
                        <div className="mt-4 rounded-xl border border-[var(--border)]/80 bg-[var(--glass-strong)] px-4 py-3 text-sm text-[var(--text)]/80">
                            {message}
                        </div>
                    )}

                    <form onSubmit={save} className="mt-6 space-y-5">
                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Asset Tag</div>
                                <input
                                    value={form.assetTag}
                                    onChange={(event) => setForm((current) => current ? { ...current, assetTag: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                    required
                                />
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Asset Name</div>
                                <input
                                    value={form.name}
                                    onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                    required
                                />
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Group</div>
                                <select
                                    value={form.assetGroup}
                                    onChange={(event) => setForm((current) => current ? { ...current, assetGroup: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                    required
                                >
                                    {allowedAssetGroups.map((group) => (
                                        <option key={group} value={group}>
                                            {group}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Type</div>
                                <input
                                    value={form.assetType}
                                    onChange={(event) => setForm((current) => current ? { ...current, assetType: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                    required
                                />
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Status</div>
                                <select
                                    value={form.status}
                                    onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                >
                                    {STATUSES.map((statusOption) => (
                                        <option key={statusOption} value={statusOption}>
                                            {statusOption}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Serial Number</div>
                                <input
                                    value={form.serialNumber}
                                    onChange={(event) => setForm((current) => current ? { ...current, serialNumber: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                />
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Manufacturer</div>
                                <input
                                    value={form.manufacturer}
                                    onChange={(event) => setForm((current) => current ? { ...current, manufacturer: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                />
                            </label>
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Model</div>
                                <input
                                    value={form.model}
                                    onChange={(event) => setForm((current) => current ? { ...current, model: event.target.value } : current)}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                />
                            </label>
                        </div>

                        <label className="block">
                            <div className="mb-1 text-xs text-[var(--text)]/70">Assign To User</div>
                            <input
                                value={userSearch}
                                onChange={(event) => setUserSearch(event.target.value)}
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                placeholder="Search by name or UPN"
                            />
                            <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm text-[var(--text)]/80">
                                <div>Selected: {selectedUserLabel}</div>
                                {userSource && (
                                    <div className="mt-1 text-xs text-[var(--text)]/60">
                                        Source: {userSource === "azure" ? "Azure directory" : "Supabase cache"}
                                    </div>
                                )}
                            </div>
                            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
                                {searchingUsers && <div className="p-3 text-sm text-[var(--text)]/70">Searching users...</div>}
                                {!searchingUsers && !userResults.length && userSearch.trim() !== "" && (
                                    <div className="p-3 text-sm text-[var(--text)]/70">No users found</div>
                                )}
                                {!!selectedUser && (
                                    <button
                                        type="button"
                                        className="w-full border-b border-[var(--border)]/70 px-3 py-2 text-left text-sm text-[var(--text)]/80 transition-colors hover:bg-[color:rgba(255,99,132,0.14)]"
                                        onClick={() => {
                                            setSelectedUser(null);
                                            setUserSearch("");
                                            setUserResults([]);
                                            setUserSource(null);
                                        }}
                                    >
                                        Clear assignment
                                    </button>
                                )}
                                {userResults.map((user) => (
                                    <button
                                        key={`${user.id}-${user.userPrincipalName}`}
                                        type="button"
                                        className="w-full border-b border-[var(--border)]/70 px-3 py-2 text-left text-sm text-[var(--text)] transition-colors hover:bg-[color:rgba(14,3,219,0.14)]"
                                        onClick={() => {
                                            setSelectedUser(user);
                                            setUserSearch(user.displayName ?? user.userPrincipalName);
                                            setUserResults([user]);
                                        }}
                                    >
                                        <div className="font-medium">{user.displayName || user.userPrincipalName}</div>
                                        <div className="text-xs text-[var(--text)]/65">
                                            {user.userPrincipalName}
                                            {user.jobTitle ? ` | ${user.jobTitle}` : ""}
                                            {user.department ? ` | ${user.department}` : ""}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </label>

                        <label className="block">
                            <div className="mb-1 text-xs text-[var(--text)]/70">Notes</div>
                            <textarea
                                value={form.notes}
                                onChange={(event) => setForm((current) => current ? { ...current, notes: event.target.value } : current)}
                                className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                            />
                        </label>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)]/70 pt-4">
                            <div className="text-sm text-[var(--text)]/60">
                                Update asset details, reassign the owner, or delete the record entirely.
                            </div>
                            <button
                                className="rounded border border-[var(--border)] bg-[color:rgba(14,3,219,0.24)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[color:rgba(14,3,219,0.36)] disabled:opacity-50"
                                disabled={saving || deleting}
                            >
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </ModuleGuard>
    );
}
