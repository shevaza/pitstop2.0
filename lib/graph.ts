import { ConfidentialClientApplication } from "@azure/msal-node";

const msal = new ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_AD_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    },
});

async function getToken() {
    const res = await msal.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
    });
    if (!res?.accessToken) throw new Error("Graph token acquisition failed");
    return res.accessToken;
}

export async function graphFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
        cache: "no-store",
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Graph ${path} ${res.status}: ${text}`);
    }
    // some PATCH/DELETE endpoints return no content
    try { return await res.json(); } catch { return {} as T; }
}
