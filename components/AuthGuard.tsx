"use client";
import { useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

type AuthGuardProps = { children: ReactNode };

export default function AuthGuard({ children }: AuthGuardProps) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (pathname === "/login") return;

    const params = new URLSearchParams();
    if (typeof window !== "undefined") {
      params.set("callbackUrl", window.location.href);
    } else if (pathname) {
      params.set("callbackUrl", pathname);
    }
    const search = params.toString();
    router.replace(search ? `/login?${search}` : "/login");
  }, [status, router, pathname]);

  if (status === "loading") {
    return <div className="p-6">Loading...</div>;
  }

  if (status !== "authenticated") {
    return null;
  }

  return <>{children}</>;
}
