"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { assetGroups } from "@/lib/asset-groups";
import { appModules, getDefaultModuleAccess, type AppModuleKey } from "@/lib/modules";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type DirectoryUser = {
    id: string;
    userPrincipalName: string;
    displayName?: string;
    jobTitle?: string;
    department?: string;
};

export default function UserAccessPage() {
    const { status } = useSession();
    const [search, setSearch] = useState("");
    const [searching, setSearching] = useState(false);
    const [users, setUsers] = useState<DirectoryUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
    const [access, setAccess] = useState<Record<AppModuleKey, boolean>>(getDefaultModuleAccess);
    const [assetGroupAccess, setAssetGroupAccess] = useState<string[]>([...assetGroups]);
    const [loadingAccess, setLoadingAccess] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status !== "authenticated") return;

        const term = search.trim();
        if (!term) {
            setUsers(selectedUser ? [selectedUser] : []);
            return;
        }

        let active = true;
        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            try {
                setSearching(true);
                setError(null);
                const params = new URLSearchParams({ top: "50", search: term });
                const res = await fetch(`/api/user-access/users?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                if (active) {
                    setUsers(Array.isArray(data.items) ? data.items : []);
                }
            } catch (err) {
                if (!active || (err as { name?: string })?.name === "AbortError") return;
                setUsers([]);
                setError(err instanceof Error ? err.message : "Failed to search users");
            } finally {
                if (active) setSearching(false);
            }
        }, 250);

        return () => {
            active = false;
            controller.abort();
            clearTimeout(timeout);
        };
    }, [search, selectedUser, status]);

    const loadAccess = useCallback(async (user: DirectoryUser) => {
        setLoadingAccess(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch(
                `/api/user-access?userPrincipalName=${encodeURIComponent(user.userPrincipalName)}`,
                { cache: "no-store" },
            );
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setAccess(data.access ?? getDefaultModuleAccess());
            setAssetGroupAccess(Array.isArray(data.assetGroups) && data.assetGroups.length ? data.assetGroups : [...assetGroups]);
        } catch (err) {
            setAccess(getDefaultModuleAccess());
            setAssetGroupAccess([...assetGroups]);
            setError(err instanceof Error ? err.message : "Failed to load user access");
        } finally {
            setLoadingAccess(false);
        }
    }, []);

    const selectUser = useCallback((user: DirectoryUser) => {
        setSelectedUser(user);
        setSearch(user.displayName || user.userPrincipalName);
        void loadAccess(user);
    }, [loadAccess]);

    const handleSave = useCallback(async () => {
        if (!selectedUser) return;

        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch("/api/user-access", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userPrincipalName: selectedUser.userPrincipalName,
                    displayName: selectedUser.displayName,
                    access,
                    assetGroups: assetGroupAccess,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setAccess(data.access ?? access);
            setAssetGroupAccess(Array.isArray(data.assetGroups) && data.assetGroups.length ? data.assetGroups : assetGroupAccess);
            setMessage("User access saved");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save user access");
        } finally {
            setSaving(false);
        }
    }, [access, assetGroupAccess, selectedUser]);

    const enabledCount = useMemo(
        () => Object.values(access).filter(Boolean).length,
        [access],
    );
    const assetGroupSelectionInvalid = access.assets && assetGroupAccess.length === 0;

    return (
        <ModuleGuard moduleKey="user-access">
            <main className="space-y-6 p-6 text-[var(--foreground)]">
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)]">
                    <h1 className="text-2xl font-semibold text-[var(--text)]">User Access</h1>
                    <p className="mt-1 max-w-3xl text-sm text-[var(--text)]/70">
                        Set each user&apos;s access to every app module. Permissions are stored in Supabase and apply to navigation and protected routes.
                    </p>
                </section>

                {error && (
                    <div className="rounded-xl border border-red-500/40 bg-[color:rgba(255,255,255,0.06)] p-4 text-sm text-red-100">
                        {error}
                    </div>
                )}
                {message && (
                    <div className="rounded-xl border border-emerald-500/40 bg-[color:rgba(16,185,129,0.15)] p-4 text-sm text-emerald-100">
                        {message}
                    </div>
                )}

                <section className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)]">
                        <h2 className="text-lg font-semibold text-[var(--text)]">Find User</h2>
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by name or exact UPN"
                            className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--text)]/40"
                        />
                        <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
                            {searching && <div className="p-3 text-sm text-[var(--text)]/70">Searching users...</div>}
                            {!searching && !users.length && search.trim() !== "" && (
                                <div className="p-3 text-sm text-[var(--text)]/70">No users found</div>
                            )}
                            {users.map((user) => (
                                <button
                                    key={`${user.id}-${user.userPrincipalName}`}
                                    type="button"
                                    className={`w-full border-b border-[var(--border)]/70 px-3 py-3 text-left transition-colors hover:bg-[color:rgba(14,3,219,0.14)] ${
                                        selectedUser?.userPrincipalName === user.userPrincipalName
                                            ? "bg-[color:rgba(14,3,219,0.14)]"
                                            : ""
                                    }`}
                                    onClick={() => selectUser(user)}
                                >
                                    <div className="font-medium text-[var(--text)]">
                                        {user.displayName || user.userPrincipalName}
                                    </div>
                                    <div className="mt-1 text-xs text-[var(--text)]/65">
                                        {user.userPrincipalName}
                                        {user.jobTitle ? ` | ${user.jobTitle}` : ""}
                                        {user.department ? ` | ${user.department}` : ""}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-[var(--text)]">Module Access Matrix</h2>
                                <div className="mt-1 text-sm text-[var(--text)]/65">
                                    {selectedUser
                                        ? `${selectedUser.displayName || selectedUser.userPrincipalName} has ${enabledCount} of ${appModules.length} modules enabled.`
                                        : "Select a user to manage access."}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--glass-strong)] disabled:opacity-60"
                                    onClick={() => {
                                        setAccess(
                                            Object.fromEntries(appModules.map((module) => [module.key, true])) as Record<AppModuleKey, boolean>,
                                        );
                                        setAssetGroupAccess([...assetGroups]);
                                    }}
                                    disabled={!selectedUser || loadingAccess}
                                >
                                    Allow all
                                </button>
                                <button
                                    type="button"
                                    className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--glass-strong)] disabled:opacity-60"
                                    onClick={() => {
                                        setAccess(
                                            Object.fromEntries(appModules.map((module) => [module.key, false])) as Record<AppModuleKey, boolean>,
                                        );
                                        setAssetGroupAccess([]);
                                    }}
                                    disabled={!selectedUser || loadingAccess}
                                >
                                    Clear all
                                </button>
                            </div>
                        </div>

                        {selectedUser && (
                            <div className="mt-2 text-xs text-[var(--text)]/60">
                                {selectedUser.userPrincipalName}
                            </div>
                        )}

                        <div className="mt-4 space-y-3">
                            {appModules.map((module) => (
                                <div
                                    key={module.key}
                                    className="rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] px-4 py-3"
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="font-medium text-[var(--text)]">{module.label}</div>
                                            <div className="text-xs text-[var(--text)]/60">{module.href}</div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={access[module.key]}
                                            onChange={(event) => {
                                                const checked = event.target.checked;
                                                setAccess((current) => ({
                                                    ...current,
                                                    [module.key]: checked,
                                                }));
                                                if (module.key === "assets") {
                                                    setAssetGroupAccess(checked ? [...assetGroups] : []);
                                                }
                                            }}
                                            disabled={!selectedUser || loadingAccess}
                                            className="h-5 w-5 rounded border-[var(--border)] bg-[var(--glass)]"
                                        />
                                    </div>
                                    {module.key === "assets" && access.assets && (
                                        <div className="mt-3 border-t border-[var(--border)]/70 pt-3">
                                            <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[var(--text)]/50">
                                                Asset Groups
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                {assetGroups.map((group) => (
                                                    <label key={group} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)]">
                                                        <input
                                                            type="checkbox"
                                                            checked={assetGroupAccess.includes(group)}
                                                            onChange={(event) => {
                                                                setAssetGroupAccess((current) => {
                                                                    if (event.target.checked) {
                                                                        return current.includes(group) ? current : [...current, group];
                                                                    }
                                                                    return current.filter((item) => item !== group);
                                                                });
                                                            }}
                                                            disabled={!selectedUser || loadingAccess}
                                                            className="h-4 w-4 rounded border-[var(--border)] bg-[var(--glass)]"
                                                        />
                                                        {group}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 flex items-center gap-3">
                            <button
                                type="button"
                                className="rounded-lg border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-soft)] hover:bg-[var(--glass-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleSave()}
                                disabled={!selectedUser || saving || loadingAccess || assetGroupSelectionInvalid}
                            >
                                {saving ? "Saving..." : "Save access"}
                            </button>
                            {(assetGroupSelectionInvalid || loadingAccess || (!selectedUser && status === "authenticated")) && (
                                <span className="text-xs text-[var(--text)]/60">
                                    {assetGroupSelectionInvalid
                                        ? "Select at least one asset group."
                                        : loadingAccess
                                            ? "Loading saved access..."
                                            : "Choose a user to begin."}
                                </span>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </ModuleGuard>
    );
}
