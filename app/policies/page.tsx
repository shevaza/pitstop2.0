"use client";

import { EMPLOYEE_TYPES } from "@/lib/employee-types";
import ModuleHeader from "@/components/ModuleHeader";
import LoadingState from "@/components/LoadingState";
import ModuleGuard from "@/components/ModuleGuard";
import type { Policy, PolicyAcknowledgement, PolicyList, PolicyAudience } from "@/lib/policy-types";
import { useCallback, useEffect, useState } from "react";

const panel = "rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 space-y-4";
const button = "inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--glass)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--glass-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${button.replace("border-[var(--border)] bg-[var(--glass)]", "border-transparent bg-[var(--primary)]").replace("hover:bg-[var(--glass-strong)]", "hover:bg-[var(--primary-hover)]")} text-white`;
const input = "w-full rounded-lg border border-[var(--border)] bg-[var(--glass-strong)] p-3 text-sm focus:outline-2 focus:outline-[var(--primary)]";
function Policies() {
    const [data, setData] = useState<PolicyList | null>(null);
    const [selected, setSelected] = useState<Policy | null>(null);
    const [editor, setEditor] = useState<{ id?: string; version: number; expectedVersion?: number; title: string; body: string; target_roles: string[]; target_employee_types: string[]; target_departments: string[]; target_users: string[] } | null>(null);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [existingAttachment, setExistingAttachment] = useState<string | null>(null);
    const [audience, setAudience] = useState<PolicyAudience | null>(null);
    const [audienceSearch, setAudienceSearch] = useState("");
    const [audienceError, setAudienceError] = useState("");
    const [audienceAttempt, setAudienceAttempt] = useState(0);
    const editing = !!editor;
    useEffect(() => {
        if (!editing || audience) return;
        setAudienceError("");
        const controller = new AbortController();
        fetch("/api/policies/audience", { signal: controller.signal, cache: "no-store" }).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
            setAudience(await res.json());
        }).catch((e) => { if (e.name !== "AbortError") setAudienceError(e.message); });
        return () => controller.abort();
    }, [editing, audience, audienceAttempt]);
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
        let file;
        if (attachment) {
            if (!attachment.size || attachment.size > 5 * 1024 * 1024) throw new Error("Choose a non-empty file up to 5 MB.");
            const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1]);
                reader.onerror = () => reject(new Error("Unable to read attachment. Please try again."));
                reader.readAsDataURL(attachment);
            });
            file = { name: attachment.name, size: attachment.size, data };
        }
        const response = await fetch("/api/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editor, attachment: file }) });
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
    const filteredPolicies = data?.policies.filter((policy) =>
        (!pendingOnly || (policy.requires_acknowledgement !== false && !policy.acknowledged_at)) &&
        `${policy.title} ${policy.body}`.toLowerCase().includes(search.trim().toLowerCase())
    ) ?? [];
    const visibleUsers = audience?.users.filter((user) => `${user.name} ${user.upn} ${user.department}`.toLowerCase().includes(audienceSearch.toLowerCase())) ?? [];
    const everyone = !!editor && !editor.target_departments.length && !editor.target_users.length && !editor.target_employee_types.length && !editor.target_roles.length;
    function backToLibrary() { setEditor(null); setSelected(null); setReport(null); setConfirmed(false); }
    function startEditor(policy?: Policy) {
        setAttachment(null); setExistingAttachment(policy?.attachment_name ?? null);
        setAudienceSearch(""); setNotice(""); setError(""); setReport(null); setSelected(null);
        setEditor(policy ? { id: policy.id, title: policy.title, body: policy.body, version: policy.version + 1, expectedVersion: policy.version, target_roles: policy.target_roles ?? [], target_employee_types: policy.target_employee_types ?? [], target_departments: policy.target_departments ?? [], target_users: policy.target_users ?? [] } : { title: "", body: "", version: 1, target_roles: [], target_employee_types: [], target_departments: [], target_users: [] });
    }
    return <main className="mx-auto max-w-7xl space-y-6 p-4 text-[var(--text)] md:p-8">
        <ModuleHeader className="flex flex-wrap items-center justify-between gap-4">
            <div>
                {(editor || selected) && <button type="button" className="mb-3 text-sm text-[var(--primary)] hover:underline disabled:opacity-50" disabled={busy} onClick={backToLibrary}>Back to policies</button>}
                <h1 className="text-3xl font-semibold tracking-tight">{editor ? editor.id ? "Update policy" : "New policy" : selected ? "Read policy" : "Policy portal"}</h1>
                <p className="mt-2 text-sm opacity-70">{editor ? "Write the policy, choose its recipients, then publish." : selected ? "Review the policy and confirm your acknowledgement below." : "Find company policies and keep your acknowledgements up to date."}</p>
            </div>
            {!editor && !selected && data?.canModify && <button className={primaryButton} disabled={busy} onClick={() => startEditor()}>+ New policy</button>}
        </ModuleHeader>
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/50 bg-red-400/10 p-4"><p className="min-w-0 break-words text-sm">{error}</p><button className={button} disabled={busy} onClick={() => void perform(load)}>Refresh policies</button></div>}
        {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">{notice}</p>}
        {!data && !error && <LoadingState label="Loading policies" />}
        {data && <>
            {editor ? <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); void perform(save); }}>
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <section className={panel} aria-labelledby="policy-content-heading">
                        <div><h2 id="policy-content-heading" className="text-lg font-semibold">Policy content</h2><p className="mt-1 text-sm opacity-60">Give recipients a clear title and the full policy to review.</p></div>
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
                            <label className="block text-sm font-medium">Title<input autoFocus required maxLength={200} placeholder="e.g. Information security policy" className={`${input} mt-2`} value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label>
                            <label className="block text-sm font-medium">Version<input type="number" required min={editor.expectedVersion ? editor.expectedVersion + 1 : 1} max={2147483647} step={1} className={`${input} mt-2`} value={Number.isNaN(editor.version) ? "" : editor.version} onChange={(event) => setEditor({ ...editor, version: event.target.valueAsNumber })} /></label>
                        </div>
                        {editor.expectedVersion && <p className="text-xs opacity-60">Current version: {editor.expectedVersion}. Updates require a higher version number.</p>}
                        <label className="block text-sm font-medium">Policy text<textarea required maxLength={100000} rows={18} placeholder="Enter the complete policy..." className={`${input} mt-2 min-h-80 resize-y leading-7`} value={editor.body} onChange={(event) => setEditor({ ...editor, body: event.target.value })} /></label>
                        <label className="block text-sm font-medium">Attachment (optional)
                            <input type="file" disabled={busy} className={`${input} mt-2`} onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                if (file && (!file.size || file.size > 5 * 1024 * 1024)) {
                                    setError("Choose a non-empty file up to 5 MB."); event.target.value = ""; setAttachment(null); return;
                                }
                                setError(""); setAttachment(file);
                            }} />
                        </label>
                        <p className="break-words text-xs opacity-60">Up to 5 MB. Recipients can download the attachment.{existingAttachment && ` Current attachment: ${existingAttachment}. Choose a file to replace it, or leave empty to keep it.`}</p>
                    </section>
                    <section className={panel} aria-labelledby="recipients-heading">
                        <div><h2 id="recipients-heading" className="text-lg font-semibold">Recipients</h2><p className="mt-1 text-sm opacity-60">Choose departments, individual employees, or both.</p></div>
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--primary-surface)] p-3 text-sm"><span>{everyone ? "Everyone in the company" : `${editor.target_departments.length} departments / ${editor.target_users.length} employees / ${editor.target_employee_types.length} employee types / ${editor.target_roles.length} roles`}</span>{!everyone && <button type="button" className="shrink-0 text-xs underline" onClick={() => setEditor({ ...editor, target_roles: [], target_employee_types: [], target_departments: [], target_users: [] })}>Reset to everyone</button>}</div>
                        <p className="text-xs leading-5 opacity-60">With no audience filters, this policy goes to everyone. Department membership is captured from Microsoft 365 when you publish.</p>
                        <fieldset><legend className="mb-2 text-sm font-medium">Employee type</legend><div className="flex flex-wrap gap-4">{EMPLOYEE_TYPES.map((type) => <label key={type} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={editor.target_employee_types.includes(type)} onChange={(event) => setEditor({ ...editor, target_employee_types: event.target.checked ? [...editor.target_employee_types, type] : editor.target_employee_types.filter((value) => value !== type) })} />{type}</label>)}</div></fieldset>
                        <p className="text-xs opacity-60">Selected types narrow the departments and users below. With no department or user selected, all users of the selected types receive the policy. No type selection includes all employee types. Membership is captured when publishing.</p>
                        {audience && <fieldset><legend className="mb-2 text-sm font-medium">Role</legend><div className="max-h-40 space-y-2 overflow-y-auto">{audience.roles.map((role) => <label key={role} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={editor.target_roles.includes(role)} onChange={(event) => setEditor({ ...editor, target_roles: event.target.checked ? [...editor.target_roles, role] : editor.target_roles.filter((value) => value !== role) })} />{role}</label>)}</div>{!audience.roles.length && <p className="text-xs opacity-60">Assign roles on the users page to make them available here.</p>}</fieldset>}
                        <p className="text-xs opacity-60">Selected roles further narrow the audience. Leave other selections empty to deploy to everyone with the selected roles.</p>
                        {audienceError ? <div role="alert" className="space-y-2 text-sm"><p>Could not load the directory: {audienceError}</p><button type="button" className={button} onClick={() => setAudienceAttempt((value) => value + 1)}>Retry directory</button></div> : !audience ? <LoadingState compact label="Loading recipient directory" /> : <>
                            <fieldset><legend className="mb-2 text-sm font-medium">Departments</legend><div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">{audience.departments.length ? audience.departments.map((department) => <label key={department} className="flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm hover:bg-[var(--glass-strong)]"><input type="checkbox" className="mt-0.5 accent-[var(--primary)]" checked={editor.target_departments.includes(department)} onChange={(event) => setEditor({ ...editor, target_departments: event.target.checked ? [...editor.target_departments, department] : editor.target_departments.filter((value) => value !== department) })} /><span className="break-words">{department}</span></label>) : <p className="p-2 text-sm opacity-60">No departments available.</p>}</div></fieldset>
                            <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Individual employees</legend><input aria-label="Search recipients" placeholder="Search name, email or department" className={input} value={audienceSearch} onChange={(event) => setAudienceSearch(event.target.value)} /><div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">{visibleUsers.map((user) => <label key={user.upn} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-[var(--glass-strong)]"><input type="checkbox" className="mt-1 accent-[var(--primary)]" checked={editor.target_users.includes(user.upn)} onChange={(event) => setEditor({ ...editor, target_users: event.target.checked ? [...editor.target_users, user.upn] : editor.target_users.filter((upn) => upn !== user.upn) })} /><span className="min-w-0 text-sm"><span className="block font-medium break-words">{user.name}</span><span className="block break-all text-xs opacity-60">{user.upn}</span>{user.department && <span className="block text-xs opacity-60">{user.department}</span>}</span></label>)}{!visibleUsers.length && <p className="p-2 text-sm opacity-60">No matching employees.</p>}</div></fieldset>
                        </>}
                    </section>
                </div>
                <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-xl text-sm opacity-70">Publishing takes effect immediately. {everyone ? "Everyone" : "Selected recipients"} will need to acknowledge this version.</p>
                    <div className="flex shrink-0 justify-end gap-3"><button type="button" className={button} disabled={busy} onClick={backToLibrary}>Cancel</button><button type="submit" className={primaryButton} disabled={busy || !Number.isInteger(editor.version) || editor.version < (editor.expectedVersion ? editor.expectedVersion + 1 : 1) || !editor.title.trim() || !editor.body.trim()}>{busy ? "Publishing..." : "Publish policy"}</button></div>
                </div>
            </form> : selected ? <div className="space-y-6">
                <article className={`${panel} !p-0 overflow-hidden`}>
                    <div className="space-y-3 border-b border-[var(--border)] p-5 md:p-8"><span className="inline-flex rounded-full bg-[var(--primary-surface)] px-3 py-1 text-xs font-medium">Version {selected.version}</span><h2 className="break-words text-2xl font-semibold">{selected.title}</h2><p className="break-words text-sm opacity-60">Published {new Date(selected.updated_at).toLocaleString()} by {selected.updated_by_upn}</p></div>
                    <div className="mx-auto max-w-3xl whitespace-pre-wrap break-words p-5 leading-8 md:p-8">{selected.body}</div>
                    {selected.attachment_name && <div className="border-t border-[var(--border)] p-5 md:px-8"><a className={`${button} max-w-full break-all`} href={`/api/policies/${selected.id}/attachment`} download>Download attachment: {selected.attachment_name}</a></div>}
                    <div className="space-y-4 border-t border-[var(--border)] bg-[var(--glass-strong)] p-5 md:p-8">
                        {selected.requires_acknowledgement === false ? <p className="text-sm opacity-70">This policy is assigned to other recipients.</p> : selected.acknowledged_at ? <p role="status" className="text-sm font-medium text-emerald-500">Acknowledged on {new Date(selected.acknowledged_at).toLocaleString()}</p> : <><h3 className="font-semibold">Your acknowledgement</h3><label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 accent-[var(--primary)]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm that I have read this policy, version {selected.version}.</label><div className="flex justify-end"><button className={primaryButton} disabled={busy || !confirmed} onClick={() => void perform(acknowledge)}>{busy ? "Saving..." : "Acknowledge policy"}</button></div></>}
                    </div>
                </article>
                {data.canModify && <section className={panel}><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Policy management</h2><p className="mt-1 max-w-2xl break-words text-sm opacity-60">Audience: {selected.recipient_upns == null ? "Everyone" : `${[...(selected.target_roles ?? []).map((role) => `Role: ${role}`), ...(selected.target_employee_types ?? []).map((type) => `Type: ${type}`), ...selected.target_departments, ...selected.target_users].join(", ")} (${selected.recipient_upns.length} recipients)`}</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => startEditor(selected)}>Edit policy</button><button className={button} disabled={busy} onClick={() => void perform(async () => {
                    const response = await fetch(`/api/policies/${selected.id}/acknowledgements`, { cache: "no-store" });
                    if (!response.ok) throw new Error(await response.text());
                    setReport((await response.json()).acknowledgements);
                })}>{busy ? "Loading..." : "View acknowledgements"}</button></div></div>
                    {report && <div className="space-y-3 border-t border-[var(--border)] pt-4"><h3 className="text-sm font-semibold">Acknowledgement history ({report.length})</h3>{report.length ? <div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full text-left text-sm"><thead className="bg-[var(--glass-strong)]"><tr><th scope="col" className="p-3">Employee</th><th scope="col" className="p-3">Version</th><th scope="col" className="p-3">Acknowledged</th></tr></thead><tbody>{report.map((row) => <tr key={`${row.user_upn}:${row.version}`} className="border-t border-[var(--border)]"><td className="p-3">{row.user_upn}</td><td className="p-3">{row.version}</td><td className="whitespace-nowrap p-3">{new Date(row.acknowledged_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="text-sm opacity-60">No acknowledgements yet.</p>}</div>}
                </section>}
            </div> : <>
                <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--primary-surface)] p-5"><div className="flex items-center gap-4"><span className="text-4xl font-semibold tabular-nums">{data.pendingCount}</span><div><h2 className="font-semibold">{data.pendingCount ? "Awaiting your acknowledgement" : "You are up to date"}</h2><p className="mt-1 text-sm opacity-70">{data.pendingCount ? "Review your pending policies and acknowledge each version." : "You have no policies waiting for acknowledgement."}</p></div></div>{data.pendingCount > 0 && <button className={button} onClick={() => { setPendingOnly(true); setSearch(""); }}>View pending policies</button>}</section>
                <section className="space-y-5" aria-labelledby="library-heading">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="library-heading" className="text-xl font-semibold">Policy library</h2><p className="mt-1 text-sm opacity-60">Showing {filteredPolicies.length} of {data.policies.length} policies</p></div><button className={button} disabled={busy} onClick={() => void perform(load)}>{busy ? "Refreshing..." : "Refresh"}</button></div>
                    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--glass)] p-4 sm:flex-row sm:items-center"><label className="flex-1"><span className="sr-only">Search policies</span><input type="search" className={input} placeholder="Search policies by title or content..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" className="accent-[var(--primary)]" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />Pending only</label>{(search || pendingOnly) && <button className="text-sm text-[var(--primary)] hover:underline" onClick={() => { setSearch(""); setPendingOnly(false); }}>Clear filters</button>}</div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredPolicies.map((policy) => <article key={policy.id} className={`${panel} flex flex-col gap-4 !space-y-0`}>
                        <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${policy.requires_acknowledgement === false ? "bg-[var(--glass-strong)]" : policy.acknowledged_at ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-[var(--text)]"}`}>{policy.requires_acknowledgement === false ? "Other recipients" : policy.acknowledged_at ? "Acknowledged" : "Acknowledgement required"}</span></div>
                        <div><h3 className="break-words text-lg font-semibold">{policy.title}</h3><p className="mt-1 text-xs opacity-60">Version {policy.version} / Updated {new Date(policy.updated_at).toLocaleDateString()}</p></div>
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 opacity-70">{policy.body}</p>
                        <div className="!mt-auto flex justify-end border-t border-[var(--border)] pt-4"><button className={button} disabled={busy} onClick={() => { setSelected(policy); setConfirmed(false); setReport(null); setEditor(null); window.scrollTo({ top: 0, behavior: "instant" }); }}>{policy.requires_acknowledgement !== false && !policy.acknowledged_at ? "Review policy" : "Read policy"}</button></div>
                    </article>)}</div>
                    {!filteredPolicies.length && <div className={`${panel} py-12 text-center`}><h3 className="font-semibold">{data.policies.length ? "No matching policies" : "No policies published yet"}</h3><p className="text-sm opacity-60">{data.policies.length ? "Try another search or clear your filters." : data.canModify ? "Create your first policy to share it with employees." : "Published policies will appear here."}</p>{!!data.policies.length && <button className={button} onClick={() => { setSearch(""); setPendingOnly(false); }}>Clear filters</button>}</div>}
                </section>
            </>}
        </>}
    </main>;
}

export default function PoliciesPage() { return <ModuleGuard moduleKey="policies"><Policies /></ModuleGuard>; }
