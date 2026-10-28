"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function PolicyNotifications() {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await fetch("/api/policies", { cache: "no-store" });
                if (!response.ok) { if (active) setCount(0); return; }
                const data = await response.json();
                if (active) setCount(data.pendingCount);
            } catch { /* Retry when the app regains focus or on the next poll. */ }
        };
        void load();
        const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
        window.addEventListener("focus", load);
        window.addEventListener("policies-changed", load);
        return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("policies-changed", load); };
    }, []);
    if (count <= 0) return null;

    return <Link href="/policies" aria-live="polite" className="rounded-xl border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm" aria-label={`${count} policies require acknowledgement`}>
        Policies<span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-white">{count} pending</span>
    </Link>;
}
