import { assertModuleAccess } from "@/lib/module-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const leaveApiBaseUrl = process.env.LEAVE_API_BASE_URL || "http://localhost:4000/api";

export async function GET() {
  try {
    await assertModuleAccess("attendance");
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  try {
    const upstream = await fetch(`${leaveApiBaseUrl}/pitstop-data`, { cache: "no-store" });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Failed to load pitstop data: ${message}`, { status: 502 });
  }
}
