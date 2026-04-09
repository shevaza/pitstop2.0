"use client";
import Link from "next/link";
import Image from "next/image";
import { appModules, getDefaultModuleAccess, type AppModuleKey } from "@/lib/modules";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

export default function HeaderNav() {
  const { status, data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [failedPhotoSrc, setFailedPhotoSrc] = useState<string | null>(null);
  const [hrOpen, setHrOpen] = useState(true);
  const [moduleAccess, setModuleAccess] = useState<Record<AppModuleKey, boolean>>(getDefaultModuleAccess);

  useEffect(() => {
    if (status !== "authenticated") return;

    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/access/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.access) {
          setModuleAccess(data.access);
        }
      } catch {
        // Keep default navigation if the access lookup fails.
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [status]);

  const navGroups = useMemo(
    () => [
      appModules.filter((module) => module.key === "dashboard" && moduleAccess[module.key]),
      appModules.filter((module) =>
        ["users", "bulk", "orgchart"].includes(module.key) && moduleAccess[module.key],
      ),
      appModules.filter((module) =>
        ["user-access", "settings"].includes(module.key) && moduleAccess[module.key],
      ),
    ].filter((group) => group.length > 0),
    [moduleAccess],
  );
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
  const currentDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date()),
    [],
  );
  const leaveBalanceSummary = "Annual Leave: 14 days";
  const memoMessage = "No active memo";
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

  const avatarNode = (
    <>
      {photoSrc && failedPhotoSrc !== photoSrc ? (
        <img
          key={photoSrc}
          src={photoSrc}
          alt={userName || userUpn || "User"}
          className="h-10 w-10 rounded-full object-cover border border-[var(--text)]/10"
          onError={() => setFailedPhotoSrc(photoSrc)}
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
          {status === "authenticated" && (
            <div className="hidden md:flex items-center gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-right shadow-[var(--shadow-soft)]">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/55">Today</div>
                <div className="text-xs font-medium text-[var(--text)]">{currentDateLabel}</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--glass)] px-3 py-2 shadow-[var(--shadow-soft)]">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/55">Leave Balance</div>
                <div className="text-xs font-medium text-[var(--text)]">{leaveBalanceSummary}</div>
              </div>
              <div className="min-w-48 rounded-xl border border-[var(--border)] bg-[var(--glass)] px-3 py-2 shadow-[var(--shadow-soft)]">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/55">Memo</div>
                <div className="truncate text-xs font-medium text-[var(--text)]/80">{memoMessage}</div>
              </div>
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
              {navGroups.slice(0, 2).map((group, groupIndex) => (
                <div
                  key={`group-${groupIndex}`}
                  className={groupIndex === 0 ? "" : "border-t border-[var(--border)] pt-3 mt-3"}
                >
                  {group.map((item, itemIndex) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded px-3 py-2 text-sm font-medium text-[var(--text)] transition-all hover:bg-[rgba(14,3,219,0.3)]! hover:text-[var(--text)]! hover:shadow-[0_10px_30px_rgba(14,3,219,0.15)] ${
                        groupIndex === 3 && itemIndex > 0 ? "ml-3 text-[var(--text)]/80" : ""
                      }`}
                      onClick={() => setIsOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}

              {(moduleAccess.hr || moduleAccess.attendance) && (
                <div className="border-t border-[var(--border)] pt-3 mt-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-3 py-2 text-sm font-medium text-[var(--text)] transition-all hover:bg-[rgba(14,3,219,0.3)]! hover:text-[var(--text)]! hover:shadow-[0_10px_30px_rgba(14,3,219,0.15)]"
                  onClick={() => setHrOpen((prev) => !prev)}
                  aria-expanded={hrOpen}
                >
                  <span>HR</span>
                  <span className="text-xs text-[var(--text)]/65">{hrOpen ? "▾" : "▸"}</span>
                </button>

                {hrOpen && (
                  <div className="mt-1 space-y-1">
                    <Link
                      href="/hr"
                      className="ml-3 block rounded px-3 py-2 text-xs font-medium text-[var(--text)]/90 transition-all hover:bg-[rgba(14,3,219,0.3)]! hover:text-[var(--text)]! hover:shadow-[0_10px_30px_rgba(14,3,219,0.15)]"
                      onClick={() => setIsOpen(false)}
                    >
                      HR Overview
                    </Link>
                    {moduleAccess.attendance && (
                      <Link
                      href="/attendance"
                      className="ml-3 block rounded px-3 py-2 text-xs font-medium text-[var(--text)]/80 transition-all hover:bg-[rgba(14,3,219,0.3)]! hover:text-[var(--text)]! hover:shadow-[0_10px_30px_rgba(14,3,219,0.15)]"
                      onClick={() => setIsOpen(false)}
                    >
                      Attendance
                    </Link>
                    )}
                  </div>
                )}
              </div>
              )}

              {moduleAccess.assets && (
                <div className="border-t border-[var(--border)] pt-3 mt-3">
                <Link
                  href="/assets"
                  className="block rounded px-3 py-2 text-sm font-medium text-[var(--text)] transition-all hover:bg-[rgba(14,3,219,0.3)]! hover:text-[var(--text)]! hover:shadow-[0_10px_30px_rgba(14,3,219,0.15)]"
                  onClick={() => setIsOpen(false)}
                >
                  Assets Management
                </Link>
              </div>
              )}

              {navGroups.slice(2).map((group, index) => (
                <div
                  key={`group-tail-${index}`}
                  className="border-t border-[var(--border)] pt-3 mt-3"
                >
                  {group.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded px-3 py-2 text-sm font-medium text-[var(--text)] transition-all hover:bg-[rgba(14,3,219,0.3)]! hover:text-[var(--text)]! hover:shadow-[0_10px_30px_rgba(14,3,219,0.15)]"
                      onClick={() => setIsOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
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
