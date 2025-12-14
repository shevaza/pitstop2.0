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
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);
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

    const expandableIds = useMemo(() => {
        const ids = new Set<string>();
        const walk = (n: Node) => {
            if (n.children.length) ids.add(n.id);
            n.children.forEach(walk);
        };
        forest.forEach(walk);
        return ids;
    }, [forest]);

    const toggleNode = (id: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const collapseAll = () => setCollapsed(new Set(expandableIds));
    const expandAll = () => setCollapsed(new Set());

    const Card = ({ n, isCollapsed }: { n: Node; isCollapsed: boolean }) => (
        <div className="relative mx-auto rounded-xl border bg-white shadow-sm px-3 py-2 text-center min-w-48 max-w-100">
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
            {n.children.length > 0 && (
                <button
                    type="button"
                    className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-blue-600 text-white text-xs shadow hover:bg-blue-800 hover:text-white"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleNode(n.id);
                    }}
                    aria-label={isCollapsed ? "Expand children" : "Collapse children"}
                >
                    {isCollapsed ? "+" : "−"}
                </button>
            )}
        </div>
    );

    const renderNode = (n: Node) => {
        const isCollapsed = collapsed.has(n.id);
        return (
            <TreeNode
                key={n.id}
                className={`org-branch ${isCollapsed ? "collapsed" : "expanded"}`}
                label={<Card n={n} isCollapsed={isCollapsed} />}
            >
                {n.children.map(renderNode)}
            </TreeNode>
        );
    };

    async function exportPdf() {
        if (forest.length === 0 || exporting) return;
        setExporting(true);

        type Measure = { width: number; height: number; children: Measure[] };
        const nodeW = 70;        // mm-ish logical units
        const nodeH = 38;
        const gapX = 20;
        const gapY = 30;
        const rootGapY = 40;
        const margin = 10;

        const measureTree = (n: Node): Measure => {
            const childMeasures = n.children.map(measureTree);
            const childrenWidth =
                childMeasures.reduce((acc, m) => acc + m.width, 0) +
                gapX * Math.max(childMeasures.length - 1, 0);
            const width = Math.max(nodeW, childrenWidth);
            const childrenHeight = childMeasures.length
                ? gapY + Math.max(...childMeasures.map(c => c.height))
                : 0;
            const height = nodeH + childrenHeight;
            return { width, height, children: childMeasures };
        };

        type Positioned = {
            n: Node;
            measure: Measure;
            x: number; // center
            y: number; // top
            children: Positioned[];
        };

        const layoutTree = (n: Node, measure: Measure, startX: number, startY: number): Positioned => {
            const xCenter = startX + measure.width / 2;
            let cursor = startX;
            const kids: Positioned[] = [];
            n.children.forEach((child, idx) => {
                const m = measure.children[idx];
                const childPos = layoutTree(child, m, cursor, startY + nodeH + gapY);
                kids.push(childPos);
                cursor += m.width + gapX;
            });
            return { n, measure, x: xCenter, y: startY, children: kids };
        };

        const rootMeasures = forest.map(measureTree);
        const maxRootWidth = Math.max(nodeW, ...rootMeasures.map(r => r.width));
        let cursorY = 0;
        const layouts: Positioned[] = [];
        forest.forEach((root, idx) => {
            const m = rootMeasures[idx];
            layouts.push(layoutTree(root, m, (maxRootWidth - m.width) / 2, cursorY));
            cursorY += m.height + rootGapY;
        });

        const contentWidth = maxRootWidth;
        const contentHeight = cursorY - rootGapY; // subtract last gap

        try {
            const { jsPDF } = await import("jspdf");
            const orientation = contentWidth > contentHeight ? "landscape" : "portrait";
            const doc = new jsPDF({ orientation });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const scale = Math.min(
                (pageWidth - margin * 2) / Math.max(contentWidth, 1),
                (pageHeight - margin * 2) / Math.max(contentHeight, 1)
            );

            const drawNode = (p: Positioned) => {
                const xCenter = margin + p.x * scale;
                const yTop = margin + p.y * scale;
                const w = nodeW * scale;
                const h = nodeH * scale;
                const x = xCenter - w / 2;

                // connector lines to children
                p.children.forEach(child => {
                    const childX = margin + child.x * scale;
                    const childY = margin + child.y * scale;
                    doc.setDrawColor(180, 180, 180);
                    doc.line(xCenter, yTop + h, childX, childY);
                });

                doc.setFillColor(247, 249, 252);
                doc.setDrawColor(203, 213, 225);
                doc.roundedRect(x, yTop, w, h, 3 * scale, 3 * scale, "FD");

                const nameSize = Math.max(6, 10 * scale);
                const jobSize = Math.max(5, 8 * scale);
                const infoSize = Math.max(5, 7 * scale);
                doc.setTextColor(17, 24, 39);
                doc.setFontSize(nameSize);
                doc.text(p.n.displayName || p.n.upn, x + 4 * scale, yTop + 10 * scale, {
                    maxWidth: w - 8 * scale,
                });
                doc.setFontSize(jobSize);
                doc.setTextColor(55, 65, 81);
                doc.text(p.n.jobTitle || "—", x + 4 * scale, yTop + 18 * scale, {
                    maxWidth: w - 8 * scale,
                });
                doc.setFontSize(infoSize);
                doc.setTextColor(107, 114, 128);
                doc.text(p.n.department || "—", x + 4 * scale, yTop + 25 * scale, {
                    maxWidth: w - 8 * scale,
                });
                doc.setTextColor(156, 163, 175);
                doc.text(p.n.upn, x + 4 * scale, yTop + 32 * scale, {
                    maxWidth: w - 8 * scale,
                });

                p.children.forEach(drawNode);
            };

            layouts.forEach(drawNode);
            doc.save("orgchart.pdf");
        } catch (err) {
            console.error("Failed to export PDF", err);
            alert("Could not build the PDF. Please try again or reduce the chart size.");
        } finally {
            setExporting(false);
        }
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
                    <button
                        onClick={exportPdf}
                        disabled={exporting}
                        className="px-3 py-2 rounded bg-black text-white hover:bg-white hover:text-black disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {exporting ? "Exporting…" : "Export PDF"}
                    </button>
                    <button
                        type="button"
                        onClick={expandAll}
                        className="px-3 py-2 rounded bg-black text-white hover:bg-white hover:text-black"
                    >
                        Expand All
                    </button>
                    <button
                        type="button"
                        onClick={collapseAll}
                        className="px-3 py-2 rounded bg-black text-white hover:bg-white hover:text-black"
                    >
                        Collapse All
                    </button>
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
                        {forest.map(root => {
                            const rootCollapsed = collapsed.has(root.id);
                            return (
                                <div
                                    key={root.id}
                                    className={`org-tree-root ${rootCollapsed ? "collapsed" : "expanded"} overflow-auto`}
                                >
                                    <Tree
                                        lineColor="#D1D5DB"      // gray-300
                                        lineWidth={"2px"}
                                        label={<Card n={root} isCollapsed={rootCollapsed} />}
                                    >
                                        {root.children.map(renderNode)}
                                    </Tree>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Print tweaks */}
            <style jsx global>{`
        .org-branch > ul,
        .org-tree-root > ul > li > ul {
          transition: max-height 240ms ease, opacity 180ms ease, transform 180ms ease;
          max-height: 9999px;
          opacity: 1;
          transform: scaleY(1);
          transform-origin: top center;
        }
        .org-branch.collapsed > ul,
        .org-tree-root.collapsed > ul > li > ul {
          max-height: 0 !important;
          opacity: 0;
          transform: scaleY(0.95);
          pointer-events: none;
          overflow: hidden;
        }
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
