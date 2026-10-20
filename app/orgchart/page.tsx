"use client";

import LoadingState from "@/components/LoadingState";
import ModuleGuard from "@/components/ModuleGuard";
import dynamic from "next/dynamic";

const OrgChartClient = dynamic(() => import("./OrgChartClient"), {
    ssr: false,
    loading: () => <LoadingState />,
});

export default function OrgChartPage() {
    return (
        <ModuleGuard moduleKey="orgchart">
            <OrgChartClient />
        </ModuleGuard>
    );
}
