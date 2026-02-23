"use client";
import MultiSelect, { type Option } from "@/components/MultiSelect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { useSession } from "next-auth/react";
import { utils as XLSXUtils, writeFileXLSX } from "xlsx";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

type User = {
    id: string;
    userPrincipalName: string;
    displayName?: string;
    givenName?: string;
    surname?: string;
    jobTitle?: string;
    department?: string;
    officeLocation?: string;
    mobilePhone?: string;
    employeeId?: string;
    employeeType?: string;
    usageLocation?: string;
    accountEnabled?: boolean;
};

const NONE_OPTION = "__none__";
const NONE_LABEL = "Not specified";

type StatusFilter = "" | "enabled" | "disabled";

type Filters = {
    name: string;
    upn: string;
    title: string;
    department: string[];
    office: string[];
    status: StatusFilter;
};

type SortKey = "name" | "upn" | "title" | "department" | "office" | "status";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection } | null;

const normalizeText = (value: string | null | undefined) => value?.toLowerCase().trim() ?? "";
const normalizeKey = (value: string | null | undefined) => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return NONE_OPTION;
    return trimmed.toLowerCase();
};


const labelFor = (value: string | null | undefined) => {
    const trimmed = (value ?? "").trim();
    return trimmed || NONE_LABEL;
};

export default function UsersPage() {
    const { status } = useSession();
    const [items, setItems] = useState<User[]>([]);
    const [nextToken, setNextToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [sort, setSort] = useState<SortState>(null);
    const [filters, setFilters] = useState<Filters>({
        name: "",
        upn: "",
        title: "",
        department: [],
        office: [],
        status: "",
    });
    const tableRef = useRef<HTMLTableElement | null>(null);

    const query = useMemo(() => new URLSearchParams({
        top: "500",
        ...(search ? { search } : {})
    }).toString(), [search]);

    const departmentOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const user of items) {
            const key = normalizeKey(user.department);
            if (!map.has(key)) {
                map.set(key, labelFor(user.department));
            }
        }
        return Array.from(map.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([value, label]) => ({ value, label }));
    }, [items]);
    const deptOptsAsOptions: Option[] = useMemo(
        () => departmentOptions.map(d => ({ id: d.value, label: d.label })),
        [departmentOptions]
    );
    const selectedDeptOptions: Option[] = useMemo(
        () => deptOptsAsOptions.filter(d => filters.department.includes(d.id)),
        [deptOptsAsOptions, filters.department]
    );

    const officeOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const user of items) {
            const key = normalizeKey(user.officeLocation);
            if (!map.has(key)) {
                map.set(key, labelFor(user.officeLocation));
            }
        }
        return Array.from(map.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([value, label]) => ({ value, label }));
    }, [items]);
    const officeOptsAsOptions: Option[] = useMemo(
        () => officeOptions.map(o => ({ id: o.value, label: o.label })),
        [officeOptions]
    );
    const selectedOfficeOptions: Option[] = useMemo(
        () => officeOptsAsOptions.filter(o => filters.office.includes(o.id)),
        [officeOptsAsOptions, filters.office]
    );
    const filteredItems = useMemo(() => {
        const nameFilter = normalizeText(filters.name);
        const upnFilter = normalizeText(filters.upn);
        const titleFilter = normalizeText(filters.title);
        return items.filter((u) => {
            const nameSource = u.displayName || `${u.givenName ?? ""} ${u.surname ?? ""}`.trim() || "(no name)";
            const matchesName = !nameFilter || normalizeText(nameSource).includes(nameFilter);
            const matchesUpn = !upnFilter || normalizeText(u.userPrincipalName).includes(upnFilter);
            const matchesTitle = !titleFilter || normalizeText(u.jobTitle).includes(titleFilter);
            const departmentKey = normalizeKey(u.department);
            const matchesDepartment = filters.department.length === 0 || filters.department.includes(departmentKey);
            const officeKey = normalizeKey(u.officeLocation);
            const matchesOffice = filters.office.length === 0 || filters.office.includes(officeKey);
        const matchesStatus = filters.status === ""
            || (filters.status === "enabled" ? u.accountEnabled : !u.accountEnabled);
        return matchesName && matchesUpn && matchesTitle && matchesDepartment && matchesOffice && matchesStatus;
    });
}, [items, filters]);

    const sortedItems = useMemo(() => {
        if (!sort) return filteredItems;
        const valueFor = (u: User) => {
            switch (sort.key) {
                case "name":
                    return normalizeText(u.displayName || `${u.givenName ?? ""} ${u.surname ?? ""}`.trim() || "(no name)");
                case "upn":
                    return normalizeText(u.userPrincipalName);
                case "title":
                    return normalizeText(u.jobTitle);
                case "department":
                    return normalizeText(u.department);
                case "office":
                    return normalizeText(u.officeLocation);
                case "status":
                    return u.accountEnabled ? "enabled" : "disabled";
                default:
                    return "";
            }
        };
        const direction = sort.direction === "asc" ? 1 : -1;
        return [...filteredItems].sort((a, b) => valueFor(a).localeCompare(valueFor(b)) * direction);
    }, [filteredItems, sort]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(Math.max(sortedItems.length, 1) / pageSize)),
        [sortedItems.length, pageSize]
    );

    const paginatedItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedItems.slice(start, start + pageSize);
    }, [sortedItems, page, pageSize]);

    useEffect(() => {
        setPage(1);
    }, [
        filters.name,
        filters.upn,
        filters.title,
        filters.department.join(","),
        filters.office.join(","),
        filters.status,
        search,
        sort?.key,
        sort?.direction,
    ]);

    useEffect(() => {
        setPage((prev) => Math.min(Math.max(prev, 1), totalPages));
    }, [totalPages]);

    const hasFilters = useMemo(
        () =>
            filters.name.trim() !== ""
            || filters.upn.trim() !== ""
            || filters.title.trim() !== ""
            || filters.department.length > 0
            || filters.office.length > 0
            || filters.status !== "",
        [filters]
    );

    const handleExportExcel = useCallback(() => {
        if (!sortedItems.length) return;
        const header = ["Name", "UPN", "Title", "Department", "Office", "Status"];
        const rows = sortedItems.map((u) => [
            u.displayName || `${u.givenName ?? ""} ${u.surname ?? ""}`.trim() || "(no name)",
            u.userPrincipalName,
            u.jobTitle ?? "",
            u.department ?? "",
            u.officeLocation ?? "",
            u.accountEnabled ? "Enabled" : "Disabled",
        ]);
        const worksheet = XLSXUtils.aoa_to_sheet([header, ...rows]);
        const workbook = XLSXUtils.book_new();
        XLSXUtils.book_append_sheet(workbook, worksheet, "Users");
        writeFileXLSX(workbook, "users.xlsx");
    }, [sortedItems]);

    const handleExportPdf = useCallback(async () => {
        if (!tableRef.current || !sortedItems.length) return;
        try {
            const dataUrl = await toPng(tableRef.current, {
                cacheBust: true,
                backgroundColor: "#ffffff",
            });
            const pdf = new jsPDF({
                orientation: "landscape",
                unit: "pt",
                format: "a4",
            });
            const imgProps = pdf.getImageProperties(dataUrl);
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const ratio = Math.min(pageWidth / imgProps.width, pageHeight / imgProps.height);
            const width = imgProps.width * ratio;
            const height = imgProps.height * ratio;
            const x = (pageWidth - width) / 2;
            const y = Math.max(20, (pageHeight - height) / 2);
            pdf.addImage(dataUrl, "PNG", x, y, width, height);
            pdf.save("users.pdf");
        } catch (error) {
            console.error("Failed to export users table as PDF", error);
        }
    }, [sortedItems]);

    const load = useCallback(async (reset = false, cursor?: string | null) => {
        setLoading(true);
        try {
            const base = `/api/users?${query}`;
            const skip = reset ? null : cursor ?? null;
            const url = skip ? `${base}&skiptoken=${encodeURIComponent(skip)}` : base;
            const res = await fetch(url, { cache: "no-store" });
            const data = await res.json();
            const newItems = data.items as User[];
            const next = (data.nextLink as string | null) || null;
            const tok = next ? new URL(next).searchParams.get("$skiptoken") : null;
            setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
            setNextToken(tok);
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        if (status !== "authenticated") return;
        load(true);
    }, [status, load]);

    const handleSearch = useCallback(() => {
        if (status !== "authenticated") return;
        load(true);
    }, [status, load]);

    const handleLoadMore = useCallback(() => {
        if (status !== "authenticated" || !nextToken) return;
        load(false, nextToken);
    }, [status, nextToken, load]);

    const toggleSort = useCallback((key: SortKey) => {
        setSort((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
            }
            return { key, direction: "asc" };
        });
    }, []);

    const sortLabel = (key: SortKey) => {
        if (!sort || sort.key !== key) return "";
        return sort.direction === "asc" ? "▲" : "▼";
    };

    const isReady = status === "authenticated";
    const canExport = isReady && sortedItems.length > 0;
    const pageStart = sortedItems.length ? (page - 1) * pageSize + 1 : 0;
    const pageEnd = sortedItems.length ? Math.min(sortedItems.length, page * pageSize) : 0;

    return (
        <AuthGuard>
            <main className="p-6 space-y-4 text-[var(--foreground)]">
                <h1 className="text-2xl font-semibold text-[var(--text)]">Users</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        className="w-72 rounded border border-[var(--border)] bg-[var(--glass)] p-2 text-[var(--text)] placeholder:text-[var(--text)]/50 focus:border-[var(--text)]/60 focus:outline-none"
                        placeholder="Search displayName or exact UPN"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        disabled={!isReady}
                    />
                    <button
                        className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                        onClick={handleSearch}
                        disabled={!isReady}
                    >
                        Search
                    </button>

                    <div className="flex gap-2">
                        <button
                            className="rounded border border-[var(--border)] bg-[color:rgba(255,99,132,0.16)] px-3 py-2 text-[var(--text)] transition-colors hover:bg-[color:rgba(255,99,132,0.28)] disabled:opacity-50"
                            onClick={handleExportPdf}
                            disabled={!canExport}
                        >
                            Export PDF
                        </button>
                        <button
                            className="rounded border border-[var(--border)] bg-[color:rgba(52,211,153,0.18)] px-3 py-2 text-[var(--text)] transition-colors hover:bg-[color:rgba(52,211,153,0.28)] disabled:opacity-50"
                            onClick={handleExportExcel}
                            disabled={!canExport}
                        >
                            Export Excel
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-[var(--text)] transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                            disabled={!nextToken || loading || !isReady}
                            onClick={handleLoadMore}
                        >
                            {loading ? "Loading..." : "Load more"}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--glass)] px-3 py-2 text-xs text-[var(--text)] shadow-[var(--shadow-soft)]">
                    <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <select
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(parseInt(e.target.value, 10));
                                setPage(1);
                            }}
                            disabled={!isReady}
                        >
                            {[25, 50, 100].map((size) => (
                                <option key={size} value={size} className="bg-black">
                                    {size}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                            onClick={() => setPage(1)}
                            disabled={!isReady || page <= 1 || !sortedItems.length}
                        >
                            First
                        </button>
                        <button
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                            disabled={!isReady || page <= 1 || !sortedItems.length}
                        >
                            Prev
                        </button>
                        <span className="px-2 text-[var(--text)]/70">
                            Page {sortedItems.length ? page : 0} of {sortedItems.length ? totalPages : 0}
                        </span>
                        <button
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                            disabled={!isReady || !sortedItems.length || page >= totalPages}
                        >
                            Next
                        </button>
                        <button
                            className="rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 transition-colors hover:bg-[var(--glass-strong)] disabled:opacity-50"
                            onClick={() => setPage(totalPages)}
                            disabled={!isReady || !sortedItems.length || page >= totalPages}
                        >
                            Last
                        </button>
                    </div>
                    <div className="ml-auto text-[var(--text)]/70">
                        {sortedItems.length
                            ? `Showing ${pageStart}-${pageEnd} of ${sortedItems.length}`
                            : loading
                                ? "Loading..."
                                : "No results"}
                    </div>
                </div>

                <div className="overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--glass)] shadow-[var(--shadow-soft)] backdrop-blur-2xl">
                    <table ref={tableRef} className="min-w-full text-sm text-[var(--text)]">
                        <thead>
                            <tr className="bg-[color:rgba(255,255,255,0.06)] p-2 text-[var(--text)]/70">
                                <th className="p-2 text-left">
                                    <button
                                        className="flex items-center gap-1 text-left text-[var(--text)]/70 hover:text-[var(--text)]"
                                        onClick={() => toggleSort("name")}
                                    >
                                        Name <span>{sortLabel("name")}</span>
                                    </button>
                                </th>
                                <th className="p-2 text-left">
                                    <button
                                        className="flex items-center gap-1 text-left text-[var(--text)]/70 hover:text-[var(--text)]"
                                        onClick={() => toggleSort("upn")}
                                    >
                                        UPN <span>{sortLabel("upn")}</span>
                                    </button>
                                </th>
                                <th className="p-2 text-left">
                                    <button
                                        className="flex items-center gap-1 text-left text-[var(--text)]/70 hover:text-[var(--text)]"
                                        onClick={() => toggleSort("title")}
                                    >
                                        Title <span>{sortLabel("title")}</span>
                                    </button>
                                </th>
                                <th className="p-2 text-left">
                                    <button
                                        className="flex items-center gap-1 text-left text-[var(--text)]/70 hover:text-[var(--text)]"
                                        onClick={() => toggleSort("department")}
                                    >
                                        Dept <span>{sortLabel("department")}</span>
                                    </button>
                                </th>
                                <th className="p-2 text-left">
                                    <button
                                        className="flex items-center gap-1 text-left text-[var(--text)]/70 hover:text-[var(--text)]"
                                        onClick={() => toggleSort("office")}
                                    >
                                        Office <span>{sortLabel("office")}</span>
                                    </button>
                                </th>
                                <th className="p-2 text-left">
                                    <button
                                        className="flex items-center gap-1 text-left text-[var(--text)]/70 hover:text-[var(--text)]"
                                        onClick={() => toggleSort("status")}
                                    >
                                        Status <span>{sortLabel("status")}</span>
                                    </button>
                                </th>
                            </tr>
                            <tr className="bg-[var(--glass-strong)] text-xs text-[var(--text)]/70">
                                <th className="p-2">
                                    <input
                                        className="w-full rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--text)]/50 focus:border-[var(--text)]/60 focus:outline-none"
                                        placeholder="Filter name"
                                        value={filters.name}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, name: e.target.value }))}
                                        disabled={!isReady}
                                    />
                                </th>
                                <th className="p-2">
                                    <input
                                        className="w-full rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--text)]/50 focus:border-[var(--text)]/60 focus:outline-none"
                                        placeholder="Filter UPN"
                                        value={filters.upn}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, upn: e.target.value }))}
                                        disabled={!isReady}
                                    />
                                </th>
                                <th className="p-2">
                                    <input
                                        className="w-full rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 text-[var(--text)] placeholder:text-[var(--text)]/50 focus:border-[var(--text)]/60 focus:outline-none"
                                        placeholder="Filter title"
                                        value={filters.title}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, title: e.target.value }))}
                                        disabled={!isReady}
                                    />
                                </th>
                                <th className="p-2">
                                    <MultiSelect
                                        value={selectedDeptOptions}
                                        onChange={(next: Option[]) =>
                                            setFilters(prev => ({ ...prev, department: next.map(n => n.id) }))
                                        }
                                        options={deptOptsAsOptions}           // or loadOptions={asyncLoader}
                                        placeholder="Filter departments…"
                                        nameForForm="department"              // optional: hidden inputs for POST
                                        disabled={!isReady || !departmentOptions.length}
                                    />
                                    {/* <select
                                        multiple
                                        title="Filter departments (Ctrl/Cmd+Click for multi-select)"
                                        className="w-full border rounded px-2 py-1 bg-white"
                                        value={filters.department}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.selectedOptions).map((option) => option.value);
                                            setFilters((prev) => ({ ...prev, department: selected }));
                                        }}
                                        disabled={!isReady || !departmentOptions.length}
                                        size={Math.min(8, Math.max(4, departmentOptions.length || 0))}
                                    >
                                        {departmentOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select> */}
                                </th>
                                <th className="p-2">
                                    <MultiSelect
                                        value={selectedOfficeOptions}
                                        onChange={(next: Option[]) =>
                                            setFilters(prev => ({ ...prev, office: next.map(n => n.id) }))
                                        }
                                        options={officeOptsAsOptions}        // or use loadOptions for async
                                        placeholder="Filter offices…"
                                        nameForForm="office"                 // optional: emit hidden inputs for form POST
                                        disabled={!isReady || !officeOptions.length}
                                    />
                                </th>
                                <th className="p-2">
                                    <select
                                        title="Filter status"
                                        className="w-full rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1 text-[var(--text)] focus:border-[var(--text)]/60 focus:outline-none"
                                        value={filters.status}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as StatusFilter }))}
                                        disabled={!isReady}
                                    >
                                        <option value="" className="bg-black">All</option>
                                        <option value="enabled" className="bg-black">Enabled</option>
                                        <option value="disabled" className="bg-black">Disabled</option>
                                    </select>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedItems.map((u) => (
                                <tr key={u.id} className="border-t border-[var(--border)]/80 transition-colors hover:bg-[color:rgba(14,3,219,0.12)]">
                                    <td className="p-2">
                                        <Link href={`/users/${encodeURIComponent(u.id)}`} className="text-[var(--text)] hover:text-[var(--primary)] hover:underline">
                                            {u.displayName || `${u.givenName ?? ""} ${u.surname ?? ""}`.trim() || "(no name)"}
                                        </Link>
                                    </td>
                                    <td className="p-2">{u.userPrincipalName}</td>
                                    <td className="p-2">{u.jobTitle ?? "-"}</td>
                                    <td className="p-2">{u.department ?? "-"}</td>
                                    <td className="p-2">{u.officeLocation ?? "-"}</td>
                                    <td className="p-2">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                            u.accountEnabled
                                                ? "bg-[color:rgba(52,211,153,0.18)] text-[var(--text)]"
                                                : "bg-[color:rgba(255,99,132,0.2)] text-[var(--text)]"
                                        }`}>
                                            {u.accountEnabled ? "Enabled" : "Disabled"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {!sortedItems.length && !loading && (
                                <tr>
                                    <td className="p-4 text-[var(--text)]/70" colSpan={6}>
                                        {hasFilters ? "No users match the selected filters" : "No users"}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </AuthGuard>
    );
}
