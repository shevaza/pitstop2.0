import { assertModuleAccess } from "@/lib/module-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const leaveApiBaseUrl = process.env.LEAVE_API_BASE_URL || "http://localhost:4000/api";

export async function GET(request: Request) {
  try {
    await assertModuleAccess("attendance");
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") || "";
  const employeeId = searchParams.get("employeeId") || "";

  if (!year || !employeeId) {
    return new Response("Missing year or employeeId", { status: 400 });
  }

  try {
    const upstreamParams = new URLSearchParams({ year, employeeId });
    const upstream = await fetch(`${leaveApiBaseUrl}/employee-leaves?${upstreamParams.toString()}`, {
      cache: "no-store",
    });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Failed to load employee leaves: ${message}`, { status: 502 });
  }
}
