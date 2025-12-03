"use client";

import AuthGuard from "@/components/AuthGuard";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AttendanceResponse = {
    rows: Record<string, unknown>[];
    columns: string[];
    fetchedAt: string;
    limit: number;
    queryUsed?: string;
    source?: string;
};

export default function AttendancePage() {
    const { status } = useSession();
    const [data, setData] = useState<AttendanceResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [limit, setLimit] = useState(200);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/attendance?limit=${limit}`, { cache: "no-store" });
            if (!res.ok) {
                const msg = (await res.text()) || `Request failed with ${res.status}`;
                throw new Error(msg);
            }
            const json = (await res.json()) as AttendanceResponse;
            setData(json);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Unknown error");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        if (status === "authenticated") void load();
    }, [status, load]);

    const filteredRows = useMemo(() => {
        if (!search.trim()) return data?.rows ?? [];
        const term = search.toLowerCase();
        return (data?.rows ?? []).filter((row) =>
            (data?.columns ?? []).some((col) => `${row[col] ?? ""}`.toLowerCase().includes(term)),
        );
    }, [data, search]);

    return (
        <AuthGuard>
          <div className="space-y-6 p-4 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-[var(--text)]">Attendance</h1>
                <p className="text-sm text-[var(--text)]/70">
                  Pull live attendance data from your configured MSSQL source.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-[var(--text)]/80">
                  <span>Limit</span>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value) || 0)}
                    className="w-24 rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-2 py-1 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-lg border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm font-medium text-[var(--text)] shadow-[var(--shadow-soft)] hover:bg-[var(--glass-strong)]"
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
                <a
                  href="/settings"
                  className="rounded-lg border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--glass-strong)]"
                >
                  Settings
                </a>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-[color:rgba(255,255,255,0.06)] p-4 text-sm text-red-100 shadow-[var(--shadow-soft)]">
                {error}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
                <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">Records</div>
                <div className="mt-1 text-3xl font-semibold text-[var(--text)]">
                  {loading ? "…" : filteredRows.length}
                </div>
                <div className="mt-1 text-xs text-[var(--text)]/60">
                  Showing up to {limit} rows
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
                <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">Source</div>
                <div className="mt-1 text-base font-semibold text-[var(--text)]">
                  {data?.source || "Not connected"}
                </div>
                <div className="mt-1 text-xs text-[var(--text)]/60">
                  {data?.fetchedAt ? `Updated ${new Date(data.fetchedAt).toLocaleString()}` : "Waiting for data"}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
                <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">Query</div>
                <div className="mt-1 truncate text-sm text-[var(--text)]/80">
                  {data?.queryUsed || "Using default attendance query"}
                </div>
                <div className="mt-1 text-xs text-[var(--text)]/60">
                  Edit the query in Settings if your schema differs.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)]">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text)]">Attendance Records</h2>
                  <p className="text-xs text-[var(--text)]/60">
                    Data is pulled live from MSSQL; nothing is cached.
                  </p>
                </div>
                <input
                  type="search"
                  placeholder="Search rows"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-0 focus:border-[var(--text)]/40"
                />
              </div>
              <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
                <table className="min-w-full text-sm text-[var(--text)]">
                  <thead>
                    <tr className="bg-[color:rgba(255,255,255,0.06)] text-left text-[var(--text)]/70">
                      {(data?.columns ?? []).map((col) => (
                        <th key={col} className="px-3 py-2">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td className="px-3 py-4 text-[var(--text)]/70" colSpan={(data?.columns ?? []).length || 1}>
                          Loading attendance…
                        </td>
                      </tr>
                    ) : filteredRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-[var(--text)]/70" colSpan={(data?.columns ?? []).length || 1}>
                          No rows found. Check your query or adjust the search filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-t border-[var(--border)]/80 transition-colors hover:bg-[color:rgba(14,3,219,0.12)]"
                        >
                          {(data?.columns ?? []).map((col) => (
                            <td key={col} className="px-3 py-2 align-top">
                              {formatValue(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </AuthGuard>
    );
}

function formatValue(value: unknown) {
    if (value === null || value === undefined) return "—";
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === "string") {
        const date = Date.parse(value);
        if (!Number.isNaN(date) && value.length > 10) {
            return new Date(date).toLocaleString();
        }
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
}
