import { assertModuleAccess } from "@/lib/module-auth";
import { syncUsersFromAzureToSupabase } from "@/lib/users-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
    try {
        await assertModuleAccess("users");
        const result = await syncUsersFromAzureToSupabase();
        return Response.json(result);
    } catch (error) {
        if (error instanceof Response) return error;
        console.error("POST /api/users/sync failed", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Failed to sync users",
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
    }
}
