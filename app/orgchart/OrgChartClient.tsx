"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, TreeNode } from "react-organizational-chart";

type FlatUser = {
    id: string;
    upn: string;
    displayName: string;
    jobTitle?: string;
    department?: string;
    managerId?: string;
    managerUpn?: string;
};

type Node = FlatUser & { children: Node[] };

export default function OrgChartClient() {
    const [items, setItems] = useState<FlatUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState(""); // optional department filter (client-side)
    const [zoom, setZoom] = useState(1);
    const ref = useRef<HTMLDivElement>(null);

    async function load() {
        setLoading(true);
        try {
            const res = await fetch("/api/orgchart", { cache: "no-store" });
            const data = await res.json();
            setItems(data.items || []);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    const forest = useMemo(() => {
        // Build id -> node
        const map = new Map<string, Node>();
        for (const u of items) map.set(u.id, { ...u, children: [] });

        // Attach children to managers
        const roots: Node[] = [];
        for (const u of items) {
            const node = map.get(u.id)!;
            if (u.managerId && map.has(u.managerId)) {
                map.get(u.managerId)!.children.push(node);
            } else {
                roots.push(node); // no manager -> top-level
            }
        }

        // Optional client filter (department contains)
        if (filter.trim()) {
            const f = filter.toLowerCase();
            const filterTree = (n: Node): Node | null => {
                const kids = n.children.map(filterTree).filter(Boolean) as Node[];
                const match = (n.department || "").toLowerCase().includes(f)
                    || (n.displayName || "").toLowerCase().includes(f)
                    || (n.jobTitle || "").toLowerCase().includes(f);
                if (match || kids.length) return { ...n, children: kids };
                return null;
            };
            return roots.map(filterTree).filter(Boolean) as Node[];
        }

        return roots;
    }, [items, filter]);

    const Card = ({ n }: { n: Node }) => (
        <div className="mx-auto  rounded-xl border bg-white shadow-sm px-3 py-2 text-center min-w-48 max-w-100">
            <img
                src={`/api/users/${encodeURIComponent(n.id)}/photo`}
                alt=""
                className="h-10 w-10 rounded-full border object-cover mx-auto mb-2"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            />
            <Link
                href={`/users/${encodeURIComponent(n.id)}`}
                className="text-sm font-semibold text-blue-600! hover:underline"
            >
                {n.displayName}
            </Link>
            <div className="text-xs text-gray-600">{n.jobTitle || "—"}</div>
            <div className="text-[10px] text-gray-500">{n.department || "—"}</div>
            <div className="mt-2 text-[10px] text-gray-400">{n.upn}</div>
        </div>
    );

    const renderNode = (n: Node) => (
        <TreeNode key={n.id} label={<Card n={n} />}>
            {n.children.map(renderNode)}
        </TreeNode>
    );

    async function exportPng() {
        if (!ref.current) return;
        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(ref.current, { pixelRatio: 2, quality: 1 });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "orgchart.png";
        a.click();
    }

    return (
        <main className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold text-white">Organization Chart</h1>
                <div className="flex items-center gap-2 print:hidden">
                    <input
                        placeholder="Filter by name / title / dept"
                        className="border rounded px-2 py-1 w-72 border-white text-white"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="px-2 py-1 rounded bg-black text-white hover:bg-white hover:text-black"
                            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                        >
                            −
                        </button>
                        <span className="px-2 text-sm text-white">{Math.round(zoom * 100)}%</span>
                        <button
                            type="button"
                            className="px-2 py-1 rounded bg-black text-white hover:bg-white hover:text-black"
                            onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))}
                        >
                            +
                        </button>
                    </div>
                    <button onClick={exportPng} className="px-3 py-2 rounded bg-black text-white hover:bg-white hover:text-black">Export PNG</button>
                    <button onClick={() => window.print()} className="px-3 py-2 rounded bg-black text-white hover:bg-white hover:text-black">Print</button>
                </div>
            </div>

            {loading && <div>Loading…</div>}

            {!loading && forest.length === 0 && (
                <div className="text-gray-500">No org data. Ensure users have managers set.</div>
            )}

            {/* Chart container (this is what we export/print) */}
            <div className="overflow-auto border rounded p-5 bg-background">
                <div
                    ref={ref}
                    className="origin-top-left"
                    style={{
                        transform: `scale(${zoom})`,
                        width: `${100 / zoom}%`,
                        height: `${100 / zoom}%`,
                    }}
                >
                    {/* Multiple roots supported */}
                    <div className="flex flex-col gap-16">
                        {forest.map(root => (
                            <div key={root.id} className="overflow-auto">
                                <Tree
                                    lineColor="#D1D5DB"      // gray-300
                                    lineWidth={"2px"}
                                    label={<Card n={root} />}
                                >
                                    {root.children.map(renderNode)}
                                </Tree>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Print tweaks */}
            <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          header, nav, footer { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
        </main>
    );
}

