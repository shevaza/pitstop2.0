"use client";

import ModuleGuard from "@/components/ModuleGuard";
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
    asset_type: string;
    status: string;
    serial_number?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    notes?: string | null;
    created_at: string;
    assigned_user?: {
        user_principal_name: string;
        display_name?: string | null;
        department?: string | null;
        job_title?: string | null;
        office_location?: string | null;
        last_synced_at?: string | null;
    } | null;
};

const initialForm = {
    assetTag: "",
    name: "",
    assetType: "",
    status: "active",
    serialNumber: "",
    manufacturer: "",
    model: "",
    notes: "",
};

export default function AssetsPage() {
    const { status } = useSession();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [form, setForm] = useState(initialForm);
    const [userSearch, setUserSearch] = useState("");
    const [userResults, setUserResults] = useState<AssetUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<AssetUser | null>(null);
    const [userSource, setUserSource] = useState<"azure" | "supabase" | null>(null);
    const [searchingUsers, setSearchingUsers] = useState(false);

    const loadAssets = useCallback(async () => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch("/api/assets", { cache: "no-store" });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setAssets(Array.isArray(data.items) ? data.items : []);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to load assets");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (status !== "authenticated") return;
        void loadAssets();
    }, [status, loadAssets]);

    useEffect(() => {
        if (status !== "authenticated") return;

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

                const items = Array.isArray(data.items) ? data.items : [];
                setUserResults(items);
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
    }, [status, userSearch, selectedUser]);

    const selectedUserLabel = useMemo(() => {
        if (!selectedUser) return "Unassigned";
        return selectedUser.displayName
            ? `${selectedUser.displayName} (${selectedUser.userPrincipalName})`
            : selectedUser.userPrincipalName;
    }, [selectedUser]);

    const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch("/api/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    assignedUser: selectedUser,
                }),
            });

            if (!res.ok) throw new Error(await res.text());

            setForm(initialForm);
            setSelectedUser(null);
            setUserSearch("");
            setUserResults([]);
            setUserSource(null);
            setMessage("Asset created");
            await loadAssets();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to create asset");
        } finally {
            setSaving(false);
        }
    }, [form, selectedUser, loadAssets]);

    return (
        <ModuleGuard moduleKey="assets">
            <main className="space-y-6 p-6 text-[var(--foreground)]">
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-semibold text-[var(--text)]">Asset Management</h1>
                            <p className="mt-1 max-w-3xl text-sm text-[var(--text)]/70">
                                Assets are stored in Supabase. When you assign an asset, a user snapshot is also stored there so the assignment still resolves if Azure data is temporarily unavailable.
                            </p>
                        </div>
                        <button
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                            onClick={() => void loadAssets()}
                            disabled={loading}
                        >
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    <form
                        onSubmit={submit}
                        className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl"
                    >
                        <h2 className="text-xl font-semibold text-[var(--text)]">Create Asset</h2>

                        <label className="block">
                            <div className="mb-1 text-xs text-[var(--text)]/70">Asset Tag</div>
                            <input
                                value={form.assetTag}
                                onChange={(event) => setForm((current) => ({ ...current, assetTag: event.target.value }))}
                                className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                required
                            />
                        </label>

                        <label className="block">
                            <div className="mb-1 text-xs text-[var(--text)]/70">Name</div>
                            <input
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                required
                            />
                        </label>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Type</div>
                                <input
                                    value={form.assetType}
                                    onChange={(event) => setForm((current) => ({ ...current, assetType: event.target.value }))}
                                    className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                    placeholder="Laptop, phone, monitor..."
                                    required
                                />
                            </label>

                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Status</div>
                                <select
                                    value={form.status}
                                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                                    className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                >
                                    <option value="active">Active</option>
                                    <option value="in-stock">In Stock</option>
                                    <option value="repair">Repair</option>
                                    <option value="retired">Retired</option>
                                </select>
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Serial Number</div>
                                <input
                                    value={form.serialNumber}
                                    onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))}
                                    className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                />
                            </label>

                            <label className="block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Manufacturer</div>
                                <input
                                    value={form.manufacturer}
                                    onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))}
                                    className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                />
                            </label>
                        </div>

                        <label className="block">
                            <div className="mb-1 text-xs text-[var(--text)]/70">Model</div>
                            <input
                                value={form.model}
                                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                                className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                            />
                        </label>

                        <label className="block">
                            <div className="mb-1 text-xs text-[var(--text)]/70">Assign To User</div>
                            <input
                                value={userSearch}
                                onChange={(event) => setUserSearch(event.target.value)}
                                className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                placeholder="Search by name or UPN"
                            />
                            <div className="mt-2 rounded border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm text-[var(--text)]/80">
                                <div>Selected: {selectedUserLabel}</div>
                                {userSource && (
                                    <div className="mt-1 text-xs text-[var(--text)]/60">
                                        Source: {userSource === "azure" ? "Azure directory" : "Supabase cache"}
                                    </div>
                                )}
                            </div>
                            <div className="mt-2 max-h-56 overflow-auto rounded border border-[var(--border)] bg-[var(--glass-strong)]">
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
                                        <div className="font-medium">
                                            {user.displayName || user.userPrincipalName}
                                        </div>
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
                                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                                className="min-h-24 w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                            />
                        </label>

                        <div className="flex items-center gap-3">
                            <button
                                className="rounded border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                                disabled={saving}
                            >
                                {saving ? "Saving..." : "Create Asset"}
                            </button>
                            {message && <div className="text-sm text-[var(--text)]/75">{message}</div>}
                        </div>
                    </form>

                    <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-xl font-semibold text-[var(--text)]">Saved Assets</h2>
                            <div className="text-sm text-[var(--text)]/65">{assets.length} total</div>
                        </div>

                        <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
                            <table className="min-w-full text-sm text-[var(--text)]">
                                <thead>
                                    <tr className="bg-[color:rgba(255,255,255,0.06)] text-[var(--text)]/70">
                                        <th className="p-3 text-left">Asset</th>
                                        <th className="p-3 text-left">Type</th>
                                        <th className="p-3 text-left">Assigned User</th>
                                        <th className="p-3 text-left">Status</th>
                                        <th className="p-3 text-left">Saved</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {assets.map((asset) => (
                                        <tr key={asset.id} className="border-t border-[var(--border)]/80 align-top transition-colors hover:bg-[color:rgba(14,3,219,0.12)]">
                                            <td className="p-3">
                                                <div className="font-medium">{asset.name}</div>
                                                <div className="text-xs text-[var(--text)]/65">
                                                    {asset.asset_tag}
                                                    {asset.serial_number ? ` | ${asset.serial_number}` : ""}
                                                    {asset.manufacturer ? ` | ${asset.manufacturer}` : ""}
                                                    {asset.model ? ` | ${asset.model}` : ""}
                                                </div>
                                            </td>
                                            <td className="p-3">{asset.asset_type}</td>
                                            <td className="p-3">
                                                {asset.assigned_user ? (
                                                    <>
                                                        <div>{asset.assigned_user.display_name || asset.assigned_user.user_principal_name}</div>
                                                        <div className="text-xs text-[var(--text)]/65">
                                                            {asset.assigned_user.user_principal_name}
                                                            {asset.assigned_user.job_title ? ` | ${asset.assigned_user.job_title}` : ""}
                                                            {asset.assigned_user.department ? ` | ${asset.assigned_user.department}` : ""}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className="text-[var(--text)]/65">Unassigned</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <span className="rounded-full bg-[color:rgba(52,211,153,0.18)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                                                    {asset.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-xs text-[var(--text)]/65">
                                                <div>{new Date(asset.created_at).toLocaleString()}</div>
                                                {asset.assigned_user?.last_synced_at && (
                                                    <div>
                                                        User snapshot: {new Date(asset.assigned_user.last_synced_at).toLocaleString()}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {!assets.length && !loading && (
                                        <tr>
                                            <td colSpan={5} className="p-4 text-[var(--text)]/70">
                                                No assets saved yet
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </section>
            </main>
        </ModuleGuard>
    );
}
