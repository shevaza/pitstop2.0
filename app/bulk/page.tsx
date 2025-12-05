"use client";
import { useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import Papa from "papaparse";

export default function Home() {
  const [rows, setRows] = useState<any[]>([]);
  const [preflight, setPreflight] = useState<any | null>(null);
  const [applyResult, setApplyResult] = useState<any | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [canary, setCanary] = useState(5);

  function handleFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRows(res.data as any[]);
        setPreflight(null);
        setApplyResult(null);
        setPreflightError(null);
        setApplyError(null);
        setTemplateError(null);
      },
    });
  }

  async function downloadTemplate() {
    setTemplateLoading(true);
    setTemplateError(null);
    try {
      const res = await fetch("/api/template");
      if (!res.ok) {
        const message = (await res.text().catch(() => "")) || `Template download failed (${res.status})`;
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "m365-bulk-template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Template download failed", e);
      setTemplateError(e?.message || "Unexpected error downloading template");
    } finally {
      setTemplateLoading(false);
    }
  }

  async function runPreflight() {
    setPreflightLoading(true);
    setPreflightError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/preflight", { method: "POST", body: JSON.stringify({ rows }), headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const message = (await res.text().catch(() => "")) || `Preflight failed (${res.status})`;
        throw new Error(message);
      }
      setPreflight(await res.json());
    } catch (e: any) {
      console.error("Preflight failed", e);
      setPreflight(null);
      setPreflightError(e?.message || "Unexpected error during preflight");
    } finally {
      setPreflightLoading(false);
    }
  }

  async function runApply() {
    if (!preflight) return;
    setApplyLoading(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        body: JSON.stringify({ dryRun, canary, items: preflight.items }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const message = (await res.text().catch(() => "")) || `Apply failed (${res.status})`;
        throw new Error(message);
      }
      setApplyResult(await res.json());
    } catch (e: any) {
      console.error("Apply failed", e);
      setApplyResult(null);
      setApplyError(e?.message || "Unexpected error during apply");
    } finally {
      setApplyLoading(false);
    }
  }

  return (
    <AuthGuard>
      <main className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">M365 Bulk Updater</h1>

        <section className="space-y-2">
          <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-soft)] hover:bg-[var(--glass-strong)] cursor-pointer">
            <span>Upload CSV</span>
            <input
              title="excel"
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            />
          </label>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-[var(--border)] bg-[var(--glass)] rounded text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-soft)] hover:bg-[var(--glass-strong)] cursor-pointer disabled:opacity-60" onClick={downloadTemplate} disabled={templateLoading}>
              {templateLoading ? "Preparing..." : "Download template (first 10 directory users)"}
            </button>
            {templateError && <span className="text-sm text-red-600">Template: {templateError}</span>}
          </div>
          <div className="text-sm text-gray-600">Expected columns: UserPrincipalName, DisplayName, GivenName, Surname, JobTitle, Department, OfficeLocation, MobilePhone, EmployeeId, EmployeeType, UsageLocation, ManagerUPN, Groups(semi;colon;list), Licenses(comma,list)</div>
          <button className="px-4 py-2 bg-white text-black rounded disabled:opacity-60" onClick={runPreflight} disabled={!rows.length || preflightLoading}>
            {preflightLoading ? "Checking..." : "Preflight"}
          </button>
          {preflightError && <div className="text-sm text-red-600">Preflight failed: {preflightError}</div>}
        </section>

        {preflight && (
          <section className="space-y-3">
            <div className="text-sm">Rows: {preflight.summary.rows} | Will change: {preflight.summary.willChange} | Errors: {preflight.summary.errors}</div>
            <div className="max-h-80 overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead><tr><th className="text-left p-2">UPN</th><th className="text-left p-2">Changes</th><th className="text-left p-2">Errors</th></tr></thead>
                <tbody>
                  {preflight.items.slice(0, 50).map((it: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{it.upn}</td>
                      <td className="p-2">{(it.changes || []).map((c: any, j: number) => <div key={j} className="text-green-700">{c.field}{c.values ? `: ${c.values.join(",")}` : ""}</div>)}</td>
                      <td className="p-2">{(it.errors || []).map((e: any, j: number) => <div key={j} className="text-red-600">{e}</div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
                Dry run
              </label>
              <label className="flex items-center gap-2">
                Canary:
                <input className="border p-1 rounded w-20" type="number" min={0} value={canary} onChange={e => setCanary(parseInt(e.target.value || "0"))} />
              </label>
              <button className="px-4 py-2 bg-black text-white rounded disabled:opacity-60" onClick={runApply} disabled={applyLoading}>
                {applyLoading ? "Applying..." : "Apply"}
              </button>
            </div>
            {applyError && <div className="text-sm text-red-600">Apply failed: {applyError}</div>}
          </section>
        )}

        {applyResult && (
          <section className="space-y-2">
            <div className="text-sm">Changed: {applyResult.summary.changed} | Failed: {applyResult.summary.failed}</div>
            <div className="max-h-80 overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead><tr><th className="text-left p-2">UPN</th><th className="text-left p-2">Status</th><th className="text-left p-2">Details</th></tr></thead>
                <tbody>
                  {applyResult.results.slice(0, 50).map((r: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.upn}</td>
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">{(r.details?.ops || []).map((o: any, j: number) => <div key={j}>{o.type}</div>)}
                        {r.details?.error && <div className="text-red-600">{r.details.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </AuthGuard>
  );
}
