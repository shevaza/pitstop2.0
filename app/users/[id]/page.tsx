"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Combobox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthGuard from "@/components/AuthGuard";

type User = {
    id: string;
    userPrincipalName: string;
    accountEnabled?: boolean;
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
};

type Manager = { id: string; userPrincipalName: string; displayName?: string } | null;

export default function UserDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { status } = useSession();
    const [user, setUser] = useState<User | null>(null);
    const [manager, setManager] = useState<Manager>(null);
    const [managerSearch, setManagerSearch] = useState("");
    const [managerOptions, setManagerOptions] = useState<User[]>([]);
    const [managerOptionsLoading, setManagerOptionsLoading] = useState(false);
    const [managerOptionsError, setManagerOptionsError] = useState<string | null>(null);
    const [managerSelection, setManagerSelection] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        const res = await fetch(`/api/users/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!res.ok) {
            setMsg(`Load failed: ${await res.text()}`);
            return;
        }
        const data = await res.json();
        setUser(data.user);
        setManager(data.manager ?? null);
    }, [id]);

    useEffect(() => {
        if (status !== "authenticated") return;
        const timer = setTimeout(() => {
            void load();
        }, 0);
        return () => clearTimeout(timer);
    }, [status, load]);

    useEffect(() => {
        if (status !== "authenticated") return;

        let active = true;
        const controller = new AbortController();

        const fetchUsers = async () => {
            try {
                if (!active) return;
                setManagerOptionsLoading(true);
                setManagerOptionsError(null);

                const params = new URLSearchParams({ top: "200" });
                const query = managerSearch.trim();
                if (query) params.set("search", query);

                const res = await fetch(`/api/users?${params.toString()}`, {
                    signal: controller.signal,
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                if (active) {
                    setManagerOptions(Array.isArray(data.items) ? data.items : []);
                }
            } catch (err) {
                if (!active) return;
                if ((err as any)?.name === "AbortError") return;
                const message =
                    err instanceof Error && err.message ? err.message : "Failed to load users";
                setManagerOptionsError(message);
            } finally {
                if (active) setManagerOptionsLoading(false);
            }
        };

        const timeout = setTimeout(() => void fetchUsers(), managerSearch ? 300 : 0);

        return () => {
            active = false;
            controller.abort();
            clearTimeout(timeout);
        };
    }, [status, managerSearch]);

    useEffect(() => {
        setManagerSelection(manager?.userPrincipalName ?? "");
    }, [manager?.userPrincipalName]);

    const managerOptionList = useMemo(() => {
        const seen = new Set<string>();
        const list: User[] = [];

        const push = (item: User) => {
            if (!item.userPrincipalName || seen.has(item.userPrincipalName)) return;
            seen.add(item.userPrincipalName);
            list.push(item);
        };

        if (managerSelection) {
            const fromSelection =
                managerOptions.find((item) => item.userPrincipalName === managerSelection) ??
                (manager && manager.userPrincipalName === managerSelection
                    ? {
                        id: manager.id,
                        userPrincipalName: manager.userPrincipalName,
                        displayName: manager.displayName,
                    }
                    : {
                        id: managerSelection,
                        userPrincipalName: managerSelection,
                    });
            push(fromSelection as User);
        }

        if (manager) {
            push({
                id: manager.id,
                userPrincipalName: manager.userPrincipalName,
                displayName: manager.displayName,
            });
        }

        for (const item of managerOptions) push(item);

        return list;
    }, [managerSelection, manager, managerOptions]);

    const filteredManagerOptions = useMemo(() => {
        const term = managerSearch.trim().toLowerCase();
        if (!term) return managerOptionList;
        return managerOptionList.filter((item) => {
            const name = item.displayName ?? "";
            return (
                name.toLowerCase().includes(term) ||
                item.userPrincipalName.toLowerCase().includes(term)
            );
        });
    }, [managerOptionList, managerSearch]);

    const selectedManagerOption = useMemo(() => {
        if (!managerSelection) return null;
        return (
            managerOptionList.find(
                (item) => item.userPrincipalName === managerSelection,
            ) ?? {
                id: managerSelection,
                userPrincipalName: managerSelection,
                displayName: managerSelection,
            }
        );
    }, [managerSelection, managerOptionList]);

    const toggleAccount = async () => {
        if (!user) return;
        const newStatus = !user.accountEnabled;
        const res = await fetch(`/api/users/${encodeURIComponent(id)}/account`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountEnabled: newStatus }),
        });
        if (res.ok) {
            setUser({ ...user, accountEnabled: newStatus });
            setMsg(`Account ${newStatus ? "enabled" : "disabled"}`);
        } else {
            setMsg(`Failed: ${await res.text()}`);
        }
    };

    const save = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user || !id) return;

        setSaving(true);
        setMsg(null);

        const form = new FormData(e.currentTarget);
        const payload: Record<string, any> = {};
        for (const key of [
            "displayName", "givenName", "surname", "jobTitle", "department",
            "officeLocation", "mobilePhone", "employeeId", "employeeType", "usageLocation",
        ]) {
            payload[key] = form.get(key) ?? "";
        }
        payload.managerUPN = (form.get("managerUPN") as string) || "";
        for (const key of Object.keys(payload)) {
            if (key !== "managerUPN" && payload[key] === "") delete payload[key];
        }

        const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        setSaving(false);
        if (res.ok) {
            setMsg("Saved");
            await load();
        } else {
            setMsg(`Error: ${await res.text()}`);
        }
    }, [user, id, load]);

    if (!user) {
        return (
            <AuthGuard>
                <main className="p-6 text-[var(--foreground)]">Loading...</main>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <main className="p-6 space-y-4 text-[var(--foreground)]">
                <div className="flex justify-center">
                    <div className="flex flex-col gap-6 sm:w-2xl rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                        <div className="flex-row-reverse flex justify-between">
                            <button
                                className="w-fit rounded border border-[var(--border)] bg-[var(--glass)] px-2 text-[var(--text)] shadow-[var(--shadow-soft)] backdrop-blur-xl transition-colors hover:bg-[var(--glass-strong)]"
                                onClick={() => router.back()}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="flex flex-row items-center gap-3 ">
                            <img
                                src={`/api/users/${encodeURIComponent(id)}/photo`}
                                alt="Profile photo"
                                className="h-20 w-20 rounded-full border border-[var(--border)] bg-[var(--glass-strong)] object-cover"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                    const fallback = document.getElementById("avatar-fallback");
                                    if (fallback) fallback.style.display = "flex";
                                }}
                            />
                            <div
                                id="avatar-fallback"
                                style={{ display: "none" }}
                                className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--glass-strong)] text-xl font-semibold text-[var(--text)]"
                                aria-label="Initials avatar"
                            >
                                {(user.displayName || user.userPrincipalName || "?")
                                    .split(" ")
                                    .map((segment) => segment[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase()}
                            </div>

                            <div className="basis-1/3">
                                <h1 className="text-2xl font-semibold text-[var(--text)]">
                                    {user.displayName ?? user.userPrincipalName}
                                </h1>
                                <div className="text-sm text-[var(--text)]/70">{user.userPrincipalName}</div>
                            </div>
                            <div className="flex items-center gap-3 ml-auto">
                                <span
                                    className={`rounded-full px-2 py-1 text-sm font-semibold ${
                                        user.accountEnabled
                                            ? "bg-[color:rgba(52,211,153,0.18)] text-[var(--text)]"
                                            : "bg-[color:rgba(255,99,132,0.2)] text-[var(--text)]"
                                    }`}
                                >
                                    {user.accountEnabled ? "Enabled" : "Disabled"}
                                </span>
                                <button
                                    onClick={toggleAccount}
                                    className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)] shadow-[var(--shadow-soft)] backdrop-blur-xl transition-colors hover:bg-[var(--glass-strong)]"
                                >
                                    {user.accountEnabled ? "Disable" : "Enable"} Account
                                </button>
                            </div>

                        </div>
                        <form className="grid grid-cols-1 gap-6 md:grid-cols-2" onSubmit={save}>
                            {([
                                ["displayName", "Display Name"],
                                ["givenName", "Given Name"],
                                ["surname", "Surname"],
                                ["jobTitle", "Job Title"],
                                ["department", "Department"],
                                ["officeLocation", "Office Location"],
                                ["mobilePhone", "Mobile Phone"],
                                ["employeeId", "Employee ID"],
                                ["employeeType", "Employee Type"],
                                ["usageLocation", "Usage Location (e.g. US)"],
                            ] as const).map(([key, label]) => (
                                <label key={key} className="block">
                                    <div className="mb-1 text-xs text-[var(--text)]/70">{label}</div>
                                    <input
                                        name={key}
                                        defaultValue={(user as any)[key] ?? ""}
                                        className="w-full rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] placeholder:text-[var(--text)]/50 focus:border-[var(--text)]/60 focus:outline-none"
                                    />
                                </label>
                            ))}

                            <label className="md:col-span-2 block">
                                <div className="mb-1 text-xs text-[var(--text)]/70">Manager UPN (leave empty to clear)</div>
                                <input type="hidden" name="managerUPN" value={managerSelection} />
                                <Combobox
                                    value={selectedManagerOption}
                                    onChange={(option: User | null) => {
                                        setManagerSelection(option?.userPrincipalName ?? "");
                                        setManagerSearch("");
                                    }}
                                >
                                    <div className="relative">
                                        <div className="relative w-full cursor-default rounded border border-[var(--border)] bg-[var(--glass)] pl-3 pr-10 py-2 text-left text-[var(--text)] shadow-[var(--shadow-soft)] backdrop-blur-xl focus-within:ring-2 focus-within:ring-[var(--primary)]/50">
                                            <Combobox.Input
                                                className="w-full border-0 bg-transparent p-0 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text)]/50"
                                                displayValue={(option: User | null) =>
                                                    option
                                                        ? option.displayName
                                                            ? `${option.displayName} (${option.userPrincipalName})`
                                                            : option.userPrincipalName
                                                        : ""
                                                }
                                                placeholder="Search manager by name or UPN"
                                                onChange={(event) => setManagerSearch(event.target.value)}
                                            />
                                            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                <ChevronUpDownIcon className="h-5 w-5 text-[var(--text)]/60" aria-hidden="true" />
                                            </Combobox.Button>
                                        </div>
                                        <Transition
                                            as={Fragment}
                                            leave="transition ease-in duration-100"
                                            leaveFrom="opacity-100"
                                            leaveTo="opacity-0"
                                        >
                                            <Combobox.Options className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--glass)] py-1 text-sm text-[var(--text)] shadow-[var(--shadow-soft)] backdrop-blur-xl focus:outline-none">
                                                <Combobox.Option
                                                    value={null}
                                                    className={({ active }) =>
                                                        `cursor-pointer select-none px-3 py-2 ${active ? "bg-[color:rgba(14,3,219,0.14)]" : ""}`
                                                    }
                                                >
                                                    Clear manager
                                                </Combobox.Option>

                                                {managerOptionsLoading && (
                                                    <div className="px-3 py-2 text-xs text-[var(--text)]/70">Loading managers...</div>
                                                )}
                                                {!managerOptionsLoading && filteredManagerOptions.length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-[var(--text)]/70">No results</div>
                                                )}

                                                {filteredManagerOptions.map((item) => (
                                                    <Combobox.Option
                                                        key={item.id}
                                                        value={item}
                                                        className={({ active }) =>
                                                            `flex cursor-pointer items-center justify-between px-3 py-2 ${active ? "bg-[color:rgba(14,3,219,0.14)]" : ""}`
                                                        }
                                                    >
                                                        <span>
                                                            {item.displayName
                                                                ? `${item.displayName} (${item.userPrincipalName})`
                                                                : item.userPrincipalName}
                                                        </span>
                                                        {managerSelection === item.userPrincipalName && (
                                                            <CheckIcon className="h-4 w-4 text-[var(--primary)]" />
                                                        )}
                                                    </Combobox.Option>
                                                ))}
                                            </Combobox.Options>
                                        </Transition>
                                    </div>
                                </Combobox>
                                {managerOptionsError && (
                                    <div className="mt-1 text-xs text-[var(--text)]/70">{managerOptionsError}</div>
                                )}
                            </label>

                            <div className="md:col-span-2 flex items-center gap-3">
                                <button className="rounded border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-[var(--text)] shadow-[var(--shadow-soft)] backdrop-blur-xl transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50" disabled={saving}>
                                    {saving ? "Saving..." : "Save"}
                                </button>
                                {msg && <div className="text-sm text-[var(--text)]/80">{msg}</div>}
                            </div>
                        </form>
                    </div>
                </div>
            </main>
        </AuthGuard>
    );
}
