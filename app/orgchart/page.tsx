"use client";

import dynamic from "next/dynamic";

const OrgChartClient = dynamic(() => import("./OrgChartClient"), {
    ssr: false,
    loading: () => <div className="p-6 text-white">Loading chart…</div>,
});

export default function OrgChartPage() {
    return <OrgChartClient />;
}
