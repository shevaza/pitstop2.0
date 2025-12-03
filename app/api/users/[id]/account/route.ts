import { auth } from "@/lib/auth";
import { isAllowed } from "@/lib/rbac";
import { graphFetch } from "@/lib/graph";

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    const { id } = await ctx.params;

    const session = await auth();
    const upn = (session as any)?.upn as string | undefined;
    if (!upn || !(await isAllowed(upn))) {
        return new Response("Forbidden", { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.accountEnabled !== "boolean") {
        return new Response("Invalid body", { status: 400 });
    }

    try {
        await graphFetch<void>(
            `/users/${encodeURIComponent(id)}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountEnabled: body.accountEnabled }),
            } as any
        );
        return new Response("Updated", { status: 200 });
    } catch (e: any) {
        return new Response(`Graph update failed: ${e.message}`, { status: 500 });
    }
}
