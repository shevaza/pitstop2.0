import { searchAssetUsers } from "@/lib/assets";
import { assertModuleAccess } from "@/lib/module-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
    try {
        await assertModuleAccess("assets");

        const { searchParams } = new URL(req.url);
        const search = (searchParams.get("search") || "").trim();
        const result = await searchAssetUsers(search);

        return Response.json(result);
    } catch (error) {
        console.error("GET /api/assets/users failed", error);
        return new Response("Failed to search asset users", { status: 500 });
    }
}
