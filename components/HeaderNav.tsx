"use client";
import Link from "next/link";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

export default function HeaderNav() {
  const { status, data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const navLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/users", label: "Users" },
    { href: "/bulk", label: "Bulk" },
    { href: "/orgchart", label: "Org Chart" },
    { href: "/attendance", label: "Attendance" },
    { href: "/settings", label: "Settings" },
  ];
  const userName = useMemo(
    () =>
      session?.user?.name ||
      (session as { upn?: string } | null)?.upn ||
      session?.user?.email ||
      "",
    [session],
  );
  const userUpn = useMemo(
    () => (session as { upn?: string } | null)?.upn || session?.user?.email || "",
    [session],
  );
  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const photoSrc = useMemo(
    () => (userUpn ? `/api/users/${encodeURIComponent(userUpn)}/photo` : ""),
    [userUpn],
  );
  useEffect(() => {
    setAvatarError(false);
  }, [photoSrc]);
  useEffect(() => {
    if (status !== "authenticated") {
      setIsOpen(false);
    }
  }, [status]);

  const avatarNode = (
    <>
      {photoSrc && !avatarError ? (
        <img
          src={photoSrc}
          alt={userName || userUpn || "User"}
          className="h-10 w-10 rounded-full object-cover border border-[var(--text)]/10"
          onError={() => setAvatarError(true)}
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--text)]/10 text-sm font-semibold text-[var(--text)]">
          {initials(userName || userUpn || "U")}
        </div>
      )}
    </>
  );

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--glass-strong)] px-4 text-[var(--text)] backdrop-blur-xl shadow-[var(--shadow-soft)]">
        <Image src="/icon.png" alt="ITCAN 365" width={90} height={0} />
        <div className="flex items-center gap-4">
          {status === "authenticated" && userName && (
            <div className="hidden md:flex items-center gap-3">
              <div className="leading-tight text-right">
                <div className="text-sm font-semibold truncate">{userName}</div>
                <div className="text-xs text-[var(--text)]/70 truncate">{userUpn}</div>
              </div>
              {avatarNode}
            </div>
          )}
          {status === "authenticated" && (
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label="Toggle navigation menu"
              className="md:hidden rounded border border-[var(--border)]! bg-[var(--glass)]! px-3 py-2 text-sm font-medium text-[var(--text)] shadow-sm backdrop-blur-xl transition-colors hover:bg-[var(--glass-strong)]"
              onClick={() => setIsOpen((prev) => !prev)}
            >
              {isOpen ? "Close" : "Menu"}
            </button>
          )}
        </div>
      </header>

      {status === "authenticated" && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {status === "authenticated" && (
        <aside
          className={`fixed top-16 left-0 z-50 h-[calc(100vh-4rem)] w-54 transform border-r border-[var(--border)] bg-[var(--glass)] text-[var(--text)] shadow-[var(--shadow-soft)] backdrop-blur-xl transition-transform duration-200 md:fixed md:left-0 md:top-16 md:h-[calc(100vh-4rem)] md:translate-x-0 md:flex-shrink-0 md:shadow-none ${
            isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <div className="flex h-full flex-col">
            <nav className="flex flex-1 flex-col gap-1 px-4 py-6 pt-8 md:pt-6">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded px-3 py-2 text-sm font-medium text-[var(--text)] transition-all hover:bg-[rgba(14,3,219,0.3)]! hover:text-[var(--text)]! hover:shadow-[0_10px_30px_rgba(14,3,219,0.15)]"
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="border-t border-[var(--border)] px-4 py-4 space-y-3 bg-[var(--glass-strong)]">
              <div className="flex items-center gap-3">
                {avatarNode}
                <div className="min-w-0 leading-tight">
                  <div className="text-sm font-semibold truncate">{userName || "Signed in"}</div>
                  <div className="text-xs text-[var(--text)]/60 truncate">{userUpn}</div>
                </div>
              </div>
              <button
                className="w-full rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm font-medium text-[var(--text)] backdrop-blur-xl transition-colors hover:bg-[var(--glass-strong)]"
                onClick={() => {
                  void signOut({ callbackUrl: "/login" });
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
