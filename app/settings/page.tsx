"use client";

import AuthGuard from "@/components/AuthGuard";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type SettingsState = {
    server: string;
    database: string;
    user: string;
    password: string;
    attendanceQuery: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    hasPassword?: boolean;
    source?: "file" | "env" | "mixed";
    defaultQuery?: string;
};

export default function SettingsPage() {
    const { status } = useSession();
    const [state, setState] = useState<SettingsState>({
        server: "",
        database: "",
        user: "",
        password: "",
        attendanceQuery: "",
        encrypt: true,
        trustServerCertificate: true,
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canSave = useMemo(
        () =>
            state.server.trim().length > 0 &&
            state.database.trim().length > 0 &&
            state.user.trim().length > 0 &&
            (state.password.trim().length > 0 || state.hasPassword),
        [state],
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/settings/mssql", { cache: "no-store" });
            if (!res.ok) {
                const msg = (await res.text()) || `Request failed with ${res.status}`;
                throw new Error(msg);
            }
            const json = await res.json();
            const settings = json.settings as SettingsState | null;
            setState((prev) => ({
                ...prev,
                ...(settings ?? {}),
                attendanceQuery: settings?.attendanceQuery || json.defaultQuery || "",
                defaultQuery: json.defaultQuery,
            }));
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (status === "authenticated") void load();
    }, [status, load]);

    const handleSubmit = useCallback(async () => {
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const payload = {
                server: state.server,
                database: state.database,
                user: state.user,
                attendanceQuery: state.attendanceQuery || state.defaultQuery,
                encrypt: state.encrypt,
                trustServerCertificate: state.trustServerCertificate,
                ...(state.password.trim() ? { password: state.password } : {}),
            };
            const res = await fetch("/api/settings/mssql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const msg = (await res.text()) || `Request failed with ${res.status}`;
                throw new Error(msg);
            }
            const json = await res.json();
            setMessage("Settings saved");
            setState((prev) => ({
                ...prev,
                ...json.settings,
                password: "",
            }));
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setSaving(false);
        }
    }, [state]);

    return (
        <AuthGuard>
          <div className="space-y-6 p-4 md:p-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold text-[var(--text)]">Settings</h1>
              <p className="text-sm text-[var(--text)]/70">
                Configure the MSSQL connection used by the Attendance page.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-[color:rgba(255,255,255,0.06)] p-4 text-sm text-red-100 shadow-[var(--shadow-soft)]">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-emerald-500/40 bg-[color:rgba(16,185,129,0.15)] p-4 text-sm text-emerald-100 shadow-[var(--shadow-soft)]">
                {message}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <SettingCard title="Server" description="Hostname or IP of your SQL Server instance.">
                <input
                  type="text"
                  value={state.server}
                  onChange={(e) => setState((s) => ({ ...s, server: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                  placeholder="sql.mycompany.local"
                />
              </SettingCard>
              <SettingCard title="Database" description="Database name that holds attendance data.">
                <input
                  type="text"
                  value={state.database}
                  onChange={(e) => setState((s) => ({ ...s, database: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                  placeholder="AttendanceDb"
                />
              </SettingCard>
              <SettingCard title="User" description="SQL account with read access to the attendance table or view.">
                <input
                  type="text"
                  value={state.user}
                  onChange={(e) => setState((s) => ({ ...s, user: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                  placeholder="attendance_reader"
                />
              </SettingCard>
              <SettingCard title="Password" description={state.hasPassword ? "Leave blank to keep the saved password." : "SQL user password."}>
                <input
                  type="password"
                  value={state.password}
                  onChange={(e) => setState((s) => ({ ...s, password: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                  placeholder={state.hasPassword ? "Stored securely on server" : "••••••••"}
                />
              </SettingCard>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text)]">Attendance query</h2>
                  <p className="text-xs text-[var(--text)]/60">
                    Use {"{{limit}}"} as a placeholder for the requested row limit.
                  </p>
                </div>
                {state.defaultQuery && (
                  <button
                    type="button"
                    className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--glass-strong)]"
                    onClick={() => setState((s) => ({ ...s, attendanceQuery: state.defaultQuery ?? "" }))}
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <textarea
                value={state.attendanceQuery}
                onChange={(e) => setState((s) => ({ ...s, attendanceQuery: e.target.value }))}
                className="h-40 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                placeholder={state.defaultQuery}
              />
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-[var(--text)]/80">
                  <input
                    type="checkbox"
                    checked={state.encrypt}
                    onChange={(e) => setState((s) => ({ ...s, encrypt: e.target.checked }))}
                    className="h-4 w-4 rounded border-[var(--border)] bg-[var(--glass-strong)]"
                  />
                  Encrypt connection
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text)]/80">
                  <input
                    type="checkbox"
                    checked={state.trustServerCertificate}
                    onChange={(e) => setState((s) => ({ ...s, trustServerCertificate: e.target.checked }))}
                    className="h-4 w-4 rounded border-[var(--border)] bg-[var(--glass-strong)]"
                  />
                  Trust server certificate
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSave || saving}
                className="rounded-lg border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-soft)] hover:bg-[var(--glass-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save settings"}
              </button>
              <span className="text-xs text-[var(--text)]/60">
                Stored on the server (not in the browser).
              </span>
            </div>

            {loading && (
              <div className="text-sm text-[var(--text)]/70">Loading current settings…</div>
            )}
          </div>
        </AuthGuard>
    );
}

function SettingCard({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
            <div className="mb-3 text-xs text-[var(--text)]/60">{description}</div>
            {children}
        </div>
    );
}
