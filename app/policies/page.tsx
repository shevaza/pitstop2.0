"use client";

import LoadingState from "@/components/LoadingState";
import ModuleGuard from "@/components/ModuleGuard";
import type { Policy, PolicyAcknowledgement, PolicyList } from "@/lib/policy-types";
import { useCallback, useEffect, useState } from "react";

const panel = "rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 space-y-4";
const button = "rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50";
const input = "w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] p-3";
function Policies() {
    const [data, setData] = useState<PolicyList | null>(null);
    const [selected, setSelected] = useState<Policy | null>(null);
    const [editor, setEditor] = useState<{ id?: string; version?: number; title: string; body: string } | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [search, setSearch] = useState("");
    const [pendingOnly, setPendingOnly] = useState(false);
    const [report, setReport] = useState<PolicyAcknowledgement[] | null>(null);
    const load = useCallback(async () => {
        const response = await fetch("/api/policies", { cache: "no-store" });
        if (!response.ok) throw new Error(await response.text());
        setData(await response.json());
        setSelected(null); setConfirmed(false); setReport(null);
    }, []);
    useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);

    async function perform(action: () => Promise<void>) {
        setBusy(true); setError(""); setNotice("");
        try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
        finally { setBusy(false); }
    }
    async function save() {
        const response = await fetch("/api/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editor) });
        if (!response.ok) throw new Error(await response.text());
        setEditor(null); setSelected(null); setReport(null);
        setNotice("Policy published. Employees will see an alert and must acknowledge this version.");
        await load(); window.dispatchEvent(new Event("policies-changed"));
    }
    async function acknowledge() {
        if (!selected || !confirmed) return;
        const response = await fetch(`/api/policies/${selected.id}/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: selected.version }) });
        if (!response.ok) throw new Error(await response.text());
        setSelected(null); setConfirmed(false); setNotice("Acknowledgement recorded.");
        await load(); window.dispatchEvent(new Event("policies-changed"));
    }
    return <main className="mx-auto max-w-6xl space-y-5 p-4 text-[var(--text)] md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h1 className="text-3xl font-semibold">Policy portal</h1><p className="mt-2 opacity-70">Read company policies and acknowledge each published version.</p></div>
            {data?.canModify && <button className={button} disabled={busy} onClick={() => { setEditor({ title: "", body: "" }); setSelected(null); }}>New policy</button>}
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-400 p-3">{error} <button className={button} disabled={busy} onClick={() => void perform(load)}>Refresh policies</button></p>}
        {notice && <p role="status" className={panel}>{notice}</p>}
        {!data && !error && <LoadingState compact />}
        {data && <>
            <div className={panel}><strong>{data.pendingCount} {data.pendingCount === 1 ? "policy requires" : "policies require"} your acknowledgement</strong><p className="text-sm opacity-70">New policies and updates remain pending until you acknowledge them.</p></div>
            <div className="flex flex-wrap items-center gap-4">
                <input aria-label="Search policies" className={`${input} max-w-md`} placeholder="Search policies" value={search} onChange={(e) => setSearch(e.target.value)} />
                <label className="flex gap-2"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Pending only</label>
                <button className={button} disabled={busy} onClick={() => void perform(load)}>Refresh</button>
            </div>
            {editor && <form className={panel} onSubmit={(e) => { e.preventDefault(); void perform(save); }}>
                <h2 className="text-xl font-semibold">{editor.id ? `Publish version ${editor.version! + 1}` : "Publish a new policy"}</h2>
                <label className="block">Title<input required maxLength={200} className={`${input} mt-2`} value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></label>
                <label className="block">Policy text<textarea required maxLength={100000} rows={14} className={`${input} mt-2`} value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} /></label>
                <p className="text-sm opacity-70">Publishing makes this version available immediately and requires everyone to acknowledge it.</p>
                <div className="flex gap-3"><button className={button} disabled={busy || !editor.title.trim() || !editor.body.trim()}>{busy ? "Publishing…" : "Publish policy"}</button><button type="button" className={button} disabled={busy} onClick={() => setEditor(null)}>Cancel</button></div>
            </form>}
            {selected && <article className={panel}>
                <div className="flex justify-between gap-3"><h2 className="text-2xl font-semibold">{selected.title}</h2><button className={button} disabled={busy} onClick={() => { setSelected(null); setReport(null); }}>Close</button></div>
                <p className="text-sm opacity-70">Version {selected.version} · Published {new Date(selected.updated_at).toLocaleString()} by {selected.updated_by_upn}</p>
                <div className="whitespace-pre-wrap break-words leading-7">{selected.body}</div>
                {selected.acknowledged_at ? <p>Acknowledged {new Date(selected.acknowledged_at).toLocaleString()}</p> : <>
                    <label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm that I have read this policy, version {selected.version}.</label>
                    <button className={button} disabled={busy || !confirmed} onClick={() => void perform(acknowledge)}>Acknowledge policy</button>
                </>}
                {data.canModify && <div className="flex flex-wrap gap-3">
                    <button className={button} disabled={busy} onClick={() => { setEditor({ id: selected.id, version: selected.version, title: selected.title, body: selected.body }); setSelected(null); setReport(null); }}>Edit policy</button>
                    <button className={button} disabled={busy} onClick={() => void perform(async () => {
                        const res = await fetch(`/api/policies/${selected.id}/acknowledgements`, { cache: "no-store" });
                        if (!res.ok) throw new Error(await res.text());
                        setReport((await res.json()).acknowledgements);
                    })}>View acknowledgements</button>
                </div>}
                {report && <div className="overflow-x-auto"><h3 className="mb-3 font-semibold">Acknowledgement history ({report.length})</h3>{report.length ? <table className="w-full text-left text-sm"><thead><tr><th>Employee</th><th>Version</th><th>Acknowledged</th></tr></thead><tbody>{report.map((row) => <tr key={`${row.user_upn}:${row.version}`}><td className="py-2 pr-4">{row.user_upn}</td><td>{row.version}</td><td>{new Date(row.acknowledged_at).toLocaleString()}</td></tr>)}</tbody></table> : <p>No acknowledgements yet.</p>}</div>}
            </article>}
            <div className="grid gap-4 md:grid-cols-2">{data.policies.filter((p) => (!pendingOnly || !p.acknowledged_at) && `${p.title} ${p.body}`.toLowerCase().includes(search.toLowerCase())).map((policy) => <div key={policy.id} className={panel}>
                <p className="text-sm">{policy.acknowledged_at ? "Acknowledged" : policy.version === 1 ? "New · Acknowledgement required" : "Updated · Acknowledgement required"}</p>
                <h2 className="text-xl font-semibold">{policy.title}</h2><p className="text-sm opacity-70">Version {policy.version} · {new Date(policy.updated_at).toLocaleDateString()}</p>
                <p className="line-clamp-2 whitespace-pre-wrap">{policy.body}</p>
                <button className={button} disabled={busy} onClick={() => { setSelected(policy); setConfirmed(false); setReport(null); setEditor(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Read policy</button>
            </div>)}</div>
            {!data.policies.length && <p className={panel}>No policies have been published yet.</p>}
            {!!data.policies.length && !data.policies.some((p) => (!pendingOnly || !p.acknowledged_at) && `${p.title} ${p.body}`.toLowerCase().includes(search.toLowerCase())) && <p>No matching policies.</p>}
        </>}
    </main>;
}

export default function PoliciesPage() { return <ModuleGuard moduleKey="policies"><Policies /></ModuleGuard>; }
