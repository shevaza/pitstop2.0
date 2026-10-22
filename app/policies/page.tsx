"use client";

import LoadingState from "@/components/LoadingState";
import ModuleGuard from "@/components/ModuleGuard";
import type { Policy, PolicyAcknowledgement, PolicyList, PolicyAudience } from "@/lib/policy-types";
import { useCallback, useEffect, useState } from "react";

const panel = "rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 space-y-4";
const button = "rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50";
const input = "w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] p-3";
function Policies() {
    const [data, setData] = useState<PolicyList | null>(null);
    const [selected, setSelected] = useState<Policy | null>(null);
    const [editor, setEditor] = useState<{ id?: string; version: number; expectedVersion?: number; title: string; body: string; target_departments: string[]; target_users: string[] } | null>(null);
    const [audience, setAudience] = useState<PolicyAudience | null>(null);
    const [audienceSearch, setAudienceSearch] = useState("");
    useEffect(() => {
        if (!editor || audience) return;
        const controller = new AbortController();
        fetch("/api/policies/audience", { signal: controller.signal, cache: "no-store" }).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
            setAudience(await res.json());
        }).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
        return () => controller.abort();
    }, [editor, audience]);
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
        setNotice("Policy published. Recipients will see an alert and must acknowledge this version.");
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
            {data?.canModify && <button className={button} disabled={busy} onClick={() => { setEditor({ title: "", body: "", version: 1, target_departments: [], target_users: [] }); setSelected(null); }}>New policy</button>}
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
                <h2 className="text-xl font-semibold">{editor.id ? "Publish an updated policy" : "Publish a new policy"}</h2>
                <label className="block">Version<input type="number" required min={editor.expectedVersion ? editor.expectedVersion + 1 : 1} max={2147483647} step={1} className={`${input} mt-2`} value={Number.isNaN(editor.version) ? "" : editor.version} onChange={(e) => setEditor({ ...editor, version: e.target.valueAsNumber })} /></label>
                <fieldset className="space-y-3"><legend className="font-semibold">Send to</legend>
                    <label className="flex gap-2"><input type="radio" name="audience" checked={!editor.target_departments.length && !editor.target_users.length} onChange={() => setEditor({ ...editor, target_departments: [], target_users: [] })} />Everyone</label>
                    <p className="text-sm opacity-70">Select departments, individual users, or both. With no selection, the policy goes to everyone. Department recipients are captured from Microsoft 365 when you publish.</p>
                    {!audience ? <p>Loading Microsoft 365 directory?</p> : <>
                        <label className="block">Departments<select multiple className={`${input} mt-2`} value={editor.target_departments} onChange={(e) => setEditor({ ...editor, target_departments: Array.from(e.target.selectedOptions, (o) => o.value) })}>{audience.departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
                        <input aria-label="Search recipients" placeholder="Search users by name, email or department" className={input} value={audienceSearch} onChange={(e) => setAudienceSearch(e.target.value)} />
                        <div className="max-h-64 overflow-y-auto space-y-2" role="group" aria-label="Selected users">{audience.users.filter((u) => `${u.name} ${u.upn} ${u.department}`.toLowerCase().includes(audienceSearch.toLowerCase())).map((u) => <label key={u.upn} className="flex gap-2"><input type="checkbox" checked={editor.target_users.includes(u.upn)} onChange={(e) => setEditor({ ...editor, target_users: e.target.checked ? [...editor.target_users, u.upn] : editor.target_users.filter((upn) => upn !== u.upn) })} />{u.name} ({u.upn}){u.department && ` ? ${u.department}`}</label>)}</div>
                        <p className="text-sm">{editor.target_departments.length} departments ? {editor.target_users.length} selected users</p>
                    </>}
                </fieldset>
                <label className="block">Title<input required maxLength={200} className={`${input} mt-2`} value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></label>
                <label className="block">Policy text<textarea required maxLength={100000} rows={14} className={`${input} mt-2`} value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} /></label>
                <p className="text-sm opacity-70">Publishing makes this version available immediately and requires the recipients to acknowledge it.</p>
                <div className="flex gap-3"><button className={button} disabled={busy || !Number.isInteger(editor.version) || editor.version < (editor.expectedVersion ? editor.expectedVersion + 1 : 1) || !editor.title.trim() || !editor.body.trim()}>{busy ? "Publishing…" : "Publish policy"}</button><button type="button" className={button} disabled={busy} onClick={() => setEditor(null)}>Cancel</button></div>
            </form>}
            {selected && <article className={panel}>
                <div className="flex justify-between gap-3"><h2 className="text-2xl font-semibold">{selected.title}</h2><button className={button} disabled={busy} onClick={() => { setSelected(null); setReport(null); }}>Close</button></div>
                <p className="text-sm opacity-70">Version {selected.version} · Published {new Date(selected.updated_at).toLocaleString()} by {selected.updated_by_upn}</p>
                <div className="whitespace-pre-wrap break-words leading-7">{selected.body}</div>
                {data.canModify && <p className="text-sm">Audience: {selected.recipient_upns == null ? "Everyone" : `${selected.target_departments.join(", ")}${selected.target_departments.length && selected.target_users.length ? "; " : ""}${selected.target_users.join(", ")} (${selected.recipient_upns.length} recipients)`}</p>}
                {selected.requires_acknowledgement === false ? <p>This policy is assigned to other recipients.</p> : selected.acknowledged_at ? <p>Acknowledged {new Date(selected.acknowledged_at).toLocaleString()}</p> : <>
                    <label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm that I have read this policy, version {selected.version}.</label>
                    <button className={button} disabled={busy || !confirmed} onClick={() => void perform(acknowledge)}>Acknowledge policy</button>
                </>}
                {data.canModify && <div className="flex flex-wrap gap-3">
                    <button className={button} disabled={busy} onClick={() => { setEditor({ id: selected.id, version: selected.version + 1, expectedVersion: selected.version, target_departments: selected.target_departments ?? [], target_users: selected.target_users ?? [], title: selected.title, body: selected.body }); setSelected(null); setReport(null); }}>Edit policy</button>
                    <button className={button} disabled={busy} onClick={() => void perform(async () => {
                        const res = await fetch(`/api/policies/${selected.id}/acknowledgements`, { cache: "no-store" });
                        if (!res.ok) throw new Error(await res.text());
                        setReport((await res.json()).acknowledgements);
                    })}>View acknowledgements</button>
                </div>}
                {report && <div className="overflow-x-auto"><h3 className="mb-3 font-semibold">Acknowledgement history ({report.length})</h3>{report.length ? <table className="w-full text-left text-sm"><thead><tr><th>Employee</th><th>Version</th><th>Acknowledged</th></tr></thead><tbody>{report.map((row) => <tr key={`${row.user_upn}:${row.version}`}><td className="py-2 pr-4">{row.user_upn}</td><td>{row.version}</td><td>{new Date(row.acknowledged_at).toLocaleString()}</td></tr>)}</tbody></table> : <p>No acknowledgements yet.</p>}</div>}
            </article>}
            <p className="text-sm opacity-70">Showing {data.policies.filter((p) => (!pendingOnly || (p.requires_acknowledgement !== false && !p.acknowledged_at)) && `${p.title} ${p.body}`.toLowerCase().includes(search.toLowerCase())).length} of {data.policies.length} policies</p>
            <div className="grid gap-4 md:grid-cols-3">{data.policies.filter((p) => (!pendingOnly || (p.requires_acknowledgement !== false && !p.acknowledged_at)) && `${p.title} ${p.body}`.toLowerCase().includes(search.toLowerCase())).map((policy) => <div key={policy.id} className={panel}>
                <p className="text-sm">{policy.requires_acknowledgement === false ? "Assigned to other recipients" : policy.acknowledged_at ? "Acknowledged" : policy.version === 1 ? "New · Acknowledgement required" : "Updated · Acknowledgement required"}</p>
                <h2 className="text-xl font-semibold">{policy.title}</h2><p className="text-sm opacity-70">Version {policy.version} · {new Date(policy.updated_at).toLocaleDateString()}</p>
                <p className="line-clamp-2 whitespace-pre-wrap">{policy.body}</p>
                <button className={button} disabled={busy} onClick={() => { setSelected(policy); setConfirmed(false); setReport(null); setEditor(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Read policy</button>
            </div>)}</div>
            {!data.policies.length && <p className={panel}>No policies have been published yet.</p>}
            {!!data.policies.length && !data.policies.some((p) => (!pendingOnly || (p.requires_acknowledgement !== false && !p.acknowledged_at)) && `${p.title} ${p.body}`.toLowerCase().includes(search.toLowerCase())) && <p>No matching policies.</p>}
        </>}
    </main>;
}

export default function PoliciesPage() { return <ModuleGuard moduleKey="policies"><Policies /></ModuleGuard>; }
