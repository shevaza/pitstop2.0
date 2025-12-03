"use client";

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  if (status === "authenticated") {
    return null;
  }

  return (
    <main className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-6 text-[var(--foreground)]">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-8 text-center shadow-[var(--shadow-soft)] backdrop-blur-2xl">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">
            Sign in to ITCAN365
          </h1>
          <p className="mt-2 text-sm text-[var(--text)]/70">
            Use your Microsoft 365 account to continue.
          </p>
        </div>
        <button
          className="w-full rounded border border-[var(--border)] bg-[var(--primary)] px-4 py-2 text-[var(--text)] shadow-[var(--shadow-soft)] transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
          onClick={() => signIn("azure-ad")}
        >
          Continue with Microsoft
        </button>
      </div>
    </main>
  );
}
