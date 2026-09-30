"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type Settings = { connected: boolean; reports: { id: string; name: string }[] };

export default function SettingsPage() {
    const { status } = useSession();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/settings/mssql", { cache: "no-store" });
            if (!response.ok) throw new Error((await response.text()) || "Could not check attendance connection.");
            setSettings((await response.json()).settings);
        } catch (error) {
            setSettings(null);
            setError(error instanceof Error ? error.message : "Could not check attendance connection.");
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);

    return (
        <ModuleGuard moduleKey="settings">
            <div className="space-y-6 p-4 md:p-6">
                <h1 className="text-2xl font-semibold text-[var(--text)]">Settings</h1>
                <p className="text-sm text-[var(--text)]/70">Attendance connection and available reports.</p>
                {error && <div role="alert" className="rounded-xl border border-red-500/40 p-4 text-sm text-red-100">{error}</div>}
                <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 text-[var(--text)]">
                    <h2 className="text-lg font-semibold">Attendance service</h2>
                    <p role="status">{loading ? "Checking connection…" : settings?.connected ? "Connected" : "Not connected"}</p>
                    <p className="text-sm opacity-70">IT manages database access and report definitions on the internal attendance server. Contact IT to request changes.</p>
                    <button type="button" disabled={loading} onClick={() => void load()} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50">
                        {loading ? "Checking…" : "Check connection"}
                    </button>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 text-[var(--text)]">
                    <h2 className="mb-3 text-lg font-semibold">Available reports</h2>
                    {settings?.reports.map((report) => <p key={report.id} className="border-t border-[var(--border)] py-3">{report.name}</p>)}
                    {!settings?.reports.length && <p className="text-sm opacity-70">Connect to the attendance service to load reports.</p>}
                </div>
            </div>
        </ModuleGuard>
    );
}
