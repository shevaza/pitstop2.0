"use client";

import AuthGuard from "@/components/AuthGuard";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type ReportForm = {
    id: string;
    name: string;
    query: string;
};

type SettingsState = {
    server: string;
    database: string;
    user: string;
    password: string;
    reports: ReportForm[];
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
        reports: [{ id: "attendance-default", name: "Attendance", query: "" }],
        encrypt: true,
        trustServerCertificate: true,
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canSave = useMemo(() => {
        const hasReports =
            state.reports.length > 0 &&
            state.reports.every((report) => report.name.trim().length > 0 && report.query.trim().length > 0);
        return (
            state.server.trim().length > 0 &&
            state.database.trim().length > 0 &&
            state.user.trim().length > 0 &&
            (state.password.trim().length > 0 || state.hasPassword) &&
            hasReports
        );
    }, [state]);

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
            const settings = json.settings as (SettingsState & { attendanceQuery?: string }) | null;
            const normalizedReports = buildReports(settings?.reports, settings?.attendanceQuery || json.defaultQuery);
            setState((prev) => ({
                ...prev,
                server: settings?.server ?? "",
                database: settings?.database ?? "",
                user: settings?.user ?? "",
                encrypt: settings?.encrypt ?? true,
                trustServerCertificate: settings?.trustServerCertificate ?? true,
                hasPassword: settings?.hasPassword,
                source: settings?.source,
                reports: normalizedReports,
                defaultQuery: json.defaultQuery,
                password: "",
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
            const cleanedReports = state.reports.map((r, idx) => ({
                id: r.id || `report-${idx + 1}`,
                name: r.name.trim() || `Report ${idx + 1}`,
                query: r.query.trim(),
            }));
            const payload = {
                server: state.server,
                database: state.database,
                user: state.user,
                attendanceQuery: cleanedReports[0]?.query || state.defaultQuery,
                reports: cleanedReports,
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
                reports: buildReports(json.settings?.reports, json.settings?.attendanceQuery || prev.defaultQuery),
                password: "",
            }));
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setSaving(false);
        }
    }, [state]);

    const addReport = useCallback(() => {
        setState((s) => ({
            ...s,
            reports: [...s.reports, createReport(`Report ${s.reports.length + 1}`, s.defaultQuery)],
        }));
    }, []);

    const removeReport = useCallback((id: string) => {
        setState((s) => {
            if (s.reports.length <= 1) return s;
            return { ...s, reports: s.reports.filter((r) => r.id !== id) };
        });
    }, []);

    const updateReport = useCallback((id: string, updates: Partial<ReportForm>) => {
        setState((s) => ({
            ...s,
            reports: s.reports.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }));
    }, []);

    const resetReportQuery = useCallback((id: string) => {
        setState((s) => ({
            ...s,
            reports: s.reports.map((r) =>
                r.id === id ? { ...r, query: s.defaultQuery ?? r.query } : r,
            ),
        }));
    }, []);

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
                  <h2 className="text-lg font-semibold text-[var(--text)]">Attendance reports</h2>
                  <p className="text-xs text-[var(--text)]/60">
                    Create one or more report queries. Use {"{{limit}}"}, {"{{FromDate}}"}, {"{{ToDate}}"} as placeholders.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--glass-strong)]"
                    onClick={addReport}
                  >
                    Add report
                  </button>
                  {state.defaultQuery && (
                    <button
                      type="button"
                      className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--glass-strong)]"
                      onClick={() =>
                        setState((s) => ({
                            ...s,
                            reports: buildReports(s.reports, s.defaultQuery),
                        }))
                      }
                    >
                      Reset empty queries
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {state.reports.map((report, idx) => (
                  <div key={report.id} className="rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 shadow-[var(--shadow-soft)] md:p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text)]">
                          {report.name || `Report ${idx + 1}`}
                        </div>
                        <div className="text-xs text-[var(--text)]/60">
                          Report {idx + 1} • Use {"{{limit}}"} for the requested row limit and {"{{FromDate}} / {{ToDate}}"} for date filters.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {state.defaultQuery && (
                          <button
                            type="button"
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--text)] hover:bg-[var(--glass-strong)]"
                            onClick={() => resetReportQuery(report.id)}
                          >
                            Use default query
                          </button>
                        )}
                        {state.reports.length > 1 && (
                          <button
                            type="button"
                            className="rounded border border-red-500/60 px-3 py-1 text-xs text-red-100 hover:bg-red-500/10"
                            onClick={() => removeReport(report.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-[var(--text)]/70">
                        <span>Report name</span>
                        <input
                          type="text"
                          value={report.name}
                          onChange={(e) => updateReport(report.id, { name: e.target.value })}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                          placeholder={`Report ${idx + 1}`}
                        />
                      </label>
                      <label className="md:col-span-2 flex flex-col gap-1 text-xs text-[var(--text)]/70">
                        <span>Report query</span>
                        <textarea
                          value={report.query}
                          onChange={(e) => updateReport(report.id, { query: e.target.value })}
                          className="h-32 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--glass)] p-3 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                          placeholder={state.defaultQuery}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
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

function buildReports(reports?: ReportForm[], fallbackQuery?: string): ReportForm[] {
    const normalized =
        reports?.map((report, idx) => ({
            id: report.id || `report-${idx + 1}`,
            name: report.name?.trim() || `Report ${idx + 1}`,
            query: (report.query ?? "").trim() || (fallbackQuery ?? ""),
        })) ?? [];

    const usable = normalized.filter((report) => report.query.trim().length > 0);
    if (usable.length > 0) {
        return usable;
    }

    if (fallbackQuery) {
        return [createReport("Attendance", fallbackQuery)];
    }

    return [createReport("Attendance", "")];
}

function createReport(name: string, query?: string): ReportForm {
    const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `report-${Math.random().toString(16).slice(2)}`;
    return { id, name, query: query ?? "" };
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
