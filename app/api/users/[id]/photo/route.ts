import { assertModuleAccess } from "@/lib/module-auth";
import { ConfidentialClientApplication } from "@azure/msal-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small helper to get a Graph token
async function getGraphToken() {
    const msal = new ConfidentialClientApplication({
        auth: {
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
        },
    });
    const res = await msal.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
    });
    if (!res?.accessToken) throw new Error("Failed to acquire Graph token");
    return res.accessToken;
}

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ id: string }> } // Next.js 16: params is a Promise
) {
    try {
        await assertModuleAccess("users");

        const { id } = await ctx.params;
        const userId = decodeURIComponent(id);

        const token = await getGraphToken();
        const res = await fetch(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/photo/$value`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
        );

        if (!res.ok) {
            // No photo or forbidden → return 404 so the UI can show a fallback
            return new Response("No photo", { status: 404 });
        }

        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        const body = await res.arrayBuffer();

        return new Response(body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                // tiny private cache so navigating back is snappy; tweak as you like
                "Cache-Control": "private, max-age=60",
            },
        });
    } catch (e: any) {
        return new Response("No photo", { status: 404 });
    }
}
