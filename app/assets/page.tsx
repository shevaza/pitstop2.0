"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { useRouter } from "next/navigation";
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
        user_principal_name: string;
        display_name?: string | null;
        department?: string | null;
        job_title?: string | null;
        office_location?: string | null;
        last_synced_at?: string | null;
    } | null;
};

type AssignmentFilter = "all" | "assigned" | "unassigned";

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

const initialForm: FormState = {
    assetTag: "",
    name: "",
    assetGroup: "",
    assetType: "",
    status: "active",
    serialNumber: "",
    manufacturer: "",
    model: "",
    notes: "",
};

const STATUSES = ["active", "in-stock", "repair", "retired"];
const PAGE_SIZE = 12;

function normalizeText(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? "";
}

function displayValue(value: string | null | undefined, fallback = "Unspecified") {
    const trimmed = value?.trim();
    return trimmed ? trimmed : fallback;
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
    const counts = new Map<string, number>();
    for (const item of items) {
        const key = getKey(item);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, count]) => ({ label, count }));
}

function statusTone(status: string) {
    switch (normalizeText(status)) {
        case "active":
            return "bg-[color:rgba(52,211,153,0.18)]";
        case "in-stock":
            return "bg-[color:rgba(59,130,246,0.18)]";
        case "repair":
            return "bg-[color:rgba(251,191,36,0.2)]";
        case "retired":
            return "bg-[color:rgba(255,99,132,0.2)]";
        default:
            return "bg-[color:rgba(255,255,255,0.12)]";
    }
}

export default function AssetsPage() {
    const router = useRouter();
    const { status } = useSession();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(initialForm);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [userSearch, setUserSearch] = useState("");
    const [userResults, setUserResults] = useState<AssetUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<AssetUser | null>(null);
    const [userSource, setUserSource] = useState<"azure" | "supabase" | null>(null);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
    const [page, setPage] = useState(1);

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
        if (status !== "authenticated" || !isCreateOpen) return;

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
    }, [status, isCreateOpen, userSearch, selectedUser]);

    const groupOptions = useMemo(() => {
        const values = new Set<string>();
        for (const asset of assets) {
            const group = asset.asset_group?.trim();
            if (group) values.add(group);
        }
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [assets]);

    const typeOptions = useMemo(() => {
        const values = new Set<string>();
        for (const asset of assets) {
            const type = asset.asset_type?.trim();
            if (type) values.add(type);
        }
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [assets]);

    const filteredAssets = useMemo(() => {
        const term = normalizeText(searchTerm);
        return assets.filter((asset) => {
            const matchesSearch = !term || [
                asset.name,
                asset.asset_tag,
                asset.asset_group,
                asset.asset_type,
                asset.serial_number,
                asset.manufacturer,
                asset.model,
                asset.assigned_user?.display_name,
                asset.assigned_user?.user_principal_name,
                asset.assigned_user?.department,
            ].some((value) => normalizeText(value).includes(term));

            const matchesGroup = groupFilter === "all" || displayValue(asset.asset_group) === groupFilter;
            const matchesType = typeFilter === "all" || asset.asset_type === typeFilter;
            const matchesStatus = statusFilter === "all" || asset.status === statusFilter;
            const isAssigned = Boolean(asset.assigned_user);
            const matchesAssignment =
                assignmentFilter === "all"
                    || (assignmentFilter === "assigned" && isAssigned)
                    || (assignmentFilter === "unassigned" && !isAssigned);

            return matchesSearch && matchesGroup && matchesType && matchesStatus && matchesAssignment;
        });
    }, [assets, searchTerm, groupFilter, typeFilter, statusFilter, assignmentFilter]);

    const totalPages = Math.max(1, Math.ceil(Math.max(filteredAssets.length, 1) / PAGE_SIZE));

    useEffect(() => {
        setPage(1);
    }, [searchTerm, groupFilter, typeFilter, statusFilter, assignmentFilter]);

    useEffect(() => {
        setPage((current) => Math.min(current, totalPages));
    }, [totalPages]);

    const paginatedAssets = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filteredAssets.slice(start, start + PAGE_SIZE);
    }, [filteredAssets, page]);

    const dashboard = useMemo(() => {
        const total = assets.length;
        const assigned = assets.filter((asset) => asset.assigned_user).length;
        const unassigned = total - assigned;
        return {
            total,
            assigned,
            unassigned,
            groups: countBy(assets, (asset) => displayValue(asset.asset_group)),
            types: countBy(assets, (asset) => displayValue(asset.asset_type)),
        };
    }, [assets]);

    const selectedUserLabel = useMemo(() => {
        if (!selectedUser) return "Unassigned";
        return selectedUser.displayName
            ? `${selectedUser.displayName} (${selectedUser.userPrincipalName})`
            : selectedUser.userPrincipalName;
    }, [selectedUser]);

    const hasFilters = searchTerm.trim() || groupFilter !== "all" || typeFilter !== "all" || statusFilter !== "all" || assignmentFilter !== "all";

    const closeCreateModal = useCallback(() => {
        if (saving) return;
        setIsCreateOpen(false);
        setForm(initialForm);
        setSelectedUser(null);
        setUserSearch("");
        setUserResults([]);
        setUserSource(null);
    }, [saving]);

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

            closeCreateModal();
            setMessage("Asset created");
            await loadAssets();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to create asset");
        } finally {
            setSaving(false);
        }
    }, [form, selectedUser, closeCreateModal, loadAssets]);

    return (
        <ModuleGuard moduleKey="assets">
            <main className="space-y-6 p-6 text-[var(--foreground)]">
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-semibold text-[var(--text)]">Asset Management</h1>
                            <p className="mt-1 max-w-3xl text-sm text-[var(--text)]/70">
                                Review inventory in one place, filter it quickly, and create new assets from a dedicated flow instead of an inline form.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                className="rounded border border-[var(--border)] bg-[color:rgba(14,3,219,0.22)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[color:rgba(14,3,219,0.35)]"
                                onClick={() => {
                                    setMessage(null);
                                    setIsCreateOpen(true);
                                }}
                            >
                                New Asset
                            </button>
                            <button
                                className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                                onClick={() => void loadAssets()}
                                disabled={loading}
                            >
                                {loading ? "Refreshing..." : "Refresh"}
                            </button>
                        </div>
                    </div>
                    {message && (
                        <div className="mt-4 rounded-xl border border-[var(--border)]/80 bg-[var(--glass-strong)] px-4 py-3 text-sm text-[var(--text)]/80">
                            {message}
                        </div>
                    )}
                </section>

                <section className="grid gap-4 lg:grid-cols-3">
                    <article className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                        <div className="text-sm text-[var(--text)]/60">Asset Coverage</div>
                        <div className="mt-3 text-3xl font-semibold text-[var(--text)]">{dashboard.total}</div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[var(--text)]/75">
                            <div className="rounded-xl border border-[var(--border)]/70 bg-[var(--glass-strong)] p-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/45">Assigned</div>
                                <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{dashboard.assigned}</div>
                            </div>
                            <div className="rounded-xl border border-[var(--border)]/70 bg-[var(--glass-strong)] p-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/45">Unassigned</div>
                                <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{dashboard.unassigned}</div>
                            </div>
                        </div>
                    </article>

                    <article className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm text-[var(--text)]/60">By Group</div>
                                <div className="mt-1 text-lg font-semibold text-[var(--text)]">Current distribution</div>
                            </div>
                            <div className="text-xs text-[var(--text)]/45">{dashboard.groups.length} groups</div>
                        </div>
                        <div className="mt-4 space-y-2">
                            {dashboard.groups.slice(0, 5).map((entry) => (
                                <div key={entry.label} className="flex items-center justify-between rounded-xl border border-[var(--border)]/70 bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)]/80">
                                    <span>{entry.label}</span>
                                    <span className="rounded-full bg-[color:rgba(255,255,255,0.08)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                                        {entry.count}
                                    </span>
                                </div>
                            ))}
                            {!dashboard.groups.length && (
                                <div className="rounded-xl border border-dashed border-[var(--border)]/70 px-3 py-4 text-sm text-[var(--text)]/60">
                                    No asset groups yet.
                                </div>
                            )}
                        </div>
                    </article>

                    <article className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm text-[var(--text)]/60">By Type</div>
                                <div className="mt-1 text-lg font-semibold text-[var(--text)]">Most common assets</div>
                            </div>
                            <div className="text-xs text-[var(--text)]/45">{dashboard.types.length} types</div>
                        </div>
                        <div className="mt-4 space-y-2">
                            {dashboard.types.slice(0, 5).map((entry) => (
                                <div key={entry.label} className="flex items-center justify-between rounded-xl border border-[var(--border)]/70 bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)]/80">
                                    <span>{entry.label}</span>
                                    <span className="rounded-full bg-[color:rgba(14,3,219,0.25)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                                        {entry.count}
                                    </span>
                                </div>
                            ))}
                            {!dashboard.types.length && (
                                <div className="rounded-xl border border-dashed border-[var(--border)]/70 px-3 py-4 text-sm text-[var(--text)]/60">
                                    No asset types yet.
                                </div>
                            )}
                        </div>
                    </article>
                </section>

                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-semibold text-[var(--text)]">Saved Assets</h2>
                            <p className="mt-1 text-sm text-[var(--text)]/65">
                                Search by asset, assignee, serial, model, or group and narrow the list with quick filters.
                            </p>
                        </div>
                        <div className="text-sm text-[var(--text)]/65">
                            {filteredAssets.length} shown of {assets.length}
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
                        <input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search assets, tags, assignees, serials..."
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text)]/45 focus:border-[var(--text)]/60 focus:outline-none"
                        />

                        <select
                            value={groupFilter}
                            onChange={(event) => setGroupFilter(event.target.value)}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                        >
                            <option value="all">All groups</option>
                            <option value="Unspecified">Unspecified groups</option>
                            {groupOptions.map((group) => (
                                <option key={group} value={group}>
                                    {group}
                                </option>
                            ))}
                        </select>

                        <select
                            value={typeFilter}
                            onChange={(event) => setTypeFilter(event.target.value)}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                        >
                            <option value="all">All types</option>
                            {typeOptions.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                        >
                            <option value="all">All statuses</option>
                            {STATUSES.map((statusOption) => (
                                <option key={statusOption} value={statusOption}>
                                    {statusOption}
                                </option>
                            ))}
                        </select>

                        <select
                            value={assignmentFilter}
                            onChange={(event) => setAssignmentFilter(event.target.value as AssignmentFilter)}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                        >
                            <option value="all">All assignment states</option>
                            <option value="assigned">Assigned only</option>
                            <option value="unassigned">Unassigned only</option>
                        </select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text)]/60">
                        <span>Page {filteredAssets.length ? page : 0} of {filteredAssets.length ? totalPages : 0}</span>
                        {hasFilters && (
                            <button
                                className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)]"
                                onClick={() => {
                                    setSearchTerm("");
                                    setGroupFilter("all");
                                    setTypeFilter("all");
                                    setStatusFilter("all");
                                    setAssignmentFilter("all");
                                }}
                            >
                                Clear filters
                            </button>
                        )}
                    </div>

                    <div className="mt-5 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--glass-strong)]">
                        <table className="min-w-full text-sm text-[var(--text)]">
                            <thead>
                                <tr className="bg-[color:rgba(255,255,255,0.06)] text-[var(--text)]/70">
                                    <th className="p-3 text-left">Asset</th>
                                    <th className="p-3 text-left">Group</th>
                                    <th className="p-3 text-left">Type</th>
                                    <th className="p-3 text-left">Assigned User</th>
                                    <th className="p-3 text-left">Status</th>
                                    <th className="p-3 text-left">Saved</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedAssets.map((asset) => (
                                    <tr
                                        key={asset.id}
                                        className="cursor-pointer border-t border-[var(--border)]/80 align-top transition-colors hover:bg-[color:rgba(14,3,219,0.12)]"
                                        onClick={() => router.push(`/assets/${encodeURIComponent(asset.id)}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                router.push(`/assets/${encodeURIComponent(asset.id)}`);
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                    >
                                        <td className="p-3">
                                            <div className="font-medium">{asset.name}</div>
                                            <div className="mt-1 text-xs text-[var(--text)]/65">
                                                {asset.asset_tag}
                                                {asset.serial_number ? ` | ${asset.serial_number}` : ""}
                                                {asset.manufacturer ? ` | ${asset.manufacturer}` : ""}
                                                {asset.model ? ` | ${asset.model}` : ""}
                                            </div>
                                        </td>
                                        <td className="p-3 text-[var(--text)]/80">{displayValue(asset.asset_group)}</td>
                                        <td className="p-3 text-[var(--text)]/80">{asset.asset_type}</td>
                                        <td className="p-3">
                                            {asset.assigned_user ? (
                                                <>
                                                    <div>{asset.assigned_user.display_name || asset.assigned_user.user_principal_name}</div>
                                                    <div className="mt-1 text-xs text-[var(--text)]/65">
                                                        {asset.assigned_user.user_principal_name}
                                                        {asset.assigned_user.job_title ? ` | ${asset.assigned_user.job_title}` : ""}
                                                        {asset.assigned_user.department ? ` | ${asset.assigned_user.department}` : ""}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-[var(--text)]/55">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--text)] ${statusTone(asset.status)}`}>
                                                {asset.status}
                                            </span>
                                        </td>
                                        <td className="p-3 text-xs text-[var(--text)]/65">
                                            <div>{new Date(asset.created_at).toLocaleString()}</div>
                                            {asset.assigned_user?.last_synced_at && (
                                                <div className="mt-1">
                                                    User snapshot: {new Date(asset.assigned_user.last_synced_at).toLocaleString()}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {!filteredAssets.length && !loading && (
                                    <tr>
                                        <td colSpan={6} className="p-6 text-center text-[var(--text)]/65">
                                            {hasFilters ? "No assets match the selected filters." : "No assets saved yet."}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-[var(--text)]/60">
                            {filteredAssets.length
                                ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filteredAssets.length)} of ${filteredAssets.length}`
                                : loading
                                    ? "Loading assets..."
                                    : "No results"}
                        </div>
                        <div className="flex gap-2">
                            <button
                                className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                disabled={page <= 1 || !filteredAssets.length}
                            >
                                Previous
                            </button>
                            <button
                                className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                                disabled={page >= totalPages || !filteredAssets.length}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </section>

                {isCreateOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(3,3,10,0.72)] p-4 backdrop-blur-sm">
                        <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl border border-[var(--border)] bg-[color:rgba(7,7,20,0.95)] p-6 shadow-[var(--glow)]">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-semibold text-[var(--text)]">Create Asset</h2>
                                    <p className="mt-1 text-sm text-[var(--text)]/65">
                                        Save the asset first, optionally assign it to a user, and keep group and type structured for dashboard reporting.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)]"
                                    onClick={closeCreateModal}
                                    disabled={saving}
                                >
                                    Close
                                </button>
                            </div>

                            <form onSubmit={submit} className="mt-6 space-y-5">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Asset Tag</div>
                                        <input
                                            value={form.assetTag}
                                            onChange={(event) => setForm((current) => ({ ...current, assetTag: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                            required
                                        />
                                    </label>

                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Asset Name</div>
                                        <input
                                            value={form.name}
                                            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                            required
                                        />
                                    </label>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Group</div>
                                        <input
                                            value={form.assetGroup}
                                            onChange={(event) => setForm((current) => ({ ...current, assetGroup: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                            placeholder="IT, Workspace, Mobile..."
                                        />
                                    </label>

                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Type</div>
                                        <input
                                            value={form.assetType}
                                            onChange={(event) => setForm((current) => ({ ...current, assetType: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                            placeholder="Laptop, Phone, Monitor..."
                                            required
                                        />
                                    </label>

                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Status</div>
                                        <select
                                            value={form.status}
                                            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
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
                                            onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                        />
                                    </label>

                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Manufacturer</div>
                                        <input
                                            value={form.manufacturer}
                                            onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                        />
                                    </label>

                                    <label className="block">
                                        <div className="mb-1 text-xs text-[var(--text)]/70">Model</div>
                                        <input
                                            value={form.model}
                                            onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
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
                                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                                        className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--glass)] p-3 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                    />
                                </label>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)]/70 pt-4">
                                    <div className="text-sm text-[var(--text)]/60">
                                        Group and type values feed the dashboard and filters automatically.
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                                            onClick={closeCreateModal}
                                            disabled={saving}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="rounded border border-[var(--border)] bg-[color:rgba(14,3,219,0.24)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[color:rgba(14,3,219,0.36)] disabled:opacity-50"
                                            disabled={saving}
                                        >
                                            {saving ? "Saving..." : "Create Asset"}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </ModuleGuard>
    );
}
