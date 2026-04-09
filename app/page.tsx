"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Metrics = {
  totals: { employees: number; active: number; disabled: number; guests: number };
  departments: { name: string; count: number; active: number; disabled: number }[];
  generatedAt: string;
  recentRuns: { id: string; actorUpn: string; createdAt: string; dryRun: boolean; total: number; changed: number; failed: number }[];
};

export default function Home() {
  const { status } = useSession();
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) {
        const message = (await res.text()) || `Request failed with ${res.status}`;
        setError(message);
        setData(null);
        return;
      }
      const json = (await res.json()) as Metrics;
      setData(json);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
  }, [status, load]);

  const deptTop10 = useMemo(() => (data?.departments ?? []).slice(0, 10), [data]);

  return (
    <ModuleGuard moduleKey="dashboard">
      <main className="p-6 space-y-6 text-[var(--foreground)]">

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-[color:rgba(255,255,255,0.06)] p-4 text-sm text-red-100 shadow-[var(--shadow-soft)] backdrop-blur-xl">
            Failed to load metrics: {error}
          </div>
        )}

        {/* KPI cards */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Kpi title="Total Employees" value={data?.totals.employees} loading={loading} />
          <Kpi title="Active" value={data?.totals.active} trend={percent(data?.totals.active, data?.totals.employees)} loading={loading} />
          <Kpi title="Disabled" value={data?.totals.disabled} trend={percent(data?.totals.disabled, data?.totals.employees)} loading={loading} />
          <Kpi title="Guests" value={data?.totals.guests} loading={loading} />
        </section>

        {/* Department headcount chart + table */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[var(--text)]">Top Departments by Headcount</h2>
              <span className="text-xs text-[var(--text)]/70">Top 10</span>
            </div>
            <div className="h-72 rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 shadow-inner">
              {loading ? (
                <div className="p-4 text-[var(--text)]/70">Loading chart...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptTop10} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#e8ebff" }} interval={0} angle={0} height={60} />
                    <YAxis tick={{ fill: "#e8ebff" }} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(3,3,10,0.92)",
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 12,
                        color: "#e8ebff",
                        backdropFilter: "blur(14px)",
                      }}
                      labelStyle={{ color: "#ffffff" }}
                      itemStyle={{ color: "#e8ebff" }}
                    />
                    <Bar dataKey="count" fill="rgba(100,60,255,0.85)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
            <h2 className="mb-3 text-xl font-semibold text-[var(--text)]">Recent Bulk Runs</h2>
            <div className="space-y-2">
              {data?.recentRuns?.length
                ? data.recentRuns.map((r) => (
                  <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm shadow-[var(--shadow-soft)]">
                    <div className="flex justify-between gap-2">
                      <div className="font-medium text-[var(--text)]">{new Date(r.createdAt).toLocaleString()}</div>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${r.dryRun ? "bg-[color:rgba(255,214,102,0.18)] text-[var(--text)]" : "bg-[color:rgba(52,211,153,0.16)] text-[var(--text)]"}`}>
                        {r.dryRun ? "DRY RUN" : "APPLIED"}
                      </span>
                    </div>
                    <div className="mt-1 text-[var(--text)]/70">
                      by {r.actorUpn} - total {r.total}, changed {r.changed}, failed {r.failed}
                    </div>
                  </div>
                ))
                : <div className="text-[var(--text)]/70">No recent runs</div>}
            </div>
          </div>
        </section>

        {/* Department table */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
          <h2 className="mb-3 text-xl font-semibold text-[var(--text)]">Departments</h2>
          <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
            <table className="min-w-full text-sm text-[var(--text)]">
              <thead>
                <tr className="bg-[color:rgba(255,255,255,0.06)] text-[var(--text)]/70">
                  <th className="p-2 text-left">Department</th>
                  <th className="p-2 text-right">Headcount</th>
                  <th className="p-2 text-right">Active</th>
                  <th className="p-2 text-right">Disabled</th>
                </tr>
              </thead>
              <tbody>
                {(data?.departments ?? []).map((d) => (
                  <tr key={d.name} className="border-t border-[var(--border)]/80 transition-colors hover:bg-[color:rgba(14,3,219,0.12)]">
                    <td className="p-2">{d.name}</td>
                    <td className="p-2 text-right">{d.count}</td>
                    <td className="p-2 text-right">{d.active}</td>
                    <td className="p-2 text-right">{d.disabled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </ModuleGuard>
  );
}

function Kpi({ title, value, trend, loading }: { title: string; value?: number; trend?: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-4 shadow-[var(--shadow-soft)] backdrop-blur-2xl transition-transform duration-150 hover:-translate-y-0.5">
      <div className="text-sm text-[var(--text)]/70">{title}</div>
      <div className="mt-1 text-3xl font-semibold text-[var(--text)]">{loading ? "..." : value ?? "N/A"}</div>
      {trend && <div className="mt-1 text-xs text-[var(--text)]/60">{trend} of total</div>}
    </div>
  );
}

function percent(part?: number, total?: number) {
  if (!part || !total) return undefined;
  return `${Math.round((part / total) * 100)}%`;
}
