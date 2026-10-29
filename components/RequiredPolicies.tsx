"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Policy } from "@/lib/policy-types";

export default function RequiredPolicies({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const user = status === "authenticated" ? ((session as { upn?: string })?.upn ?? session?.user?.email ?? "signed-in") : "";
    const dialog = useRef<HTMLElement>(null);
    const currentUser = useRef(user); currentUser.current = user;
    const [checkedUser, setCheckedUser] = useState("");
    const [policies, setPolicies] = useState<Policy[]>([]);
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
    const blocked = !!user && (checkedUser !== user || !!error || (policies.length > 0 && pathname !== "/policies"));
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
        <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="required-policy-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--background)] p-6 text-[var(--text)] shadow-xl">
            <h1 id="required-policy-title" className="text-xl font-semibold">Policy acknowledgement required</h1>
            <p className="my-3">Read and acknowledge all pending policies to continue using the app.</p>
            {error && <p role="alert" className="my-3">{error}</p>}
            {checkedUser === user && policies.length > 0 && <>
                <p className="my-4">You have {policies.length} pending {policies.length === 1 ? "policy" : "policies"} to acknowledge.</p>
                <Link href="/policies" className="inline-block rounded-lg bg-[var(--primary)] px-4 py-3 text-white">Go to Policies</Link>
            </>}
            {(checkedUser !== user || error) && <button className="my-4 rounded-lg border p-3" onClick={() => void refresh()}>{error ? "Retry" : "Checking required policies..."}</button>}
        </section>
    </div>;
}
