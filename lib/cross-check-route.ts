import { createHash } from "node:crypto";
import { assertModuleAccess } from "@/lib/module-auth";
import { attendanceErrorResponse, fetchScraper } from "@/lib/attendance-api";

export function scraperRoute(kind: "pitstop-data" | "leave-users" | "employee-leaves") {
    return async (request: Request) => {
        let user: string;
        try { user = await assertModuleAccess("attendance"); } catch (error) {
            if (error instanceof Response) return error;
            throw error;
        }
        const input = new URL(request.url).searchParams;
        const allowed = new Set(["jobId", ...(kind === "employee-leaves" ? ["year", "employeeId"] : [])]);
        for (const key of input.keys()) {
            if (!allowed.has(key) || input.getAll(key).length !== 1) return new Response("Invalid cross-check parameters", { status: 400 });
        }
        if (input.has("jobId") && !/^[a-f0-9-]{36}$/.test(input.get("jobId") || "")) return new Response("Invalid job ID", { status: 400 });
        if (kind === "employee-leaves" && (!/^(19|20)\d{2}$/.test(input.get("year") || "") || !/^[\w.-]{1,100}$/.test(input.get("employeeId") || ""))) {
            return new Response("Provide a valid year and employee ID", { status: 400 });
        }
        // Identity comes from verified browser/mobile authentication, never request parameters.
        const params = new URLSearchParams(input);
        params.set("owner", createHash("sha256").update(user.trim().toLowerCase()).digest("hex"));
        try {
            const result = await fetchScraper(kind, params);
            const headers = { "Cache-Control": "no-store" };
            if (result.state === "pending") return Response.json(result, { status: 202, headers: { ...headers, "Retry-After": "3" } });
            if (result.state === "failed") return new Response(result.error, { status: 502, headers });
            return Response.json(result.data, { headers });
        } catch (error) { return attendanceErrorResponse(error); }
    };
}
