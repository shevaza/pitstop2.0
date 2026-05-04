"use client";

import AuthGuard from "@/components/AuthGuard";
import { moduleAccessLevelAllows, type AppModuleKey, type ModuleAccessLevel } from "@/lib/modules";
import { useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";

type ModuleGuardProps = {
    moduleKey: AppModuleKey;
    requiredLevel?: Exclude<ModuleAccessLevel, "none">;
    children: ReactNode;
};

export default function ModuleGuard({ moduleKey, requiredLevel = "read", children }: ModuleGuardProps) {
    const { status } = useSession();
    const [loading, setLoading] = useState(true);
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        if (status !== "authenticated") return;

        let active = true;

        const load = async () => {
            try {
                setLoading(true);
                const res = await fetch("/api/access/me", { cache: "no-store" });
                if (!res.ok) {
                    if (active) setAllowed(false);
                    return;
                }
                const data = await res.json();
                if (active) {
                    const level = data.accessLevel?.[moduleKey] ?? (data.access?.[moduleKey] ? "modify" : "none");
                    setAllowed(moduleAccessLevelAllows(level, requiredLevel));
                }
            } catch {
                if (active) setAllowed(false);
            } finally {
                if (active) setLoading(false);
            }
        };

        void load();

        return () => {
            active = false;
        };
    }, [moduleKey, requiredLevel, status]);

    return (
        <AuthGuard>
            {loading ? (
                <main className="p-6 text-[var(--foreground)]">Loading...</main>
            ) : allowed ? (
                children
            ) : (
                <main className="p-6">
                    <div className="rounded-2xl border border-red-500/30 bg-[color:rgba(255,255,255,0.06)] p-6 text-sm text-[var(--text)]">
                        You do not have access to this module.
                    </div>
                </main>
            )}
        </AuthGuard>
    );
}
