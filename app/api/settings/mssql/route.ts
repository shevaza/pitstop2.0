import { fetchAttendanceSettings, attendanceErrorResponse } from "@/lib/attendance-api";
import { assertModuleAccess } from "@/lib/module-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Keep this URL for web/mobile compatibility; credentials and SQL stay on premises.
export async function GET() {
    try { await assertModuleAccess("settings"); } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }
    try {
        return Response.json({ settings: await fetchAttendanceSettings() }, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) { return attendanceErrorResponse(error); }
}

export async function POST() {
    try { await assertModuleAccess("settings", "modify"); } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }
    return new Response("Database credentials and report queries are managed on the internal attendance server. Update your app to view connection status.", {
        status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
}
