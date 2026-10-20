"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import PolicyNotifications from "@/components/PolicyNotifications";
import { appModules, getDefaultModuleAccess, type AppModuleKey } from "@/lib/modules";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

export default function HeaderNav() {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [failedPhotoSrc, setFailedPhotoSrc] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  });
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

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("pitstop-theme", nextTheme);
    setTheme(nextTheme);
  };

  const navGroups = useMemo(() => [
    { label: "Overview", keys: ["dashboard"] },
    { label: "People & Directory", keys: ["users", "bulk", "orgchart"] },
    { label: "Human Resources", keys: ["hr", "attendance", "policies"] },
    { label: "IT & Operations", keys: ["assets", "it-tickets", "it-tickets-admin"] },
    { label: "Administration", keys: ["user-access", "settings"] },
  ].map((group) => ({
    ...group,
    items: group.keys.flatMap((key) => appModules.filter((item) => item.key === key && moduleAccess[item.key])),
  })).filter((group) => group.items.length > 0), [moduleAccess]);

  const activeHref = appModules
    .filter((item) => item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => {
    if (!isOpen) return;
    const mobile = window.matchMedia("(max-width: 767px)");
    const previousOverflow = document.body.style.overflow;
    const updateScroll = () => { document.body.style.overflow = mobile.matches ? "hidden" : previousOverflow; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        document.getElementById("navigation-toggle")?.focus();
      }
    };
    updateScroll();
    mobile.addEventListener("change", updateScroll);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      mobile.removeEventListener("change", updateScroll);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);
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
        <div className="relative h-[51px] w-[90px]" aria-label="ITCAN 365">
          <Image
            src="/icon-dark.png"
            alt=""
            width={90}
            height={51}
            className="theme-logo-dark absolute inset-0 h-auto w-[90px]"
            priority
          />
          <Image
            src="/icon-light.png"
            alt=""
            width={90}
            height={51}
            className="theme-logo-light absolute inset-0 h-auto w-[90px]"
            priority
          />
        </div>
        <div className="flex items-center gap-4">
          {status === "authenticated" && moduleAccess.policies && <PolicyNotifications />}
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
              id="navigation-toggle"
              aria-controls="primary-navigation"
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
          className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {status === "authenticated" && (
        <aside
          id="primary-navigation"
          aria-label="Main navigation"
          className={`fixed inset-x-0 top-16 z-40 h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-[var(--border)] bg-[var(--glass-strong)] text-[var(--text)] shadow-[var(--shadow-soft)] backdrop-blur-xl transition-[transform,opacity,visibility] duration-200 motion-reduce:transition-none md:bottom-0 md:right-auto md:w-64 md:translate-y-0 md:border-b-0 md:border-r md:opacity-100 md:visible md:shadow-none ${isOpen ? "translate-y-0 opacity-100 visible" : "-translate-y-full opacity-0 invisible"}`}
        >
          <div className="flex min-h-full flex-col">
            <nav aria-label="Modules" className="flex-1 space-y-4 px-3 py-4">
              {navGroups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h2 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/55">{group.label}</h2>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const selected = activeHref === item.href;
                      const ticketChild = item.key === "it-tickets" || item.key === "it-tickets-admin";
                      return (
                        <div key={item.key}>
                          {ticketChild && group.items.find((entry) => entry.key === "it-tickets" || entry.key === "it-tickets-admin")?.key === item.key && (
                            <div className="px-3 pb-1 pt-2 text-xs font-semibold text-[var(--text)]/65">IT Tickets</div>
                          )}
                          <Link href={item.href} aria-current={selected ? "page" : undefined}
                            className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--text)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${ticketChild ? "ml-3 border-l border-[var(--border)]" : ""} ${selected ? "bg-blue-500/15 font-semibold text-[var(--text)]" : "font-medium text-[var(--text)]/75"}`}
                            onClick={() => setIsOpen(false)}>
                            {item.key === "hr" ? "HR Overview" : item.key === "it-tickets" ? "My Tickets" : item.key === "it-tickets-admin" ? "Admin Queue" : item.label}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>

            <div className="border-t border-[var(--border)] px-4 py-4 space-y-3 bg-[var(--glass-strong)]">
              <div className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2">
                <span className="text-sm font-medium text-[var(--text)]">{theme === "dark" ? "Dark" : "Light"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={theme === "dark"}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                  className="relative h-7 w-14 rounded-full border border-[var(--border)] bg-[var(--glass-strong)] p-0.5 transition-colors hover:bg-[var(--glass)]"
                  onClick={toggleTheme}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-[var(--text)] shadow-sm transition-transform ${theme === "dark" ? "translate-x-7" : "translate-x-0"
                      }`}
                  />
                  <span className="sr-only">{theme === "dark" ? "Dark" : "Light"}</span>
                </button>
              </div>
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
