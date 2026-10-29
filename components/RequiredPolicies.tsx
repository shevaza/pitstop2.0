"use client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Policy } from "@/lib/policy-types";

export default function RequiredPolicies({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    const user = status === "authenticated" ? ((session as { upn?: string })?.upn ?? session?.user?.email ?? "signed-in") : "";
    const dialog = useRef<HTMLElement>(null);
    const currentUser = useRef(user); currentUser.current = user;
    const [checkedUser, setCheckedUser] = useState("");
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const refresh = useCallback(async () => {
        if (!user) { setCheckedUser(""); setPolicies([]); setError(""); return; }
        try {
            const response = await fetch("/api/policies/required", { cache: "no-store" });
            if (!response.ok) throw new Error(await response.text());
            const result = await response.json();
            if (currentUser.current !== user) return;
            setPolicies(result.policies); setCheckedUser(user); setError("");
        } catch (e) { if (currentUser.current === user) setError(e instanceof Error ? e.message : "Unable to check required policies."); }
    }, [user]);
    useEffect(() => {
        void refresh();
        const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
        window.addEventListener("focus", refresh); window.addEventListener("policies-changed", refresh);
        return () => { clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("policies-changed", refresh); };
    }, [refresh]);
    const policy = checkedUser === user ? policies[0] : undefined;
    useEffect(() => { setConfirmed(false); }, [policy?.id, policy?.version]);
    const blocked = !!user && (checkedUser !== user || !!error || policies.length > 0);
    useEffect(() => { if (!blocked) return; const before = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = before; }; }, [blocked]);
    useEffect(() => { if (blocked) dialog.current?.focus(); }, [blocked]);
    if (status === "loading") return <p role="status" className="p-8">Checking your session...</p>;
    if (!blocked) return children;
    return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onKeyDown={(event) => { if (event.key === "Escape") event.preventDefault();
            if (event.key === "Tab") {
                const elements = dialog.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled)');
                if (!elements?.length) { event.preventDefault(); return; }
                const first = elements[0], last = elements[elements.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            } }}>
        <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="required-policy-title" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[var(--background)] p-6 text-[var(--text)] shadow-xl">
            <h1 id="required-policy-title" className="text-xl font-semibold">Policy acknowledgement required</h1>
            <p className="my-3">Read and acknowledge all pending policies to continue using the app.</p>
            {error && <p role="alert" className="my-3">{error}</p>}
            {policy && <><p>{policies.length} remaining</p><h2 className="mt-4 text-lg font-semibold">{policy.title} / Version {policy.version}</h2>
                <div className="my-5 whitespace-pre-wrap break-words leading-7">{policy.body}</div>
                {policy.attachment_name && <a className="block py-3 underline" href={`/api/policies/required/${policy.id}/attachment`} download>Download: {policy.attachment_name}</a>}
                <label className="my-4 flex gap-3"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I have read this policy, version {policy.version}.</label>
                <button disabled={!confirmed || busy} className="rounded-lg bg-[var(--primary)] px-4 py-3 text-white disabled:opacity-50" onClick={async () => {
                    setBusy(true); setError("");
                    try {
                        const response = await fetch(`/api/policies/required/${policy.id}/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: policy.version }) });
                        if (!response.ok) { const message = await response.text(); if (response.status === 409) await refresh(); throw new Error(message); }
                        setConfirmed(false); await refresh();
                    } catch (e) { setError(e instanceof Error ? e.message : "Unable to acknowledge policy."); }
                    finally { setBusy(false); }
                }}>{busy ? "Saving..." : "Acknowledge and continue"}</button></>}
            {(!policy || error) && <button className="my-4 rounded-lg border p-3" disabled={busy} onClick={() => void refresh()}>{error ? "Retry" : "Checking required policies..."}</button>}
        </section>
    </div>;
}
