"use client";

import ModuleGuard from "@/components/ModuleGuard";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useMemo } from "react";

type LeaveBalance = {
    label: string;
    days: number;
    tone: string;
};

type LeaveCalendarItem = {
    date: string;
    label: string;
    type: "leave" | "holiday";
};

type LeaveStatus = {
    id: string;
    leaveType: string;
    range: string;
    status: "Approved" | "Pending" | "Rejected";
};

type PersonOnLeave = {
    name: string;
    team: string;
    until: string;
};

type Holiday = {
    id: string;
    name: string;
    date: string;
    scope: string;
};

const leaveBalances: LeaveBalance[] = [
    { label: "Annual Leave", days: 14, tone: "bg-[color:rgba(52,211,153,0.18)]" },
    { label: "Sick Leave", days: 6, tone: "bg-[color:rgba(251,191,36,0.18)]" },
    { label: "Personal Leave", days: 3, tone: "bg-[color:rgba(96,165,250,0.18)]" },
];

const leaveCalendarItems: LeaveCalendarItem[] = [
    { date: "2026-04-10", label: "Company Holiday", type: "holiday" },
    { date: "2026-04-14", label: "Your Annual Leave", type: "leave" },
    { date: "2026-04-15", label: "Your Annual Leave", type: "leave" },
    { date: "2026-04-21", label: "Regional Holiday", type: "holiday" },
];

const peopleOnLeave: PersonOnLeave[] = [
    { name: "Maya Haddad", team: "Finance", until: "Apr 11" },
    { name: "Omar Saad", team: "Operations", until: "Apr 12" },
    { name: "Nadine Khoury", team: "HR", until: "Apr 14" },
];

const recentLeaveStatuses: LeaveStatus[] = [
    { id: "REQ-1042", leaveType: "Annual Leave", range: "Apr 14 - Apr 15", status: "Approved" },
    { id: "REQ-1031", leaveType: "Sick Leave", range: "Mar 28", status: "Approved" },
    { id: "REQ-1024", leaveType: "Personal Leave", range: "Mar 17", status: "Pending" },
];

const upcomingHolidays: Holiday[] = [
    { id: "HOL-1", name: "Spring Holiday", date: "2026-04-10", scope: "Company-wide" },
    { id: "HOL-2", name: "Founders Day", date: "2026-04-21", scope: "Lebanon Office" },
    { id: "HOL-3", name: "Labor Day", date: "2026-05-01", scope: "Company-wide" },
];

export default function HrPage() {
    const { data: session } = useSession();
    const userName = session?.user?.name || (session as { upn?: string } | null)?.upn || "Employee";
    const now = useMemo(() => new Date(), []);
    const monthLabel = now.toLocaleString(undefined, { month: "long", year: "numeric" });
    const monthDays = useMemo(() => buildCalendarDays(now, leaveCalendarItems), [now]);

    return (
        <ModuleGuard moduleKey="hr">
            <main className="space-y-6 p-6 text-[var(--foreground)]">
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-semibold text-[var(--text)]">HR</h1>
                            <p className="mt-1 max-w-3xl text-sm text-[var(--text)]/70">
                                Personal leave, holidays, and approval status for {userName}. This module is ready for the later HR-admin data setup; current cards use placeholder data.
                            </p>
                        </div>
                        <Link
                            href="/attendance"
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)]"
                        >
                            Open Attendance
                        </Link>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                    {leaveBalances.map((item) => (
                        <div
                            key={item.label}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl"
                        >
                            <div className="text-sm text-[var(--text)]/65">{item.label}</div>
                            <div className="mt-2 flex items-end justify-between gap-3">
                                <div className="text-4xl font-semibold text-[var(--text)]">{item.days}</div>
                                <span className={`rounded-full px-3 py-1 text-xs font-medium text-[var(--text)] ${item.tone}`}>
                                    days left
                                </span>
                            </div>
                        </div>
                    ))}
                </section>

                <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-[var(--text)]">Leave Calendar</h2>
                                <p className="text-xs text-[var(--text)]/60">{monthLabel}</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[var(--text)]/65">
                                <span className="rounded-full bg-[color:rgba(96,165,250,0.18)] px-2 py-1">Your leave</span>
                                <span className="rounded-full bg-[color:rgba(251,191,36,0.18)] px-2 py-1">Holiday</span>
                            </div>
                        </div>
                        <div className="mb-3 grid grid-cols-7 gap-2">
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                                <div
                                    key={day}
                                    className="rounded-lg px-2 py-1 text-center text-xs font-medium uppercase tracking-wide text-[var(--text)]/55"
                                >
                                    {day}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-2">
                            {monthDays.map((day, index) => (
                                <div
                                    key={`${day.dateKey}-${index}`}
                                    className={`min-h-28 rounded-xl border p-3 ${
                                        day.inCurrentMonth
                                            ? "border-[var(--border)] bg-[var(--glass-strong)]"
                                            : "border-[var(--border)]/50 bg-[color:rgba(255,255,255,0.03)]"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span
                                            className={`text-sm font-semibold ${
                                                day.isToday
                                                    ? "rounded-full bg-[color:rgba(14,3,219,0.22)] px-2 py-0.5 text-[var(--text)]"
                                                    : day.inCurrentMonth
                                                        ? "text-[var(--text)]"
                                                        : "text-[var(--text)]/35"
                                            }`}
                                        >
                                            {day.dayNumber}
                                        </span>
                                        {day.entries.length > 0 && (
                                            <span className="text-[10px] text-[var(--text)]/45">
                                                {day.entries.length} item{day.entries.length > 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        {day.entries.map((entry) => (
                                            <div
                                                key={`${day.dateKey}-${entry.label}`}
                                                className={`rounded-lg px-2 py-1 text-[11px] leading-tight text-[var(--text)] ${
                                                    entry.type === "leave"
                                                        ? "bg-[color:rgba(96,165,250,0.18)]"
                                                        : "bg-[color:rgba(251,191,36,0.18)]"
                                                }`}
                                            >
                                                {entry.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                            <h2 className="text-xl font-semibold text-[var(--text)]">People Currently on Leave</h2>
                            <div className="mt-4 space-y-3">
                                {peopleOnLeave.map((person) => (
                                    <div
                                        key={`${person.name}-${person.until}`}
                                        className="rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-4"
                                    >
                                        <div className="font-medium text-[var(--text)]">{person.name}</div>
                                        <div className="mt-1 text-sm text-[var(--text)]/65">{person.team}</div>
                                        <div className="mt-2 text-xs text-[var(--text)]/60">Back after {person.until}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                            <h2 className="text-xl font-semibold text-[var(--text)]">Recent Leave Status</h2>
                            <div className="mt-4 space-y-3">
                                {recentLeaveStatuses.map((item) => (
                                    <div
                                        key={item.id}
                                        className="rounded-xl border border-[var(--border)] bg-[var(--glass-strong)] p-4"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="font-medium text-[var(--text)]">{item.leaveType}</div>
                                            <span
                                                className={`rounded-full px-2 py-1 text-xs ${
                                                    item.status === "Approved"
                                                        ? "bg-[color:rgba(52,211,153,0.18)] text-[var(--text)]"
                                                        : item.status === "Pending"
                                                            ? "bg-[color:rgba(251,191,36,0.18)] text-[var(--text)]"
                                                            : "bg-[color:rgba(255,99,132,0.18)] text-[var(--text)]"
                                                }`}
                                            >
                                                {item.status}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-sm text-[var(--text)]/65">{item.range}</div>
                                        <div className="mt-1 text-xs text-[var(--text)]/55">{item.id}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </section>

                <section className="rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-5 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-[var(--text)]">Upcoming Holidays</h2>
                        <p className="text-xs text-[var(--text)]/60">
                            This will be maintained later by HR admin workflows.
                        </p>
                    </div>
                    <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--glass-strong)]">
                        <table className="min-w-full text-sm text-[var(--text)]">
                            <thead>
                                <tr className="bg-[color:rgba(255,255,255,0.06)] text-left text-[var(--text)]/70">
                                    <th className="px-3 py-2">Holiday</th>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Scope</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upcomingHolidays.map((holiday) => (
                                    <tr
                                        key={holiday.id}
                                        className="border-t border-[var(--border)]/80 transition-colors hover:bg-[color:rgba(14,3,219,0.12)]"
                                    >
                                        <td className="px-3 py-2">{holiday.name}</td>
                                        <td className="px-3 py-2">{holiday.date}</td>
                                        <td className="px-3 py-2">{holiday.scope}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </ModuleGuard>
    );
}

type CalendarDay = {
    dateKey: string;
    dayNumber: number;
    inCurrentMonth: boolean;
    isToday: boolean;
    entries: LeaveCalendarItem[];
};

function buildCalendarDays(baseDate: Date, items: LeaveCalendarItem[]): CalendarDay[] {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const todayKey = toDateKey(new Date());
    const itemsByDate = new Map<string, LeaveCalendarItem[]>();

    for (const item of items) {
        const list = itemsByDate.get(item.date) ?? [];
        list.push(item);
        itemsByDate.set(item.date, list);
    }

    const days: CalendarDay[] = [];

    for (let index = startOffset - 1; index >= 0; index -= 1) {
        const date = new Date(year, month, -index);
        const dateKey = toDateKey(date);
        days.push({
            dateKey,
            dayNumber: date.getDate(),
            inCurrentMonth: false,
            isToday: dateKey === todayKey,
            entries: itemsByDate.get(dateKey) ?? [],
        });
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const date = new Date(year, month, day);
        const dateKey = toDateKey(date);
        days.push({
            dateKey,
            dayNumber: day,
            inCurrentMonth: true,
            isToday: dateKey === todayKey,
            entries: itemsByDate.get(dateKey) ?? [],
        });
    }

    while (days.length % 7 !== 0) {
        const nextDay = days.length - (startOffset + totalDays) + 1;
        const date = new Date(year, month + 1, nextDay);
        const dateKey = toDateKey(date);
        days.push({
            dateKey,
            dayNumber: date.getDate(),
            inCurrentMonth: false,
            isToday: dateKey === todayKey,
            entries: itemsByDate.get(dateKey) ?? [],
        });
    }

    return days;
}

function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}
