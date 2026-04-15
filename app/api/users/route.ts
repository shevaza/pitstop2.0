import { assertModuleAccess } from "@/lib/module-auth";
import { buildAzureUsersPath, type GraphUsersPage } from "@/lib/users-cache";
import { graphFetch } from "@/lib/graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/users?top=25&skiptoken=...&search=...
export async function GET(req: Request) {
    try {
        await assertModuleAccess("users");
    } catch (error) {
        if (error instanceof Response) return error;
        throw error;
    }

    const { searchParams } = new URL(req.url);
    const top = Math.min(parseInt(searchParams.get("top") || "25", 10), 500);
    const search = (searchParams.get("search") || "").trim();
    const skiptoken = searchParams.get("skiptoken");

    const path = buildAzureUsersPath({
        top,
        search: search || undefined,
        skiptoken,
    });

    const data = await graphFetch<GraphUsersPage>(path);
    return Response.json({
        items: data.value || [],
        nextLink: data["@odata.nextLink"] || null, // contains $skiptoken
    });
}
