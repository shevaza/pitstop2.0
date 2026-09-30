import { fetchAttendance, attendanceErrorResponse } from "@/lib/attendance-api";
import { assertModuleAccess } from "@/lib/module-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
    try {
        // Supports both browser sessions and authenticated mobile bearer tokens.
        await assertModuleAccess("attendance");
    } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }
    try {
        return Response.json(await fetchAttendance(new URL(request.url).searchParams), {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) { return attendanceErrorResponse(error); }
}
